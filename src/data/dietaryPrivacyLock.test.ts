// CANDADO DE PRIVACIDAD de las alergias e intolerancias de la ficha privada (datos de salud, RGPD art. 9; migración 0279; análisis en
// docs/comunidad/ALERGIAS_INTOLERANCIAS_ANALISIS.md). Pruebas ESTÁTICAS sobre el código: fallan si alguien conecta esos datos a la IA, a las funciones de
// servidor, a Comunidad, a los avisos o a los registros. Lo que NO pueden demostrar (frases libres que escriba la persona, lo que ocurra en Google)
// está documentado en el análisis.
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const norm = (p: string) => relative(ROOT, p).split(sep).join('/')

function walk(dir: string, accept: (file: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, accept, out)
    else if (accept(full)) out.push(full)
  }
  return out
}
const isCode = (f: string) => /\.(ts|tsx|mjs|js|sql)$/.test(f)
const isTest = (f: string) => /\.test\.(ts|tsx|mjs)$/.test(f)
const read = (f: string) => readFileSync(f, 'utf8')

// Identificadores de la ficha de salud: tabla, funciones, módulos y campos.
const HEALTH_REF = /member_dietary_restrictions|member_health_consent|dietary_(?:list|add|update|delete|grant_consent|revoke_consent)\b|dietary_restrictions|allergen_key|dietaryRestrictions|dietaryRestrictionsRules/

// El único archivo de servidor que nombra estos identificadores es la propia guarda que los PROHÍBE en las peticiones a la IA.
const GUARD_FILE = 'supabase/functions/_shared/ai/healthGuard.ts'

describe('ninguna función de servidor puede tocar la ficha de salud', () => {
  const files = walk(join(ROOT, 'supabase/functions'), isCode)

  it('hay funciones que revisar (para que el candado no se quede vacío)', () => {
    expect(files.length).toBeGreaterThan(60)
  })

  it('ningún archivo de supabase/functions (IA, Comunidad, avisos, push, sincronizaciones…) nombra la tabla, sus funciones ni el módulo', () => {
    const offenders = files.filter((f) => norm(f) !== GUARD_FILE && HEALTH_REF.test(read(f))).map(norm)
    expect(offenders).toEqual([])
  })

  it('la guarda es la única que los nombra, y solo para prohibirlos', () => {
    const text = read(join(ROOT, GUARD_FILE))
    expect(text).toContain('HEALTH_FORBIDDEN_MARKERS')
    expect(text).toContain('member_dietary_restrictions')
    expect(text).not.toMatch(/\.rpc\(|\.from\(|fetch\(/)
  })

  it('ningún worker, script ni semilla de datos las menciona', () => {
    const others = [...walk(join(ROOT, 'workers'), isCode), ...walk(join(ROOT, 'scripts'), isCode), ...walk(join(ROOT, 'supabase/seed'), isCode)]
    expect(others.filter((f) => HEALTH_REF.test(read(f))).map(norm)).toEqual([])
  })
})

describe('ninguna otra migración las nombra', () => {
  const migrations = walk(join(ROOT, 'supabase/migrations'), (f) => f.endsWith('.sql'))
  it('solo 0279 menciona la tabla y sus funciones (ni Comunidad 0264-0277, ni avisos 0260-0263, ni futuras)', () => {
    const offenders = migrations.filter((f) => !norm(f).endsWith('0279_family_dietary_restrictions.sql') && HEALTH_REF.test(read(f))).map(norm)
    expect(offenders).toEqual([])
  })

  it('ninguna migración mete las tablas en Realtime ni en una publicación', () => {
    for (const f of migrations) {
      const t = read(f)
      if (/alter publication/i.test(t)) expect(t, norm(f)).not.toMatch(/member_dietary|member_health/)
    }
  })
})

describe('ningún código del cliente conecta la ficha con la IA, la voz, Comunidad o los avisos', () => {
  const src = walk(join(ROOT, 'src'), (f) => isCode(f) && !isTest(f)).map(norm)
  // Archivos que construyen peticiones a la IA o dependen de las funciones de IA, estén donde estén.
  const aiCallers = src.filter((f) => /callAiFunction|services\/aiClient|functions\/v1\//.test(read(join(ROOT, f))))

  it('hay archivos del cliente que llaman a la IA (para que el candado no se quede vacío)', () => {
    expect(aiCallers.length).toBeGreaterThanOrEqual(6)
  })

  it('ningún archivo que llama a la IA importa o nombra las alergias', () => {
    const offenders = aiCallers.filter((f) => HEALTH_REF.test(read(join(ROOT, f))))
    expect(offenders).toEqual([])
  })

  const FORBIDDEN_DIRS = [/^src\/services\//, /^src\/pepa\//, /^src\/ui\/community\//, /^src\/data\/community[A-Za-z]*\.ts$/, /^src\/domain\/community[A-Za-z]*\.ts$/, /^src\/data\/notifications[A-Za-z]*\.ts$/, /^src\/data\/errorReports\.ts$/]
  it('services, Pepa (voz), Comunidad, avisos y registros de errores no importan ni nombran las alergias', () => {
    const offenders = src.filter((f) => FORBIDDEN_DIRS.some((r) => r.test(f)) && HEALTH_REF.test(read(join(ROOT, f))))
    expect(offenders).toEqual([])
  })

  it('el módulo de alergias no importa nada de IA, voz, Comunidad, avisos ni registro de errores', () => {
    for (const f of ['src/data/dietaryRestrictions.ts', 'src/domain/dietaryRestrictions.ts', 'src/domain/dietaryRestrictionsRules.ts']) {
      const imports = [...read(join(ROOT, f)).matchAll(/from '([^']+)'/g)].map((m) => m[1])
      for (const i of imports) expect(i, `${f} importa ${i}`).not.toMatch(/aiClient|services\/|pepa\/|community|notification|errorReports|events|food/)
    }
  })

  it('los módulos de alergias solo los importan pantallas de Familia/Cocina y sus pruebas: ni data/ ajenos ni domain/ ajenos', () => {
    const importers = src.filter((f) => !/^src\/(data|domain)\/dietaryRestrictions/.test(f) && /dietaryRestrictions/.test(read(join(ROOT, f))))
    for (const f of importers) expect(f, `${f} no debería importar las alergias`).toMatch(/^src\/ui\/(?!community\/)/)
  })

  it('ningún texto de la interfaz guarda alergias en la URL, en el almacenamiento del navegador ni en la consola', () => {
    for (const f of ['src/data/dietaryRestrictions.ts', 'src/domain/dietaryRestrictions.ts', 'src/domain/dietaryRestrictionsRules.ts']) {
      const code = read(join(ROOT, f)).replace(/\/\/.*$/gm, '')
      expect(code, f).not.toMatch(/localStorage|sessionStorage|indexedDB|console\.|location\.|URLSearchParams|document\.cookie/)
    }
  })
})

describe('la puerta de la IA rechaza cargas con datos de salud', () => {
  it('el cliente (callAiFunction) y el servidor (createProvider) llevan la guarda', () => {
    expect(read(join(ROOT, 'src/services/aiClient.ts'))).toMatch(/assertNoHealthData\(body\)/)
    const providers = read(join(ROOT, 'supabase/functions/_shared/ai/providers.ts'))
    expect(providers).toMatch(/guardHealthData\(createGeminiProvider\(apiKey\)\)/)
    expect(providers).toMatch(/assertNoHealthData\(/)
  })

  it('ningún archivo de servidor crea un proveedor de Gemini saltándose createProvider', () => {
    const direct = walk(join(ROOT, 'supabase/functions'), isCode).filter((f) => /createGeminiProvider\(/.test(read(f)) && !/_shared\/ai\/(gemini|providers)\.ts$/.test(norm(f)))
    expect(direct.map(norm)).toEqual([])
    // Y nadie llama a la API de Google por su cuenta fuera de gemini.ts.
    const raw = walk(join(ROOT, 'supabase/functions'), isCode).filter((f) => /generativelanguage\.googleapis\.com/.test(read(f)) && !/_shared\/ai\/gemini\.ts$/.test(norm(f)))
    expect(raw.map(norm)).toEqual([])
  })
})

describe('la migración 0279 (estructura)', () => {
  const m = read(join(ROOT, 'supabase/migrations/0279_family_dietary_restrictions.sql'))
  // Sin comentarios de línea ni los textos de «comment on» (que pueden nombrar lo que NO hay).
  const code = m.replace(/^\s*--.*$/gm, '').replace(/^comment on .*$/gm, '')

  it('seguridad por filas activa y NINGÚN permiso en las tablas (ni app, ni anónimos, ni service_role)', () => {
    for (const t of ['member_dietary_restrictions', 'member_health_consent']) {
      expect(code).toContain(`alter table public.${t} enable row level security;`)
      expect(code).toMatch(new RegExp(`revoke all on public\\.${t} from public, anon, authenticated, service_role;`))
    }
    expect(code).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[^;]*\bon\s+(?:table\s+)?public\.member_/i)
    expect(code).not.toMatch(/grant[^;]*to (?:anon|public)/i)
  })

  it('solo hay políticas de lectura, para el rol authenticated y con la regla por rol', () => {
    const policies = [...code.matchAll(/create policy "([^"]+)" on public\.[a-z_]+ for ([a-z]+) to ([a-z]+)/g)]
    expect(policies).toHaveLength(2)
    for (const p of policies) {
      expect(p[2]).toBe('select')
      expect(p[3]).toBe('authenticated')
    }
    expect(code).toContain("in ('admin', 'adult')")
    expect(code).toContain('private.current_member_id()')
    expect(code).toContain('private.current_family_id()')
    expect(code).toContain('private.current_role_in_family()')
  })

  it('todas las funciones son SECURITY DEFINER con search_path vacío (las de cálculo, solo search_path vacío)', () => {
    const fns = [...code.matchAll(/create or replace function ((?:public|private)\.[a-z_]+)\(([\s\S]*?)\bas\b\s*\$\$/g)]
    expect(fns.length).toBeGreaterThanOrEqual(11)
    for (const f of fns) {
      expect(f[0], f[1]).toMatch(/set search_path = ''/)
      if (!/dietary_allergen_keys|dietary_norm/.test(f[1])) expect(f[0], f[1]).toMatch(/security definer/)
    }
  })

  it('las funciones de la app solo las puede ejecutar authenticated (nunca public, anon ni service_role)', () => {
    const names = [...code.matchAll(/create or replace function public\.([a-z_]+)\(([^)]*)\)/g)].map((x) => [x[1], x[2].trim().split(/\s*,\s*/).map((a) => a.split(' ')[1]).join(', ')] as const)
    expect(names.map((n) => n[0]).sort()).toEqual(['dietary_add', 'dietary_delete', 'dietary_grant_consent', 'dietary_list', 'dietary_revoke_consent', 'dietary_update'])
    for (const [n, args] of names) {
      const a = args === 'undefined' || args === '' ? '' : args
      expect(code, n).toContain(`revoke all on function public.${n}(${a}) from public, anon, service_role;`)
      expect(code, n).toContain(`grant execute on function public.${n}(${a}) to authenticated;`)
    }
    expect(code).not.toMatch(/grant execute on function [^;]* to (?:anon|public|service_role)/)
  })

  it('las funciones privadas (cálculo y triggers) no son ejecutables por nadie desde fuera', () => {
    for (const n of ['dietary_allergen_keys()', 'dietary_norm(text)', 'dietary_restrictions_guard()', 'dietary_purge_on_revoke()', 'dietary_purge_on_profile_delete()']) {
      expect(code, n).toContain(`revoke all on function private.${n} from public, anon, authenticated, service_role;`)
    }
  })

  it('sin activity_log, sin Realtime, sin Comunidad y sin IA', () => {
    expect(code).not.toMatch(/log_activity|activity_log|supabase_realtime|alter publication|community_|ai_gate|gemini/i)
  })

  it('borrado en cascada: miembro, familia y revocación del consentimiento; y al borrar el acceso de la persona', () => {
    expect(code.match(/references public\.families\(id\) on delete cascade/g)).toHaveLength(2)
    expect(code.match(/references public\.family_members\(id\) on delete cascade/g)).toHaveLength(2)
    expect(code).toContain('create trigger member_health_consent_purge after update of revoked_at')
    expect(code).toContain('create trigger dietary_purge_on_profile_delete before delete on public.profiles')
  })

  it('sin consentimiento activo no se guarda (también por trigger), con tope y límites de longitud', () => {
    expect(code).toContain("raise exception 'DIET_NO_CONSENT'")
    expect(code).toContain("raise exception 'DIET_LIMIT'")
    expect(code).toContain("check (allergen_key = any (private.dietary_allergen_keys()))")
    expect(code).toContain('check ((allergen_key is null) <> (custom_label is null))')
  })

  it('los fallos esperados no lanzan excepciones con datos: las funciones devuelven {ok:false,error}', () => {
    const publicBodies = code.slice(code.indexOf('create or replace function public.dietary_list'))
    expect(publicBodies).not.toMatch(/raise exception/)
    expect(publicBodies).not.toMatch(/raise notice|raise warning|raise log/i)
    expect(code).not.toMatch(/raise (?:notice|warning|info|log)/i)
  })

  it('el deshacer existe y borra todo lo creado', () => {
    const down = read(join(ROOT, 'supabase/rollbacks/0279_family_dietary_restrictions_down.sql'))
    for (const t of ['member_dietary_restrictions', 'member_health_consent']) expect(down).toContain(`drop table if exists public.${t} cascade;`)
    for (const f of ['dietary_list()', 'dietary_add(uuid, text, text, text, text, text)', 'dietary_update(uuid, text, text, text, text)', 'dietary_delete(uuid)', 'dietary_grant_consent(uuid, text)', 'dietary_revoke_consent(uuid)']) {
      expect(down).toContain(`drop function if exists public.${f};`)
    }
    expect(down).toContain('drop trigger if exists dietary_purge_on_profile_delete on public.profiles;')
  })
})

describe('«Borrar mi cuenta» sigue funcionando con las tablas sin permisos para service_role', () => {
  it('la función de servidor borra con DELETE sobre families (cascada) y con delete_account_prepare: no lee ni escribe las tablas de salud', () => {
    const fn = read(join(ROOT, 'supabase/functions/delete-account/index.ts'))
    expect(fn).toContain('admin.from("families").delete().eq("id", familyId)')
    expect(fn).toContain('delete_account_prepare')
    expect(fn).not.toMatch(/dietary|health_consent/)
    // Las cascadas las ejecuta el propietario de la tabla (comprobado con PostgreSQL real en db-tests/dietary.test.mjs), no service_role.
  })
})
