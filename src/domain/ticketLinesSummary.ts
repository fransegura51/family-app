// COMPROBAR LOS IMPORTES ANTES DE GUARDAR un ticket o una compra con productos. Lógica pura.
//
// Cada línea es cantidad × precio por unidad (o por kg). La suma de las líneas, menos los descuentos del ticket (el total impreso ya los lleva
// aplicados), debería coincidir con el total del ticket. Es solo un AVISO: nunca bloquea guardar (un ticket puede tener líneas ilegibles, redondeos o
// productos omitidos a propósito, como PARKING).
import { parseAmount } from './manualPurchase'
import { isCreditLine } from './ticketCreditLines'

export interface SummaryLine {
  name: string
  quantity: string
  unitPrice: string
}

export interface TicketLinesSummary {
  /** Líneas con nombre y precio válido que se guardarán. */
  counted: number
  /** Líneas con nombre pero sin un precio válido (o negativas: abonos), que NO se guardan en el historial. */
  ignored: number
  /** Suma de cantidad × precio de las líneas que se guardarán. */
  linesTotal: number
  discount: number
  /** Lo que debería poner el ticket: suma de líneas − descuentos. */
  expectedTotal: number
  ticketTotal: number | null
  /** ticketTotal − expectedTotal; null si no hay total. */
  difference: number | null
  /** null = no se puede comprobar (sin líneas o sin total). */
  matches: boolean | null
}

const round2 = (n: number) => Math.round(n * 100) / 100
export const TICKET_TOTAL_TOLERANCE = 0.02

/** Importe de una línea (cantidad × precio), o null si no hay un precio válido. */
export function lineAmount(line: SummaryLine): number | null {
  const price = parseAmount(line.unitPrice)
  if (price == null || price < 0) return null
  const quantity = line.quantity.trim() === '' ? 1 : parseAmount(line.quantity)
  if (quantity == null || quantity <= 0) return null
  return round2(quantity * price)
}

/**
 * ¿Se guarda esta línea en el Historial de precios? Tiene nombre y un precio escrito y válido (un precio VACÍO no es 0 €: antes una línea sin precio
 * se guardaba a 0,00 € y falseaba el historial), y no es un abono o descuento (importe negativo). La cantidad vacía vale 1.
 * El resumen de importes y el guardado usan EXACTAMENTE esta misma regla, para que lo que se avisa sea lo que de verdad se guarda.
 */
export function isSavableLine(line: SummaryLine): boolean {
  if (!line.name.trim()) return false
  const price = parseAmount(line.unitPrice)
  return price != null && lineAmount(line) != null && !isCreditLine(price)
}

export function summarizeTicketLines(lines: readonly SummaryLine[], ticketTotalText: string, discountTotal: number): TicketLinesSummary {
  let counted = 0
  let ignored = 0
  let linesTotal = 0
  for (const l of lines) {
    if (!l.name.trim()) continue
    if (!isSavableLine(l)) {
      ignored++
      continue
    }
    counted++
    linesTotal += lineAmount(l) as number
  }
  linesTotal = round2(linesTotal)
  const discount = round2(Math.max(0, discountTotal))
  const expectedTotal = round2(linesTotal - discount)
  const ticketTotal = parseAmount(ticketTotalText)
  const difference = ticketTotal == null ? null : round2(ticketTotal - expectedTotal)
  const matches = counted === 0 || difference == null ? null : Math.abs(difference) <= TICKET_TOTAL_TOLERANCE
  return { counted, ignored, linesTotal, discount, expectedTotal, ticketTotal, difference, matches }
}

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

export type SummaryTone = 'ok' | 'warn' | 'info'

/** Texto para enseñar bajo las líneas. null = nada que decir (sin líneas). */
export function summaryMessage(s: TicketLinesSummary): { tone: SummaryTone; text: string } | null {
  if (s.counted === 0 && s.ignored === 0) return null
  const parts: string[] = []
  let tone: SummaryTone = 'info'
  if (s.counted > 0) {
    const base = `${s.counted} ${s.counted === 1 ? 'producto suma' : 'productos suman'} ${eur(s.linesTotal)}${s.discount > 0 ? ` − descuentos ${eur(s.discount)} = ${eur(s.expectedTotal)}` : ''}`
    if (s.ticketTotal == null) parts.push(`${base}. Escribe el importe total del ticket para comprobar que cuadra.`)
    else if (s.matches) {
      tone = 'ok'
      // COMP-01: con descuentos ya registrados, una confirmación discreta con la cuenta completa (sin pedir ninguna explicación).
      if (s.discount > 0) parts.push(`✓ Compra cuadrada: ${eur(s.linesTotal)} − ${eur(s.discount)} = ${eur(s.ticketTotal)}.`)
      else parts.push(`✓ ${base}: cuadra con el total del ticket (${eur(s.ticketTotal)}).`)
    } else {
      tone = 'warn'
      const d = s.difference as number
      parts.push(`${base}, pero el ticket pone ${eur(s.ticketTotal)}: ${d > 0 ? `faltan ${eur(d)}` : `sobran ${eur(-d)}`}. Revisa las líneas (¿falta alguna, o sobra o está mal un precio?). Puedes guardar igualmente.`)
    }
  }
  if (s.ignored > 0) parts.push(`${s.ignored === 1 ? '1 línea sin precio válido no se guardará' : `${s.ignored} líneas sin precio válido no se guardarán`} en el historial.`)
  return { tone, text: parts.join(' ') }
}
