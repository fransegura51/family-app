import { describe, expect, it } from 'vitest'

// Guardas de la FASE 6A (líneas que no son productos): migración 0145 + los caminos que crean products / product_prices.
const FILES = import.meta.glob(
  [
    '/supabase/migrations/0145_non_product_lines.sql',
    '/supabase/rollbacks/0145_non_product_lines_down.sql',
    '/supabase/functions/mercadona-ticket-webhook/index.ts',
    '/supabase/functions/amazon-order-webhook/index.ts',
    '/supabase/functions/analyze-receipt-photo/index.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0145_non_product_lines.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0145_non_product_lines_down.sql']
const MERCADONA = FILES['/supabase/functions/mercadona-ticket-webhook/index.ts']
const AMAZON = FILES['/supabase/functions/amazon-order-webhook/index.ts']
const OCR = FILES['/supabase/functions/analyze-receipt-photo/index.ts']
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const ALL_FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const ROLLBACK_SQL = ROLLBACK.replace(/--[^\n]*/g, '')

describe('Fase 6A: la decisión en la base de datos (gemela de TypeScript)', () => {
  const fn = SQL.slice(SQL.indexOf('create or replace function public.is_non_product_line'), SQL.indexOf('revoke all on function public.is_non_product_line'))

  it('una sola regla, específica de cadena: Mercadona + texto normalizado «parking»', () => {
    expect(fn).toContain("c.chain_key = 'mercadona'")
    expect(fn).toContain("public.product_text_key(p_text) = 'parking'")
    expect(fn).toContain('from public.resolve_store_chain(p_store) c')
    expect(fn.match(/'parking'/g)).toHaveLength(1)
    expect(fn.match(/'mercadona'/g)).toHaveLength(1)
    // sin subcadenas ni comodines: la tienda va por los alias reales y el texto por igualdad exacta
    expect(fn).not.toMatch(/\blike\b|\bilike\b|~\*?|similarity/i)
  })

  it('sin tienda o sin texto nunca se descarta nada; ejecutable solo por usuarios autenticados y service_role', () => {
    expect(fn).toContain('false)')
    expect(SQL).toContain('revoke all on function public.is_non_product_line(text, text) from public, anon;')
    expect(SQL).toContain('grant execute on function public.is_non_product_line(text, text) to authenticated, service_role;')
    expect(SQL).not.toMatch(/security definer/i)
  })

  it('el trigger de refuerzo solo actúa ANTES de INSERT en product_prices y descarta la fila sin error', () => {
    expect(SQL).toMatch(/create trigger product_prices_skip_non_product\s+before insert on public\.product_prices\s+for each row/)
    expect(SQL).toContain('public.is_non_product_line(new.store, v_name)')
    expect(SQL).toMatch(/return null;/)
    expect(SQL).not.toMatch(/raise exception[^;]*is_non_product/i)
  })

  it('no toca el aprendizaje compartido, las cadenas, el catálogo, las clases ni los datos económicos', () => {
    expect(SQL).not.toMatch(/(insert into|update|delete from|alter table|drop table|truncate)\s+(public\.)?(shared_|store_chain|catalog_|family_food_types|budget_categories|budgets|receipts|expenses|families)/i)
    expect(SQL).not.toMatch(/class_confirmed_at|create_family/i)
  })
})

describe('Fase 6A: la limpieza del histórico es segura y reversible', () => {
  it('las únicas filas que se borran son las de products (y sus precios por la FK en cascada)', () => {
    const deletes = [...SQL.matchAll(/delete from\s+(public\.\w+)[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, ' '))
    expect(deletes).toEqual(['delete from public.products where id = any (v_ids);'])
    expect(SQL).not.toMatch(/\btruncate\b|\bdrop\b/i)
  })

  it('precondiciones: exactamente 1 producto y 8 precios, todos a 0,00 € y cantidad 1, y cada ticket conserva más líneas', () => {
    expect(SQL).toContain('cardinality(v_ids) <> 1')
    expect(SQL).toContain('v_n_prices <> 8')
    expect(SQL).toContain("pp.price <> 0 or coalesce(pp.quantity, '1') <> '1' or pp.receipt_id is null")
    expect(SQL).toContain('algún ticket quedaría sin más líneas de producto')
    expect(SQL).toContain('not public.is_non_product_line(pp.store, p.display_name)') // TODAS sus líneas son no-producto según la regla
  })

  it('comprobación económica: mismos importes, recuentos y totales por ticket antes y después; si no, se revierte todo', () => {
    for (const piece of [
      '(select count(*) from public.products) <> v_products_before - 1',
      '(select count(*) from public.product_prices) <> v_prices_before - 8',
      "sum(price * coalesce(nullif(quantity, '')::numeric, 1))",
      'sum(total_amount)',
      'sum(amount)',
      'v_per_receipt_after is distinct from v_per_receipt_before',
      'se revierte todo',
    ]) {
      expect(SQL, piece).toContain(piece)
    }
  })

  it('antes de borrar copia íntegra (producto + precios) a un archivo no expuesto a los usuarios', () => {
    expect(SQL).toMatch(/insert into public\.non_product_line_archive[\s\S]*?to_jsonb\(p\)[\s\S]*?jsonb_agg\(to_jsonb\(pp\)/)
    expect(SQL.indexOf('insert into public.non_product_line_archive')).toBeLessThan(SQL.indexOf('delete from public.products'))
    expect(SQL).toContain('alter table public.non_product_line_archive enable row level security;')
    expect(SQL).toContain('revoke all on public.non_product_line_archive from public, anon, authenticated;')
    expect(SQL).not.toMatch(/create policy/i)
  })

  it('el rollback restaura el producto y sus precios con los mismos ids ANTES de borrar el archivo, y quita el trigger primero', () => {
    const at = (s: string) => ROLLBACK_SQL.indexOf(s)
    expect(at('drop trigger if exists product_prices_skip_non_product')).toBeGreaterThan(-1)
    expect(at('drop trigger if exists product_prices_skip_non_product')).toBeLessThan(at('insert into public.product_prices'))
    expect(at('insert into public.products')).toBeLessThan(at('insert into public.product_prices'))
    expect(at('insert into public.product_prices')).toBeLessThan(at('drop table if exists public.non_product_line_archive'))
    expect(ROLLBACK_SQL).toContain('jsonb_populate_recordset(null::public.products')
    expect(ROLLBACK_SQL).toContain('jsonb_populate_recordset(')
    expect(ROLLBACK_SQL).toContain('drop function if exists public.is_non_product_line(text, text)')
    expect(ROLLBACK_SQL).toContain('drop function if exists public.product_prices_skip_non_product()')
    expect(ROLLBACK_SQL).not.toMatch(/delete from|truncate/i)
    expect(ROLLBACK_SQL).not.toMatch(/(insert into|update|alter table|drop table)\s+(public\.)?(shared_|store_chain|catalog_|receipts|expenses|budget|families|family_food_types)/i)
  })
})

describe('Fase 6A: TODOS los caminos que crean products / product_prices filtran (o los cubre el refuerzo de la base de datos)', () => {
  it('solo hay tres escritores de product_prices: el cliente, el webhook de Mercadona y el de Amazon', () => {
    const inServer = Object.entries(ALL_FUNCTIONS)
      .filter(([, text]) => /from\("product_prices"\)\.insert|from\('product_prices'\)\.insert/.test(text))
      .map(([file]) => file)
      .sort()
    expect(inServer).toEqual(['/supabase/functions/amazon-order-webhook/index.ts', '/supabase/functions/mercadona-ticket-webhook/index.ts'])
    const inClient = Object.entries(APP)
      .filter(([, text]) => /from\('product_prices'\)[\s\S]{0,40}\.insert\(/.test(text))
      .map(([file]) => file)
    expect(inClient).toEqual(['/src/data/products.ts'])
  })

  it('cliente: recordProductPurchase (único punto) descarta la línea ANTES de crear producto o precio', () => {
    const src = APP['/src/data/products.ts']
    const start = src.indexOf('export async function recordProductPurchase')
    const body = src.slice(start)
    expect(body.indexOf('isProductLine(input.store, input.name)')).toBeGreaterThan(-1)
    expect(body.indexOf('isProductLine(input.store, input.name)')).toBeLessThan(body.indexOf('currentFamilyId()'))
    expect(body.indexOf('isProductLine(input.store, input.name)')).toBeLessThan(body.indexOf(".from('products')"))
    expect(body.indexOf('isProductLine(input.store, input.name)')).toBeLessThan(body.indexOf(".from('product_prices')"))
    expect(body).toContain('return { productId: null }')
  })

  it('el guardado del ticket no hace nada más con una línea descartada (sin clase, sin non_food, sin shared)', () => {
    const src = APP['/src/ui/FinanceScreen.tsx']
    const start = src.indexOf('const { productId } = await recordProductPurchase')
    const after = src.slice(start, start + 3200)
    expect(after.indexOf('if (productId == null) return')).toBeGreaterThan(-1)
    expect(after.indexOf('if (productId == null) return')).toBeLessThan(after.indexOf('setProductNonFood'))
    expect(after.indexOf('if (productId == null) return')).toBeLessThan(after.indexOf('resolveDraftLineClass'))
    expect(after.indexOf('if (productId == null) return')).toBeLessThan(after.indexOf('setProductFoodType'))
  })

  it('al leer un ticket, las líneas no-producto ni llegan a la revisión (y se avisa), conservando el total y la foto', () => {
    const src = APP['/src/ui/FinanceScreen.tsx']
    expect(src).toContain('partitionTicketLines(readStore, parsed.items)')
    expect(src).toContain('setSkippedLines(skipped.map')
    expect(src).toContain("if (parsed.total != null) setTotalAmount(String(parsed.total))") // el total del ticket sigue viniendo entero
  })

  it('webhook de Mercadona: filtra antes de crear producto o precio, con la copia idéntica de la capa, y avisa cuántas omitió', () => {
    expect(MERCADONA).toContain('import { partitionTicketLines } from "./ticketLines.ts"')
    const at = (s: string) => MERCADONA.indexOf(s)
    expect(at('partitionTicketLines("Mercadona", items)')).toBeGreaterThan(-1)
    expect(at('partitionTicketLines("Mercadona", items)')).toBeLessThan(at('for (const item of productItems)'))
    expect(at('for (const item of productItems)')).toBeLessThan(at('.from("products")'))
    expect(MERCADONA).not.toMatch(/for \(const item of items\)/)
    expect(MERCADONA).toContain('itemsSaved: productItems.length, itemsSkippedNonProduct: skippedItems.length')
    // el ticket, el gasto y el total se guardan siempre íntegros (antes del filtro)
    expect(at('.from("receipts")')).toBeLessThan(at('partitionTicketLines("Mercadona", items)'))
    expect(at('amount: total')).toBeLessThan(at('partitionTicketLines("Mercadona", items)'))
  })

  it('webhook de Amazon: fuera del alcance de esta fase (Amazon no tiene reglas); lo cubre el refuerzo de la base de datos', () => {
    expect(AMAZON).not.toMatch(/ticketLines|partitionTicketLines/)
    expect(SQL_TRIGGER_COVERS_ANY_STORE()).toBe(true)
  })

  it('el OCR (analyze-receipt-photo) solo devuelve líneas: no escribe productos ni precios', () => {
    expect(OCR).not.toMatch(/product_prices|from\("products"\)|from\('products'\)/)
  })
})

// El trigger mira la tienda de la fila, no la de quien la inserta: cubre cualquier camino (Amazon, importadores futuros...).
function SQL_TRIGGER_COVERS_ANY_STORE(): boolean {
  return /before insert on public\.product_prices/.test(SQL) && /is_non_product_line\(new\.store, v_name\)/.test(SQL)
}

describe('Fase 6A: no cambia nada más', () => {
  it('el clasificador de productos y el aprendizaje compartido siguen sin conocer la capa de líneas', () => {
    for (const file of ['/src/domain/productClass.ts', '/src/domain/sharedLearning.ts', '/src/domain/sharedClassLoader.ts', '/src/domain/foodTypes.ts']) {
      expect(APP[file], file).not.toMatch(/ticketLines|isProductLine|partitionTicketLines/)
    }
  })

  it('la capa de líneas solo la usan el guardado de tickets y la propia capa de datos de productos', () => {
    const users = Object.entries(APP)
      .filter(([file, text]) => file !== '/src/domain/ticketLines.ts' && /ticketLines|isProductLine|partitionTicketLines/.test(text))
      .map(([file]) => file)
      .sort()
    expect(users).toEqual(['/src/data/products.ts', '/src/ui/FinanceScreen.tsx'])
  })
})
