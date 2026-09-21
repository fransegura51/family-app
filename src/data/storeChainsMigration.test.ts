import { describe, expect, it } from 'vitest'

// Guardas de la FASE 3 (cadenas comerciales). La migración es la fuente; aquí se lee como texto.
const FILES = import.meta.glob(['/supabase/migrations/0142_store_chains.sql', '/supabase/rollbacks/0142_store_chains_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0142_store_chains.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0142_store_chains_down.sql']
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

// Solo el código SQL (sin comentarios de línea) para que las frases explicativas no cuenten como sentencias.
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const PROTECTED = ['products', 'product_prices', 'receipts', 'expenses', 'budgets', 'budget_categories', 'family_food_types', 'families', 'family_members', 'profiles', 'tags', 'shopping_stores', 'shopping_items', 'shopping_trips', 'catalog_categories', 'catalog_food_types']

describe('Fase 3: tablas de cadenas', () => {
  const chainsTable = SQL.slice(SQL.indexOf('create table public.store_chains ('), SQL.indexOf('comment on table public.store_chains'))
  const aliasesTable = SQL.slice(SQL.indexOf('create table public.store_chain_aliases ('), SQL.indexOf('create index store_chain_aliases_chain_idx'))

  it('store_chains: clave estable, nombre, tipo, learnable, estado y marcas de tiempo', () => {
    for (const piece of ['key text primary key', 'name text not null', 'kind text not null', 'learnable boolean not null default false', "status text not null default 'active'", 'created_at timestamptz', 'updated_at timestamptz']) {
      expect(chainsTable, piece).toContain(piece)
    }
    expect(chainsTable).toContain("kind in ('supermarket', 'marketplace', 'fuel_retail', 'local_shop')")
    expect(chainsTable).toContain('check (status = \'active\' or not learnable)')
  })

  it('PRINCIPIO: ninguna columna de cadenas ni de alias apunta a categoría, clase o tipo de alimento', () => {
    for (const table of [chainsTable, aliasesTable]) {
      expect(table).not.toMatch(/categor|class|food_type|catalog_key|budget_/i)
    }
    expect(MIGRATION).toMatch(/una cadena NUNCA determina la categoría ni la clase/i)
  })

  it('alias: normalizados por la propia base de datos, únicos y sin subcadenas', () => {
    expect(aliasesTable).toContain('alias_norm = public.catalog_norm_name(alias_norm)')
    expect(aliasesTable).toContain('length(alias_norm) >= 4')
    expect(aliasesTable).toContain("match_mode in ('exact', 'word_prefix')")
    expect(aliasesTable).toContain('unique (alias_norm)')
    expect(aliasesTable).toContain('references public.store_chains (key) on update cascade on delete restrict')
    expect(SQL).not.toMatch(/\blike\b|\bilike\b|similarity|levenshtein|soundex/i)
  })

  it('la resolución compara palabras completas y no adivina: desconocido, ambiguo y alfabetos no latinos quedan sin resolver', () => {
    expect(SQL).toContain("left(v_norm, length(a.alias_norm) + 1) = a.alias_norm || ' '")
    for (const reason of ['empty', 'unsupported_characters', 'unknown', 'ambiguous']) expect(SQL, reason).toContain(`'${reason}'::text`)
    expect(SQL).toContain('cardinality(v_keys) > 1')
    expect(SQL).toContain("c.status = 'active'")
  })

  it('Charter tiene su propia clave y ningún alias de Consum lo nombra', () => {
    expect(SQL).toMatch(/\('charter', 'Charter', 'supermarket', true/)
    expect(SQL).toMatch(/\('charter', 'charter', 'exact'/)
    expect(SQL).not.toMatch(/\('consum', '[^']*charter/)
  })
})

describe('Fase 3: seguridad', () => {
  it('RLS activa; los usuarios solo leen; nadie escribe salvo migraciones y service_role', () => {
    expect(SQL).toContain('alter table public.store_chains enable row level security')
    expect(SQL).toContain('alter table public.store_chain_aliases enable row level security')
    expect(SQL).toMatch(/revoke all on public\.store_chains, public\.store_chain_aliases from public, anon, authenticated/)
    expect(SQL).toMatch(/grant select on public\.store_chains, public\.store_chain_aliases to authenticated/)
    expect(SQL).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*to\s+(authenticated|anon|public)/i)
    const policies = [...SQL.matchAll(/create policy [^\n]*/g)].map((m) => m[0])
    expect(policies).toHaveLength(2)
    for (const policy of policies) expect(policy).toMatch(/for select to authenticated using \(true\)/)
  })

  it('la resolución no es pública: solo usuarios autenticados y service_role; sin security definer', () => {
    expect(SQL).toContain('revoke all on function public.resolve_store_chain(text) from public, anon')
    expect(SQL).toContain('grant execute on function public.resolve_store_chain(text) to authenticated, service_role')
    expect(SQL).not.toMatch(/security definer/i)
  })
})

describe('Fase 3: aislamiento y rollback', () => {
  it('no toca ningún dato de negocio, catálogo ni función existente', () => {
    for (const table of PROTECTED) {
      expect(SQL, table).not.toMatch(new RegExp(`(?:insert into|update|delete from|alter table|drop table|truncate)\\s+(?:only\\s+)?(?:public\\.)?${table}\\b`, 'i'))
    }
    expect(SQL).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop\b/i)
    expect(SQL).not.toMatch(/class_confirmed_at|shared_product_learning|classification_source|create_family/i)
    const alters = [...SQL.matchAll(/alter table\s+(\S+)/gi)].map((m) => m[1])
    expect(alters.every((t) => t === 'public.store_chains' || t === 'public.store_chain_aliases')).toBe(true)
  })

  it('el rollback borra solo lo creado aquí y conserva el catálogo (catalog_norm_name es de la Fase 1)', () => {
    for (const dropped of ['drop function if exists public.resolve_store_chain(text)', 'drop table if exists public.store_chain_aliases', 'drop table if exists public.store_chains', 'drop function if exists public.store_chains_touch_updated_at()']) {
      expect(ROLLBACK, dropped).toContain(dropped)
    }
    const statements = ROLLBACK.replace(/--[^\n]*/g, '')
    expect(statements).not.toMatch(/catalog_|delete from|truncate|budget|product|receipt|expense/i)
  })

  it('la app todavía no consulta las tablas de cadenas (fase de infraestructura)', () => {
    const users = Object.entries(APP)
      .filter(([file, text]) => file !== '/src/domain/storeChains.ts' && /store_chains|store_chain_aliases|resolve_store_chain/.test(text))
      .map(([file]) => file)
    expect(users).toEqual([])
  })

  it('las utilidades nuevas son puras y aún no están conectadas a ningún flujo', () => {
    for (const file of ['/src/domain/storeChains.ts', '/src/domain/productText.ts']) {
      expect(APP[file], file).not.toMatch(/^import /m)
    }
    const importers = Object.entries(APP)
      .filter(([file, text]) => !file.endsWith('/storeChains.ts') && !file.endsWith('/productText.ts') && /from ['"](?:@\/domain|\.\.?)\/(?:storeChains|productText)['"]/.test(text))
      .map(([file]) => file)
    expect(importers).toEqual([])
  })
})
