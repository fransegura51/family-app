// Comunidad PEPA — candados de seguridad de las migraciones (0264-0275): se leen los textos SQL y se exige que NINGUNA tabla de Comunidad sea accesible directamente
// y que TODA función cumpla las reglas (SECURITY DEFINER con ruta de búsqueda vacía, permisos explícitos, funciones del servidor solo para service_role,
// funciones de administración con comprobación de administrador). La lógica se prueba además con una base de datos de verdad (PostgreSQL) fuera de este conjunto.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'supabase/migrations')
const files = readdirSync(dir)
  .filter((f) => /^02(6[4-9]|7\d)_community|^0260_|^0261_|^0262_|^0263_/.test(f) && f.includes('_'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
const community = files.filter((f) => /_community_/.test(f))
const sql = community.map((f) => ({ f, text: readFileSync(join(dir, f), 'utf8') }))
const all = sql.map((x) => x.text).join('\n')

function tables(): string[] {
  return [...all.matchAll(/create table public\.(community_[a-z_]+)/g)].map((m) => m[1])
}

describe('tablas de Comunidad', () => {
  const list = tables()

  it('hay tablas (para que el candado no se quede vacío) y todas con seguridad por filas activa', () => {
    expect(list.length).toBeGreaterThanOrEqual(35)
    for (const t of list) expect(all, t).toMatch(new RegExp(`alter table public\\.${t} enable row level security;`))
  })

  it('NINGUNA es accesible directamente desde la app: se revoca todo a anon y authenticated y no hay ni una política', () => {
    const revokedTables = new Set<string>()
    for (const m of all.matchAll(/revoke all on ([\s\S]*?) from (?:public, )?anon, authenticated;/g)) {
      for (const t of m[1].matchAll(/public\.([a-z_]+)/g)) revokedTables.add(t[1])
    }
    for (const t of list) expect(revokedTables.has(t), `${t} sin revoke all`).toBe(true)
    // Las únicas políticas de Comunidad son las de las FOTOS (Storage), restringidas a la carpeta propia.
    const policies = [...all.matchAll(/create policy "([^"]+)"/g)].map((m) => m[1])
    expect(policies.length).toBeGreaterThan(0)
    expect(policies.every((p) => p.startsWith('community media:'))).toBe(true)
  })

  it('ninguna tabla guarda nombre real, familia ni correo de las personas de Comunidad', () => {
    const profileTable = /create table public\.community_profiles \(([\s\S]*?)\n\);/.exec(all)?.[1] ?? ''
    expect(profileTable).not.toMatch(/family_id|display_name|email|real_name/i)
  })

  it('la receta pública es una copia independiente: no guarda la receta privada ni la familia de quien publica', () => {
    const recipes = /create table public\.community_recipes \(([\s\S]*?)\n\);/.exec(all)?.[1] ?? ''
    expect(recipes).not.toMatch(/family_id|private_recipe/i)
  })

  it('el historial de administración no se puede editar ni borrar', () => {
    expect(all).toContain('community_admin_log_no_update before update or delete on public.community_admin_log')
  })
})

describe('funciones de Comunidad', () => {
  it('todas son SECURITY DEFINER con search_path vacío (nada de rutas abiertas)', () => {
    const headers = [...all.matchAll(/create (?:or replace )?function (?:public|private)\.[a-z_]+\([\s\S]*?\bas\b\s*(?:\$\$|\$function\$)/g)].map((m) => m[0])
    expect(headers.length).toBeGreaterThanOrEqual(120)
    for (const h of headers) {
      const name = /function ((?:public|private)\.[a-z_]+)/.exec(h)?.[1]
      const isTrigger = /returns trigger/.test(h)
      if (/community_(admin_log_immutable|posts_check_topic|comments_one_level|profile_on_unlink)|validate_notification_prefs|plain_excerpt|poll_window|medal_catalog|community_menu_(text_key|warn|quality|state|publish_window)|community_validate_menu/.test(name ?? '')) {
        expect(h, name).toMatch(/set search_path = ''/)
        continue
      }
      expect(h, name).toMatch(/security definer/)
      expect(h, `${name} (${isTrigger ? 'trigger' : 'función'}) sin search_path vacío`).toMatch(/set search_path (?:= ''|to 'public')/)
    }
  })

  it('las funciones del servidor (community_service_*) solo las puede llamar service_role', () => {
    const names = [...new Set([...all.matchAll(/function public\.(community_service_[a-z_]+)\(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2].replace(/\s+default\s+[^,]+/g, '').replace(/[a-z_]+ ([a-z\[\]]+)/g, '$1')})`))]
    expect(names.length).toBeGreaterThanOrEqual(10)
    for (const raw of names) {
      const base = raw.split('(')[0]
      expect(all, base).toMatch(new RegExp(`grant execute on function public\\.${base}\\([^)]*\\) to service_role;`))
      expect(all, base).not.toMatch(new RegExp(`grant execute on function public\\.${base}\\([^)]*\\) to (?:anon|authenticated)`))
    }
  })

  it('las funciones de administración comprueban que quien llama es administrador de Comunidad', () => {
    const adminFns = [...all.matchAll(/create (?:or replace )?function public\.(community_admin_[a-z_]+)\(([\s\S]*?)\n\$\$;/g)]
    expect(adminFns.length).toBeGreaterThanOrEqual(25)
    for (const m of adminFns) expect(m[0], m[1]).toContain('private.community_require_admin()')
  })

  it('las funciones de participación comprueban sesión, alias, reglas, expulsión, lanzamiento y adultos antes de escribir', () => {
    // La definición VIGENTE es la última (0271 sustituye a la de 0265).
    const guard = [...all.matchAll(/create or replace function private\.community_require_participant\(\)([\s\S]*?)\n\$\$;/g)].at(-1)?.[1] ?? ''
    for (const code of ['AUTH_REQUIRED', 'NOT_LAUNCHED', 'ALIAS_REQUIRED', 'BANNED']) expect(guard).toContain(code)
    // La edad y los permisos de la familia (menores) se comprueban en CADA llamada, con una función de 0277.
    expect(guard).toContain('private.community_require_participation_access()')
    for (const w of ['community_create_post', 'community_add_comment', 'community_toggle_like', 'community_toggle_save', 'community_follow_user', 'community_rate_recipe', 'community_report', 'community_vote_poll', 'community_save_draft']) {
      const body = new RegExp(`function public\\.${w}\\([\\s\\S]*?\\n\\$\\$;`).exec(all)?.[0] ?? ''
      expect(body, w).toContain('private.community_require_participant()')
    }
  })

  it('ninguna función pública de lectura sin sesión devuelve identificadores de personas ni de familias', () => {
    const pub = /create or replace function public\.community_public_get_post[\s\S]*?\n\$\$;/.exec(all)?.[0] ?? ''
    expect(pub).not.toMatch(/'author_id'|'family_id'|user_id|profile_id/)
    const comments = /create or replace function public\.community_public_get_comments[\s\S]*?\n\$\$;/.exec(all)?.[0] ?? ''
    expect(comments).not.toMatch(/'author_id'|'family_id'|user_id|profile_id/)
    expect(pub).toContain('private.community_launched()')
  })

  it('un visitante sin sesión (anon) solo puede ejecutar una lista cerrada de funciones, y los avisos de visitantes no guardan identidad ni ocultan nada', () => {
    const anonFns = new Set([...all.matchAll(/grant execute on function public\.([a-z_]+)\([^)]*\) to [a-z_, ]*\banon\b/g)].map((m) => m[1]))
    expect([...anonFns].sort()).toEqual(
      ['community_list_topics', 'community_public_get_comments', 'community_public_get_poll', 'community_public_get_post', 'community_public_sitemap', 'community_visitor_report'].sort())
    const table = /create table public\.community_visitor_reports \(([\s\S]*?)\n\);/.exec(all)?.[1] ?? ''
    expect(table).not.toMatch(/user_id|profile_id|family_id|email|\bip\b|reporter_id/i)
    const fn = /create or replace function public\.community_visitor_report\([\s\S]*?\n\$\$;/.exec(all)?.[0] ?? ''
    for (const w of ['private.community_launched()', 'private.community_clean_text', 'RATE_LIMIT', 'private.community_notify_admins']) expect(fn, w).toContain(w)
    // Nunca oculta contenido por sí solo: eso solo lo hace la administración al resolver.
    expect(fn).not.toContain('community_set_content_status')
    expect(all).toMatch(/revoke all on function public\.community_visitor_report\([^)]*\) from public, anon, authenticated;/)
  })

  it('el borrado de cuenta deja el contenido como «Usuario eliminado» sin identidad', () => {
    expect(all).toContain('user_id uuid unique references auth.users(id) on delete set null')
    expect(all).toContain('new.alias := null;')
    expect(all).toContain("'Usuario eliminado'")
  })

  it('el texto se limpia en el servidor: código ejecutable, enlaces peligrosos, direcciones IP y dominios bloqueados', () => {
    const clean = /function private\.community_clean_text[\s\S]*?\n\$\$;/.exec(all)?.[0] ?? ''
    for (const code of ['UNSAFE_CONTENT', 'UNSAFE_LINK', 'BLOCKED_LINK', 'TOO_MANY_LINKS', 'TEXT_TOO_LONG']) expect(clean).toContain(code)
    expect(clean).toContain('javascript')
  })

  it('las fotos solo pueden venir de la propia carpeta (id del perfil público) y deben existir', () => {
    const check = /function private\.community_check_photo_paths[\s\S]*?\n\$\$;/.exec(all)?.[0] ?? ''
    expect(check).toContain("split_part(v_path, '/', 1) <> p_cp::text")
    expect(check).toContain('storage.objects')
    expect(all).toContain("(storage.foldername(name))[1] = (select private.community_cp()::text)")
  })
})

describe('menores y fotos privadas (0277, 0266)', () => {
  it('toda función de lectura de Comunidad comprueba el acceso por edad y permisos en cada llamada', () => {
    for (const fn of ['community_list_posts', 'community_similar_posts', 'community_search_suggest', 'community_get_post', 'community_list_comments', 'community_get_public_profile', 'community_get_poll', 'community_get_summary', 'community_news_breakdown', 'community_get_medals', 'community_list_recipe_reviews']) {
      const body = new RegExp(`function public\\.${fn}\\([\\s\\S]*?\\n\\$\\$;`).exec(all)?.[0] ?? ''
      expect(body, fn).toContain('private.community_require_reader()')
    }
  })

  it('las funciones de permisos de menores solo las ejecuta quien tiene sesión y exigen ser administrador de familia', () => {
    expect(all).toMatch(/revoke all on function public\.community_set_minor_permission\(uuid, boolean, boolean, boolean\) from public, anon;/)
    expect(all).not.toMatch(/grant execute on function public\.community_(?:set|list)_minor_permission[a-z_]*\([^)]*\) to anon/)
    const setFn = /function public\.community_set_minor_permission[\s\S]*?\n\$\$;/.exec(all)?.[0] ?? ''
    expect(setFn).toContain('private.community_family_admin()')
    expect(setFn).toContain('v_age < 15 or v_age >= 18')
  })

  it('el bucket de fotos es privado y la lectura la decide una política con contenido publicado', () => {
    expect(all).toMatch(/values \('community-media', 'community-media', false,/)
    expect(all).toContain('create policy "community media: read" on storage.objects')
    expect(all).toContain('private.community_photo_visible')
  })

  it('el contenido de menores no llega a la IA', () => {
    expect(all).toContain('alter table public.community_posts add column ai_excluded')
    for (const fn of ['community_service_summary_input', 'community_service_pepa_candidates', 'community_service_pepa_mentions']) {
      const body = new RegExp(`function public\\.${fn}\\([\\s\\S]*?\\n\\$\\$;`).exec(all)?.[0] ?? ''
      expect(body, fn).toContain('ai_excluded')
    }
  })
})

describe('deshacer', () => {
  it('cada migración de Comunidad tiene su archivo en supabase/rollbacks', () => {
    const rollbacks = readdirSync(join(process.cwd(), 'supabase/rollbacks'))
    for (const f of community) {
      const n = f.slice(0, 4)
      expect(rollbacks.some((r) => r.startsWith(n)), `sin deshacer: ${f}`).toBe(true)
    }
  })
})
