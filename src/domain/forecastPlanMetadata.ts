import type { ForecastAmountStatus } from '@/domain/forecast'

// Previsión de pagos — EDICIÓN DE METADATOS vs EDICIÓN DE ESTRUCTURA (28/10/2026).
//
// Bug real: al editar una previsión importada de un cuadro de amortización (seis pagos de importes distintos) y cambiar «Estado del importe TOTAL» de «Estimado» a «Conocido»,
// el formulario rehacía el plan entero y dejaba seis cuotas iguales. El estado (y el texto «en qué se basa») es información DESCRIPTIVA del importe: no puede tocar el dinero.
//   · METADATOS: estado del importe, en qué se basa, concepto, categoría, notas… → nunca recalculan importes, fechas ni número de pagos.
//   · ESTRUCTURA: número de pagos, frecuencia, primer vencimiento, importe total, modo de importe y pasar a/desde «Pendiente» → sí piden recalcular, y si hay importes o fechas
//     personalizados no se sobrescriben sin que la persona lo confirme (aviso «Recalcular / Mantener» en el formulario).
// Estas funciones son puras (sin React) para poder probarlas con el caso real.

export interface PlanLineLike {
  date: string
  amountStatus: ForecastAmountStatus
  amount: string
  amountEstimatedBasis: string
}

const toCents = (text: string): number | null => {
  const t = text.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/**
 * ¿Las líneas actuales tienen algo que el reparto propuesto NO daría (otro importe o otra fecha en alguna línea, o distinto número)?
 * Si es así, rehacer el plan sobrescribiría datos reales o personalizados y hay que pedir confirmación.
 */
export function linesDifferFromProposal(lines: readonly PlanLineLike[], proposal: readonly PlanLineLike[]): boolean {
  if (lines.length !== proposal.length) return true
  return lines.some((line, i) => {
    const p = proposal[i]
    if (line.date !== p.date) return true
    const a = line.amountStatus === 'unknown' ? null : toCents(line.amount)
    const b = p.amountStatus === 'unknown' ? null : toCents(p.amount)
    return a !== b
  })
}

/**
 * Cambio de estado/base del importe TOTAL: solo cambia el estado (y la base, si procede) de las líneas que SEGUÍAN al total. Importes y fechas quedan EXACTAMENTE como estaban.
 *  - Una línea con un estado propio distinto del que tenía el total (p. ej. una «Pendiente» puesta a mano) se respeta.
 *  - Una línea con su propia explicación de «en qué se basa» se respeta; si usaba la del total, la sigue.
 */
export function applyTotalStatusToLines<T extends PlanLineLike>(
  lines: readonly T[],
  prev: { status: ForecastAmountStatus; basis: string },
  next: { status: ForecastAmountStatus; basis: string },
): T[] {
  return lines.map((line) => {
    if (line.amountStatus !== prev.status) return line
    const followsTotalBasis = line.amountEstimatedBasis === '' || line.amountEstimatedBasis === prev.basis
    return {
      ...line,
      amountStatus: next.status,
      amountEstimatedBasis: next.status === 'estimated' ? (followsTotalBasis ? next.basis : line.amountEstimatedBasis) : '',
    }
  })
}

/** La base («en qué se basa») del total cambió sin cambiar el estado: las líneas «Estimadas» que usaban la base anterior pasan a la nueva. Importes y fechas no se tocan. */
export function applyTotalBasisToLines<T extends PlanLineLike>(lines: readonly T[], prevBasis: string, nextBasis: string): T[] {
  return lines.map((line) => (line.amountStatus === 'estimated' && line.amountEstimatedBasis === prevBasis ? { ...line, amountEstimatedBasis: nextBasis } : line))
}

/** Pasar a o desde «Pendiente» cambia la naturaleza del importe (con o sin cifra): eso sí es estructural. */
export function statusIsStructural(prev: ForecastAmountStatus, next: ForecastAmountStatus): boolean {
  return (prev === 'unknown') !== (next === 'unknown')
}
