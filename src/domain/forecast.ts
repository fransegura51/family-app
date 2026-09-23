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

// Fase 1E.0 — infraestructura mínima de préstamos/hipotecas: información adicional OPCIONAL, relación
// 1:1, de un ForecastPayment que la familia ha clasificado como préstamo. Su sola EXISTENCIA es lo que
// marca "esto es un préstamo" — nunca un booleano aparte en ForecastPayment que pudiera desincronizarse.
// forecast_payments sigue siendo el ÚNICO generador de compromisos futuros: esto nunca participa en
// forecastTotals/forecastByMonth/expandForecastOccurrences, ni en absoluto en ningún cálculo financiero
// (capital pendiente, interés, cuadro de amortización) — solo se guarda y se muestra tal cual.
//
// Nivel 1 (aprobado explícitamente): todos los campos financieros NULL, incluido loanType, es una fila
// perfectamente válida — "sabemos que es un préstamo, no sabemos más todavía". NUNCA 0 como sustituto de
// "no lo sabemos".
export type ForecastLoanType = 'hipoteca' | 'prestamo_coche' | 'prestamo_moto' | 'prestamo_personal' | 'otro'
export type ForecastLoanInterestType = 'fijo' | 'variable' | 'mixto'

export interface ForecastLoanDetails {
  id: string
  familyId: string
  forecastPaymentId: string
  loanType: ForecastLoanType | null
  // Identificador ESTABLE observado en los cargos bancarios (p. ej. "8078183410" de "PRESTAMOS ADEUDO
  // CUOTA N.8078183410") — nunca el mismo concepto que contractReference, aunque a veces coincidan.
  bankReference: string | null
  // Referencia de contrato REAL — solo dato aportado por la familia o una fuente contractual fiable,
  // nunca copiado automáticamente desde bankReference.
  contractReference: string | null
  originalPrincipalCents: number | null
  outstandingPrincipalCents: number | null
  // Invariante (constraint en BD): outstandingPrincipalCents y principalAsOfDate son ambos null o ambos
  // no-null — un capital pendiente sin fecha de referencia es un dato que caduca en silencio.
  principalAsOfDate: string | null
  interestRateBps: number | null // 300 = 3,00 % — básicos puntos, nunca decimal flotante
  interestType: ForecastLoanInterestType | null
  maturityDate: string | null // dato contractual real — NUNCA derivado del UNTIL de recurrenceRule
  remainingInstallments: number | null
  lastVerifiedAt: string | null
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

// Fase 1E.2 — conversión UI porcentaje humano ↔ básicos puntos persistidos (interestRateBps). Nunca
// decimal flotante en BD: "3,00 %" se guarda como 300, nunca 3.00 ni 0.03. Puramente aritmética de
// unidades — no es ningún cálculo financiero (interés compuesto, TAE...), eso sigue sin implementarse.
export function parseInterestPercentToBps(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

export function formatInterestBpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2).replace('.', ',')
}

export interface ForecastOccurrenceOverride {
  id: string
  forecastPaymentId: string
  occurrenceDate: string // clave estable: el vencimiento que produce la regla PURA, nunca se sobrescribe a sí misma
  // Fase 1D-c: null = el override es del CICLO completo (comportamiento de siempre, sin fraccionar);
  // 1..N = de un cargo concreto dentro del ciclo (su sequence_index en forecast_payment_installments).
  // Necesario porque forecastPaymentId+occurrenceDate por sí solos no bastan para distinguir dos cargos
  // del mismo ciclo (podrían caer excepcionalmente el mismo día).
  installmentSequenceIndex: number | null
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
  // Fase 1D-c: null = ocurrencia del ciclo completo (sin fraccionar, comportamiento de siempre);
  // 1..N = qué cargo concreto dentro del ciclo (para mostrar "1/2", "2/2"...).
  installmentSequenceIndex: number | null
  dueDate: string
  expectedPaymentDate: string
  amountStatus: ForecastAmountStatus
  amount: number | null
  currency: string
  categoryId: string | null
  matchedExpenseId: string | null
}

// Fase 1D-c — plantilla de un cargo dentro de CADA ciclo de una obligación recurrente (p. ej. un seguro
// que se renueva una vez al año pero se cobra en 2 plazos cada renovación). Vive en
// forecast_payment_installments; NUNCA se materializa una fila por año — el motor la reaplica en cada
// ciclo. Distinto del "plan finito de N cuotas" de Fase 1D-b (eso limita CUÁNTAS renovaciones hay, con
// UNTIL; esto define CUÁNTOS cargos genera CADA renovación, con una plantilla fija por ciclo).
export interface ForecastPaymentInstallment {
  id: string
  forecastPaymentId: string
  sequenceIndex: number // 1-based — "1/2", "2/2"...
  offsetDays: number // días desde el due_date del ciclo hasta este cargo — nunca negativo en esta fase
  amountStatus: ForecastAmountStatus
  amount: number | null
  amountEstimatedBasis: string | null
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

export function stepDays(anchorDateStr: string, totalDays: number): string {
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

export function parseForecastRecurrenceRule(rule: string): ParsedForecastRule | null {
  const parts = Object.fromEntries(rule.split(';').map((p) => p.split('=') as [string, string]))
  const freq = parts.FREQ
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
  const interval = Number(parts.INTERVAL)
  return { freq, interval: Number.isFinite(interval) && interval > 1 ? interval : 1, until: parts.UNTIL ?? null }
}

// Ocurrencia número `cycleN` (0-indexado) de una serie anclada en `anchorDateStr` con la regla dada.
// MONTHLY/YEARLY usan el recorte de stepMonthsClamped; DAILY/WEEKLY son aritmética de días exacta, sin
// ninguna ambigüedad de calendario (nunca hace falta recortar). Exportada para Fase 1D-a (planes de
// cuotas finitos): es la misma pieza que ya usa expandForecastOccurrences, sin duplicar la aritmética.
export function occurrenceForCycle(anchorDateStr: string, rule: ParsedForecastRule, cycleN: number): string {
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

// Clave de búsqueda de overrides: el ciclo (occurrenceDate) + qué cargo concreto (null = el ciclo
// completo, sin fraccionar). Misma normalización null↔0 que la constraint de forecast_occurrences.
function overrideKey(occurrenceDate: string, installmentSequenceIndex: number | null): string {
  return `${occurrenceDate}:${installmentSequenceIndex ?? 0}`
}

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
    installmentSequenceIndex: null,
    dueDate: override?.dueDateOverride ?? ruleDue,
    expectedPaymentDate: override?.expectedPaymentDateOverride ?? rulePayment,
    amountStatus: hasAmountOverride ? override!.amountStatus! : payment.amountStatus,
    amount: hasAmountOverride ? override!.amount : payment.amount,
    currency: payment.currency,
    categoryId: payment.categoryId,
    matchedExpenseId: override?.matchedExpenseId ?? null,
  }
}

// Fase 1D-c: un cargo concreto dentro de un ciclo fraccionado. `cycleDueDate` es la clave ESTABLE del
// ciclo (la renovación); `chargeDate` es due_date_del_ciclo + offset_days de la plantilla. Un cargo no
// tiene distinción propia vencimiento/pago-esperado (esa distinción vive a nivel de la OBLIGACIÓN, no
// del cargo individual): antes de cualquier override, dueDate === expectedPaymentDate === chargeDate.
function resolveInstallmentOccurrence(
  payment: Pick<ForecastPayment, 'id' | 'title' | 'currency' | 'categoryId'>,
  installment: ForecastPaymentInstallment,
  cycleDueDate: string,
  chargeDate: string,
  override: ForecastOccurrenceOverride | undefined,
): ForecastOccurrence | null {
  if (override?.skipped) return null
  const hasAmountOverride = !!override?.amountStatus
  return {
    forecastPaymentId: payment.id,
    title: payment.title,
    occurrenceDate: cycleDueDate,
    installmentSequenceIndex: installment.sequenceIndex,
    dueDate: override?.dueDateOverride ?? chargeDate,
    expectedPaymentDate: override?.expectedPaymentDateOverride ?? chargeDate,
    amountStatus: hasAmountOverride ? override!.amountStatus! : installment.amountStatus,
    amount: hasAmountOverride ? override!.amount : installment.amount,
    currency: payment.currency,
    categoryId: payment.categoryId,
    matchedExpenseId: override?.matchedExpenseId ?? null,
  }
}

// Expande un forecast_payment en sus ocurrencias dentro de [rangeStart, rangeEnd] (YYYY-MM-DD, ambos
// incluidos), aplicando overrides y respetando `skipped` — mismo espíritu que expandOccurrences de
// domain/calendar.ts, pero con motor propio (ver cabecera del archivo) y con due_date/expected_payment_date
// como dos anclas independientes emparejadas por número de ciclo, nunca por posición de array.
//
// Fase 1D-c: `installments` (opcional, [] por defecto) — si el pago tiene plantilla de cargos por
// ciclo, CADA ciclo genera una ForecastOccurrence por cargo en vez de una sola. Sin plantilla
// (comportamiento de todos los pagos existentes, incluido Seguro Coche Ibiza): idéntico a antes, byte
// a byte — el parámetro nuevo nunca cambia nada si se omite u omite vacío.
export function expandForecastOccurrences(
  payment: Pick<
    ForecastPayment,
    'id' | 'title' | 'dueDate' | 'expectedPaymentDate' | 'recurrenceRule' | 'amountStatus' | 'amount' | 'currency' | 'categoryId' | 'active'
  >,
  overrides: ForecastOccurrenceOverride[],
  rangeStart: string,
  rangeEnd: string,
  installments: ForecastPaymentInstallment[] = [],
): ForecastOccurrence[] {
  if (!payment.active) return []
  const overrideByKey = new Map(overrides.map((o) => [overrideKey(o.occurrenceDate, o.installmentSequenceIndex), o]))
  const sortedInstallments = installments.length > 0 ? [...installments].sort((a, b) => a.sequenceIndex - b.sequenceIndex) : []
  // offset_days nunca es negativo (constraint de BD): el cargo más tardío de un ciclo marca cuánto hay
  // que "mirar hacia atrás" desde rangeStart para no perder un ciclo cuya renovación ya pasó pero cuyo
  // último cargo todavía cae dentro del horizonte pedido (p. ej. renovación 08/06, hoy 20/06, horizonte
  // 30 días: el cargo 2/2 de 10/07 sigue siendo "próximo" aunque la renovación ya no lo sea).
  const maxOffsetDays = sortedInstallments.reduce((max, i) => Math.max(max, i.offsetDays), 0)
  const results: ForecastOccurrence[] = []

  function pushCycle(cycleDueDate: string, cycleExpectedPayment: string) {
    if (sortedInstallments.length === 0) {
      if (cycleDueDate < rangeStart || cycleDueDate > rangeEnd) return
      const resolved = resolveOccurrence(payment, cycleDueDate, cycleDueDate, cycleExpectedPayment, overrideByKey.get(overrideKey(cycleDueDate, null)))
      if (resolved) results.push(resolved)
      return
    }
    for (const installment of sortedInstallments) {
      const chargeDate = stepDays(cycleDueDate, installment.offsetDays)
      if (chargeDate < rangeStart || chargeDate > rangeEnd) continue
      const override = overrideByKey.get(overrideKey(cycleDueDate, installment.sequenceIndex))
      const resolved = resolveInstallmentOccurrence(payment, installment, cycleDueDate, chargeDate, override)
      if (resolved) results.push(resolved)
    }
  }

  if (!payment.recurrenceRule) {
    pushCycle(payment.dueDate, payment.expectedPaymentDate ?? payment.dueDate)
    return results
  }

  const rule = parseForecastRecurrenceRule(payment.recurrenceRule)
  if (!rule) return results
  const paymentAnchor = payment.expectedPaymentDate ?? payment.dueDate
  const earliestCycleDueToConsider = maxOffsetDays > 0 ? stepDays(rangeStart, -maxOffsetDays) : rangeStart

  for (let n = 0; n < MAX_CYCLES_GUARD; n++) {
    const due = occurrenceForCycle(payment.dueDate, rule, n)
    if (rule.until && due > rule.until) break
    if (due > rangeEnd) break
    if (due >= earliestCycleDueToConsider) {
      const expectedPayment = occurrenceForCycle(paymentAnchor, rule, n)
      pushCycle(due, expectedPayment)
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
  installments: ForecastPaymentInstallment[] = [],
): ForecastOccurrence | null {
  const rangeEnd = stepMonthsClamped(today, 120) // 10 años hacia delante: cubre cualquier UNTIL razonable o pago indefinido
  const occurrences = expandForecastOccurrences(payment, overrides, today, rangeEnd, installments)
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

// Fase 1D-f — "Próximos X días"/"Visión 12 meses" representan dinero TODAVÍA PENDIENTE de pagar: una
// ocurrencia ya conciliada (matched_expense_id, Fase 1D-e) es dinero que YA SALIÓ, así que nunca debe
// seguir sumando aquí — mismo criterio que remainingInstallments/remainingPlanAmount, que ya excluían las
// conciliadas desde que existe esa columna. Desconciliar (data/forecast.ts: unmatchForecastOccurrence)
// vuelve a dejar matchedExpenseId en null, así que la ocurrencia vuelve a sumar aquí automáticamente en
// el siguiente render — sin ningún estado adicional que sincronizar a mano.
export function forecastTotals(occurrences: ForecastOccurrence[]): ForecastTotals {
  const byCurrency = new Map<string, ForecastCurrencyTotals>()
  for (const o of occurrences) {
    if (o.matchedExpenseId) continue
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
// mes" son dos vistas legítimas y distintas, por eso es parametrizable en vez de fijo. Hereda de
// forecastTotals la exclusión de ocurrencias ya conciliadas (Fase 1D-f) sin duplicar el filtro aquí.
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

// ── Fase 1C — opciones de recurrencia amigables para el formulario (nunca se pide al usuario escribir
// RRULE a mano). "custom" cubre exactamente lo que el motor soporta: frecuencia + intervalo + fin
// opcional — nada más. ──

export type ForecastRecurrenceOption = 'none' | 'monthly' | 'every_3_months' | 'every_6_months' | 'yearly' | 'custom'

export interface ForecastCustomRecurrence {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  until: string | null // YYYY-MM-DD, opcional
}

const RECURRENCE_OPTION_RULES: Record<Exclude<ForecastRecurrenceOption, 'none' | 'custom'>, string> = {
  monthly: 'FREQ=MONTHLY',
  every_3_months: 'FREQ=MONTHLY;INTERVAL=3',
  every_6_months: 'FREQ=MONTHLY;INTERVAL=6',
  yearly: 'FREQ=YEARLY',
}

export function buildForecastRecurrenceRule(option: ForecastRecurrenceOption, custom: ForecastCustomRecurrence | null): string | null {
  if (option === 'none') return null
  if (option !== 'custom') return RECURRENCE_OPTION_RULES[option]
  if (!custom) return null
  const parts = [`FREQ=${custom.freq}`]
  if (custom.interval > 1) parts.push(`INTERVAL=${custom.interval}`)
  if (custom.until) parts.push(`UNTIL=${custom.until}`)
  return parts.join(';')
}

// Inversa de buildForecastRecurrenceRule, para precargar el formulario al editar un pago existente.
// Cualquier regla que no coincida exactamente con una de las 4 predefinidas (otro INTERVAL, un UNTIL,
// WEEKLY/DAILY) se trata como "custom" — nunca se pierde ni se aproxima a la predefinida más cercana.
export function parseForecastRecurrenceOption(rule: string | null): { option: ForecastRecurrenceOption; custom: ForecastCustomRecurrence | null } {
  if (!rule) return { option: 'none', custom: null }
  const predefined = (Object.entries(RECURRENCE_OPTION_RULES) as [Exclude<ForecastRecurrenceOption, 'none' | 'custom'>, string][]).find(([, r]) => r === rule)
  if (predefined) return { option: predefined[0], custom: null }
  const parsed = parseForecastRecurrenceRule(rule)
  if (!parsed) return { option: 'none', custom: null } // regla no reconocida por el motor — mismo criterio que el resto del dominio, nunca se inventa
  return { option: 'custom', custom: { freq: parsed.freq, interval: parsed.interval, until: parsed.until } }
}

// ── Fase 1C — "¿queda alguna ocurrencia futura?" — un pago activo sin ninguna ocurrencia a partir de
// hoy (serie recurrente que superó su UNTIL, o un pago puntual cuyo único vencimiento ya pasó) se
// considera Finalizado: la última proyección real queda como historial, pero no debe seguir pareciendo
// "el próximo vencimiento" en Calendario ni en la lista de próximos pagos. ──
export function isForecastPaymentFinished(
  payment: Parameters<typeof expandForecastOccurrences>[0],
  overrides: ForecastOccurrenceOverride[],
  today: string,
  installments: ForecastPaymentInstallment[] = [],
): boolean {
  if (!payment.active) return false
  // Fase 1D-c: con cargos fraccionados, "queda algo futuro" tiene que mirar cada CARGO, no solo el
  // ciclo — si no, un plan finito (UNTIL) cuyo último ciclo aún tiene un cargo pendiente (p. ej. el
  // cargo 2/2 de julio de una renovación que venció en junio) se marcaría "Finalizada" antes de tiempo.
  return nextForecastOccurrence(payment, overrides, today, 'dueDate', installments) === null
}

// ── Fase 1C — formato de importe consciente de divisa (formatEuros de domain/financeCompute.ts es
// EUR-only; Previsión admite multidivisa desde el diseño de Fase 1A, ver forecastTotals). ──
export function formatForecastAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount)
  } catch {
    // Código de divisa no reconocido por Intl (no debería pasar con datos reales) — degrada con
    // gracia en vez de reventar la pantalla.
    return `${amount.toFixed(2)} ${currency}`
  }
}

// ── Fase 1D-a — planes de cuotas FINITOS, con el modelo actual (recurrence_rule con UNTIL,
// forecast_occurrences para las excepciones puntuales). NO es una entidad nueva: un plan de N cuotas es
// sencillamente una serie recurrente cuyo UNTIL se calcula a partir del número de cuotas en vez de
// dejarse como fecha libre — así nunca se representa un plan finito con una recurrencia sin fin (ver
// requisito 1 de la auditoría). No cubre el caso de una obligación que se renueva y cada renovación
// genera varios cargos (Fase 1D-c, "seguro a plazos" — fuera de alcance aquí).
//
// "importe total del plan", "fecha de primera cuota", "fecha de última cuota" y "próxima cuota" NO
// necesitan función nueva — ya son composición directa de piezas existentes:
//   - primera cuota  → payment.dueDate
//   - última cuota   → parseForecastRecurrenceRule(payment.recurrenceRule).until
//   - importe total  → forecastTotals(expandForecastOccurrences(payment, overrides, payment.dueDate, until))
//   - próxima cuota  → nextForecastOccurrence(payment, overrides, today, 'dueDate')  (ya existía en Fase 1B)

// UNTIL determinista a partir de la primera cuota + frecuencia + número de cuotas — nunca se pide al
// usuario (ni se deja) como fecha libre para un plan finito. La cuota `installmentCount` (1-indexada) es
// el mismo cálculo que ya usa el motor para cualquier ciclo — mismo recorte de fin de mes/29 de febrero,
// sin caso especial nuevo.
export function computeInstallmentPlanUntil(
  firstDate: string,
  freq: ForecastCustomRecurrence['freq'],
  interval: number,
  installmentCount: number,
): string {
  if (!Number.isInteger(installmentCount) || installmentCount < 1) {
    throw new Error('installmentCount debe ser un entero >= 1')
  }
  return occurrenceForCycle(firstDate, { freq, interval: Math.max(1, interval), until: null }, installmentCount - 1)
}

// Número total de cuotas de la serie:
//  - pago puntual (sin recurrence_rule) → 1 (él mismo es su única "cuota")
//  - serie SIN UNTIL (indefinida)       → null: una recurrencia sin fin no tiene un "total", y devolver
//                                          un número aquí sería justo el hack que se quiere evitar
//  - serie CON UNTIL (plan finito)      → número de ciclos desde due_date hasta UNTIL, ambos incluidos
//
// Deliberadamente NO tiene en cuenta `skipped`: la numeración "3/6" de un plan no se recalcula porque
// una cuota se haya omitido — sigue siendo la cuota 3 de un plan de 6, solo que esa vez no se cobra.
export function totalInstallments(payment: Pick<ForecastPayment, 'dueDate' | 'recurrenceRule'>): number | null {
  if (!payment.recurrenceRule) return 1
  const rule = parseForecastRecurrenceRule(payment.recurrenceRule)
  if (!rule || !rule.until) return null
  let count = 0
  for (let n = 0; n < MAX_CYCLES_GUARD; n++) {
    if (occurrenceForCycle(payment.dueDate, rule, n) > rule.until) break
    count++
  }
  return count
}

// Posición (1-indexada) de una ocurrencia concreta dentro de la serie — `occurrenceDate` es SIEMPRE la
// clave estable (la fecha que produce la regla pura, la misma que usa forecast_occurrences.occurrence_date),
// nunca la fecha ya sobrescrita por un override — así "3/6" no cambia si esa cuota tiene la fecha movida.
// No depende de UNTIL: funciona igual para una serie indefinida (sirve para "esta es la cuota número N",
// no solo para planes finitos).
export function installmentIndexForOccurrence(payment: Pick<ForecastPayment, 'dueDate' | 'recurrenceRule'>, occurrenceDate: string): number | null {
  if (!payment.recurrenceRule) return occurrenceDate === payment.dueDate ? 1 : null
  const rule = parseForecastRecurrenceRule(payment.recurrenceRule)
  if (!rule) return null
  for (let n = 0; n < MAX_CYCLES_GUARD; n++) {
    const due = occurrenceForCycle(payment.dueDate, rule, n)
    // Más allá de UNTIL (si el plan es finito) no es una cuota real de la serie — nunca se numera "7/6".
    if (rule.until && due > rule.until) return null
    if (due === occurrenceDate) return n + 1
    if (due > occurrenceDate) return null // nos hemos pasado sin encontrarla: no pertenece a esta serie
  }
  return null
}

// Cuotas "restantes" de un plan finito: las que vencen desde `today` (inclusive) hasta UNTIL, sin contar
// las omitidas (skipped, ya excluidas por expandForecastOccurrences) ni las ya conciliadas
// (matched_expense_id no nulo en su fila de forecast_occurrences, evidencia real — nunca inventada).
//
// null cuando la serie no tiene UNTIL (indefinida): "restantes" no está definido para algo sin fin.
//
// LIMITACIÓN DOCUMENTADA (requisito 7/8 de la auditoría): esto es un recuento por FECHA, no por estado
// de pago. Una cuota con fecha ya pasada que NO tiene matched_expense_id no se excluye de este cálculo
// simplemente por haber pasado su fecha — esta función no la cuenta como "restante" tampoco, porque solo
// mira fechas desde `today` en adelante; no afirma ni niega si esa cuota pasada está pagada. Distinguir
// "pendiente" de "pagada sin conciliar todavía" para cuotas ya vencidas queda fuera de esta fase (Fase
// 1D-e, conciliación bancaria) — aquí solo se responde con datos verificables, nunca se infiere.
export function remainingInstallments(
  payment: Parameters<typeof expandForecastOccurrences>[0],
  overrides: ForecastOccurrenceOverride[],
  today: string,
): number | null {
  if (!payment.recurrenceRule) return null
  const rule = parseForecastRecurrenceRule(payment.recurrenceRule)
  if (!rule || !rule.until) return null
  const occurrences = expandForecastOccurrences(payment, overrides, today, rule.until)
  return occurrences.filter((o) => !o.matchedExpenseId).length
}

// Importe pendiente de un plan finito — mismo conjunto que remainingInstallments (desde `today`, sin
// omitidas ni conciliadas), agregado con forecastTotals: nunca suma unknown como 0, nunca mezcla
// divisas — hereda esas garantías tal cual, sin repetir la lógica.
export function remainingPlanAmount(
  payment: Parameters<typeof expandForecastOccurrences>[0],
  overrides: ForecastOccurrenceOverride[],
  today: string,
): ForecastTotals | null {
  if (!payment.recurrenceRule) return null
  const rule = parseForecastRecurrenceRule(payment.recurrenceRule)
  if (!rule || !rule.until) return null
  const occurrences = expandForecastOccurrences(payment, overrides, today, rule.until).filter((o) => !o.matchedExpenseId)
  return forecastTotals(occurrences)
}
