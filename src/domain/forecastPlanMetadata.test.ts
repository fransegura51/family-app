// Previsión de pagos — caso real de regresión (28/10/2026): cuadro de amortización de 6 pagos, total 658,75 €.
// Cambiar el estado del importe (Estimado ↔ Conocido) NUNCA puede cambiar importes ni fechas; ni siquiera al guardar, cerrar y volver a abrir.
import { describe, expect, it } from 'vitest'
import {
  applyTotalBasisToLines,
  applyTotalStatusToLines,
  linesDifferFromProposal,
  statusIsStructural,
  type PlanLineLike,
} from '@/domain/forecastPlanMetadata'
import { buildForecastDocumentPrefillFields, classifyDocumentAmountStatus, type ForecastDocumentScanResult } from '@/domain/forecastDocumentImport'
import { buildFinitePlanSubmission, parseFinitePlanLinesFromSaved, proposeFinitePlanLines } from '@/domain/forecastInstallmentPlanForm'
import type { ForecastOccurrenceOverride } from '@/domain/forecast'

const AMOUNTS = [116.21, 107.93, 108.21, 108.52, 108.81, 109.07]
const DATES = ['2026-11-20', '2026-12-21', '2027-01-20', '2027-02-22', '2027-03-22', '2027-04-20']

const scan: ForecastDocumentScanResult = {
  provider: 'Acreedor',
  concept: 'Cuadro de amortización',
  totalAmount: 658.75,
  installmentCount: 6,
  installmentAmount: null,
  installmentAmounts: AMOUNTS,
  firstDueDate: '2026-11-20',
  periodicity: 'mensual',
  lastDueDate: '2027-04-20',
  paidInstallments: null,
  installmentDueDates: DATES,
}

function importedLines(status: 'known' | 'estimated'): PlanLineLike[] {
  return AMOUNTS.map((a, i) => ({ date: DATES[i], amountStatus: status, amount: String(a), amountEstimatedBasis: status === 'estimated' ? 'Importe leído de un documento importado — revisa que sea correcto.' : '' }))
}
const snapshot = (lines: PlanLineLike[]) => lines.map((l) => [l.date, l.amount])

describe('clasificación Conocido / Estimado por el contenido del documento', () => {
  it('el cuadro real (6 importes + 6 fechas que suman 658,75) se propone como Conocido', () => {
    const fields = buildForecastDocumentPrefillFields(scan)
    expect(fields.amount).toBe(658.75)
    expect(fields.installmentAmounts).toEqual(AMOUNTS)
    expect(fields.installmentDueDates).toEqual(DATES)
    expect(fields.amountStatusSuggestion).toBe('known')
    expect(fields.amountStatusNote).toMatch(/lista cada importe y cada fecha/)
  })

  it('sin total explícito, el total es la suma de las filas y también es Conocido', () => {
    const fields = buildForecastDocumentPrefillFields({ ...scan, totalAmount: null })
    expect(fields.amount).toBeCloseTo(658.75, 2)
    expect(fields.amountStatusSuggestion).toBe('known')
  })

  it('con duda se queda en Estimado: total que no cuadra con las filas, faltan fechas o faltan importes', () => {
    expect(buildForecastDocumentPrefillFields({ ...scan, totalAmount: 20790 }).amountStatusSuggestion).toBe('estimated') // capital ≠ suma de cuotas (intereses)
    expect(buildForecastDocumentPrefillFields({ ...scan, installmentDueDates: null }).amountStatusSuggestion).toBe('estimated')
    expect(buildForecastDocumentPrefillFields({ ...scan, installmentAmounts: null, installmentAmount: null }).amountStatusSuggestion).toBe('estimated')
    expect(buildForecastDocumentPrefillFields({ ...scan, installmentAmounts: AMOUNTS.slice(0, 5) }).amountStatusSuggestion).toBe('estimated')
  })

  it('cuotas iguales con importe y total que se confirman entre sí → Conocido; si no coinciden → Estimado', () => {
    const base = { ...scan, installmentAmounts: null, installmentDueDates: null, installmentAmount: 100, totalAmount: 600 }
    expect(buildForecastDocumentPrefillFields(base).amountStatusSuggestion).toBe('known')
    expect(buildForecastDocumentPrefillFields({ ...base, totalAmount: 650 }).amountStatusSuggestion).toBe('estimated')
    expect(buildForecastDocumentPrefillFields({ ...base, totalAmount: null }).amountStatusSuggestion).toBe('estimated')
  })

  it('classifyDocumentAmountStatus no se fía si el total es dudoso', () => {
    const r = classifyDocumentAmountStatus({ scan, amount: 658.75, installmentAmounts: AMOUNTS, installmentDueDates: DATES, amountReviewNote: 'revisa', planReviewNote: null })
    expect(r.status).toBe('estimated')
  })
})

describe('cambiar el estado del importe no toca el dinero ni las fechas', () => {
  const prevEst = { status: 'estimated' as const, basis: 'Importe leído de un documento importado — revisa que sea correcto.' }

  it('Estimado → Conocido → Estimado → Conocido: los seis importes y las seis fechas son idénticos en cada paso', () => {
    const original = importedLines('estimated')
    const before = snapshot(original)

    const known = applyTotalStatusToLines(original, prevEst, { status: 'known', basis: prevEst.basis })
    expect(known.every((l) => l.amountStatus === 'known')).toBe(true)
    expect(snapshot(known)).toEqual(before)

    const estimatedAgain = applyTotalStatusToLines(known, { status: 'known', basis: prevEst.basis }, { status: 'estimated', basis: prevEst.basis })
    expect(estimatedAgain.every((l) => l.amountStatus === 'estimated')).toBe(true)
    expect(snapshot(estimatedAgain)).toEqual(before)

    const knownAgain = applyTotalStatusToLines(estimatedAgain, { status: 'estimated', basis: prevEst.basis }, { status: 'known', basis: '' })
    expect(snapshot(knownAgain)).toEqual(before)
    // el total sigue siendo 658,75 € y NO se han convertido en pagos iguales
    const total = knownAgain.reduce((s, l) => s + Math.round(Number(l.amount) * 100), 0)
    expect(total).toBe(65875)
    expect(new Set(knownAgain.map((l) => l.amount)).size).toBe(6)
  })

  it('una línea con estado propio (p. ej. «Pendiente» puesta a mano) se respeta', () => {
    const lines = importedLines('estimated')
    lines[3] = { ...lines[3], amountStatus: 'unknown', amount: '' }
    const out = applyTotalStatusToLines(lines, prevEst, { status: 'known', basis: '' })
    expect(out[3].amountStatus).toBe('unknown')
    expect(out.filter((l) => l.amountStatus === 'known')).toHaveLength(5)
  })

  it('una explicación propia de una línea («en qué se basa») se respeta; la del total se sigue', () => {
    const lines = importedLines('estimated')
    lines[1] = { ...lines[1], amountEstimatedBasis: 'Según el banco por teléfono' }
    const out = applyTotalBasisToLines(lines, prevEst.basis, 'Cuadro oficial del acreedor')
    expect(out[1].amountEstimatedBasis).toBe('Según el banco por teléfono')
    expect(out[0].amountEstimatedBasis).toBe('Cuadro oficial del acreedor')
  })

  it('pasar a o desde «Pendiente» sí es estructural; Estimado ↔ Conocido no', () => {
    expect(statusIsStructural('estimated', 'known')).toBe(false)
    expect(statusIsStructural('known', 'estimated')).toBe(false)
    expect(statusIsStructural('known', 'unknown')).toBe(true)
    expect(statusIsStructural('unknown', 'estimated')).toBe(true)
  })

  it('guardar, cerrar y volver a abrir conserva importes, fechas, número de pagos y estado (sin duplicar)', () => {
    // El formulario tras cambiar a Conocido:
    const lines = applyTotalStatusToLines(importedLines('estimated'), prevEst, { status: 'known', basis: '' })
    const submission = buildFinitePlanSubmission('2026-11-20', 'MONTHLY', 1, lines, 'known', 658.75, null, 'total')
    expect(submission.parentAmountStatus).toBe('known')
    // Lo guardado en la base: el padre + un override por cada línea que difiere (fecha, estado o importe).
    const overrides: ForecastOccurrenceOverride[] = submission.overrides.map((o, i) => ({
      id: `o${i}`,
      forecastPaymentId: 'p1',
      occurrenceDate: o.occurrenceDate,
      installmentSequenceIndex: null,
      dueDateOverride: o.dueDateOverride,
      amountStatus: o.amountStatus,
      amount: o.amount,
      amountEstimatedBasis: o.amountEstimatedBasis,
    })) as unknown as ForecastOccurrenceOverride[]
    // Reabrir:
    const reopened = parseFinitePlanLinesFromSaved('2026-11-20', 'MONTHLY', 1, 6, submission.parentAmountStatus, submission.parentAmount, submission.parentAmountEstimatedBasis, overrides)
    expect(reopened).toHaveLength(6)
    expect(snapshot(reopened).map(([d, a]) => [d, Number(a)])).toEqual(DATES.map((d, i) => [d, AMOUNTS[i]]))
    expect(reopened.every((l) => l.amountStatus === 'known')).toBe(true)
    // Y una segunda vuelta (guardar otra vez lo reabierto) no cambia nada.
    const again = buildFinitePlanSubmission('2026-11-20', 'MONTHLY', 1, reopened, 'known', 658.75, null, 'total')
    expect(again.overrides).toEqual(submission.overrides)
  })
})

describe('cuándo SÍ hace falta recalcular (estructura) y cuándo no hay nada que proteger', () => {
  it('las líneas del documento difieren del reparto uniforme: hay que pedir confirmación antes de sustituirlas', () => {
    const proposal = proposeFinitePlanLines('2026-11-20', 'MONTHLY', 1, 6, 'known', 658.75, '')
    expect(linesDifferFromProposal(importedLines('known'), proposal)).toBe(true)
  })

  it('un plan que ya es el reparto propuesto se puede rehacer sin preguntar', () => {
    const proposal = proposeFinitePlanLines('2026-11-20', 'MONTHLY', 1, 6, 'estimated', 658.75, 'x')
    expect(linesDifferFromProposal(proposal, proposeFinitePlanLines('2026-11-20', 'MONTHLY', 1, 6, 'known', 658.75, ''))).toBe(false)
  })

  it('cambiar solo el estado de un reparto propuesto NO cambia sus importes (antes se volvía a repartir)', () => {
    const est = proposeFinitePlanLines('2026-11-20', 'MONTHLY', 1, 6, 'estimated', 658.75, 'base')
    const known = proposeFinitePlanLines('2026-11-20', 'MONTHLY', 1, 6, 'known', 658.75, '')
    expect(snapshot(est)).toEqual(snapshot(known))
  })
})
