// Registro de uso por cuenta (migración 0226): qué se cuenta, cómo se ordena y que no se guarda nada más que contadores.
import { describe, expect, it } from 'vitest'
import { buildAccountActivity, rankOverall, rankSections, type AccountForActivity, type ActivityRow } from '@/domain/usageActivity'
import { OPEN_KEY, sectionKeyForPath, USAGE_SECTIONS } from '@/domain/usageSections'

const FILES = import.meta.glob(
  ['/src/services/usageTracker.ts', '/src/ui/UsageTracker.tsx', '/src/ui/AppActivityPanel.tsx', '/src/ui/AdminUsageScreen.tsx', '/src/App.tsx', '/src/data/appUsageActivity.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SQL = Object.entries(MIGRATIONS).find(([f]) => f.includes('0226_app_usage_activity'))?.[1] ?? ''
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

const account = (id: string, name: string, family = 'f1'): AccountForActivity => ({
  profileId: id,
  familyId: family,
  familyName: family === 'f1' ? 'Familia A' : 'Familia B',
  displayName: name,
  email: `${name}@x.test`,
  createdAt: '2026-10-01T10:00:00Z',
  lastSignInAt: null,
  hasPush: false,
})
const row = (profileId: string, section: string, hits: number, daysUsed = 1, lastDay = '2026-10-08'): ActivityRow => ({ profileId, familyId: 'f1', section, hits, daysUsed, lastDay })

describe('pantallas que se cuentan', () => {
  it('la ruta se convierte en el nombre de la pantalla (sin identificadores ni parámetros)', () => {
    expect(sectionKeyForPath('/')).toBe('inicio')
    expect(sectionKeyForPath('/calendario')).toBe('calendario')
    expect(sectionKeyForPath('/calendario/evento/abc-123?x=1')).toBe('calendario')
    expect(sectionKeyForPath('/dinero')).toBe('dinero')
  })
  it('lo desconocido y el panel de administración NO se cuentan', () => {
    expect(sectionKeyForPath('/admin-uso')).toBeNull()
    expect(sectionKeyForPath('/loquesea')).toBeNull()
    expect(sectionKeyForPath('/__proto__')).toBeNull()
  })
  it('todas las claves son válidas para la base de datos (^[a-z0-9_-]{1,40}$)', () => {
    for (const key of [OPEN_KEY, ...Object.keys(USAGE_SECTIONS)]) expect(key).toMatch(/^[a-z0-9_-]{1,40}$/)
  })
})

describe('actividad por cuenta', () => {
  const accounts = [account('a', 'Ana'), account('b', 'Beto'), account('c', 'Carla', 'f2')]
  const rows = [
    row('a', OPEN_KEY, 10, 4),
    row('a', 'calendario', 12),
    row('a', 'compras', 30),
    row('a', 'dinero', 3),
    row('b', OPEN_KEY, 2, 1),
    row('b', 'calendario', 1),
  ]
  const lines = buildAccountActivity(accounts, rows)

  it('una línea por cuenta, la que menos usa la app primero (las inactivas son las que interesa detectar)', () => {
    expect(lines.map((l) => l.displayName)).toEqual(['Carla', 'Beto', 'Ana'])
  })
  it('detecta la cuenta que nunca ha abierto la app', () => {
    expect(lines[0]).toMatchObject({ displayName: 'Carla', opens: 0, inactive: true, sections: [] })
    expect(lines[2]).toMatchObject({ displayName: 'Ana', opens: 10, daysActive: 4, inactive: false })
  })
  it('las pantallas de cada cuenta van de MÁS a MENOS usada y no incluyen la apertura', () => {
    expect(lines[2].sections.map((s) => [s.label, s.hits])).toEqual([['Compras', 30], ['Calendario', 12], ['Dinero', 3]])
    expect(lines[2].sections.some((s) => s.key === OPEN_KEY)).toBe(false)
  })
  it('a igualdad de entradas, orden alfabético estable', () => {
    expect(rankSections([{ section: 'dinero', hits: 2 }, { section: 'calendario', hits: 2 }]).map((s) => s.key)).toEqual(['calendario', 'dinero'])
  })
})

describe('pantallas más y menos usadas en total', () => {
  const rows = [row('a', 'compras', 30), row('b', 'compras', 5), row('a', 'calendario', 12), row('a', OPEN_KEY, 9)]
  const overall = rankOverall(rows, Object.keys(USAGE_SECTIONS))
  it('suma todas las cuentas, de mayor a menor, y cuenta cuántas cuentas distintas la usan', () => {
    expect(overall[0]).toMatchObject({ key: 'compras', hits: 35, accounts: 2 })
    expect(overall[1]).toMatchObject({ key: 'calendario', hits: 12, accounts: 1 })
  })
  it('las pantallas que nadie ha abierto salen con 0 al final (son las menos útiles)', () => {
    const last = overall[overall.length - 1]
    expect(last.hits).toBe(0)
    expect(overall.filter((s) => s.hits === 0).length).toBe(Object.keys(USAGE_SECTIONS).length - 2)
    expect(overall.some((s) => s.key === OPEN_KEY)).toBe(false)
  })
})

describe('registro en la app: pocas llamadas y sin contenido', () => {
  const tracker = FILES['/src/services/usageTracker.ts']
  it('acumula en el móvil y manda todo junto: como mucho una llamada cada 5 min de uso, más una al pasar a segundo plano', () => {
    expect(tracker).toContain('const FLUSH_EVERY_MS = 5 * 60_000')
    expect(tracker).toContain("supabase.rpc('record_app_usage', { p_counts: batch })")
    expect((tracker.match(/supabase\.rpc\(/g) ?? []).length).toBe(1)
    expect(tracker).toContain("document.visibilityState === 'hidden'")
  })
  it('lo que no llega a enviarse se guarda en el móvil y se reintenta (no se pierde) y un fallo nunca rompe la app', () => {
    expect(tracker).toContain("const PENDING_KEY = 'family-app:usage-pending'")
    expect(tracker).toContain('for (const [key, n] of Object.entries(batch)) pending[key] = (pending[key] ?? 0) + n')
    expect(tracker).toMatch(/catch \{/)
  })
  it('una apertura por sesión y otra al volver tras más de 30 min en segundo plano', () => {
    expect(tracker).toContain('const REOPEN_AFTER_HIDDEN_MS = 30 * 60_000')
    expect(tracker).toContain('recordOpen()')
  })
  it('solo manda nombres de pantalla y números: nada de rutas, textos ni datos', () => {
    expect(tracker).not.toMatch(/pathname|location\.href|userAgent|localStorage\.getItem\('family-app:(?!usage)/)
    const ui = FILES['/src/ui/UsageTracker.tsx']
    expect(ui).toContain('sectionKeyForPath(location.pathname)')
  })
  it('se monta dentro de la app con sesión, junto a los demás vigilantes', () => {
    expect(FILES['/src/App.tsx']).toContain('<UsageTracker />')
  })
})

describe('migración 0226', () => {
  it('guarda solo contadores por cuenta y día; sin acceso directo a la tabla y con RLS', () => {
    expect(CODE).toContain('hits integer not null default 0')
    expect(CODE).toContain("section text not null check (section ~ '^[a-z0-9_-]{1,40}$')")
    expect(CODE).toContain('alter table public.app_usage_daily enable row level security;')
    expect(CODE).toContain('revoke all on public.app_usage_daily from public, anon, authenticated;')
    expect(CODE).not.toMatch(/create policy/i)
    expect(CODE).not.toMatch(/\b(ip|user_agent|email|payload|content)\b\s+(text|inet)/i)
  })
  it('cada cuenta solo escribe lo suyo (auth.uid()), con topes y sin ejecutar si no hay sesión', () => {
    expect(CODE).toContain('v_profile uuid := auth.uid()')
    expect(CODE).toContain('exit when v_seen > 40')
    expect(CODE).toContain('least(500,')
    expect(CODE).toContain('if v_profile is null or p_counts is null')
  })
  it('solo las propietarias leen (is_app_owner); el resto recibe 0 filas', () => {
    expect(CODE.split('me.is_app_owner').length - 1).toBe(2)
    expect(CODE).toContain('grant execute on function public.list_app_usage_activity(integer) to authenticated;')
    expect(CODE).toContain('grant execute on function public.list_app_owner_families() to authenticated;')
  })
  it('las tres funciones son SECURITY DEFINER con search_path fijo y cerradas a anon/public', () => {
    expect((CODE.match(/security definer/g) ?? []).length).toBe(3)
    expect((CODE.match(/set search_path to 'public'/g) ?? []).length).toBe(3)
    expect(CODE.match(/revoke all on function[^;]*from public, anon, authenticated;/g)?.length).toBe(3)
    expect(CODE).not.toMatch(/grant [^;]* to (anon|public)\b/)
  })
  it('de las personas de cada familia solo se cuenta el número, no los nombres', () => {
    const fn = CODE.slice(CODE.indexOf('create or replace function public.list_app_owner_families'))
    expect(fn).toContain('select count(*) from public.family_members')
    expect(fn).not.toMatch(/\bm\.name\b/)
  })
})

describe('panel de propietaria', () => {
  const panel = FILES['/src/ui/AppActivityPanel.tsx']
  it('una línea por cuenta con desplegable (details) que lista sus pantallas de más a menos usada', () => {
    expect(panel).toContain('<details')
    expect(panel).toContain('buildAccountActivity(accounts, rows)')
    expect(panel).toContain('l.sections.map(')
  })
  it('enseña el ranking global de pantallas y avisa de las cuentas que no han abierto la app', () => {
    expect(panel).toContain('rankOverall(rows, Object.keys(USAGE_SECTIONS))')
    expect(panel).toContain('no la ha abierto')
  })
  it('solo aparece para propietarias (misma señal que el resto del panel)', () => {
    expect(FILES['/src/ui/AdminUsageScreen.tsx']).toContain('{isAppOwnerView && <AppActivityPanel accounts={rows} />}')
  })
})
