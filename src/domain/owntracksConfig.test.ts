// OwnTracks: configuración que se importa con un enlace + candados de la migración 0213, la función del servidor y la pantalla.
import { describe, expect, it } from 'vitest'
import {
  buildOwnTracksConfig,
  MAX_ACCURACY_M,
  ownTracksConfigLink,
  OWNTRACKS_ANDROID_STORE_URL,
  OWNTRACKS_IOS_STORE_URL,
  trackerId,
} from '@/domain/owntracksConfig'

const FILES = import.meta.glob(
  ['/supabase/functions/owntracks-ingest/index.ts', '/src/ui/BackgroundLocationSetup.tsx', '/src/ui/LocationScreen.tsx', '/src/data/locationToken.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SQL = Object.entries(MIGRATIONS).find(([f]) => f.includes('0213_owntracks_background_location'))?.[1] ?? ''
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const EDGE = FILES['/supabase/functions/owntracks-ingest/index.ts']
const UI = FILES['/src/ui/BackgroundLocationSetup.tsx']

const INPUT = {
  endpointUrl: 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/owntracks-ingest',
  memberId: '8f0b6c1e-1111-4222-8333-944455556666',
  token: 'a'.repeat(64),
  memberName: 'Jennifer',
}

describe('configuración de OwnTracks', () => {
  it('modo HTTP con usuario = miembro y contraseña = código, GPS continuo y el mismo umbral de precisión que el servidor', () => {
    const c = buildOwnTracksConfig(INPUT)
    expect(c).toMatchObject({ _type: 'configuration', mode: 3, auth: true, username: INPUT.memberId, password: INPUT.token, url: INPUT.endpointUrl, monitoring: 2 })
    expect(c.ignoreInaccurateLocations).toBe(MAX_ACCURACY_M)
    expect(CODE).toContain(`p_acc > ${MAX_ACCURACY_M}`)
  })
  it('el enlace owntracks:///config?inline= contiene la configuración y sobrevive a la decodificación de URL', () => {
    const link = ownTracksConfigLink(INPUT)
    expect(link.startsWith('owntracks:///config?inline=')).toBe(true)
    const param = link.slice('owntracks:///config?inline='.length)
    expect(param).not.toMatch(/[+/=]/) // codificados: ningún parser los confunde con la consulta
    expect(JSON.parse(atob(decodeURIComponent(param)))).toEqual(buildOwnTracksConfig(INPUT))
  })
  it('el identificador corto es siempre de 2 letras ASCII, también con acentos o nombres raros', () => {
    expect(trackerId('Jennifer')).toBe('JE')
    expect(trackerId('Álvaro')).toBe('AL')
    expect(trackerId('Lucía')).toBe('LU')
    expect(trackerId('X')).toBe('XP')
    expect(trackerId('👨')).toBe('PE')
    expect(trackerId('李')).toMatch(/^[A-Z]{2}$/)
  })
})

describe('migración 0213 — código por miembro y recepción segura', () => {
  it('guarda solo la huella sha256 del código, nunca el código; RLS activo y sin políticas', () => {
    expect(CODE).toContain('token_hash text not null')
    expect(CODE).toContain("encode(sha256(convert_to(v_token, 'UTF8')), 'hex')")
    expect(CODE).not.toMatch(/\btoken text\b/)
    expect(CODE).toContain('alter table public.member_location_tokens enable row level security;')
    expect(CODE).not.toMatch(/create policy/i)
  })
  it('generar/revocar: solo el propio miembro o un admin (comparación con coalesce: un null nunca concede) y misma familia', () => {
    expect(CODE.split("coalesce(private.current_member_id() = p_member_id, false) or coalesce(private.current_role_in_family() = 'admin', false)").length - 1).toBe(2)
    expect(CODE).toContain('fm.family_id = v_family_id')
    expect(CODE).toContain("raise exception 'Miembro no encontrado'")
  })
  it('exige consentimiento de ubicación al generar Y en cada posición recibida', () => {
    expect(CODE.split('c.member_id = p_member_id and c.family_id = v_family_id and c.enabled').length - 1).toBe(2)
    expect(CODE).toContain("return 'no_consent'")
  })
  it('descarta lo inválido: coordenadas fuera de rango, precisión > 150 m, fechas futuras y posiciones más antiguas que la guardada', () => {
    expect(CODE).toContain('p_lat not between -90 and 90')
    expect(CODE).toContain("return 'inaccurate'")
    expect(CODE).toContain("if v_at > now() + interval '5 minutes'")
    expect(CODE).toContain('where public.member_locations.recorded_at < excluded.recorded_at')
    expect(CODE).toContain("return 'stale'")
  })
  it('escribe en la misma tabla de siempre (member_locations), así que dispara el aviso de llegada/salida existente', () => {
    expect(CODE).toContain('insert into public.member_locations')
    expect(CODE).not.toMatch(/net\.http_post|send_family_push/)
  })
  it('permisos: recibir posiciones solo service_role; el resto solo authenticated; nada para anon/public', () => {
    expect(CODE).toContain('grant execute on function public.ingest_member_location(uuid, text, double precision, double precision, timestamptz, double precision) to service_role;')
    expect(CODE).toContain('grant execute on function public.create_member_location_token(uuid) to authenticated;')
    expect(CODE).toContain('grant execute on function public.revoke_member_location_token(uuid) to authenticated;')
    expect(CODE).toContain('grant execute on function public.list_member_location_token_status() to authenticated;')
    expect(CODE.match(/revoke all on function[^;]*from public, anon, authenticated;/g)?.length).toBe(4)
    expect(CODE).not.toMatch(/grant [^;]* to (anon|public)\b/)
    expect((CODE.match(/security definer/g) ?? []).length).toBe(4)
    expect((CODE.match(/set search_path to 'public'/g) ?? []).length).toBe(4)
  })
  it('no toca otras tablas ni las reglas de avisos', () => {
    expect(CODE).not.toMatch(/alter table (?!public\.member_location_tokens)/i)
    expect(CODE).not.toMatch(/automation_rule|location_places|push_subscriptions/)
  })
})

describe('Edge Function owntracks-ingest', () => {
  it('autentica con HTTP Basic (usuario = uuid de miembro) antes de nada y responde 401 sin pistas', () => {
    expect(EDGE).toContain('parseBasicAuth(req.headers.get("authorization"))')
    expect(EDGE).toContain('UUID_RE.test(creds.user)')
    expect(EDGE).toContain('return new Response("unauthorized", { status: 401 })')
    expect(EDGE).toContain('if (data === "unauthorized") return new Response("unauthorized", { status: 401 })')
  })
  it('solo procesa posiciones; responde «[]» (lo que OwnTracks espera) y valida los números', () => {
    expect(EDGE).toContain('if (msg._type !== "location") return emptyReply()')
    expect(EDGE).toContain('new Response("[]"')
    expect(EDGE).toContain('Number.isFinite(lat)')
    expect(EDGE).toContain('raw.length > MAX_BODY_CHARS')
  })
  it('el código nunca se escribe en los logs ni en la respuesta', () => {
    const logs = EDGE.split('\n').filter((l) => l.includes('console.'))
    expect(logs.length).toBeGreaterThan(0)
    for (const l of logs) expect(l).not.toMatch(/creds|pass|token/i)
  })
  it('la base decide: la función solo llama a ingest_member_location con la clave de servicio', () => {
    expect(EDGE).toContain('supabaseAdmin.rpc("ingest_member_location"')
    expect(EDGE).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })
})

describe('pantalla', () => {
  it('«Compartir ubicación» ofrece la conexión solo a quien puede gestionar ese miembro (él mismo o admin)', () => {
    const screen = FILES['/src/ui/LocationScreen.tsx']
    expect(screen).toContain('<BackgroundLocationSetup')
    expect(screen).toContain('members={members.filter((m) => isAdmin || m.linkedProfileId === profileId)}')
  })
  it('explica el porqué, no muestra el código si no se acaba de generar y avisa de los permisos que hacen falta', () => {
    expect(UI).toContain('Permitir siempre')
    expect(UI).toContain('ahorro de batería')
    expect(UI).toContain('el código solo se muestra ahora')
    expect(UI).toContain('{setup && (')
    expect(UI).toContain('{enabled && (')
  })
  it('la instalación se hace desde PEPA: botones directos a la App Store y a Google Play (enlaces oficiales de owntracks.org)', () => {
    expect(OWNTRACKS_IOS_STORE_URL).toBe('https://itunes.apple.com/us/app/mqttitude/id692424691?mt=8')
    expect(OWNTRACKS_ANDROID_STORE_URL).toBe('https://play.google.com/store/apps/details?id=org.owntracks.android')
    expect(UI).toContain('<InstallOwnTracksButtons />')
    expect(UI).toContain('href={OWNTRACKS_IOS_STORE_URL}')
    expect(UI).toContain('href={OWNTRACKS_ANDROID_STORE_URL}')
    expect(UI).toContain('Instalar en iPhone (App Store)')
    expect(UI).toContain('Instalar en Android (Google Play)')
  })
  it('los botones de instalar están en la PRIMERA pantalla de Ubicación (antes estaban a tres niveles) y el atajo abre «Compartir»', () => {
    const screen = FILES['/src/ui/LocationScreen.tsx']
    const inicio = screen.slice(screen.indexOf('function UbicacionInicioTab'), screen.indexOf('// Copia de EconomiaMenuDropdown'))
    expect(inicio).toContain('<InstallOwnTracksButtons />')
    expect(inicio).toContain('Ya la tengo instalada → Conectar')
    expect(screen).toContain("setInitialPanel('compartir')")
    expect(screen).toContain('useState<\'lugares\' | \'estoy-aqui\' | \'compartir\'>(initialPanel)')
  })
  it('dentro de «Compartir ubicación» la sección sale la primera, sin tener que bajar', () => {
    const screen = FILES['/src/ui/LocationScreen.tsx']
    const compartir = screen.slice(screen.indexOf("{panelTab === 'compartir' && ("))
    expect(compartir.indexOf('<BackgroundLocationSetup')).toBeGreaterThan(-1)
    expect(compartir.indexOf('<BackgroundLocationSetup')).toBeLessThan(compartir.indexOf('Este dispositivo'))
  })
  it('al pulsar «Conectar» los pasos salen ARRIBA de la lista y la pantalla va sola hasta ellos; los errores también se ven', () => {
    expect(UI.indexOf('ref={panelRef}')).toBeGreaterThan(-1)
    expect(UI.indexOf('ref={panelRef}')).toBeLessThan(UI.indexOf('className="event-list"'))
    expect(UI).toContain('scrollSoon(panelRef)')
    expect(UI).toContain('scrollSoon(errorRef)')
    expect(UI).toContain('role="alert"')
    expect(UI).toContain("busy === m.id ? 'Generando…'")
  })
  it('desconectar pide confirmación', () => {
    expect(UI).toContain('<ConfirmButton onConfirm={() => handleDisconnect(m)}')
  })
  it('los datos usan las funciones de la migración', () => {
    const data = FILES['/src/data/locationToken.ts']
    for (const fn of ['create_member_location_token', 'revoke_member_location_token', 'list_member_location_token_status']) expect(data).toContain(fn)
    expect(data).not.toContain('member_location_tokens')
  })
})
