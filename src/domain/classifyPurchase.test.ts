import { describe, expect, it } from 'vitest'
import { CLASSIFY_FAILED_MESSAGE, CONFLICT_MESSAGE, classifyMessage, classifyOk, parseClassifyResult, pendingSignalText } from './classifyPurchase'
import { categoryLabel, isPendingSpendingRow, PENDING_LABEL, pendingSignal } from './pending'
import { SUPER, exp } from './financeTestData'
import type { Expense } from './types'

// FASE 6C.2C — UI de «Pendiente de clasificar»: señal, filtro, etiqueta y mensajes de la clasificación atómica.
const P = (amount: number, extra: Partial<Expense> = {}) => exp('2026-09-15', amount, SUPER, { category: null, ...extra })

describe('M/N. señal de Economía: «3 pendientes de clasificar · 245,30 €»', () => {
  it('M. sin pendientes → no hay señal (null: no se pinta nada)', () => {
    expect(pendingSignalText(pendingSignal([]))).toBeNull()
    expect(pendingSignalText(pendingSignal([exp('2026-09-03', 60, SUPER)]))).toBeNull()
  })

  it('N. con 3 pendientes → contador e importe correctos', () => {
    const rows = [P(100), P(100.3, { expenseDate: '2026-08-01' }), P(45, { expenseDate: '2026-07-20' }), exp('2026-09-03', 60, SUPER)]
    expect(pendingSignal(rows)).toEqual({ amount: 245.3, count: 3 })
    expect(pendingSignalText(pendingSignal(rows))).toBe('3 pendientes de clasificar · 245,30 €')
  })

  it('singular: «1 pendiente de clasificar»', () => {
    expect(pendingSignalText(pendingSignal([P(12)]))).toBe('1 pendiente de clasificar · 12,00 €')
  })

  it('cuenta pendientes de TODAS las fechas (siguen pendientes aunque pase el mes) y solo gasto real', () => {
    const rows = [P(10, { expenseDate: '2025-01-01' }), P(20, { isIncome: true }), P(30, { kind: 'previsto' }), P(5)]
    expect(pendingSignal(rows)).toEqual({ amount: 15, count: 2 })
  })
})

describe('P. el filtro «Pendientes» solo deja category NULL', () => {
  it('isPendingSpendingRow: NULL sí; cualquier categoría real (incluida «Otros») no; ingresos y previstos no', () => {
    expect(isPendingSpendingRow(P(5))).toBe(true)
    expect(isPendingSpendingRow(exp('2026-09-15', 5, 'Otros'))).toBe(false)
    expect(isPendingSpendingRow(exp('2026-09-15', 5, SUPER))).toBe(false)
    expect(isPendingSpendingRow(P(5, { isIncome: true }))).toBe(false)
    expect(isPendingSpendingRow(P(5, { kind: 'estimado' }))).toBe(false)
  })

  it('aplicado a una lista mixta devuelve exactamente los NULL', () => {
    const rows = [P(1), exp('2026-09-15', 2, SUPER), P(3), exp('2026-09-15', 4, 'Otros')]
    expect(rows.filter(isPendingSpendingRow).map((e) => e.amount)).toEqual([1, 3])
  })
})

describe('Q. clasificar un pendiente lo saca de Pendientes al instante', () => {
  it('con la categoría asignada ya no es pendiente y la señal baja', () => {
    const rows = [P(100), P(50)]
    expect(pendingSignal(rows).count).toBe(2)
    const after = rows.map((e, i) => (i === 0 ? { ...e, category: SUPER } : e))
    expect(after.filter(isPendingSpendingRow)).toHaveLength(1)
    expect(pendingSignal(after)).toEqual({ amount: 50, count: 1 })
    expect(pendingSignalText(pendingSignal(after.map((e) => ({ ...e, category: SUPER }))))).toBeNull()
  })
})

describe('R/S. la fila y el ticket NULL nunca muestran «null» o «undefined»', () => {
  it('categoryLabel(NULL) = «Pendiente de clasificar»', () => {
    expect(categoryLabel(null)).toBe('Pendiente de clasificar')
    expect(categoryLabel(undefined)).toBe(PENDING_LABEL)
    expect(categoryLabel('Alimentación')).toBe('Alimentación')
    for (const v of [null, undefined, 'Regalos y compras varias']) expect(categoryLabel(v)).not.toMatch(/null|undefined/)
  })
})

describe('U. conflicto y rechazos: mensajes humanos, sin detalles internos', () => {
  const conflict = parseClassifyResult({ status: 'conflict', reason: 'different_categories', expense_id: 'e', receipt_id: 'r', expense_category: 'A', receipt_category: 'B', requested: 'C' })

  it('un conflicto explica lo que pasa y no cambia nada', () => {
    expect(conflict.status).toBe('conflict')
    expect(classifyOk(conflict)).toBe(false)
    expect(classifyMessage(conflict)).toBe(CONFLICT_MESSAGE)
    expect(CONFLICT_MESSAGE).toBe('Este gasto y su ticket tienen categorías distintas. Revísalos antes de cambiar la clasificación.')
  })

  it('también cuando solo un lado está clasificado con otra categoría', () => {
    const r = parseClassifyResult({ status: 'conflict', reason: 'one_side_differs' })
    expect(classifyMessage(r)).toBe(CONFLICT_MESSAGE)
  })

  it('cada rechazo tiene un mensaje comprensible, sin SQL, ids ni nombres técnicos', () => {
    const reasons = ['unknown_category', 'null_category', 'empty_category', 'pending_label', 'ambiguous_link', 'income_not_supported', 'link_mismatch', 'family_mismatch', 'linked_expense_not_accessible', 'algo_raro']
    for (const reason of reasons) {
      const msg = classifyMessage(parseClassifyResult({ status: 'rejected', reason }))
      expect(msg.length).toBeGreaterThan(10)
      expect(msg).not.toMatch(/rpc|sql|postgres|policy|rls|uuid|classify_purchase|exception|null|undefined|42501/i)
    }
    expect(classifyMessage(parseClassifyResult({ status: 'not_found' }))).toMatch(/No encuentro/)
    expect(CLASSIFY_FAILED_MESSAGE).not.toMatch(/rpc|sql|postgres|exception/i)
  })

  it('una respuesta inesperada de la base NUNCA se toma como éxito', () => {
    for (const raw of [null, undefined, {}, 'ok', 42, { status: 'hecho' }, { status: 'classified2' }]) {
      const r = parseClassifyResult(raw)
      expect(classifyOk(r), JSON.stringify(raw)).toBe(false)
    }
  })

  it('los éxitos se reconocen: classified, unchanged y reclassified', () => {
    for (const status of ['classified', 'unchanged', 'reclassified']) {
      const r = parseClassifyResult({ status, category: 'Alimentación', expense_id: 'e', receipt_id: null, changed_expense: true, changed_receipt: false })
      expect(classifyOk(r)).toBe(true)
      expect(r.changedExpense).toBe(true)
      expect(r.changedReceipt).toBe(false)
      expect(r.receiptId).toBeNull()
    }
  })
})
