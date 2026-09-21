// Fase 6C.2C — resultado de classify_purchase (RPC atómica gasto ↔ ticket) y sus mensajes HUMANOS.
// La RPC devuelve siempre un jsonb estructurado; nada de errores SQL llega al usuario.
import { formatEuros } from '@/domain/financeCompute'
import type { PendingSpending } from '@/domain/pending'

export type ClassifyStatus = 'classified' | 'unchanged' | 'reclassified' | 'conflict' | 'rejected' | 'not_found'

export interface ClassifyResult {
  status: ClassifyStatus
  reason: string | null
  category: string | null
  expenseId: string | null
  receiptId: string | null
  changedExpense: boolean
  changedReceipt: boolean
  expenseCategory: string | null
  receiptCategory: string | null
}

const STATUSES: readonly ClassifyStatus[] = ['classified', 'unchanged', 'reclassified', 'conflict', 'rejected', 'not_found']

/** Valida y normaliza lo que devuelve la RPC (viene como jsonb sin tipo). Una respuesta inesperada se trata como rechazo, nunca como éxito. */
export function parseClassifyResult(raw: unknown): ClassifyResult {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const status = STATUSES.includes(o.status as ClassifyStatus) ? (o.status as ClassifyStatus) : 'rejected'
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  return {
    status,
    reason: str(o.reason) ?? (STATUSES.includes(o.status as ClassifyStatus) ? null : 'unexpected_response'),
    category: str(o.category),
    expenseId: str(o.expense_id),
    receiptId: str(o.receipt_id),
    changedExpense: o.changed_expense === true,
    changedReceipt: o.changed_receipt === true,
    expenseCategory: str(o.expense_category),
    receiptCategory: str(o.receipt_category),
  }
}

/** ¿Quedó clasificado (o ya lo estaba)? */
export function classifyOk(r: ClassifyResult): boolean {
  return r.status === 'classified' || r.status === 'unchanged' || r.status === 'reclassified'
}

export const CONFLICT_MESSAGE = 'Este gasto y su ticket tienen categorías distintas. Revísalos antes de cambiar la clasificación.'

/** El texto que ve la persona cuando NO se pudo clasificar. Sin detalles internos. */
export function classifyMessage(r: ClassifyResult): string {
  if (r.status === 'conflict') return CONFLICT_MESSAGE
  if (r.status === 'not_found') return 'No encuentro ese movimiento. Puede que ya no exista o que no tengas acceso.'
  switch (r.reason) {
    case 'unknown_category':
      return 'Esa categoría no existe entre las de tu familia. Elige una de la lista.'
    case 'null_category':
    case 'empty_category':
    case 'pending_label':
      return 'Elige una categoría real para clasificarlo.'
    case 'ambiguous_link':
      return 'Este gasto tiene más de un ticket enlazado. Revísalo antes de clasificar.'
    case 'income_not_supported':
      return 'Un ingreso no se clasifica como gasto pendiente.'
    case 'link_mismatch':
    case 'family_mismatch':
    case 'linked_expense_not_accessible':
      return 'No se puede clasificar este ticket junto con su gasto desde aquí. Revísalos antes de continuar.'
    default:
      return 'No se ha podido clasificar. No se ha cambiado nada.'
  }
}

/** Mensaje genérico si la llamada falla por otra causa (red, permisos...): el detalle técnico se registra aparte, no se enseña. */
export const CLASSIFY_FAILED_MESSAGE = 'No se ha podido clasificar ahora mismo. No se ha cambiado nada; inténtalo de nuevo.'

/** «3 pendientes de clasificar · 245,30 €» (null si no hay ninguno: la señal no se muestra). */
export function pendingSignalText(p: PendingSpending): string | null {
  if (p.count <= 0) return null
  const n = p.count === 1 ? '1 pendiente' : `${p.count} pendientes`
  return `${n} de clasificar · ${formatEuros(p.amount)}`
}
