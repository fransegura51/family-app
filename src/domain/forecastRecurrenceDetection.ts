// Previsión de pagos — Fase 1D-g: detección DETERMINISTA de posibles pagos recurrentes a partir del
// histórico bancario real. Motor PURO: nunca lee bank_transactions/expenses/forecast_payments
// directamente (eso es cosa de la capa de datos), nunca decide ni crea nada — solo propone candidatos
// explicables. Ni IA ni aprendizaje automático en ningún punto: todo es agrupación, aritmética de fechas
// y comparación de intervalos, código determinista de principio a fin (auditoría previa a esta fase).
//
// Principio del encargo: BANCO → DETECCIÓN → PROPUESTA → REVISIÓN → CONFIRMACIÓN → PREVISIÓN. Nunca
// "banco → previsión automática" — este módulo termina siempre en una PROPUESTA, nunca en una escritura.
import { eurosNumberToCents } from './forecastMoneyCents'
import { daysBetweenDates } from './forecastInstallmentSplitForm'
import { hasSharedWord } from './forecastReconciliation'
import { stepMonthsClamped } from './forecast'

// Un movimiento bancario real, reducido a lo que hace falta para detectar el patrón — igual criterio que
// BankMovementForMatching (Fase 1D-e): el motor se puede probar con datos de mentira sin tocar Supabase.
export interface BankMovementForDetection {
  bankTransactionId: string
  expenseId: string | null
  accountId: string
  date: string // YYYY-MM-DD
  amount: number // valor absoluto, en la unidad de currency
  currency: string
  description: string | null
  isIncome: boolean // credit_debit === 'CRDT'
  // La categoría REAL ya guardada en el expense vinculado a este movimiento (si existe) — nunca se
  // recalcula aquí con guessCategory (eso viviría solo en el Edge Function; auditoría previa a esta
  // fase: no duplicarlo). null si el movimiento no tiene expense todavía, o el expense no tiene categoría.
  category: string | null
}

// ── Periodicidades — constantes documentadas, nunca números sueltos dispersos por el código ──────────
//
// Con ~3,5 meses de histórico real (auditoría previa a esta fase) SOLO "mensual" tiene evidencia
// observable hoy: bimestral necesita al menos 2 ciclos completos (~4 meses) para ver una sola repetición,
// y el resto necesita aún más. El motor queda preparado para las 6 — nunca hay que "fingir" evidencia que
// no existe: si una familia no tiene histórico suficiente, esa periodicidad simplemente no encuentra
// ningún grupo con intervalos consistentes, no se fuerza ni se aproxima.
//
// "Semanal" queda FUERA a propósito (decisión aprobada): ningún ejemplo real del encargo es semanal, y el
// riesgo de confundirlo con compras frecuentes (Mercadona, Amazon...) es alto — mejor no proponerlo que
// llenar la pantalla de ruido.
//
// monthStep: para reutilizar stepMonthsClamped (el MISMO motor de fechas ya certificado del resto de
// Previsión) al calcular la próxima fecha — nunca una segunda aritmética de fechas en paralelo.
export type RecurrencePeriodicity = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'

export interface PeriodicityDefinition {
  key: RecurrencePeriodicity
  label: string
  targetDays: number
  toleranceDays: number
  monthStep: number
}

export const RECURRENCE_PERIODICITIES: readonly PeriodicityDefinition[] = [
  { key: 'monthly', label: 'mensual', targetDays: 30, toleranceDays: 7, monthStep: 1 },
  { key: 'bimonthly', label: 'bimestral', targetDays: 60, toleranceDays: 10, monthStep: 2 },
  { key: 'quarterly', label: 'trimestral', targetDays: 90, toleranceDays: 12, monthStep: 3 },
  { key: 'semiannual', label: 'semestral', targetDays: 182, toleranceDays: 15, monthStep: 6 },
  { key: 'annual', label: 'anual', targetDays: 365, toleranceDays: 20, monthStep: 12 },
]

// Las ventanas de tolerancia NUNCA se solapan entre sí (mensual 23-37, bimestral 50-70, trimestral 78-102,
// semestral 167-197, anual 345-385) — un mismo intervalo real solo puede encajar en UNA periodicidad,
// nunca hay ambigüedad entre "¿es mensual o bimestral?" para el mismo dato.

// Mínimo de evidencia antes de proponer NADA — decisión aprobada explícitamente, no cambiar sin
// justificar el motivo (el encargo pide parar y preguntar antes de tocar este número).
export const RECURRENCE_MIN_OCCURRENCES = 3

// ── Agrupación por comercio ─────────────────────────────────────────────────────────────────────────
//
// Clave de agrupación deliberadamente CONSERVADORA (recorta espacios, mayúsculas) — nunca quita prefijos
// ni números de tarjeta como haría cleanMerchantName (Edge Function, Deno-only, no importable aquí; no
// se duplica). Los datos reales confirman que esto basta para la inmensa mayoría de comercios: la misma
// cadena exacta mes a mes (ENDESA ENERGIA S.A., ORANGE ESPAGNE SAU, COMPRA TARJ. ...ANTHROPIC*...). Una
// normalización más agresiva podría fusionar comercios distintos (prohibido explícitamente) — se prefiere
// agrupar de menos que agrupar de más.
//
// Fase 1D-g.2 — auditoría de dos préstamos reales (bank_transactions.description =
// "PRESTAMOS ADEUDO CUOTA N.8078183410 30/06/26", "...31/07/26", "...31/08/26"): el banco añade la
// FECHA del cargo al final del texto, así que cada mensualidad producía una clave distinta y nunca
// llegaba a RECURRENCE_MIN_OCCURRENCES. Único recorte añadido: un sufijo de fecha "DD/MM/YY" o
// "DD/MM/YYYY" INEQUÍVOCO al final de la cadena (día 1-31, mes 1-12 — si no es una fecha real, no se
// toca nada). El identificador del préstamo (N.8078183410) queda siempre dentro de la clave, así que
// dos préstamos distintos nunca se fusionan por compartir "PRESTAMOS ADEUDO CUOTA". Nunca se toca
// bank_transactions.description ni expenses: esto es solo la identidad DERIVADA que usa el detector.
const TRAILING_DATE_SUFFIX = /\s+(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/

// Exportada (Fase 1D-g.3): el mismo recorte que ya usa normalizeMerchantKey para la IDENTIDAD también
// sirve, sin forzar mayúsculas, como nombre de PRESENTACIÓN — nunca una segunda regex de fecha. displayName
// la reutiliza tal cual en groupByMerchant; FinanceScreen.tsx la reutiliza igual para el prefill mínimo
// de "Añadir a Previsión" (Caso 2, sin histórico suficiente) — un único sitio decide qué es una fecha.
export function stripTrailingDateSuffix(text: string): string {
  const match = text.match(TRAILING_DATE_SUFFIX)
  if (!match) return text
  const day = Number(match[1])
  const month = Number(match[2])
  if (day < 1 || day > 31 || month < 1 || month > 12) return text // no es una fecha real — se conserva tal cual
  return text.slice(0, match.index).trimEnd()
}

export function normalizeMerchantKey(description: string): string {
  return stripTrailingDateSuffix(description.trim().replace(/\s+/g, ' ')).toUpperCase()
}

interface MerchantGroup {
  accountId: string
  merchantKey: string
  currency: string
  displayName: string
  movements: BankMovementForDetection[] // orden cronológico ascendente
}

function groupByMerchant(movements: BankMovementForDetection[]): MerchantGroup[] {
  const groups = new Map<string, MerchantGroup>()
  for (const m of movements) {
    if (m.isIncome) continue // una previsión de pago siempre es dinero que SALE, nunca un ingreso
    if (!m.description || !m.description.trim()) continue
    const merchantKey = normalizeMerchantKey(m.description)
    const groupKey = `${m.accountId}::${merchantKey}::${m.currency}`
    const existing = groups.get(groupKey)
    // Fase 1D-g.3 — displayName (el título que se ve en la tarjeta/formulario) recorta la MISMA fecha
    // final que la identidad, pero SIN forzar mayúsculas: es un nombre para leer, no una clave de
    // comparación. "31/08/26" del último cargo usado como muestra nunca es parte del nombre del pago.
    const displayName = stripTrailingDateSuffix(m.description.trim().replace(/\s+/g, ' '))
    if (existing) existing.movements.push(m)
    else groups.set(groupKey, { accountId: m.accountId, merchantKey, currency: m.currency, displayName, movements: [m] })
  }
  for (const g of groups.values()) g.movements.sort((a, b) => a.date.localeCompare(b.date))
  return [...groups.values()]
}

// ── Clasificación de periodicidad ───────────────────────────────────────────────────────────────────
//
// Busca, para cada periodicidad, la racha final (más reciente) de movimientos cuyos intervalos consecutivos
// caen TODOS dentro de su tolerancia — nunca basta con que la MEDIA se acerque al objetivo (pedido
// explícito: "no aceptar simplemente porque la media dé aproximadamente 30 días"). Usar la racha final (no
// exigir que TODO el histórico sea consistente desde el principio) porque un compromiso real puede haber
// empezado en un momento distinto o haber tenido un cargo suelto irregular antes — los cargos usados para
// justificar el patrón son siempre los que de verdad lo cumplen, nunca todo el histórico a la fuerza.
function longestTrailingConsistentRun(movements: BankMovementForDetection[], def: PeriodicityDefinition): BankMovementForDetection[] | null {
  if (movements.length < RECURRENCE_MIN_OCCURRENCES) return null
  let start = movements.length - 1
  for (let i = movements.length - 1; i > 0; i--) {
    const gap = daysBetweenDates(movements[i - 1].date, movements[i].date)
    if (Math.abs(gap - def.targetDays) > def.toleranceDays) break
    start = i - 1
  }
  const run = movements.slice(start)
  return run.length >= RECURRENCE_MIN_OCCURRENCES ? run : null
}

// ── Candidato propuesto ─────────────────────────────────────────────────────────────────────────────

export interface RecurrenceOccurrenceEvidence {
  date: string
  amountCents: number
  bankTransactionId: string
  expenseId: string | null
}

export interface RecurrenceCandidate {
  accountId: string
  merchantKey: string
  displayName: string
  currency: string
  periodicity: RecurrencePeriodicity
  periodicityLabel: string
  // Los cargos REALES usados para detectar y estimar — nunca "todo el historial", solo la racha
  // consistente (ver longestTrailingConsistentRun). Orden cronológico ascendente.
  occurrences: RecurrenceOccurrenceEvidence[]
  estimatedAmountCents: number // media de occurrences, en céntimos — nunca floats
  amountRangeCents: { min: number; max: number }
  estimatedBasisText: string // "Media de los últimos N cargos (X–Y €)", listo para mostrar/editar
  // SIEMPRE estrictamente posterior a la referenceDate pasada a detectRecurrenceCandidates — nunca una
  // fecha ya pasada ni "hoy" (Fase 1D-g.1). Ver nextFutureDueDate.
  nextDueDate: string
  // Solo cuando una categoría real es mayoritaria de verdad entre los expenses de esos cargos — "Otros"
  // NUNCA cuenta como fiable (pedido explícito): un expense sin categorizar de verdad no aporta señal.
  suggestedCategoryName: string | null
}

// ── Fase 1D-g.1 — "próximo cargo estimado" SIEMPRE estrictamente futuro ────────────────────────────
//
// stepMonthsClamped(lastChargeDate, monthStep) da UN ciclo por delante del último cargo real — si la
// familia no ha certificado la app en un tiempo, ese ciclo puede ya haber pasado (o ser hoy). "Próximo"
// significa posterior a referenceDate, nunca hoy ni una fecha ya pasada — se avanza ciclo a ciclo hasta
// encontrar el primero que sea de verdad futuro.
//
// SIEMPRE se ancla en lastChargeDate multiplicando el ciclo (monthStep * cycle), nunca encadenando
// stepMonthsClamped sobre su propio resultado: encadenar arrastraría drift de fin de mes (31 ene -> 28
// feb -> 28 mar, en vez de 31 mar) — el mismo criterio de anclaje único que ya usa occurrenceForCycle
// para el resto de Previsión. No es aritmética de fechas nueva: sigue siendo el mismo stepMonthsClamped
// certificado, solo evaluado en más ciclos hasta pasar de referenceDate.
const NEXT_FUTURE_DATE_CYCLE_GUARD = 2000 // ~166 años a paso mensual — cota de seguridad, nunca alcanzable con datos reales

export function nextFutureDueDate(lastChargeDate: string, monthStep: number, referenceDate: string): string {
  let cycle = 1
  let candidate = stepMonthsClamped(lastChargeDate, monthStep * cycle)
  while (candidate <= referenceDate && cycle < NEXT_FUTURE_DATE_CYCLE_GUARD) {
    cycle += 1
    candidate = stepMonthsClamped(lastChargeDate, monthStep * cycle)
  }
  return candidate
}

const NOT_A_RELIABLE_CATEGORY = 'Otros'

function estimateAmount(run: BankMovementForDetection[]): { estimatedAmountCents: number; amountRangeCents: { min: number; max: number }; basisText: string } {
  const cents = run.map((m) => eurosNumberToCents(m.amount))
  const sumCents = cents.reduce((a, b) => a + b, 0)
  const estimatedAmountCents = Math.round(sumCents / cents.length)
  const min = Math.min(...cents)
  const max = Math.max(...cents)
  const fmt = (c: number) => (c / 100).toFixed(2).replace('.', ',')
  const rangeText = min === max ? '' : ` (${fmt(min)}–${fmt(max)} €)`
  return {
    estimatedAmountCents,
    amountRangeCents: { min, max },
    basisText: `Media de los últimos ${run.length} cargos${rangeText}`,
  }
}

// Mayoría ESTRICTA (más de la mitad de los cargos usados) de la MISMA categoría real, nunca "Otros" —
// si no hay consenso claro, se deja sin proponer para que el usuario elija (pedido explícito).
function dominantReliableCategory(run: BankMovementForDetection[]): string | null {
  const counts = new Map<string, number>()
  for (const m of run) {
    if (!m.category || m.category === NOT_A_RELIABLE_CATEGORY) continue
    counts.set(m.category, (counts.get(m.category) ?? 0) + 1)
  }
  let best: { name: string; count: number } | null = null
  for (const [name, count] of counts) if (!best || count > best.count) best = { name, count }
  if (!best) return null
  return best.count > run.length / 2 ? best.name : null
}

// Detecta TODOS los patrones plausibles del histórico dado — sin comprobar todavía si ya existen como
// previsión ni si la familia los descartó antes (eso es findNewRecurrenceCandidates, un paso aparte y
// deliberadamente separado para poder auditar/testear cada cosa por su lado).
//
// referenceDate ("hoy") SIEMPRE la da quien llama — este módulo nunca lee el reloj del sistema (new
// Date()) por su cuenta, para poder probarse con fechas deterministas y para no dispersar la noción de
// "hoy" en varias funciones (mismo criterio que today/expandForecastOccurrences en el resto de Previsión).
export function detectRecurrenceCandidates(movements: BankMovementForDetection[], referenceDate: string): RecurrenceCandidate[] {
  const groups = groupByMerchant(movements)
  const candidates: RecurrenceCandidate[] = []
  for (const group of groups) {
    for (const def of RECURRENCE_PERIODICITIES) {
      const run = longestTrailingConsistentRun(group.movements, def)
      if (!run) continue
      const { estimatedAmountCents, amountRangeCents, basisText } = estimateAmount(run)
      candidates.push({
        accountId: group.accountId,
        merchantKey: group.merchantKey,
        displayName: group.displayName,
        currency: group.currency,
        periodicity: def.key,
        periodicityLabel: def.label,
        occurrences: run.map((m) => ({ date: m.date, amountCents: eurosNumberToCents(m.amount), bankTransactionId: m.bankTransactionId, expenseId: m.expenseId })),
        estimatedAmountCents,
        amountRangeCents,
        estimatedBasisText: basisText,
        nextDueDate: nextFutureDueDate(run[run.length - 1].date, def.monthStep, referenceDate),
        suggestedCategoryName: dominantReliableCategory(run),
      })
      // Las ventanas de tolerancia de las periodicidades nunca se solapan (ver comentario de
      // RECURRENCE_PERIODICITIES) — una racha real que encaja en UNA nunca encaja también en otra, así
      // que no hace falta seguir probando el resto de periodicidades para este mismo grupo.
      break
    }
  }
  return candidates
}

// ── Deduplicación contra previsiones ya existentes ──────────────────────────────────────────────────
//
// Señal FUERTE (real, ya disponible desde la Fase 1D-e): si CUALQUIER cargo usado para detectar el
// patrón ya está conciliado con una previsión real (su expense_id aparece en matchedExpenseIds), el
// compromiso YA EXISTE — se excluye sin más, sin necesidad de comparar texto. Es el caso obligatorio de
// esta fase: ENDESA, ya conciliada con "Endesa factura de luz", nunca debe reaparecer como propuesta.
//
// Señal DÉBIL (conservadora, solo si la fuerte no aplica): coincidencia de palabra significativa entre
// el nombre del comercio y el título/proveedor de una previsión ACTIVA de la MISMA cuenta — reutiliza
// hasSharedWord tal cual (Fase 1D-e), nunca un matching agresivo. Preferimos perder una propuesta dudosa
// antes que duplicar una previsión.
export interface ForecastPaymentForDedup {
  title: string
  provider: string | null
  bankAccountId: string | null
  active: boolean
}

export function isRecurrenceCandidateAlreadyKnown(
  candidate: RecurrenceCandidate,
  matchedExpenseIds: ReadonlySet<string>,
  existingPayments: readonly ForecastPaymentForDedup[],
): boolean {
  if (candidate.occurrences.some((o) => o.expenseId && matchedExpenseIds.has(o.expenseId))) return true
  return existingPayments.some(
    (p) => p.active && p.bankAccountId === candidate.accountId && hasSharedWord(candidate.displayName, `${p.title} ${p.provider ?? ''}`),
  )
}

// Combina detección + deduplicación + descartes ya guardados ("No me interesa") — el resultado son
// SOLO las propuestas nuevas que de verdad hace falta enseñar. dismissedMerchantKeys: claves
// `${accountId}::${merchantKey}` ya descartadas por esta familia (forecast_recurrence_dismissals).
export function findNewRecurrenceCandidates(
  movements: BankMovementForDetection[],
  matchedExpenseIds: ReadonlySet<string>,
  existingPayments: readonly ForecastPaymentForDedup[],
  dismissedMerchantKeys: ReadonlySet<string>,
  referenceDate: string,
): RecurrenceCandidate[] {
  return detectRecurrenceCandidates(movements, referenceDate).filter(
    (c) => !isRecurrenceCandidateAlreadyKnown(c, matchedExpenseIds, existingPayments) && !dismissedMerchantKeys.has(`${c.accountId}::${c.merchantKey}`),
  )
}
