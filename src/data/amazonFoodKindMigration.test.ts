import { describe, expect, it } from 'vitest'

// Guardas de la FASE 6C (Amazon, categoría financiera y food/non_food).
const FILES = import.meta.glob(
  ['/supabase/migrations/0148_amazon_food_kind_cleanup.sql', '/supabase/rollbacks/0148_amazon_food_kind_cleanup_down.sql'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0148_amazon_food_kind_cleanup.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0148_amazon_food_kind_cleanup_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const ROLLBACK_SQL = ROLLBACK.replace(/--[^\n]*/g, '')
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const HEPBURN = "'011429a4-4fd8-4341-9c04-ec6b2f585196'"

describe('Fase 6C — migración de datos: alcance', () => {
  it('trabaja únicamente sobre Familia Hepburn (id + nombre comprobados); no toca Demo ni otras familias', () => {
    expect(SQL).toContain(`c_family constant uuid := ${HEPBURN}`)
    expect(SQL).toContain("where id = c_family and name = 'Familia Hepburn'")
    for (const other of ['72296108-f334-4098-95aa-91bf489c7ac2', '223ea7b0-bd93-4e6d-9acb-46d4aa60817b', 'e98546ca-3240-48db-bf7b-c64e548de8b0']) expect(SQL).not.toContain(other)
  })

  it('las ÚNICAS escrituras: products (por id), la categoría de ESE ticket (por id) y el registro de reversibilidad', () => {
    const updates = [...SQL.matchAll(/update\s+public\.(\w+)\s+set\s+([^;]+);/gi)].map((m) => `${m[1]}: ${m[2].replace(/\s+/g, ' ').trim()}`)
    expect(updates).toEqual([
      'products: non_food = true where id = any (c_contradictions)',
      "products: category = 'Ropa y calzado', class_confirmed_at = now(), non_food = true where id in (c_shirt_a, c_shirt_b)",
      "receipts: category = 'Regalos y compras varias' where id = c_receipt",
    ])
    expect(SQL).not.toMatch(/delete from|\btruncate\b|\bdrop\b/i)
    expect([...SQL.matchAll(/insert into\s+(public\.\w+)/gi)].map((m) => m[1])).toEqual([
      'public.food_kind_migration_log',
      'public.food_kind_migration_log',
      'public.food_kind_migration_log',
    ])
  })

  it('NINGÚN criterio de cambio usa la tienda: ni Amazon ni ningún comercio en los UPDATE/INSERT de datos', () => {
    const writes = [...SQL.matchAll(/(update\s+public\.\w+\s+set[^;]+;|insert into public\.food_kind_migration_log[\s\S]*?;)/gi)].map((m) => m[0]).join('\n')
    expect(writes).not.toMatch(/amazon|store|cofidis|like\s/i)
  })

  it('NO toca gastos, precios, presupuestos, categorías, clases, catálogo, cadenas, aprendizaje compartido ni create_family', () => {
    expect(SQL).not.toMatch(/(update|delete from|insert into|alter table)\s+public\.(expenses|product_prices|budgets|budget_categories|family_food_types|catalog_\w+|store_chain\w*|shared_\w+|families|profiles)\b/i)
    expect(SQL).not.toMatch(/create or replace function|create_family/i)
  })
})

describe('Fase 6C — precondiciones e invariantes que abortan', () => {
  it('las 10 contradicciones se identifican por EVIDENCIA (clase confirmada + kind no_alimentos + non_food false) y deben ser exactamente las auditadas', () => {
    expect(SQL).toContain("where p.class_confirmed_at is not null and ft.kind = 'no_alimentos' and p.non_food = false")
    expect(SQL).toContain('v_found is distinct from (select array_agg(x order by x) from unnest(c_contradictions) x)')
    expect(SQL).toContain("(select count(*) from public.products where id = any (c_contradictions) and family_id = c_family) <> 10")
    expect([...SQL.matchAll(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g)].length).toBeGreaterThan(14)
  })

  it('el café es caso de control: se comprueba que es alimentación confirmada y su fila queda idéntica', () => {
    expect(SQL).toContain("c_cafe constant uuid := 'fe839dfd-29e5-4150-8e60-9d322df1c05b'")
    expect(SQL).toContain("ft.kind = 'alimentacion' and ft.catalog_key = 'food.bebidas_no_alcoholicas'")
    expect(SQL).toContain('is distinct from v_cafe_h')
    // el café no está entre los ids que se actualizan
    expect(SQL.match(/c_contradictions constant uuid\[\] := array\[[^\]]*\]/)?.[0]).not.toContain('fe839dfd')
  })

  it('las camisetas: mismo pedido, dos líneas de 24,99 € que suman el total, sin clase ni confirmación, clase Ropa y calzado existente', () => {
    for (const piece of [
      "v_receipt.notes is distinct from 'Pedido 402-9067482-7147522'",
      'v_receipt.total_amount <> 49.98',
      '(select count(*) from public.product_prices where receipt_id = c_receipt) <> 2',
      "(select sum(price * quantity::numeric) from public.product_prices where receipt_id = c_receipt) <> 49.98",
      'price <> 24.99',
      'nullif(btrim(category), \'\') is null and class_confirmed_at is null and non_food = false',
      "catalog_key = 'other.ropa_calzado' and kind = 'no_alimentos' and name = 'Ropa y calzado'",
      "product_classification = 'Ropa y calzado'",
    ]) {
      expect(SQL, piece).toContain(piece)
    }
  })

  it('el ticket: por id, con su gasto vinculado ya en «Regalos y compras varias» (P); no existe regla Amazon → categoría', () => {
    expect(SQL).toContain("c_receipt constant uuid := '02c189b8-35a0-4502-91e9-0947d68004ff'")
    expect(SQL).toContain("category = 'Regalos y compras varias'\n                 and amount = 49.98")
    expect(SQL).toContain("where family_id = c_family and category = 'Amazon') <> 1")
    expect(SQL).not.toMatch(/update public\.receipts[^;]*(store|amazon|like)/i)
  })

  it('invariantes finales: importes, gastos, precios, presupuestos, clases, catálogo, cadenas, compartido y otras filas idénticos', () => {
    for (const piece of [
      'is distinct from v_exp_h',
      'is distinct from v_prices_h',
      'is distinct from v_budgets_h',
      'is distinct from v_bcats_h',
      'is distinct from v_types_h',
      'is distinct from v_shared_h',
      'is distinct from v_chains_h',
      'is distinct from v_aliases_h',
      'is distinct from v_families_h',
      'is distinct from v_prod_rest_h',
      'is distinct from v_prod_others_h',
      'is distinct from v_rec_rest_h',
      '<> v_nonfood_n + 12',
      '<> v_confirmed_n + 2',
      '(select sum(total_amount) from public.receipts) <> v_rec_sum',
      '(select sum(amount) from public.expenses) <> v_exp_sum',
      '(select sum(price) from public.product_prices) <> v_prices_sum',
      'se revierte todo',
    ]) {
      expect(SQL, piece).toContain(piece)
    }
  })

  it('la categoría financiera personal Amazon NO se retira (el webhook aún la escribe): ningún DELETE ni borrado de budget_categories', () => {
    expect(SQL).not.toMatch(/delete from public\.budget_categories/i)
    expect(SQL).toContain('is distinct from v_bcats_h')
  })
})

describe('Fase 6C — reversibilidad', () => {
  it('copia antes de cambiar y el rollback restaura non_food, clase, confirmación y categoría del ticket sin pisar cambios posteriores', () => {
    expect(SQL.indexOf("select '6C', 'product', p.id, to_jsonb(p), to_jsonb(p) || jsonb_build_object('non_food', true)")).toBeLessThan(SQL.indexOf('update public.products set non_food = true'))
    expect(SQL.indexOf("values ('6C', 'receipt'")).toBeLessThan(SQL.indexOf('update public.receipts'))
    expect(ROLLBACK_SQL).toContain("l.before ->> 'category'")
    expect(ROLLBACK_SQL).toContain("(l.before ->> 'class_confirmed_at')::timestamptz")
    expect(ROLLBACK_SQL).toContain("(l.before ->> 'non_food')::boolean")
    expect(ROLLBACK_SQL).toContain("p.non_food = (l.after ->> 'non_food')::boolean")
    expect(ROLLBACK_SQL).toContain("x.category = l.after ->> 'category'")
    expect(ROLLBACK_SQL).toContain('drop table if exists public.food_kind_migration_log')
    expect(ROLLBACK_SQL).not.toMatch(/(update|delete from|insert into)\s+public\.(expenses|product_prices|budgets|budget_categories|family_food_types|catalog_\w+|shared_\w+|store_chain\w*|families)/i)
  })

  it('la tabla de registro no es accesible desde la aplicación (RLS activada, sin permisos para clientes)', () => {
    expect(SQL).toContain('alter table public.food_kind_migration_log enable row level security')
    expect(SQL).toContain('revoke all on public.food_kind_migration_log from public, anon, authenticated')
  })
})

describe('Fase 6C — guardas de código: la tienda no decide qué es un producto', () => {
  const files = Object.entries(APP)

  it('ningún código escribe non_food ni la clase a partir de la tienda Amazon', () => {
    const offenders = files.filter(([, text]) => /amazon[^\n]{0,120}(setProductNonFood|setProductFoodType|non_food\s*[:=]|category:\s*)/i.test(text) || /(setProductNonFood|setProductFoodType|non_food\s*[:=])[^\n]{0,120}amazon/i.test(text))
    expect(offenders.map(([f]) => f)).toEqual([])
  })

  it('el webhook de Amazon NO escribe non_food ni ninguna clase de producto (Amazon != clase)', () => {
    const webhook = FUNCTIONS['/supabase/functions/amazon-order-webhook/index.ts']
    expect(webhook).toBeTruthy()
    expect(webhook).not.toMatch(/non_food|class_confirmed_at|family_food_types|nonFood/)
    // el upsert de productos solo lleva identidad (familia, nombre)
    expect(webhook).toMatch(/family_id[^{}]*normalized_name[^{}]*display_name/s)
  })

  it('la clase conocida manda: isFoodPurchase comprueba primero los conjuntos por clase, antes que cualquier regla de tienda', () => {
    const src = APP['/src/domain/products.ts']
    const body = src.slice(src.indexOf('export function isFoodPurchase'), src.indexOf('export function buildProductKindSets'))
    expect(body.indexOf('foodProductIds.has')).toBeGreaterThan(-1)
    expect(body.indexOf('foodProductIds.has')).toBeLessThan(body.indexOf("price.store !== 'Amazon'"))
    expect(body.indexOf('nonFoodProductIds.has')).toBeLessThan(body.indexOf("price.store !== 'Amazon'"))
  })

  it('todos los puntos de lectura Alimentos/Otros usan los conjuntos por clase (buildProductKindSets), no products.filter(nonFood)', () => {
    for (const [file, text] of files) {
      expect(text, file).not.toMatch(/products\.filter\(\(\w+\) => \w+\.nonFood\)/i)
      expect(text, file).not.toMatch(/allProducts\.filter\(\(\w+\) => \w+\.nonFood\)/i)
    }
    for (const f of ['/src/domain/financeCompute.ts', '/src/domain/financeAnalysis.ts', '/src/ui/FinanceScreen.tsx', '/src/ui/ShoppingScreen.tsx']) {
      expect(APP[f], f).toContain('buildProductKindSets')
    }
  })

  it('listProducts deriva classKind de las clases de la familia (family_food_types), nunca de la tienda', () => {
    const src = APP['/src/data/products.ts']
    const body = src.slice(src.indexOf('export async function listProducts'), src.indexOf('export async function setProductNonFood'))
    expect(body).toContain("from('family_food_types')")
    expect(body).toContain('storedClassKind(')
    expect(body).not.toMatch(/\bstore\b|amazon/i)
  })

  it('elegir una clase mantiene non_food coherente en la MISMA escritura y solo a partir del kind de esa clase; «Automático» no lo toca', () => {
    const src = APP['/src/data/foodTypes.ts']
    const body = src.slice(src.indexOf('export async function setProductFoodType'))
    expect(body).toContain("...(name && kind ? { non_food: kind === 'no_alimentos' } : {})")
    expect(body).toContain('class_confirmed_at: name ? new Date().toISOString() : null')
    expect(body).not.toMatch(/\bstore\b|amazon/i)
    // una sola llamada update (atómica)
    expect(body.match(/\.update\(/g)).toHaveLength(1)
  })

  it('«Marcar como Otros» no se ofrece cuando la clase es conocida (su conjunto manda); el desplegable ofrece las clases de los dos conjuntos', () => {
    const src = APP['/src/ui/ShoppingScreen.tsx']
    expect(src).toContain('{!detail.classKnown && (')
    expect(src).toContain('<optgroup key={k}')
    expect(src).toContain('nonFood: chosen ? chosen.kind === ')
  })

  it('la resolución del producto conocido en la lista y en los tickets parte del conjunto de su clase (no de la tienda)', () => {
    expect(APP['/src/ui/ShoppingScreen.tsx']).toContain("existing?.classKind ?? (existing?.nonFood ? 'no_alimentos' : 'alimentacion')")
    expect(APP['/src/ui/FinanceScreen.tsx']).toContain("existing.classKind ?? (existing.nonFood ? 'no_alimentos' : 'alimentacion')")
  })

  it('no hay ninguna regla nueva Amazon → categoría financiera ni Amazon → clase en el código de la aplicación', () => {
    const rule = /amazon[^\n]{0,80}(=>|:)\s*['"](Regalos y compras varias|Compras varias|Otros|Electrónica|Ropa y calzado|Alimentación)['"]/i
    expect(Object.values(APP).some((t) => rule.test(t))).toBe(false)
    expect(Object.values(FUNCTIONS).some((t) => rule.test(t))).toBe(false)
  })
})
