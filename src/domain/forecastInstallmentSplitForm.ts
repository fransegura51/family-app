// Previsión de pagos — Fase 1D-d: puente puro entre el formulario ("¿Cómo se cobra cada vez? → varios
// cobros, con su fecha e importe humanos") y forecast_payment_installments (offset_days interno). Igual
// que forecastInstallmentPlanForm.ts (Fase 1D-b), no añade semántica nueva — compone domain/forecast.ts.
// La UI SIEMPRE recoge fechas absolutas ("Fecha prevista: 10/06/2027"), nunca un "offset" — este módulo
// hace la conversión en los dos sentidos, con aritmética de días segura frente a cambios de horario de
// verano (Date.UTC, sin componente de hora) y meses/años que cruzan por el offset.
import type { ForecastAmountStatus, ForecastPaymentInstallment } from './forecast'
import { stepDays } from './forecast'
import { centsToEurosString, distributeTotalCentsEvenly, eurosStringToCents } from './forecastMoneyCents'

export interface ForecastSplitChargeFormRow {
  date: string // YYYY-MM-DD, fecha humana tal cual la introduce el usuario
  amountStatus: ForecastAmountStatus
  amount: string
  amountEstimatedBasis: string
}

export const SPLIT_CHARGE_COUNT_MIN = 2
// A diferencia del máximo de 60 cuotas de un plan finito (Fase 1D-b, pensado para años de plazos), un
// ciclo fraccionado es "cuántos cargos genera CADA renovación" — un número pequeño en cualquier caso
// real (nadie paga un seguro en 12 plazos por renovación). 12 es un límite explícito y razonable,
// documentado aquí por si hiciera falta revisarlo — no viene dado por la auditoría ni por el encargo.
export const SPLIT_CHARGE_COUNT_MAX = 12

export function validateSplitChargeCount(raw: string): { ok: true; count: number } | { ok: false; message: string } {
  const trimmed = raw.trim()
  const n = Number(trimmed)
  const message = `El número de cobros debe estar entre ${SPLIT_CHARGE_COUNT_MIN} y ${SPLIT_CHARGE_COUNT_MAX}.`
  if (trimmed === '' || !Number.isInteger(n) || n < SPLIT_CHARGE_COUNT_MIN || n > SPLIT_CHARGE_COUNT_MAX) return { ok: false, message }
  return { ok: true, count: n }
}

// Días de calendario entre dos fechas YYYY-MM-DD (to - from), sin componente de hora — Date.UTC no
// tiene horario de verano, así que el resultado es exacto cruzando cualquier cambio de hora, mes o año.
// Es la inversa exacta de stepDays: stepDays(from, daysBetweenDates(from, to)) === to siempre.
export function daysBetweenDates(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number)
  const [ty, tm, td] = toDateStr.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

// Formulario (fechas humanas) -> plantillas (offset_days interno). Un offset negativo (el usuario puso
// una fecha anterior al vencimiento) se recorta a 0 — la BD no admite offsets negativos en esta fase
// (ver migración 0156); es un caso de uso extremo no contemplado, no una fecha inventada: el cargo
// simplemente se ancla al mismo día que la renovación en vez de perderse.
export function buildInstallmentTemplatesFromForm(
  dueDate: string,
  charges: ForecastSplitChargeFormRow[],
): { sequenceIndex: number; offsetDays: number; amountStatus: ForecastAmountStatus; amount: number | null; amountEstimatedBasis: string | null }[] {
  return charges.map((c, i) => ({
    sequenceIndex: i + 1,
    offsetDays: Math.max(0, daysBetweenDates(dueDate, c.date)),
    amountStatus: c.amountStatus,
    amount: c.amountStatus === 'unknown' ? null : Number(c.amount) || 0,
    amountEstimatedBasis: c.amountStatus === 'estimated' ? c.amountEstimatedBasis.trim() || null : null,
  }))
}

// Ajuste UX tras certificación móvil — propuesta inicial a partir del importe TOTAL del ciclo (no ya
// "mismo importe en todos / diferentes": PEPA reparte en céntimos y el usuario corrige directamente
// cada línea si hace falta). La fecha de cada cobro no tiene un patrón natural único (a diferencia de
// un plan finito, que sigue la frecuencia elegida) — se propone la propia fecha de vencimiento para
// todos y el usuario la ajusta, igual que ya hacía el formulario antes de este cambio.
export function proposeSplitCharges(
  dueDate: string,
  count: number,
  totalStatus: ForecastAmountStatus,
  totalAmount: number | null,
  totalBasis: string | null,
): ForecastSplitChargeFormRow[] {
  if (totalStatus === 'unknown' || totalAmount == null) {
    return Array.from({ length: count }, () => ({ date: dueDate, amountStatus: 'unknown' as const, amount: '', amountEstimatedBasis: '' }))
  }
  const totalCents = eurosStringToCents(String(totalAmount)) ?? 0
  const centsPerLine = distributeTotalCentsEvenly(totalCents, count)
  return centsPerLine.map((cents) => ({
    date: dueDate,
    amountStatus: totalStatus,
    amount: centsToEurosString(cents),
    amountEstimatedBasis: totalStatus === 'estimated' ? (totalBasis ?? '') : '',
  }))
}

// Inversa — para precargar el formulario al editar un pago con cargos ya guardados. Ordena por
// sequence_index (la posición de diseño, no se recalcula) y convierte cada offset a una fecha humana.
export function parseInstallmentTemplatesToForm(dueDate: string, installments: ForecastPaymentInstallment[]): ForecastSplitChargeFormRow[] {
  return [...installments]
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
    .map((installment) => ({
      date: stepDays(dueDate, installment.offsetDays),
      amountStatus: installment.amountStatus,
      amount: installment.amount != null ? String(installment.amount) : '',
      amountEstimatedBasis: installment.amountEstimatedBasis ?? '',
    }))
}
