// Previsión de pagos (Economía) — dominio puro: recurrencia financiera, resolución de ocurrencias y
// totales. Fase 1A/1A.1/1A.2 (diseño, aprobado) → Fase 1B (esta implementación).
//
// A propósito NO importa nada de domain/calendar.ts: expandOccurrences tiene un desbordamiento
// verificado (no corregido aquí, fuera de alcance) para FREQ=MONTHLY en día 29/30/31 — un ancla del día
// 31 de enero termina desplazada permanentemente al día 3 de marzo en adelante, en vez de volver al 31
// en los meses que sí tienen 31 días. Previsión necesita semántica financiera correcta (recorte al
// último día válido del mes de destino, recalculado SIEMPRE desde el ancla original, nunca desde la
// ocurrencia anterior), así que tiene su propio motor, autocontenido, para MONTHLY/YEARLY. DAILY/WEEKLY
// son aritmética de días pura (sin riesgo de desbordamiento) y se calculan aquí mismo, sin depender de
// ningún otro módulo.

export type ForecastAmountStatus = 'known' | 'estimated' | 'unknown'
export type ForecastReminderUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months'

export interface ForecastPayment {
  id: string
  familyId: string
  title: string
  categoryId: string | null
  provider: string | null
  notes: string | null
  amountStatus: ForecastAmountStatus
  amount: number | null // invariante: null ⟺ amountStatus === 'unknown'
  amountEstimatedBasis: string | null // invariante: no-null cuando amountStatus === 'estimated'
  currency: string
  dueDate: string // YYYY-MM-DD — vencimiento/renovación, obligatoria
  expectedPaymentDate: string | null // cargo esperado — independiente, null = coincide con dueDate
  recurrenceRule: string | null // mismo formato de texto que CalendarEvent.recurrenceRule; null = puntual
  bankAccountId: string | null
  ownerMemberId: string | null // contexto ("es de Paco"), NUNCA controla privacidad
  showInCalendar: boolean
  calendarEventId: string | null // proyección puramente visual, nunca lleva avisos
  active: boolean
}

export interface ForecastReminder {
  id: string
  forecastPaymentId: string
  value: number
  unit: ForecastReminderUnit
}

export interface ForecastOccurrenceOverride {
  id: string
  forecastPaymentId: string
  occurrenceDate: string // clave estable: el vencimiento que produce la regla PURA, nunca se sobrescribe a sí misma
  dueDateOverride: string | null
  expectedPaymentDateOverride: string | null
  amountStatus: ForecastAmountStatus | null // null = hereda del padre
  amount: number | null
  amountEstimatedBasis: string | null
  skipped: boolean
  matchedExpenseId: string | null
}

// Una ocurrencia ya resuelta (regla + override si existe) — lo que consume la UI/PEPA.
export interface ForecastOccurrence {
  forecastPaymentId: string
  title: string
  occurrenceDate: string
  dueDate: string
  expectedPaymentDate: string
  amountStatus: ForecastAmountStatus
  amount: number | null
  currency: string
  categoryId: string | null
  matchedExpenseId: string | null
}

// ── Aritmética de fechas (hora local, mismo criterio que domain/calendar.ts) ──

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate()
}

function parseDateStr(dateStr: string): { year: number; monthIndex0: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number)
  return { year: y, monthIndex0: m - 1, day: d }
}

function formatDateStr(year: number, monthIndex0: number, day: number): string {
  const d = new Date(year, monthIndex0, day)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Recorte a fin de mes: si el mes de destino no tiene el día original (29/30/31), usa su último día
// real — nunca se desborda al mes siguiente. Se recalcula SIEMPRE desde `anchorDateStr` (la intención
// original), nunca desde un resultado anterior: por eso 29/02 vuelve a ser 29/02 el siguiente año
// bisiesto en vez de quedarse anclado en 28/02 para siempre.
export function stepMonthsClamped(anchorDateStr: string, totalMonthsToAdd: number): string {
  const anchor = parseDateStr(anchorDateStr)
  const targetMonthAbs = anchor.year * 12 + anchor.monthIndex0 + totalMonthsToAdd
  const targetYear = Math.floor(targetMonthAbs / 12)
  const targetMonthIndex0 = ((targetMonthAbs % 12) + 12) % 12
  const targetDay = Math.min(anchor.day, daysInMonth(targetYear, targetMonthIndex0))
  return formatDateStr(targetYear, targetMonthIndex0, targetDay)
}

function stepDays(anchorDateStr: string, totalDays: number): string {
  const a = parseDateStr(anchorDateStr)
  const d = new Date(a.year, a.monthIndex0, a.day + totalDays)
  return formatDateStr(d.getFullYear(), d.getMonth(), d.getDate())
}

// ── Recurrencia financiera ──

interface ParsedForecastRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  until: string | null
}

function parseForecastRecurrenceRule(rule: string): ParsedForecastRule | null {
  const parts = Object.fromEntries(rule.split(';').map((p) => p.split('=') as [string, string]))
  const freq = parts.FREQ
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
  const interval = Number(parts.INTERVAL)
  return { freq, interval: Number.isFinite(interval) && interval > 1 ? interval : 1, until: parts.UNTIL ?? null }
}

// Ocurrencia número `cycleN` (0-indexado) de una serie anclada en `anchorDateStr` con la regla dada.
// MONTHLY/YEARLY usan el recorte de stepMonthsClamped; DAILY/WEEKLY son aritmética de días exacta, sin
// ninguna ambigüedad de calendario (nunca hace falta recortar).
function occurrenceForCycle(anchorDateStr: string, rule: ParsedForecastRule, cycleN: number): string {
  switch (rule.freq) {
    case 'DAILY':
      return stepDays(anchorDateStr, rule.interval * cycleN)
    case 'WEEKLY':
      return stepDays(anchorDateStr, 7 * rule.interval * cycleN)
    case 'MONTHLY':
      return stepMonthsClamped(anchorDateStr, rule.interval * cycleN)
    case 'YEARLY':
      return stepMonthsClamped(anchorDateStr, 12 * rule.interval * cycleN)
  }
}

const MAX_CYCLES_GUARD = 5000

function resolveOccurrence(
  payment: Pick<ForecastPayment, 'id' | 'title' | 'amountStatus' | 'amount' | 'currency' | 'categoryId'>,
  occurrenceDate: string,
  ruleDue: string,
  rulePayment: string,
  override: ForecastOccurrenceOverride | undefined,
): ForecastOccurrence | null {
  if (override?.skipped) return null
  const hasAmountOverride = !!override?.amountStatus
  return {
    forecastPaymentId: payment.id,
    title: payment.title,
    occurrenceDate,
    dueDate: override?.dueDateOverride ?? ruleDue,
    expectedPaymentDate: override?.expectedPaymentDateOverride ?? rulePayment,
    amountStatus: hasAmountOverride ? override!.amountStatus! : payment.amountStatus,
    amount: hasAmountOverride ? override!.amount : payment.amount,
    currency: payment.currency,
    categoryId: payment.categoryId,
    matchedExpenseId: override?.matchedExpenseId ?? null,
  }
}

// Expande un forecast_payment en sus ocurrencias dentro de [rangeStart, rangeEnd] (YYYY-MM-DD, ambos
// incluidos), aplicando overrides y respetando `skipped` — mismo espíritu que expandOccurrences de
// domain/calendar.ts, pero con motor propio (ver cabecera del archivo) y con due_date/expected_payment_date
// como dos anclas independientes emparejadas por número de ciclo, nunca por posición de array.
export function expandForecastOccurrences(
  payment: Pick<
    ForecastPayment,
    'id' | 'title' | 'dueDate' | 'expectedPaymentDate' | 'recurrenceRule' | 'amountStatus' | 'amount' | 'currency' | 'categoryId' | 'active'
  >,
  overrides: ForecastOccurrenceOverride[],
  rangeStart: string,
  rangeEnd: string,
): ForecastOccurrence[] {
  if (!payment.active) return []
  const overrideByDate = new Map(overrides.map((o) => [o.occurrenceDate, o]))
  const results: ForecastOccurrence[] = []

  if (!payment.recurrenceRule) {
    if (payment.dueDate >= rangeStart && payment.dueDate <= rangeEnd) {
      const resolved = resolveOccurrence(payment, payment.dueDate, payment.dueDate, payment.expectedPaymentDate ?? payment.dueDate, overrideByDate.get(payment.dueDate))
      if (resolved) results.push(resolved)
    }
    return results
  }

  const rule = parseForecastRecurrenceRule(payment.recurrenceRule)
  if (!rule) return results
  const paymentAnchor = payment.expectedPaymentDate ?? payment.dueDate

  for (let n = 0; n < MAX_CYCLES_GUARD; n++) {
    const due = occurrenceForCycle(payment.dueDate, rule, n)
    if (rule.until && due > rule.until) break
    if (due > rangeEnd) break
    if (due >= rangeStart) {
      const expectedPayment = occurrenceForCycle(paymentAnchor, rule, n)
      const resolved = resolveOccurrence(payment, due, due, expectedPayment, overrideByDate.get(due))
      if (resolved) results.push(resolved)
    }
  }
  return results
}

// Ocurrencia siguiente a `today` (inclusive), según `dateField` (vencimiento o pago esperado).
export function nextForecastOccurrence(
  payment: Parameters<typeof expandForecastOccurrences>[0],
  overrides: ForecastOccurrenceOverride[],
  today: string,
  dateField: 'dueDate' | 'expectedPaymentDate' = 'dueDate',
): ForecastOccurrence | null {
  const rangeEnd = stepMonthsClamped(today, 120) // 10 años hacia delante: cubre cualquier UNTIL razonable o pago indefinido
  const occurrences = expandForecastOccurrences(payment, overrides, today, rangeEnd)
  const sorted = [...occurrences].sort((a, b) => a[dateField].localeCompare(b[dateField]))
  return sorted[0] ?? null
}

// ── Recordatorios: mes natural (recorte a fin de mes) para 'months'; duración fija para el resto.
// due_date no lleva hora de reloj, así que minutes/hours se redondean a días completos (hacia arriba) —
// es una simplificación explícita, no una fecha inventada: el resultado sigue siendo un día concreto. ──

const MINUTES_PER_DAY = 24 * 60

export function computeForecastReminderDate(dueDate: string, reminder: Pick<ForecastReminder, 'value' | 'unit'>): string {
  if (reminder.unit === 'months') return stepMonthsClamped(dueDate, -reminder.value)
  const days =
    reminder.unit === 'weeks'
      ? reminder.value * 7
      : reminder.unit === 'days'
        ? reminder.value
        : reminder.unit === 'hours'
          ? Math.ceil(reminder.value / 24)
          : Math.ceil(reminder.value / MINUTES_PER_DAY)
  return stepDays(dueDate, -days)
}

// ── Totales — nunca se suman divisas distintas, 'unknown' nunca cuenta como 0 ──

export interface ForecastCurrencyTotals {
  currency: string
  knownTotal: number
  estimatedTotal: number
  unknownCount: number
  // A propósito NO se llama "total": es la suma de lo que sí tiene cifra en ESA divisa.
  knownPlusEstimatedTotal: number
}

// Array, nunca un objeto único — estructuralmente imposible sumar divisas distintas por error.
export type ForecastTotals = ForecastCurrencyTotals[]

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function forecastTotals(occurrences: ForecastOccurrence[]): ForecastTotals {
  const byCurrency = new Map<string, ForecastCurrencyTotals>()
  for (const o of occurrences) {
    const t = byCurrency.get(o.currency) ?? { currency: o.currency, knownTotal: 0, estimatedTotal: 0, unknownCount: 0, knownPlusEstimatedTotal: 0 }
    if (o.amountStatus === 'known') t.knownTotal = round2(t.knownTotal + (o.amount ?? 0))
    else if (o.amountStatus === 'estimated') t.estimatedTotal = round2(t.estimatedTotal + (o.amount ?? 0))
    else t.unknownCount += 1
    t.knownPlusEstimatedTotal = round2(t.knownTotal + t.estimatedTotal)
    byCurrency.set(o.currency, t)
  }
  return [...byCurrency.values()]
}

// Agrupa por mes (clave "YYYY-MM") según `dateField` — "qué vence este mes" y "qué vamos a pagar este
// mes" son dos vistas legítimas y distintas, por eso es parametrizable en vez de fijo.
export function forecastByMonth(occurrences: ForecastOccurrence[], dateField: 'dueDate' | 'expectedPaymentDate' = 'expectedPaymentDate'): Map<string, ForecastTotals> {
  const byMonth = new Map<string, ForecastOccurrence[]>()
  for (const o of occurrences) {
    const key = o[dateField].slice(0, 7)
    const list = byMonth.get(key) ?? []
    list.push(o)
    byMonth.set(key, list)
  }
  const result = new Map<string, ForecastTotals>()
  for (const [key, list] of byMonth) result.set(key, forecastTotals(list))
  return result
}
