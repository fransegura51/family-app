// Funciones de servidor de Comunidad: estructura y garantías que se comprueban leyendo el código fuente (como hace fcmSender.test.ts):
// autenticación por cabecera en las de cron, nada sin aprobación humana, nada llama a ai_gate, empaquetado de Edge Functions y migración 0275.
import { describe, expect, it } from 'vitest'
import communityAi from '../../supabase/functions/_shared/communityAi.ts?raw'
import communityRuntime from '../../supabase/functions/_shared/communityRuntime.ts?raw'
import communityServer from '../../supabase/functions/_shared/communityServer.ts?raw'
import geminiRaw from '../../supabase/functions/_shared/ai/gemini.ts?raw'
import maintenanceIndex from '../../supabase/functions/community-maintenance/index.ts?raw'
import maintenance from '../../supabase/functions/community-maintenance/maintenance.ts?raw'
import pepaIndex from '../../supabase/functions/community-pepa/index.ts?raw'
import pepa from '../../supabase/functions/community-pepa/pepa.ts?raw'
import summarizeIndex from '../../supabase/functions/community-summarize/index.ts?raw'
import summarize from '../../supabase/functions/community-summarize/summarize.ts?raw'
import eurostat from '../../supabase/functions/community-weekly-proposals/eurostat.ts?raw'
import weeklyIndex from '../../supabase/functions/community-weekly-proposals/index.ts?raw'
import proposals from '../../supabase/functions/community-weekly-proposals/proposals.ts?raw'
import migration0264 from '../../supabase/migrations/0264_community_core.sql?raw'
import migration0265 from '../../supabase/migrations/0265_community_content.sql?raw'
import migration0270 from '../../supabase/migrations/0270_community_official.sql?raw'
import migration0272 from '../../supabase/migrations/0272_community_public_read.sql?raw'
import migration0325 from '../../supabase/migrations/0325_community_editorial_automation.sql?raw'
import migration0275Raw from '../../supabase/migrations/0275_community_cron_functions.sql?raw'
import rollback0275 from '../../supabase/rollbacks/0275_community_cron_functions_down.sql?raw'
import { COMMUNITY_AI_PURPOSES } from '../../supabase/functions/_shared/communityAi'
import { TOPICS } from '../../supabase/functions/community-weekly-proposals/proposals'

// Los saltos de línea de Windows no deben romper las comprobaciones de texto.
const migration0275 = migration0275Raw.replace(/\r\n/g, '\n')

// Quita los comentarios (// y /* */) para comprobar solo el CÓDIGO.
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// Lo mismo para SQL (-- comentarios).
const sql = (src: string): string => src.replace(/--.*$/gm, '')

const PURE_FILES: Record<string, string> = { communityAi, communityServer, maintenance, pepa, summarize, eurostat, proposals }
const ALL_FILES: Record<string, string> = { ...PURE_FILES, communityRuntime, maintenanceIndex, pepaIndex, summarizeIndex, weeklyIndex }
const CRON_HANDLERS: Record<string, string> = { pepa, maintenance, proposals }
const CRON_INDEXES: Record<string, string> = { pepaIndex, maintenanceIndex, weeklyIndex }

describe('nada llama a ai_gate (que es por familia)', () => {
  it.each(Object.entries(ALL_FILES))('%s no usa ai_gate ni ai_record_usage', (_name, src) => {
    expect(code(src)).not.toMatch(/ai_gate|ai_record_usage/)
  })
  it('usa los contadores de Comunidad', () => {
    const c = code(communityAi)
    expect(c).toContain('community_service_ai_allowed')
    expect(c).toContain('community_service_record_ai')
  })
  it('los propósitos de IA coinciden con el CHECK vigente de la tabla de uso (0273, ampliado en 0325)', () => {
    const m = /community_ai_usage_purpose_check\s+check \(purpose in \(([^)]*)\)\)/.exec(migration0325)!
    const inDb = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()
    expect([...COMMUNITY_AI_PURPOSES].sort()).toEqual(inDb)
  })
})

describe('reutiliza la capa de IA existente sin duplicarla', () => {
  it('importa el proveedor de _shared/ai y no vuelve a escribir la llamada a Gemini', () => {
    expect(communityAi).toContain("from './ai/providers.ts'")
    expect(communityAi).toContain("from './ai/types.ts'")
    expect(geminiRaw).toContain('generativelanguage.googleapis.com')
    for (const [name, src] of Object.entries(ALL_FILES)) {
      expect(src, name).not.toContain('generativelanguage.googleapis.com')
      expect(src, name).not.toMatch(/x-goog-api-key/)
    }
  })
})

describe('empaquetado de Edge Functions', () => {
  it('ningún import sale de supabase/functions ni apunta a src/ (las Edge Functions no resuelven «../» hacia src)', () => {
    for (const [name, src] of Object.entries(ALL_FILES)) {
      const imports = [...src.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2])
      for (const spec of imports) {
        const ok = spec.startsWith('./') || spec.startsWith('../_shared/') || spec.startsWith('npm:') || spec.startsWith('jsr:')
        expect(ok, `${name}: ${spec}`).toBe(true)
        expect(spec, name).not.toMatch(/\/src\//)
      }
    }
  })
  it('los imports relativos llevan extensión .ts (Deno la exige)', () => {
    for (const [name, src] of Object.entries(ALL_FILES)) {
      for (const m of src.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) expect(m[1], `${name}: ${m[1]}`).toMatch(/\.ts$/)
    }
  })
  it('los módulos con la lógica son puros: sin Deno ni npm: (por eso se prueban en Node); solo communityRuntime toca el entorno', () => {
    for (const [name, src] of Object.entries(PURE_FILES)) {
      expect(code(src), name).not.toMatch(/\bDeno\b/)
      expect(src, name).not.toMatch(/['"]npm:|['"]jsr:/)
    }
    expect(communityRuntime).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")')
    expect(communityRuntime).toContain('npm:@supabase/supabase-js@2')
  })
  it('cada función tiene su index.ts con Deno.serve y el import de runtime de Edge Functions', () => {
    for (const [name, src] of Object.entries({ summarizeIndex, ...CRON_INDEXES })) {
      expect(src, name).toContain('Deno.serve(')
      expect(src, name).toContain('import "jsr:@supabase/functions-js/edge-runtime.d.ts"')
    }
  })
  it('la clave de servicio solo se lee en el módulo de entorno y nunca se escribe en el código', () => {
    for (const [name, src] of Object.entries(PURE_FILES)) expect(code(src), name).not.toMatch(/SERVICE_ROLE|service_role_key/i)
  })
})

describe('las funciones por cron se autentican por cabecera (no por JWT de persona)', () => {
  it('comparan x-cron-secret con el secreto cron_shared_secret del Vault', () => {
    expect(communityServer).toContain("req.headers.get('x-cron-secret')")
    expect(communityServer).toContain("p_name: 'cron_shared_secret'")
    expect(communityServer).toContain('timingSafeEqual(')
  })
  it.each(Object.entries(CRON_HANDLERS))('%s exige la cabecera ANTES de hacer nada', (_name, src) => {
    const handler = src.slice(src.indexOf('export async function handle'))
    expect(handler.indexOf('await authorizeCron(req, deps.admin)')).toBeGreaterThan(-1)
    expect(handler.indexOf('await authorizeCron(')).toBeLessThan(handler.indexOf('await run'))
    expect(handler).toContain('if (denied) return denied')
  })
  it.each(Object.entries(CRON_INDEXES))('%s documenta verify_jwt = false (la llama pg_net sin JWT)', (_name, src) => {
    expect(src).toContain('verify_jwt = false a propósito')
    expect(src).toContain('x-cron-secret')
  })
  it('community-summarize SÍ usa la sesión de la persona (JWT), exige alias y no usa la cabecera de cron', () => {
    expect(summarize).toContain("req.headers.get('Authorization')")
    expect(summarize).toContain('community_get_my_profile')
    expect(summarize).not.toContain('x-cron-secret')
    expect(summarizeIndex).toContain('verify_jwt = true')
    expect(communityRuntime).toContain('userClient.auth.getUser()')
  })
})

describe('nada se publica sin aprobación humana', () => {
  it('el lote semanal solo escribe con community_service_create_proposals (estado «proposed»)', () => {
    const c = code(proposals) + code(eurostat)
    const writes = [...c.matchAll(/\.rpc\(\s*'([a-z_]+)'/g)].map((m) => m[1])
    expect(new Set(writes)).toEqual(new Set(['community_service_ai_allowed', 'community_service_create_proposals']))
    expect(c).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
    expect(c).not.toMatch(/approve|publish_item|community_posts|community_polls|\bpublished\b/i)
  })
  it('la función SQL que usa deja las filas en «proposed» y avisa a administración; publicar exige a un administrador (0270)', () => {
    const create = migration0270.slice(migration0270.indexOf('function public.community_service_create_proposals'), migration0270.indexOf('grant execute on function public.community_service_create_proposals'))
    expect(create).toContain('insert into public.community_official_items')
    expect(create).not.toContain('community_publish_item')
    expect(create).not.toMatch(/status\s*=\s*'(approved|published)'/)
    const approve = migration0270.slice(migration0270.indexOf('function public.community_admin_approve_proposal'), migration0270.indexOf('function public.community_admin_reject_proposal'))
    expect(approve).toContain('private.community_require_admin()')
  })
  it('un artículo sin fuentes no se propone ni en el código ni en la base de datos', () => {
    expect(migration0270).toContain("v_kind = 'article' and coalesce(jsonb_array_length(v_payload -> 'sources'), 0) = 0")
    expect(proposals).toContain('sources: [source]')
  })
  it('las fuentes del artículo las construye el código: la IA no escribe enlaces (el esquema de salida no tiene campo de fuentes ni de url)', () => {
    const schema = proposals.slice(proposals.indexOf('export const ARTICLE_SCHEMA'), proposals.indexOf('// Tabla de datos en texto'))
    expect(schema).not.toMatch(/url|source|fuente/i)
    expect(proposals).toContain('buildArticleItem')
  })
  it('Pepa solo publica comentarios con la función de servidor (identidad oficial), nunca publicaciones ni contenido oficial', () => {
    const c = code(pepa)
    expect([...c.matchAll(/\.rpc\(\s*'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual(
      ['community_service_ai_allowed', 'community_service_pepa_candidates', 'community_service_pepa_comment', 'community_service_pepa_mentions', 'community_service_record_ai'].sort(),
    )
    expect(c).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
  })
  it('el resumen solo guarda con community_service_save_summary', () => {
    const c = code(summarize)
    expect(c).toContain("'community_service_save_summary'")
    expect(c).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
  })
  it('mantenimiento solo escribe en la cola de borrado de fotos y en el almacenamiento de Comunidad', () => {
    const c = code(maintenance)
    expect([...c.matchAll(/\.from\(\s*'([a-z_]+)'\)/g)].map((m) => m[1])).toEqual(['community_media_deletions'])
    expect(c).not.toMatch(/\.update\(|\.upsert\(|\.delete\(/)
    expect(c).toContain("MEDIA_BUCKET = 'community-media'")
  })
})

describe('catálogos y constantes fáciles de cambiar', () => {
  it('los temas de la función son EXACTAMENTE los de community_topics (0264)', () => {
    const block = migration0264.slice(migration0264.indexOf('insert into public.community_topics'), migration0264.indexOf('create table public.community_profiles'))
    const inDb = Object.fromEntries([...block.matchAll(/\('([a-z-]+)',\s*'(recetas|hogar)'/g)].map((m) => [m[1], m[2]]))
    expect(TOPICS).toEqual(inDb)
  })
  it('los códigos de Eurostat están en una constante exportada junto al formato de la API', () => {
    expect(eurostat).toContain('export const EUROSTAT_CATALOG')
    expect(eurostat).toContain("export const EUROSTAT_API_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data'")
    expect(eurostat).toContain('prc_hicp_aind')
    expect(eurostat).toContain('hbs_str_t211')
  })
})

describe('migración 0275 (trabajos programados)', () => {
  it('programa las tres funciones con su horario y el secreto del Vault', () => {
    expect(migration0275).toContain("'community-pepa',\n    '*/10 * * * *'")
    expect(migration0275).toContain("'community-maintenance',\n    '*/15 * * * *'")
    expect(migration0275).toContain("'community-weekly-proposals',\n    '0 8 * * 3'")
    for (const f of ['community-pepa', 'community-maintenance', 'community-weekly-proposals']) {
      expect(migration0275).toContain(`https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/${f}`)
    }
    expect((migration0275.match(/'x-cron-secret', \(select public\.get_app_secret\('cron_shared_secret'\)\)/g) ?? []).length).toBe(3)
    expect(sql(migration0275)).not.toMatch(/ai_gate/)
  })
  it('es idempotente y tiene su deshacer', () => {
    expect((migration0275.match(/cron\.unschedule\(/g) ?? []).length).toBe(3)
    expect((rollback0275.match(/cron\.unschedule\(/g) ?? []).length).toBe(3)
    expect(rollback0275).not.toMatch(/drop table|delete from/i)
  })
  it('no toca tablas ni datos: solo trabajos programados', () => {
    expect(sql(migration0275)).not.toMatch(/\b(create|alter|drop)\s+table|insert into|update\s+public|delete from/i)
  })
})

describe('menú semanal oficial: candados de la migración 0270', () => {
  const fn = (name: string) => migration0270.slice(migration0270.indexOf(`function ${name}`), migration0270.indexOf('$$;', migration0270.indexOf(`function ${name}`)))
  it('la publicación automática nace DESACTIVADA y el panel no puede cambiarla (no está en la lista blanca de ajustes)', () => {
    expect(migration0270).toContain("('weekly_menu_autopublish', '0',")
    expect(migration0270).not.toMatch(/\('weekly_menu_autopublish', '1'/)
  })
  it('el trabajo del menú no hace nada si el ajuste no vale 1, bloquea con skip locked, limita a 3 intentos y no publica sin aprobar', () => {
    const run = fn('private.community_run_menus')
    expect(run).toContain("private.community_setting_int('weekly_menu_autopublish', 0) <> 1")
    expect(run).toContain('for update skip locked')
    expect(run).toContain('publish_attempts < 3')
    expect(run).toContain("i.status = 'approved'")
    expect(run).toContain('private.community_notify_admins')
  })
  it('una sola publicación por semana: índices únicos parciales en los elementos y en las publicaciones', () => {
    expect(migration0270).toContain('create unique index uq_community_official_menu_week on public.community_official_items (menu_week_start)')
    expect(migration0270).toContain("where kind = 'menu' and menu_week_start is not null and status <> 'rejected'")
    expect(migration0270).toContain('create unique index uq_community_posts_menu_week')
  })
  it('aprobar un menú semanal programa (no publica) y vuelve a validar; el servidor rechaza menús inválidos; publicar también valida', () => {
    const approve = fn('public.community_admin_approve_proposal')
    expect(approve).toContain('private.community_validate_menu_item(i.payload)')
    expect(approve.indexOf("i.payload ->> 'schedule' = 'saturday'")).toBeLessThan(approve.indexOf('private.community_publish_item(p_id)'))
    expect(approve).toContain("'scheduled', true")
    expect(fn('public.community_service_create_proposals')).toContain("raise exception 'MENU_INVALID'")
    expect(fn('private.community_publish_item')).toContain('private.community_validate_menu_item(i.payload)')
  })
  it('las herramientas de intervención son de administración y el trabajo de cada 5 minutos es uno solo', () => {
    for (const f of ['community_admin_list_menus', 'community_admin_get_menu', 'community_admin_reschedule_menu', 'community_admin_retry_publish']) expect(fn(`public.${f}`), f).toContain('private.community_require_admin()')
    expect(migration0270).toContain("cron.schedule('community-run-polls', '*/5 * * * *', 'select private.community_run_official()')")
  })
  it('los datos del menú solo salen por el detalle con sesión (0265): ni la tarjeta ni la lectura pública los llevan', () => {
    const detail = migration0265.slice(migration0265.indexOf('function private.community_post_detail'), migration0265.indexOf('function public.community_get_post'))
    expect(detail).toContain("'menu', p.menu")
    const card = migration0265.slice(migration0265.indexOf('function private.community_card'), migration0265.indexOf('function public.community_list_posts'))
    expect(card).not.toMatch(/p\.menu/)
    const pub = migration0272.slice(migration0272.indexOf('function public.community_public_get_post'), migration0272.indexOf('function public.community_public_get_comments'))
    expect(pub).not.toMatch(/p\.menu|'menu'/)
  })
})
