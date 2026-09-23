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
// se duplica). Los datos reales confirman que esto basta: el mismo comercio produce la MISMA cadena
// exacta mes a mes (ENDESA ENERGIA S.A., ORANGE ESPAGNE SAU, COMPRA TARJ. ...ANTHROPIC*...). Una
// normalización más agresiva podría fusionar comercios distintos (prohibido explícitamente) — se prefiere
// agrupar de menos que agrupar de más.
export function normalizeMerchantKey(description: string): string {
  return description.trim().replace(/\s+/g, ' ').toUpperCase()
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
    if (existing) existing.movements.push(m)
    else groups.set(groupKey, { accountId: m.accountId, merchantKey, currency: m.currency, displayName: m.description.trim(), movements: [m] })
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
  nextDueDate: string
  // Solo cuando una categoría real es mayoritaria de verdad entre los expenses de esos cargos — "Otros"
  // NUNCA cuenta como fiable (pedido explícito): un expense sin categorizar de verdad no aporta señal.
  suggestedCategoryName: string | null
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
export function detectRecurrenceCandidates(movements: BankMovementForDetection[]): RecurrenceCandidate[] {
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
        nextDueDate: stepMonthsClamped(run[run.length - 1].date, def.monthStep),
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
): RecurrenceCandidate[] {
  return detectRecurrenceCandidates(movements).filter(
    (c) => !isRecurrenceCandidateAlreadyKnown(c, matchedExpenseIds, existingPayments) && !dismissedMerchantKeys.has(`${c.accountId}::${c.merchantKey}`),
  )
}
