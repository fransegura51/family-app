import { describe, expect, it } from 'vitest'

// Guardas de la FASE 6C.2A: la base admite category = NULL («Pendiente de clasificar») y los consumidores lo aceptan, pero NINGÚN
// productor genera todavía un NULL (banco, webhooks y cliente siguen escribiendo exactamente lo mismo).
const FILES = import.meta.glob(
  ['/supabase/migrations/0149_category_nullable_pending.sql', '/supabase/rollbacks/0149_category_nullable_pending_down.sql'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0149_category_nullable_pending.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0149_category_nullable_pending_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const ROLLBACK_SQL = ROLLBACK.replace(/--[^\n]*/g, '')
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const BANK = FUNCTIONS['/supabase/functions/enable-banking-sync-transactions/index.ts']
const AMAZON = FUNCTIONS['/supabase/functions/amazon-order-webhook/index.ts']
const MERCADONA = FUNCTIONS['/supabase/functions/mercadona-ticket-webhook/index.ts']

describe('0149: solo estructura, ningún dato', () => {
  it('las ÚNICAS sentencias sobre las tablas: quitar NOT NULL, quitar el default de receipts, añadir los dos CHECK y comentar las columnas', () => {
    const alters = [...SQL.matchAll(/alter table\s+public\.(\w+)\s+([^;]+);/gi)].map((m) => `${m[1]}: ${m[2].replace(/\s+/g, ' ').trim()}`)
    expect(alters).toEqual([
      'expenses: alter column category drop not null',
      'receipts: alter column category drop not null',
      'receipts: alter column category drop default',
      "expenses: add constraint expenses_category_not_blank check (category is null or btrim(category) <> '')",
      "receipts: add constraint receipts_category_not_blank check (category is null or btrim(category) <> '')",
    ])
    // ninguna escritura de datos
    expect(SQL).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from|truncate|drop\s+table)\b/i)
  })

  it('NO cambia ninguna otra tabla, función, create_family, catálogo, presupuestos ni aprendizaje compartido', () => {
    expect(SQL).not.toMatch(/create\s+(or\s+replace\s+)?function|create_family|create\s+table|create\s+trigger|create\s+policy/i)
    expect(SQL).not.toMatch(/alter table\s+public\.(?!expenses\b|receipts\b)/i)
    // (las tablas que solo se LEEN para las huellas no se modifican)
    expect(SQL).not.toMatch(/(update|insert\s+into|delete\s+from|alter\s+table)\s+public\.(budget_categories|catalog_\w+|shared_\w+|store_chain\w*|family_food_types|budgets|products|product_prices|families)\b/i)
  })

  it('no crea ninguna categoría ficticia ni classification_status', () => {
    expect(SQL).not.toMatch(/classification_status/i)
    expect(SQL).not.toMatch(/insert[^;]*Pendiente de clasificar/i)
    expect(APP['/src/domain/types.ts']).not.toMatch(/classification_status/i)
  })

  it('precondiciones que abortan: esquema esperado, 0 categorías vacías y ningún objeto dependiente', () => {
    for (const piece of [
      "table_name = 'expenses' and column_name = 'category'",
      "and data_type = 'text' and is_nullable = 'NO' and column_default is null",
      "column_default = '''Alimentación''::text'",
      "exists (select 1 from public.expenses where btrim(category) = '')",
      "exists (select 1 from public.receipts where btrim(category) = '')",
      'pg_views',
      'pg_policies',
      'pg_indexes',
      "contype = 'c'",
      'pg_get_functiondef',
      'information_schema.triggers',
    ]) {
      expect(SQL, piece).toContain(piece)
    }
    expect((SQL.match(/raise exception/g) ?? []).length).toBeGreaterThanOrEqual(10)
  })

  it('invariantes finales: huellas idénticas de todas las tablas, ningún NULL creado y el esquema exacto; si no, se revierte todo', () => {
    for (const table of ['expenses', 'receipts', 'products', 'product_prices', 'budgets', 'budget_categories', 'family_food_types', 'shared_product_learning', 'store_chains', 'families']) {
      expect(SQL, table).toMatch(new RegExp(`from public\\.${table} x`))
    }
    expect(SQL).toContain('is distinct from v_exp_h')
    expect(SQL).toContain('is distinct from v_rec_h')
    expect(SQL).toContain('exists (select 1 from public.expenses where category is null)')
    expect(SQL).toContain('exists (select 1 from public.receipts where category is null)')
    expect(SQL).toContain('se revierte todo')
  })
})

describe('rollback 0149', () => {
  it('ANTES de volver a NOT NULL comprueba que no hay NULL y aborta sin inventar ninguna categoría', () => {
    const check = ROLLBACK_SQL.indexOf('raise exception')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(ROLLBACK_SQL.indexOf('set not null'))
    expect(ROLLBACK_SQL).toContain('where category is null')
    expect(ROLLBACK_SQL).not.toMatch(/update\s+public|coalesce\s*\(\s*category/i) // jamás rellena un NULL
  })

  it('restaura el esquema anterior: NOT NULL en ambas, DEFAULT «Alimentación» en receipts y sin los CHECK nuevos', () => {
    expect(ROLLBACK_SQL).toContain('alter table public.expenses alter column category set not null')
    expect(ROLLBACK_SQL).toContain('alter table public.receipts alter column category set not null')
    expect(ROLLBACK_SQL).toContain("alter table public.receipts alter column category set default 'Alimentación'")
    expect(ROLLBACK_SQL).toContain('drop constraint if exists expenses_category_not_blank')
    expect(ROLLBACK_SQL).toContain('drop constraint if exists receipts_category_not_blank')
  })
})

describe('tipos: category es string | null y ningún cast lo oculta', () => {
  it('Expense.category y Receipt.category admiten null', () => {
    const types = APP['/src/domain/types.ts']
    expect(types).toMatch(/export interface Expense \{[\s\S]*?category: string \| null/)
    expect(types).toMatch(/export interface Receipt \{[\s\S]*?category: string \| null/)
  })

  it('el código no usa casts ni «!» sobre category de gastos/tickets para silenciar al compilador', () => {
    // (financeActions.ts castea la categoría de un PRESUPUESTO ya validada como string; no es ni un gasto ni un ticket)
    const offenders = Object.entries(APP).filter(([f, t]) => !f.endsWith('/pepa/actions/financeActions.ts') && /\.category\s+as\s+string|\.category!/.test(t))
    expect(offenders.map(([f]) => f)).toEqual([])
  })
})

describe('formulario y datos de tickets: un NULL no se convierte en Alimentación', () => {
  const form = APP['/src/ui/FinanceScreen.tsx']
  const receipts = APP['/src/data/receipts.ts']

  it('un ticket existente se abre con SU categoría (NULL → sin categoría); solo un ticket nuevo parte de «Alimentación»', () => {
    expect(form).toContain("useState(receipt ? (receipt.category ?? '') : 'Alimentación')")
    expect(form).not.toMatch(/receipt\?\.category \?\? 'Alimentación'/)
    // al crear: vacío → null, nunca «Alimentación». Al editar (6C.2C) la categoría ya no se manda: solo cambia por classify_purchase
    expect((form.match(/category: category \|\| null,/g) ?? []).length).toBe(1)
  })

  it('un ticket sin categoría no pisa la categoría real del gasto enlazado ni la de un gasto del banco', () => {
    expect(receipts).toContain("...(input.category != null ? { category: input.category } : {})")
    expect((receipts.match(/\.\.\.\(input\.category != null \? \{ category: input\.category \} : \{\}\)/g) ?? []).length).toBe(2)
  })

  it('la fila del ticket no deja un « · » suelto cuando no hay categoría', () => {
    // (6C.2C: un ticket pendiente muestra «Pendiente de clasificar»; nunca un hueco ni «null»)
    expect(form).toContain('{isPendingCategory(receipt.category) ? <span className="pending-tag">⏳ {PENDING_LABEL}</span> : receipt.category}')
  })

  it('editar un gasto sin categoría no le inventa una: el estado conserva null hasta que se elija una', () => {
    expect(form).toContain('useState<string | null>(expense.category)')
    expect(form).toContain("<CategorySelect value={category ?? ''} onChange={setCategory} categories={categories} emptyLabel=")
  })
})

describe('.neq del sync bancario: null-safe', () => {
  it('la búsqueda del cargo original de una anulación ya no pierde los cargos sin categoría', () => {
    expect(BANK).toContain('.or("category.is.null,category.neq.Cobro anulado")')
    expect(BANK).not.toMatch(/\.neq\("category"/)
  })
})

describe('NINGÚN productor genera NULL todavía (6C.2A no cambia el comportamiento visible)', () => {
  it('el sync bancario sigue asignando categoría con las MISMAS reglas: mismo fallback «Otros» y misma regla de Repsol', () => {
    expect(BANK).toContain('return familyCategoryNames.has("Otros") ? "Otros" : [...familyCategoryNames][0] ?? "Otros"')
    expect(BANK).toContain('{ keywords: ["repsol", "cepsa", "galp", "shell", "gasolinera", "estacion de servicio", "petroprix", "ballenoil"], category: "Combustible" }')
    expect(BANK).toContain('category: isIncome ? "Ingreso" : category')
    expect(BANK).not.toMatch(/category:\s*null/)
  })

  it('el webhook de Amazon sigue escribiendo la categoría literal «Amazon» (gasto y ticket) — no se toca hasta la 6C.2D', () => {
    expect((AMAZON.match(/category: "Amazon"/g) ?? []).length).toBe(2)
    expect(AMAZON).not.toMatch(/category:\s*null/)
  })

  it('el webhook de Mercadona sigue escribiendo «Alimentación» (gasto y ticket)', () => {
    expect((MERCADONA.match(/category: "Alimentación"/g) ?? []).length).toBe(2)
    expect(MERCADONA).not.toMatch(/category:\s*null/)
  })

  it('ninguna capa que escribe gastos o tickets (datos, importadores y webhooks) escribe category: null', () => {
    const writers = ['/src/data/finance.ts', '/src/data/receipts.ts', '/src/data/bank.ts']
      .map((f) => [f, APP[f]] as const)
      .concat(Object.entries(FUNCTIONS).filter(([f]) => /enable-banking|amazon-order|mercadona-ticket/.test(f)))
      .filter(([, t]) => t && /\bcategory:\s*null\b/.test(t))
    expect(writers.map(([f]) => f)).toEqual([])
  })

  it('el alta de gastos (addExpense) y de tickets nuevos sigue exigiendo una categoría', () => {
    expect(APP['/src/data/finance.ts']).toMatch(/export async function addExpense\(input: \{[\s\S]*?category: string\b/)
    expect(APP['/src/ui/FinanceScreen.tsx']).toContain("useState(receipt ? (receipt.category ?? '') : 'Alimentación')")
  })
})
