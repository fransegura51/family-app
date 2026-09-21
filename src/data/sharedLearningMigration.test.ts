import { describe, expect, it } from 'vitest'

// Guardas de la FASE 4 (aprendizaje compartido). La migración es la fuente; aquí se lee como texto.
const FILES = import.meta.glob(['/supabase/migrations/0143_shared_product_learning.sql', '/supabase/rollbacks/0143_shared_product_learning_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0143_shared_product_learning.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0143_shared_product_learning_down.sql']
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

// Solo el código SQL (sin comentarios de línea): las frases explicativas no cuentan como sentencias.
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const table = (name: string) => SQL.slice(SQL.indexOf(`create table public.${name} (`), SQL.indexOf(');', SQL.indexOf(`create table public.${name} (`)))
const LEARNING = table('shared_product_learning')
const BATCHES = table('shared_learning_batches')
const columnsOf = (ddl: string) =>
  ddl
    .split('\n')
    .map((l) => l.match(/^ {2}([a-z_]+) (?:uuid|text|integer|timestamptz)\b/)?.[1])
    .filter(Boolean)

const PROTECTED = ['products', 'product_prices', 'receipts', 'expenses', 'budgets', 'budget_categories', 'family_food_types', 'families', 'family_members', 'profiles', 'tags', 'shopping_stores', 'shopping_items', 'shopping_trips', 'catalog_categories', 'catalog_food_types', 'catalog_release', 'store_chains', 'store_chain_aliases']

describe('Fase 4: shared_product_learning', () => {
  it('identidad UNIQUE(chain_key, text_key) y FK reales a store_chains y catalog_food_types (claves estables)', () => {
    expect(LEARNING).toContain('unique (chain_key, text_key)')
    expect(LEARNING).toMatch(/chain_key text not null references public\.store_chains \(key\) on update cascade on delete restrict/)
    expect(LEARNING).toMatch(/food_type_key text references public\.catalog_food_types \(key\) on update cascade on delete restrict/)
    expect(LEARNING).toMatch(/batch_key text not null references public\.shared_learning_batches \(key\)/)
  })

  it('estados explícitos: pending, approved, ambiguous y retired', () => {
    expect(LEARNING).toContain("status in ('pending', 'approved', 'ambiguous', 'retired')")
  })

  it('un ambiguo NO puede llevar clase y un aprobado exige clase y aprobación (respaldo en la propia tabla)', () => {
    expect(LEARNING).toContain("status = 'approved' and food_type_key is not null and approved_by is not null and approved_at is not null")
    expect(LEARNING).toContain("status = 'ambiguous' and food_type_key is null")
  })

  it('solo contiene información generalizable: ninguna columna de familia, usuario, precio, fecha de compra, cantidad, ticket, banco o tienda concreta', () => {
    expect(columnsOf(LEARNING)).toEqual(['id', 'chain_key', 'text_key', 'food_type_key', 'status', 'batch_key', 'approved_by', 'approved_at', 'retired_at', 'notes', 'created_at', 'updated_at'])
    expect(columnsOf(BATCHES)).toEqual(['key', 'catalog_version', 'process', 'approved_by', 'approved_at', 'notes', 'created_at'])
    for (const ddl of [LEARNING, BATCHES]) {
      expect(ddl).not.toMatch(/family|user|profile|member|price|amount|quantity|receipt|expense|store\b|location|iban|email|name/i)
    }
  })

  it('text_key: formato de solo palabras en minúscula, sin signos ni secuencias largas de dígitos', () => {
    expect(LEARNING).toContain("text_key ~ '^[[:alnum:]]+( [[:alnum:]]+)*$'")
    expect(LEARNING).toContain('text_key = lower(text_key)')
    expect(LEARNING).toContain('length(text_key) between 2 and 60')
    expect(LEARNING).toContain("text_key !~ '\\d( ?\\d){8}'")
  })

  it('el guard exige, para aprobar: cadena activa y aprendible, clase aprobada del catálogo y validación de privacidad', () => {
    const guard = SQL.slice(SQL.indexOf('create or replace function public.shared_product_learning_guard'), SQL.indexOf('create trigger shared_product_learning_guard'))
    expect(guard).toContain("new.status = 'approved'")
    expect(guard).toContain('learnable is distinct from true')
    expect(guard).toContain("status is distinct from 'active'")
    expect(guard).toMatch(/catalog_food_types ft where ft\.key = new\.food_type_key and ft\.status = 'approved'/)
    expect(guard).toContain('public.check_commercial_text(new.text_key)')
    expect(SQL).toMatch(/create trigger shared_product_learning_guard\s+before insert or update on public\.shared_product_learning/)
  })

  it('lotes: versión de catálogo, proceso y aprobación identificados por un slug (nunca una persona)', () => {
    expect(BATCHES).toMatch(/catalog_version integer not null references public\.catalog_release \(version\)/)
    expect(BATCHES).toContain("approved_by text not null check (approved_by ~ '^[a-z][a-z0-9_]*$')")
    expect(LEARNING).toContain("approved_by text check (approved_by ~ '^[a-z][a-z0-9_]*$')")
    expect(SQL).toMatch(/\('pepa_seed_v1', 1,/)
    expect(SQL).toContain("'pepa_admin', now()")
  })
})

describe('Fase 4: la siembra', () => {
  it('169 filas aprobadas + 1 ambigua, todas del lote pepa_seed_v1', () => {
    const approved = SQL.match(/'approved', 'pepa_seed_v1', 'pepa_admin', now\(\)\)/g) ?? []
    expect(approved).toHaveLength(169)
    expect(SQL.match(/'ambiguous', 'pepa_seed_v1'/g)).toHaveLength(1)
    expect(SQL).toContain("('charter', 'sup bebida fria', null, 'ambiguous', 'pepa_seed_v1'")
  })

  it('la propia migración falla si la siembra no es exactamente 169 (133 / 29 / 7) y solo de esas cadenas', () => {
    expect(SQL).toContain('v_total <> 169 or v_m <> 133 or v_h <> 29 or v_c <> 7 or v_other <> 0')
    expect(SQL).toContain("chain_key not in ('mercadona', 'hiperber', 'charter')")
  })

  it('no copia datos de ninguna familia: sin INSERT ... SELECT ni referencias a tablas de negocio', () => {
    expect(SQL).not.toMatch(/insert into[^;]*\bselect\b/i)
    for (const t of PROTECTED) {
      expect(SQL, t).not.toMatch(new RegExp(`(?:insert into|update|delete from|alter table|drop table|truncate)\\s+(?:only\\s+)?(?:public\\.)?${t}\\b`, 'i'))
    }
    for (const t of ['products', 'product_prices', 'receipts', 'expenses', 'budgets', 'families', 'profiles']) {
      expect(SQL, t).not.toMatch(new RegExp(`\\b(?:from|join)\\s+(?:public\\.)?${t}\\b`, 'i'))
    }
    expect(SQL).not.toMatch(/class_confirmed_at|classification_source|create_family|is_seed_template|hepburn/i)
  })
})

describe('Fase 4: seguridad', () => {
  it('las tablas NO están expuestas: RLS activa, sin políticas y sin ningún permiso para usuarios', () => {
    expect(SQL).toContain('alter table public.shared_learning_batches enable row level security')
    expect(SQL).toContain('alter table public.shared_product_learning enable row level security')
    expect(SQL).toMatch(/revoke all on public\.shared_learning_batches, public\.shared_product_learning from public, anon, authenticated/)
    expect(SQL).not.toMatch(/create policy/i)
    expect(SQL).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*on\s+(?:table\s+)?public\.shared_/i)
  })

  it('solo se consulta por la RPC: security definer únicamente en resolve_shared_product_class, ejecutable por usuarios autenticados y service_role', () => {
    expect(SQL.match(/security definer/g)).toHaveLength(1)
    const rpc = SQL.slice(SQL.indexOf('create or replace function public.resolve_shared_product_class'), SQL.indexOf('alter table public.shared_learning_batches'))
    expect(rpc).toContain('security definer')
    expect(rpc).toContain('set search_path = public')
    for (const fn of ['resolve_shared_product_class(text, text)', 'product_text_key(text)', 'check_commercial_text(text)']) {
      expect(SQL).toContain(`revoke all on function public.${fn} from public, anon`)
      expect(SQL).toContain(`grant execute on function public.${fn} to authenticated, service_role`)
    }
  })

  it('la RPC sigue el orden: cadena → aprendible → texto seguro → búsqueda; y solo devuelve clase con approved', () => {
    const rpc = SQL.slice(SQL.indexOf('create or replace function public.resolve_shared_product_class'), SQL.indexOf('alter table public.shared_learning_batches'))
    const at = (s: string) => rpc.indexOf(s)
    expect(at('resolve_store_chain(p_store)')).toBeGreaterThan(-1)
    expect(at('resolve_store_chain(p_store)')).toBeLessThan(at('not v_chain.learnable'))
    expect(at('not v_chain.learnable')).toBeLessThan(at('check_commercial_text(p_text)'))
    expect(at('check_commercial_text(p_text)')).toBeLessThan(at('from public.shared_product_learning l'))
    for (const status of ['chain_unresolved', 'chain_not_learnable', 'invalid', 'not_found', 'ambiguous', 'matched']) expect(rpc, status).toContain(`'${status}'::text`)
    // la clase solo sale en la rama matched
    expect(rpc.match(/v_row\.l_food_type, 'shared'/g)).toHaveLength(1)
    expect(rpc).toContain("v_row.l_status not in ('approved', 'ambiguous')")
    expect(rpc).toMatch(/l\.chain_key = v_chain\.chain_key and l\.text_key = v_key/)
  })

  it('las funciones gemelas usan array_append (un literal sin tipo no se puede concatenar a un array)', () => {
    expect(SQL).not.toMatch(/v_issues\s*\|\|/)
    expect(SQL).toContain("regexp_matches(p_text, '\\d+(?:[ .-]\\d+)*', 'g')")
  })
})

describe('Fase 4: aislamiento, rollback y app sin conectar', () => {
  it('solo crea objetos nuevos: las únicas tablas alteradas son las suyas', () => {
    const alters = [...SQL.matchAll(/alter table\s+(\S+)/gi)].map((m) => m[1])
    expect(alters.every((t) => t === 'public.shared_learning_batches' || t === 'public.shared_product_learning')).toBe(true)
    expect(SQL).not.toMatch(/\bdrop\b|\btruncate\b|\bdelete from\b/i)
    const updates = [...SQL.matchAll(/\bupdate\s+public\.\w+/gi)].map((m) => m[0])
    expect(updates).toEqual([])
  })

  it('el rollback elimina la infraestructura y la siembra y conserva las fases 1-3', () => {
    for (const dropped of [
      'drop function if exists public.resolve_shared_product_class(text, text)',
      'drop table if exists public.shared_product_learning',
      'drop table if exists public.shared_learning_batches',
      'drop function if exists public.shared_product_learning_guard()',
      'drop function if exists public.check_commercial_text(text)',
      'drop function if exists public.product_text_key(text)',
    ]) {
      expect(ROLLBACK, dropped).toContain(dropped)
    }
    const statements = ROLLBACK.replace(/--[^\n]*/g, '')
    expect(statements).not.toMatch(/store_chain|catalog_|resolve_store_chain|budget|product_prices|receipt|expense|families|delete from|truncate/i)
    expect(statements).not.toMatch(/drop table if exists public\.products/i)
  })

  it('la app todavía NO usa el aprendizaje compartido: nada lo importa ni lo consulta', () => {
    const users = Object.entries(APP)
      .filter(([file, text]) => file !== '/src/domain/sharedLearning.ts' && /shared_product_learning|resolve_shared_product_class|shared_learning_batches|pepa_seed_v1|sharedLearning/.test(text))
      .map(([file]) => file)
    expect(users).toEqual([])
  })

  it('el clasificador actual, los productos y los tickets siguen sin conocer las cadenas ni el aprendizaje', () => {
    for (const file of ['/src/domain/foodTypes.ts', '/src/domain/products.ts', '/src/domain/productSplit.ts']) {
      expect(APP[file], file).toBeDefined()
      expect(APP[file], file).not.toMatch(/storeChains|productText|sharedLearning|resolve_shared|shared_product/)
    }
  })

  it('el espejo TypeScript es puro: solo importa las utilidades de la Fase 3 y ninguna capa de datos', () => {
    const imports = [...APP['/src/domain/sharedLearning.ts'].matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    expect(imports.sort()).toEqual(['./productText', './storeChains'])
  })
})
