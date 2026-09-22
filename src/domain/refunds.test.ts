import { describe, expect, it } from 'vitest'
import { isRefund, isRefundCategory, REFUND_CATALOG_KEY } from './refunds'
import type { BudgetCategory, Expense } from './types'

// FASE 6D.1 — identidad de una devolución: SIEMPRE por catalogKey (i.ingreso.devoluciones), nunca por el nombre visible.
function cat(name: string, catalogKey: string | null, over: Partial<BudgetCategory> = {}): BudgetCategory {
  return { id: name, familyId: 'f', name, icon: '', budgetGroup: 'ingresos', sortOrder: 0, parentId: null, necessity: null, isFixed: null, catalogKey, ...over }
}
const CATEGORIES: BudgetCategory[] = [
  cat('Devoluciones', REFUND_CATALOG_KEY),
  cat('Sueldo', 'i.sueldo'),
  cat('Movimientos internos', 'i.movimientos_internos'),
  cat('Cobro anulado', 'g.movimientos_internos.cobro_anulado', { parentId: 'Movimientos internos', budgetGroup: 'generales' }),
]
const exp = (over: Partial<Expense>): Expense =>
  ({ id: 'e', familyId: 'f', expenseDate: '2026-06-01', amount: 10, category: null, store: null, kind: 'real', notes: null, isIncome: true, budgetGroup: 'ingresos', tagId: null, source: 'banco', isFixedOverride: null, ownerMemberId: null, shared: false, sharedFromExpenseId: null, productClassification: null, ...over }) as Expense

describe('A. catalog_key identifica la devolución, sin importar el nombre visible', () => {
  it('la categoría estándar «Devoluciones» (catalogKey i.ingreso.devoluciones) es una devolución', () => {
    expect(isRefundCategory('Devoluciones', CATEGORIES)).toBe(true)
  })

  it('B. renombrar la categoría (mismo catalogKey) no rompe la detección', () => {
    const renamed = [cat('Reembolsos de compras', REFUND_CATALOG_KEY), ...CATEGORIES.slice(1)]
    expect(isRefundCategory('Reembolsos de compras', renamed)).toBe(true)
  })

  it('C. un nombre "Devoluciones" con OTRO catalogKey (o sin catalogKey) NO se considera devolución', () => {
    const personal = [cat('Devoluciones', 'g.otros'), ...CATEGORIES.slice(1)]
    expect(isRefundCategory('Devoluciones', personal)).toBe(false)
    const sinClave = [cat('Devoluciones', null), ...CATEGORIES.slice(1)]
    expect(isRefundCategory('Devoluciones', sinClave)).toBe(false)
  })

  it('categoría inexistente o NULL → no es devolución', () => {
    expect(isRefundCategory('Categoría que no existe', CATEGORIES)).toBe(false)
    expect(isRefundCategory(null, CATEGORIES)).toBe(false)
  })
})

describe('D/E/H/I/W. isRefund: solo movimientos REALES de esa categoría, nunca internos ni Cobro anulado', () => {
  it('D. movimiento real con categoría Devoluciones → isRefund true', () => {
    expect(isRefund(exp({ category: 'Devoluciones', kind: 'real' }), CATEGORIES)).toBe(true)
  })

  it('E. el mismo movimiento pero estimado/previsto (no real) → false', () => {
    expect(isRefund(exp({ category: 'Devoluciones', kind: 'estimado' }), CATEGORIES)).toBe(false)
    expect(isRefund(exp({ category: 'Devoluciones', kind: 'previsto' }), CATEGORIES)).toBe(false)
  })

  it('H. un movimiento interno no es una devolución', () => {
    expect(isRefund(exp({ category: 'Movimientos internos', kind: 'real' }), CATEGORIES)).toBe(false)
  })

  it('I/W. un «Cobro anulado» (incluida la pareja comisión+bonificación de 6D.0) no es una devolución', () => {
    expect(isRefund(exp({ category: 'Cobro anulado', kind: 'real', isIncome: true }), CATEGORIES)).toBe(false)
    expect(isRefund(exp({ category: 'Cobro anulado', kind: 'real', isIncome: false }), CATEGORIES)).toBe(false)
  })

  it('sin categoría (pendiente de clasificar, Fase 6C) no es una devolución', () => {
    expect(isRefund(exp({ category: null, kind: 'real' }), CATEGORIES)).toBe(false)
  })
})
