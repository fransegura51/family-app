// COMPRAS MANUALES (sin ticket). Lógica pura: validación del formulario rápido, formas de pago, quién pagó por defecto y búsqueda de la
// compra manual a la que pertenece un ticket que se sube después (para completarla en vez de crear otra y duplicar el gasto en Economía).
import { TICKET_MATCH_WINDOW_DAYS } from './ticketExpenseMatch'

export const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: '💶 Efectivo',
  tarjeta: '💳 Tarjeta',
  bizum: '📱 Bizum',
  transferencia: '🏦 Transferencia',
  otro: 'Otro',
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value)
}

export interface ManualPurchaseInput {
  store: string
  /** AAAA-MM-DD */
  date: string
  /** Texto del campo «Importe total»; admite coma decimal. */
  total: string
  paymentMethod: string
}

/** Primer problema que impide guardar una compra rápida, o null. Solo exige lo imprescindible: importe y fecha. */
export function validateManualPurchase(input: ManualPurchaseInput): string | null {
  const total = parseAmount(input.total)
  if (total == null) return 'Escribe el importe total'
  if (total <= 0) return 'El importe tiene que ser mayor que 0'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'Elige la fecha de la compra'
  if (input.paymentMethod !== '' && !isPaymentMethod(input.paymentMethod)) return 'Elige una forma de pago de la lista'
  return null
}

/** «8,50» y «8.50» → 8.5; vacío o no numérico → null. Redondea a céntimos. */
export function parseAmount(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (clean === '') return null
  const n = Number(clean)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

/** Quién pagó por defecto: la persona que está registrando (si es miembro de la familia); si no, nadie (el campo es opcional). */
export function defaultPayerId(members: readonly { id: string; linkedProfileId?: string | null }[], profileId: string | null | undefined): string {
  if (!profileId) return ''
  return members.find((m) => m.linkedProfileId === profileId)?.id ?? ''
}

export interface PurchaseCandidate {
  id: string
  store: string | null
  receiptDate: string
  totalAmount: number | null
  storagePath: string | null
  isManual?: boolean
}

function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

function normStore(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Compras manuales SIN justificante que podrían ser la misma compra que un ticket recién leído: mismo importe (al céntimo), fecha a ±7 días
 * y, si ambos tienen establecimiento, el mismo. Se devuelven ordenadas por cercanía de fecha. NUNCA se unen solas: quien sube el ticket
 * decide («es esta compra») — una coincidencia aproximada no basta para fusionar ni borrar nada.
 */
export function findManualPurchasesForTicket(
  candidates: readonly PurchaseCandidate[],
  ticket: { totalAmount: number | null; receiptDate: string; store: string },
): PurchaseCandidate[] {
  if (ticket.totalAmount == null) return []
  const ticketStore = normStore(ticket.store)
  return candidates
    .filter((c) => c.isManual && !c.storagePath && c.totalAmount != null)
    .filter((c) => Math.abs((c.totalAmount as number) - (ticket.totalAmount as number)) < 0.01)
    .filter((c) => Math.abs(dayNumber(c.receiptDate) - dayNumber(ticket.receiptDate)) <= TICKET_MATCH_WINDOW_DAYS)
    .filter((c) => !ticketStore || !normStore(c.store) || normStore(c.store) === ticketStore)
    .sort((a, b) => Math.abs(dayNumber(a.receiptDate) - dayNumber(ticket.receiptDate)) - Math.abs(dayNumber(b.receiptDate) - dayNumber(ticket.receiptDate)))
}
