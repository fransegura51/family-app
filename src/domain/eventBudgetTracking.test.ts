import { describe, expect, it } from 'vitest'
import {
  budgetItemAmounts,
  comparePayments,
  committedAmountForBudgetItem,
  groupKeyForBudgetItem,
  groupKeyForPayment,
  paidAmountForBudgetItem,
  paymentProgress,
  sortPayments,
} from '@/domain/eventBudgetTracking'
import type { EventBudgetItem, EventPayment } from '@/domain/types'

function makeBudgetItem(overrides: Partial<EventBudgetItem> = {}): EventBudgetItem {
  return {
    id: 'b1',
    eventId: 'e1',
    familyId: 'f1',
    category: 'Flores',
    plannedAmount: 200,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    decisionId: null,
    providerId: null,
    groupId: null,
    categoryId: null,
    committedAmount: null,
    ...overrides,
  }
}

function makePayment(overrides: Partial<EventPayment> = {}): EventPayment {
  return {
    id: 'p1',
    eventId: 'e1',
    familyId: 'f1',
    providerId: null,
    providerName: null,
    concept: 'Floristería',
    totalAmount: 100,
    depositPaid: 0,
    dueDate: null,
    status: 'pendiente',
    notes: null,
    reminderCalendarEventId: null,
    createdAt: '2026-01-01T00:00:00Z',
    budgetItemId: null,
    category: null,
    bondAmount: null,
    bondReturnedAt: null,
    attachmentStoragePath: null,
    attachmentOriginalName: null,
    attachmentMimeType: null,
    ...overrides,
  }
}

describe('Parte D (orden de recuperación de requisitos) — Planeado/Comprometido/Pagado por partida', () => {
  it('committedAmountForBudgetItem: manual si está fijado, nunca se recalcula por encima de él', () => {
    const item = makeBudgetItem({ committedAmount: 150 })
    const payments = [makePayment({ budgetItemId: 'b1', totalAmount: 999 })]
    expect(committedAmountForBudgetItem(item, payments)).toBe(150)
  })

  it('committedAmountForBudgetItem: sin fijar a mano, suma los pagos enlazados por budgetItemId', () => {
    const item = makeBudgetItem()
    const payments = [makePayment({ id: 'p1', budgetItemId: 'b1', totalAmount: 100 }), makePayment({ id: 'p2', budgetItemId: 'b1', totalAmount: 50 }), makePayment({ id: 'p3', budgetItemId: 'otro', totalAmount: 999 })]
    expect(committedAmountForBudgetItem(item, payments)).toBe(150)
  })

  it('committedAmountForBudgetItem: null (no "no lo sé" como 0) si no hay fijado ni pagos enlazados', () => {
    expect(committedAmountForBudgetItem(makeBudgetItem(), [])).toBeNull()
  })

  it('paidAmountForBudgetItem: 0 de verdad (no null) si no hay pagos enlazados', () => {
    expect(paidAmountForBudgetItem(makeBudgetItem(), [])).toBe(0)
  })

  it('paidAmountForBudgetItem: suma depositPaid solo de los pagos de ESTA partida', () => {
    const payments = [makePayment({ id: 'p1', budgetItemId: 'b1', depositPaid: 40 }), makePayment({ id: 'p2', budgetItemId: 'otro', depositPaid: 999 })]
    expect(paidAmountForBudgetItem(makeBudgetItem(), payments)).toBe(40)
  })

  it('budgetItemAmounts junta los tres, planned siempre viene de plannedAmount tal cual', () => {
    const item = makeBudgetItem({ plannedAmount: 300 })
    const payments = [makePayment({ budgetItemId: 'b1', totalAmount: 200, depositPaid: 80 })]
    expect(budgetItemAmounts(item, payments)).toEqual({ planned: 300, committed: 200, paid: 80 })
  })

  it('groupKeyForBudgetItem: categoría/encargo/proveedor, null = sin asignar', () => {
    const item = makeBudgetItem({ category: 'Flores', groupId: 'g1', providerId: null })
    expect(groupKeyForBudgetItem(item, 'categoria')).toBe('Flores')
    expect(groupKeyForBudgetItem(item, 'encargo')).toBe('g1')
    expect(groupKeyForBudgetItem(item, 'proveedor')).toBeNull()
  })
})

describe('Parte E — barra de progreso, 6 criterios de orden, agrupar por categoría/proveedor', () => {
  it('paymentProgress: fracción pagado/total, nunca fuera de [0,1]', () => {
    expect(paymentProgress(makePayment({ totalAmount: 100, depositPaid: 40 }))).toBeCloseTo(0.4)
    expect(paymentProgress(makePayment({ totalAmount: 100, depositPaid: 150 }))).toBe(1)
    expect(paymentProgress(makePayment({ totalAmount: 0, depositPaid: 0 }))).toBe(0)
    expect(paymentProgress(makePayment({ totalAmount: 0, depositPaid: 10 }))).toBe(1)
  })

  it('comparePayments por vencimiento: sin fecha siempre al final', () => {
    const a = makePayment({ id: 'a', dueDate: '2026-05-01' })
    const b = makePayment({ id: 'b', dueDate: null })
    const c = makePayment({ id: 'c', dueDate: '2026-01-01' })
    expect(sortPayments([a, b, c], 'vencimiento').map((p) => p.id)).toEqual(['c', 'a', 'b'])
  })

  it('comparePayments por importe: mayor primero', () => {
    const a = makePayment({ id: 'a', totalAmount: 50 })
    const b = makePayment({ id: 'b', totalAmount: 200 })
    expect(sortPayments([a, b], 'importe').map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('comparePayments por pendiente: lo que queda por pagar, mayor primero', () => {
    const a = makePayment({ id: 'a', totalAmount: 100, depositPaid: 90 })
    const b = makePayment({ id: 'b', totalAmount: 100, depositPaid: 10 })
    expect(sortPayments([a, b], 'pendiente').map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('comparePayments por proveedor y concepto: alfabético, sin proveedor al final', () => {
    const a = makePayment({ id: 'a', providerName: 'Zeta' })
    const b = makePayment({ id: 'b', providerName: 'Ana' })
    const c = makePayment({ id: 'c', providerName: null })
    expect(sortPayments([a, b, c], 'proveedor').map((p) => p.id)).toEqual(['b', 'a', 'c'])
    expect(comparePayments(makePayment({ concept: 'Zeta' }), makePayment({ concept: 'Ana' }), 'concepto')).toBeGreaterThan(0)
  })

  it('comparePayments por estado: pendiente < parcial < pagado', () => {
    const a = makePayment({ id: 'a', status: 'pagado' })
    const b = makePayment({ id: 'b', status: 'pendiente' })
    const c = makePayment({ id: 'c', status: 'parcial' })
    expect(sortPayments([a, b, c], 'estado').map((p) => p.id)).toEqual(['b', 'c', 'a'])
  })

  it('groupKeyForPayment: categoría o proveedor, null = sin asignar', () => {
    const p = makePayment({ category: 'Flores', providerName: 'Floristería X' })
    expect(groupKeyForPayment(p, 'categoria')).toBe('Flores')
    expect(groupKeyForPayment(p, 'proveedor')).toBe('Floristería X')
    expect(groupKeyForPayment(makePayment(), 'categoria')).toBeNull()
  })
})
