// Orden de recuperación de requisitos (Partes D y E, autorización directa del usuario 2026-10-10) —
// Presupuesto y Pagos por PARTIDA (no solo agregados de TODO el evento, que es lo que había hasta ahora
// en BudgetSection/PaymentsSection de EventosScreen.tsx). Funciones puras, sin acceso a datos: reciben ya
// cargados los EventBudgetItem/EventPayment del evento y calculan sobre ellos.
import type { EventBudgetItem, EventPayment, EventPaymentStatus } from '@/domain/types'

// "Comprometido" de una partida: manual (committedAmount) si lo han fijado a mano, o si no, la suma de
// los pagos ya enlazados a ella (budgetItemId) — nunca inventado, nunca combinado con "Planeado" ni con
// "Gastado en Economía" (ver BudgetSection, que ya separa esos dos a propósito).
export function committedAmountForBudgetItem(item: EventBudgetItem, payments: EventPayment[]): number | null {
  if (item.committedAmount != null) return item.committedAmount
  const linked = payments.filter((p) => p.budgetItemId === item.id)
  if (linked.length === 0) return null
  return linked.reduce((sum, p) => sum + p.totalAmount, 0)
}

// "Pagado" de una partida: suma de depositPaid de los pagos enlazados a ella. 0 si no hay ninguno
// (distinto de null: "comprometido" puede ser "no lo sé todavía", pero "pagado" sin pagos es 0 de verdad).
export function paidAmountForBudgetItem(item: EventBudgetItem, payments: EventPayment[]): number {
  return payments.filter((p) => p.budgetItemId === item.id).reduce((sum, p) => sum + p.depositPaid, 0)
}

export interface BudgetItemAmounts {
  planned: number | null
  committed: number | null
  paid: number
}

export function budgetItemAmounts(item: EventBudgetItem, payments: EventPayment[]): BudgetItemAmounts {
  return {
    planned: item.plannedAmount,
    committed: committedAmountForBudgetItem(item, payments),
    paid: paidAmountForBudgetItem(item, payments),
  }
}

// EVT-D2 — agrupar partidas por Encargo/Proveedor/Categoría (Concepto es cada partida en sí, ya es la
// unidad mínima). null = "sin asignar", siempre su propio grupo al final, nunca mezclado con uno real.
export type BudgetGroupCriterion = 'categoria' | 'encargo' | 'proveedor'

export function groupKeyForBudgetItem(item: EventBudgetItem, criterion: BudgetGroupCriterion): string | null {
  if (criterion === 'categoria') return item.category || null
  if (criterion === 'encargo') return item.groupId
  return item.providerId
}

// EVT-E2 — barra de progreso de un pago: fracción pagada sobre el total, SIEMPRE entre 0 y 1 (un pago
// con depositPaid > totalAmount por error de captura no debe desbordar la barra ni volverse negativa).
export function paymentProgress(payment: EventPayment): number {
  if (payment.totalAmount <= 0) return payment.depositPaid > 0 ? 1 : 0
  return Math.min(1, Math.max(0, payment.depositPaid / payment.totalAmount))
}

// EVT-E3 — 6 criterios de ordenación. Los pagos sin el dato correspondiente (sin vencimiento, sin
// proveedor...) van siempre al final, nunca mezclados al azar con los que sí lo tienen.
export type PaymentSortCriterion = 'vencimiento' | 'importe' | 'pendiente' | 'proveedor' | 'concepto' | 'estado'

const PAYMENT_STATUS_ORDER: Record<EventPaymentStatus, number> = { pendiente: 0, parcial: 1, pagado: 2 }

function compareNullableString(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a.localeCompare(b, 'es')
}

export function comparePayments(a: EventPayment, b: EventPayment, criterion: PaymentSortCriterion): number {
  switch (criterion) {
    case 'vencimiento': {
      if (a.dueDate == null && b.dueDate == null) return 0
      if (a.dueDate == null) return 1
      if (b.dueDate == null) return -1
      return a.dueDate.localeCompare(b.dueDate)
    }
    case 'importe':
      return b.totalAmount - a.totalAmount
    case 'pendiente':
      return b.totalAmount - b.depositPaid - (a.totalAmount - a.depositPaid)
    case 'proveedor':
      return compareNullableString(a.providerName, b.providerName)
    case 'concepto':
      return a.concept.localeCompare(b.concept, 'es')
    case 'estado':
      return PAYMENT_STATUS_ORDER[a.status] - PAYMENT_STATUS_ORDER[b.status]
    default:
      return 0
  }
}

export function sortPayments(payments: EventPayment[], criterion: PaymentSortCriterion): EventPayment[] {
  return [...payments].sort((a, b) => comparePayments(a, b, criterion))
}

// EVT-E5 — agrupar pagos por categoría o proveedor (null = "sin asignar", su propio grupo).
export type PaymentGroupCriterion = 'categoria' | 'proveedor'

export function groupKeyForPayment(payment: EventPayment, criterion: PaymentGroupCriterion): string | null {
  return criterion === 'categoria' ? payment.category : payment.providerName
}
