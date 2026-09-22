import { describe, expect, it } from 'vitest'

// Guardas de la FASE 6C.2C: RPC classify_purchase (0150) y su cableado en la interfaz.
const FILES = import.meta.glob(['/supabase/migrations/0150_classify_purchase.sql', '/supabase/rollbacks/0150_classify_purchase_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0150_classify_purchase.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0150_classify_purchase_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FORM = APP['/src/ui/FinanceScreen.tsx']

describe('classify_purchase: seguridad', () => {
  it('SECURITY INVOKER (RLS de quien llama), nunca DEFINER; search_path fijo', () => {
    expect(SQL).toContain('security invoker')
    expect(SQL).not.toMatch(/security definer/i)
    expect(SQL).toContain('set search_path = public')
  })

  it('solo la ejecutan usuarios autenticados: sin permiso para public ni anon', () => {
    expect(SQL).toContain('revoke all on function public.classify_purchase(uuid, uuid, text) from public, anon;')
    expect(SQL).toContain('grant execute on function public.classify_purchase(uuid, uuid, text) to authenticated;')
    expect(SQL).not.toMatch(/grant execute[^;]*\bto\b[^;]*\b(anon|public|service_role)\b/i)
  })

  it('el cliente NO manda family_id: la familia sale de las filas autorizadas por la RLS', () => {
    expect(SQL).toContain('create or replace function public.classify_purchase(\n  p_expense_id uuid default null,\n  p_receipt_id uuid default null,\n  p_category text default null\n)')
    expect(SQL).not.toMatch(/p_family/i)
    expect(SQL).toContain('v_family := case when v_has_e then v_e.family_id else v_r.family_id end;')
    expect(SQL).toContain("where family_id = v_family and name = p_category and budget_group = 'generales'")
  })

  it('valida el destino ANTES de leer nada: NULL, vacío y «Pendiente de clasificar» se rechazan', () => {
    const body = SQL.slice(SQL.indexOf('begin'))
    for (const reason of ['null_category', 'empty_category', 'pending_label']) expect(body, reason).toContain(`'reason', '${reason}'`)
    expect(body.indexOf("'null_category'")).toBeLessThan(body.indexOf('select * into v_e'))
    expect(body).toContain("lower(btrim(p_category)) = 'pendiente de clasificar'")
  })

  it('rechaza categoría inexistente / de otra familia, ingresos, vínculo que no coincide, familias distintas y dos tickets en un gasto', () => {
    for (const reason of ['unknown_category', 'income_not_supported', 'link_mismatch', 'family_mismatch', 'ambiguous_link', 'linked_expense_not_accessible']) {
      expect(SQL, reason).toContain(`'reason', '${reason}'`)
    }
  })
})

describe('classify_purchase: matriz de decisión (atómica, sin pisar)', () => {
  it('cubre NULL/NULL, igual/idempotente, recategorizar coherente, un lado NULL y conflictos; devuelve estados estructurados', () => {
    for (const piece of [
      "v_e.category is null and v_r.category is null",
      "v_status := 'classified'",
      "v_e.category is not distinct from v_r.category",
      "v_status := 'unchanged'",
      "v_status := 'reclassified'",
      "'reason', 'one_side_differs'",
      "'reason', 'different_categories'",
      "'status', 'conflict'",
    ]) {
      expect(SQL, piece).toContain(piece)
    }
  })

  it('un lado NULL se completa SOLO con la categoría que ya tiene el otro (nunca con otra distinta) y el clasificado no se toca', () => {
    expect(SQL).toContain('if v_r.category = p_category then v_set_e := true; v_status := \'classified\';')
    expect(SQL).toContain('if v_e.category = p_category then v_set_r := true; v_status := \'classified\';')
  })

  it('el conflicto se resuelve ANTES de cualquier UPDATE (no cambia nada)', () => {
    const firstUpdate = SQL.indexOf('update public.expenses')
    for (const m of SQL.matchAll(/'status', 'conflict'/g)) expect(m.index).toBeLessThan(firstUpdate)
  })

  it('las ÚNICAS escrituras son la columna category de expenses y receipts, por id, con comprobación de 1 fila (si no, excepción y se revierte todo)', () => {
    const updates = [...SQL.matchAll(/update\s+public\.(\w+)\s+set\s+([^;]+);/gi)].map((m) => `${m[1]}: ${m[2].replace(/\s+/g, ' ').trim()}`)
    expect(updates).toEqual(['expenses: category = p_category where id = v_e.id', 'receipts: category = p_category where id = v_r.id'])
    expect(SQL).not.toMatch(/\b(insert\s+into|delete\s+from|truncate|drop\s+table)\b/i)
    expect((SQL.match(/if v_n <> 1 then raise exception/g) ?? []).length).toBe(2)
  })

  it('un ticket sin gasto NO crea ningún gasto; un gasto sin ticket clasifica solo el gasto', () => {
    expect(SQL).not.toMatch(/insert\s+into\s+public\.expenses/i)
    expect(SQL).toContain('else\n    if v_r.category is null then v_set_r := true;')
  })

  it('NO toca productos, precios, presupuestos, aprendizaje compartido, catálogo ni cadenas', () => {
    expect(SQL).not.toMatch(/(update|insert|delete|alter)[^;]*\b(products|product_prices|budgets|shared_\w+|catalog_\w+|store_chain\w*|family_food_types)\b/i)
    expect(SQL).not.toMatch(/class_confirmed_at|non_food/i)
  })

  it('bloquea las filas (for update) y la función se retira sin tocar datos', () => {
    expect(SQL).toContain('for update')
    expect(ROLLBACK.replace(/--[^\n]*/g, '').trim()).toBe('drop function if exists public.classify_purchase(uuid, uuid, text);')
  })

  it('no toca create_family ni otras funciones; la migración no cambia ninguna tabla', () => {
    expect(SQL).not.toMatch(/create_family|alter\s+table|create\s+table|create\s+trigger/i)
    expect((SQL.match(/create or replace function/g) ?? []).length).toBe(1)
  })
})

describe('interfaz: la categoría de una compra solo cambia por classify_purchase', () => {
  it('la capa de datos llama a la RPC con los tres parámetros y sin family_id', () => {
    const src = APP['/src/data/classifyPurchase.ts']
    expect(src).toContain("supabase.rpc('classify_purchase'")
    expect(src).toContain('p_expense_id')
    expect(src).toContain('p_receipt_id')
    expect(src).toContain('p_category')
    expect(src).not.toMatch(/family/i)
    expect(src).toContain('if (error) throw error') // un error técnico se lanza; un conflicto NO es una excepción
  })

  it('editar un gasto: la categoría va por classify_purchase (no por updateExpense), con mensaje humano y sin pisar', () => {
    const edit = FORM.slice(FORM.indexOf('function EditExpenseInline'), FORM.indexOf('function CategorySelect'))
    expect(edit).toContain('classifyPurchase({ expenseId: expense.id, category })')
    expect(edit).toContain('if (!classifyOk(result))')
    expect(edit).toContain('setError(classifyMessage(result))')
    expect(edit).toContain('setError(CLASSIFY_FAILED_MESSAGE)')
    expect(edit).toContain('void reportClientError(err)')
    // updateExpense solo lleva la categoría para un INGRESO
    expect(edit).toContain('...(expense.isIncome && category != null ? { category } : {})')
    expect(edit).not.toMatch(/updateExpense\([^)]*\n\s+category,/)
  })

  it('editar un ticket: por classify_purchase (con su gasto enlazado, atómico); updateReceipt ya no manda la categoría', () => {
    const start = FORM.indexOf('} else if (receipt) {')
    const block = FORM.slice(start, start + 2200)
    expect(block).toContain('classifyPurchase({ receiptId: receipt.id, category })')
    expect(block).toContain("if (category !== '' && category !== (receipt.category ?? ''))")
    const update = block.slice(block.indexOf('await updateReceipt('), block.indexOf('await deleteProductPricesByReceipt'))
    expect(update).not.toMatch(/category/)
  })

  it('updateReceipt: undefined = no tocar la categoría; un ticket sin categoría no pisa la de su gasto', () => {
    const src = APP['/src/data/receipts.ts']
    expect(src).toContain('category?: string | null')
    expect(src).toContain('...(input.category !== undefined ? { category: input.category } : {})')
  })

  it('señal en Resumen (discreta, sin pendientes no se pinta), filtro «Pendientes» y etiqueta en filas y tickets', () => {
    expect(FORM).toContain('function PendingSignal(')
    expect(FORM).toContain('if (!text) return null')
    expect(FORM).toContain('<PendingSignal signal={pendingSignal(expenses)} onOpen={() => onViewMovements({ label: PENDING_LABEL, pendingOnly: true })} />')
    expect(FORM).toContain("{ key: 'pendientes', label: 'Pendientes' }")
    expect((FORM.match(/if \(typeFilter === 'pendientes'\) return isPendingSpendingRow\(e\)/g) ?? []).length).toBe(2) // Movimientos y Banco
    expect(FORM).toContain('if (filter.pendingOnly && !isPendingSpendingRow(e)) return false')
    expect(FORM).toContain('{isPendingCategory(e.category) ? <span className="pending-tag">⏳ {PENDING_LABEL}</span> : e.category}')
    // un modal, popup o banner a pantalla completa no existe para esto
    const signal = FORM.slice(FORM.indexOf('function PendingSignal('), FORM.indexOf('function ResumenTab'))
    expect(signal).not.toMatch(/modal|overlay|alert\(|confirm\(/)
  })

  it('«Pendiente de clasificar» no es una categoría: el filtro es lógico y el bucket de repartos va aparte, sin drill-down por categoría', () => {
    expect(FORM).toContain("const PENDING_SLICE_KEY = 'pendiente-de-clasificar'")
    expect(FORM).toContain('const topSlices: BreakdownSlice[] = [...categorySlices, ...pendingSlices]')
    expect(FORM).toContain('if (highlightedTop.key === PENDING_SLICE_KEY) {\n                onViewPending?.()')
    expect(FORM).toContain('.concat(pendingInMonth.amount > 0 ?')
    expect(FORM).toContain('pending: pendingInRange.count > 0 ? pendingInRange : undefined,')
    expect(FORM).toContain("<tr><td>⏳ ${PENDING_LABEL}</td>")
  })

  it('nada clasifica productos: la RPC y su cliente no mencionan products/non_food; solo Amazon (6C.2D) genera NULL, y ningún webhook llama a classify_purchase', () => {
    expect(APP['/src/data/classifyPurchase.ts']).not.toMatch(/products|non_food|class_confirmed/i)
    for (const [file, text] of Object.entries(FUNCTIONS)) {
      if (!/enable-banking|amazon-order|mercadona-ticket/.test(file)) continue
      if (!/amazon-order/.test(file)) expect(text, file).not.toMatch(/category:\s*null/)
      const code = text.replace(/\/\/[^\n]*/g, '') // classify_purchase se menciona solo en el comentario explicativo del webhook de Amazon
      expect(code, file).not.toContain('classify_purchase')
    }
    // el formulario de ticket NUEVO sigue con su categoría de siempre
    expect(FORM).toContain("useState(receipt ? (receipt.category ?? '') : 'Alimentación')")
  })
})
