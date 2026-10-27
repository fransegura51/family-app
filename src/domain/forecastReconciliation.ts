// Previsión de pagos — Fase 1D-e: conciliación bancaria. Motor PURO y determinista: dado un movimiento
// bancario real (ya convertido en expense por el sync, ver enable-banking-sync-transactions) y una lista
// de ocurrencias previstas ya resueltas (expandForecastOccurrences — nunca se recalcula nada aquí),
// encuentra candidatos plausibles con una puntuación explicable. Nunca decide ni concilia por sí solo —
// solo propone; la confirmación es siempre del usuario (Fase 1D-e, sección 7: nada de auto-conciliación
// todavía, ni para "high"). La IA no participa en absoluto en este cálculo — todo es aritmética y
// comparación de fechas/importes/cuenta, código determinista de principio a fin.
import { eurosNumberToCents } from './forecastMoneyCents'
import { compareMerchantIdentity, type MerchantIdentityMatch } from './forecastMerchantIdentity'
import { isPendingCategory } from './pending'
import type { ForecastOccurrence } from './forecast'

// Un movimiento bancario real, ya reducido a lo que hace falta para compararlo — el motor nunca lee
// bank_transactions/expenses directamente (eso es cosa de la capa de datos), así se puede probar con
// datos de mentira sin tocar Supabase.
export interface BankMovementForMatching {
  bankTransactionId: string
  // El expense real al que ya está vinculado este movimiento (enable-banking-sync-transactions SIEMPRE
  // crea o reutiliza un expense al sincronizar) — sin él no hay nada que conciliar todavía (auditoría:
  // "si el movimiento bancario ya genera/está vinculado a un expense, usar ese expense").
  expenseId: string | null
  accountId: string
  date: string // YYYY-MM-DD — transaction_date
  amount: number // valor absoluto, en la unidad de currency (no céntimos todavía — se convierte aquí)
  currency: string
  description: string | null
  isIncome: boolean // credit_debit === 'CRDT'
  // Fase 3B (2026-09-30) — la categoría YA asignada al expense vinculado (el sync bancario la adivina al
  // sincronizar, o el usuario la corrige a mano después) — null si sigue sin clasificar. Señal AUXILIAR,
  // nunca una verdad absoluta: la auditoría real de Hipoteca/Préstamo Moto demostró que el sync puede
  // adivinar mal (cae en "Otros" cuando no reconoce el comercio) — ver isUninformativeCategory más abajo,
  // que trata ese fallback igual que "sin clasificar" para esta comparación.
  category: string | null
}

export type ReconciliationReasonCode =
  | 'merchant_match'
  | 'merchant_alias'
  | 'merchant_reference'
  | 'same_account'
  | 'amount_exact'
  | 'amount_close'
  | 'amount_variable'
  | 'date_exact'
  | 'date_near'
  | 'category_agrees'

export interface ReconciliationReason {
  code: ReconciliationReasonCode
  label: string
}

// Todo candidato que llega aquí ya superó los filtros de elegibilidad, así que como mínimo es «medium»: la etiqueta solo distingue un caso redondo («high»).
export type ReconciliationConfidence = 'high' | 'medium'

export interface ReconciliationCandidate {
  occurrence: ForecastOccurrence
  movement: BankMovementForMatching
  score: number
  confidence: ReconciliationConfidence
  reasons: ReconciliationReason[]
}

// ── ECO-02 (2026-10-27): ELEGIBILIDAD primero, ORDENACIÓN después ─────────────────────────────────────────────
//
// CAUSA REAL de los falsos positivos (ENDESA ↔ ASADOR SESE, GOOGLE FLOW ↔ CONSUM, SEQURA ↔ «Eric Segura Hepburn»…): antes los únicos filtros duros eran
// ingreso/divisa/cuenta/ventana de fecha, y la identidad del comercio era solo +10 puntos opcionales. La exclusión por importe exigía además que la
// CATEGORÍA fuera fuertemente distinta en ambos lados (casi nunca: el banco clasifica «Otros»). Así, cualquier cargo de la misma cuenta a ±3 días sumaba
// 30 (cuenta) + 15-30 (fecha) = «medio» y se enseñaba como «el mejor de varios candidatos malos»; al pulsar «No es este» salía el siguiente. Además la UI decía
// que el nivel «bajo» no se enseñaba, pero no lo filtraba.
//
// Ahora un movimiento solo es CANDIDATO si supera TODOS estos filtros duros (la fecha y la cuenta nunca compensan a los demás):
//   1. es un cargo (no un ingreso), con gasto vinculado, de la misma divisa, de la cuenta prevista (si el pago tiene una) y dentro de la ventana de fecha;
//   2. IDENTIDAD COMERCIAL: el concepto del banco y el pago previsto hablan del mismo comercio (forecastMerchantIdentity.ts). Sin evidencia → no se propone;
//   3. IMPORTE compatible según el tipo de pago: conocido (exacto o diferencia pequeña), estimado/variable (dentro de un margen) o desconocido (identidad
//      especialmente fiable: evidencia sólida y cuenta prevista coincidente, porque aquí no hay importe que respalde).
// Solo entonces se puntúa para ORDENAR (nunca para decidir si se muestra). Lo que no pasa los filtros se puede asociar a mano (assessManualPairing).

// Ventana de fecha: el vencimiento previsto puede caer en fin de semana/festivo y el banco liquidar el primer día laborable siguiente (caso real: previsto
// 05/12, cargo real 07/12, +2 días). Fuera de esta ventana, un movimiento NUNCA se propone.
export const RECONCILIATION_DATE_WINDOW_DAYS = 3

// Importe CONOCIDO: exacto, o una diferencia pequeña en AMBOS sentidos (relativa y absoluta). Un importe elevado no admite un margen porcentual amplio.
// Casos reales que deben seguir proponiéndose: previsto 144,54 €, banco 146,20 € (1,15 %, 1,66 €); suscripción de 104,52 € cobrada a 108,90 € (4,2 %, 4,38 €).
export const RECONCILIATION_KNOWN_TOLERANCE_RATIO = 0.05
export const RECONCILIATION_KNOWN_TOLERANCE_MAX_ABS_CENTS = 1000 // 10,00 €

// Importe ESTIMADO (facturas variables): la identidad ya está comprobada, así que se admite una diferencia mayor, pero no ilimitada.
export const RECONCILIATION_ESTIMATED_TOLERANCE_RATIO = 0.5

const SCORE_SAME_ACCOUNT = 30
const SCORE_AMOUNT_EXACT = 40
const SCORE_AMOUNT_CLOSE = 25
const SCORE_AMOUNT_VARIABLE = 10
const SCORE_DATE_EXACT = 30
const SCORE_DATE_PER_DAY_PENALTY = 5 // por cada día de distancia hasta la ventana — nunca negativo
const SCORE_IDENTITY_STRONG = 30
const SCORE_IDENTITY_WEAK = 20
const SCORE_CATEGORY_AGREES = 5

// "Otros" es la categoría de reserva del sync bancario (guessCategory) cuando no reconoce el comercio: baja confianza, se trata como "sin clasificar".
const CATEGORY_GUESS_FALLBACK = 'Otros'
function isUninformativeCategory(category: string | null | undefined): boolean {
  return isPendingCategory(category) || category === CATEGORY_GUESS_FALLBACK
}

// Umbral de la etiqueta «high» (solo texto de la tarjeta; nunca se enseña como porcentaje ni decide si se muestra).
export const RECONCILIATION_CONFIDENCE_HIGH_MIN = 90

function confidenceForScore(score: number): ReconciliationConfidence {
  return score >= RECONCILIATION_CONFIDENCE_HIGH_MIN ? 'high' : 'medium'
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number)
  const [ty, tm, td] = toDateStr.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

// Fase 1D-g.4 — la deduplicación de recurrencias busca identidad del COMPROMISO/comercio, nunca del MEDIO DE PAGO (boilerplate "COMPRA TARJ."). Estas
// utilidades (meaningfulWords / hasSharedWord) las usa la detección de posibles recurrencias y NO se tocan; la conciliación usa la identidad más estricta
// de forecastMerchantIdentity.ts.
const GENERIC_BANK_BOILERPLATE_WORDS = new Set(['compra', 'tarj'])

function isMaskedCardReference(word: string): boolean {
  return /^[0-9x]+$/.test(word) && /\d/.test(word) && /x/.test(word)
}

export function meaningfulWords(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  const words = normalized.match(/[a-z0-9]+/g) ?? []
  return new Set(words.filter((w) => w.length >= 3 && !GENERIC_BANK_BOILERPLATE_WORDS.has(w) && !isMaskedCardReference(w)))
}

export function hasSharedWord(a: string, b: string): boolean {
  const wordsA = meaningfulWords(a)
  if (wordsA.size === 0) return false
  const wordsB = meaningfulWords(b)
  for (const w of wordsB) if (wordsA.has(w)) return true
  return false
}

export interface ForecastPaymentContextForMatching {
  bankAccountId: string | null
  title: string
  provider: string | null
}

type OccurrenceForScoring = Pick<ForecastOccurrence, 'expectedPaymentDate' | 'amountStatus' | 'amount' | 'currency' | 'title' | 'matchedExpenseId'>

export type AmountCompatibility = 'exact' | 'close' | 'variable' | 'far' | 'unknown'

export interface PairingFacts {
  sameAccount: boolean
  /** Solo es relevante si el pago tiene cuenta prevista. */
  accountMismatch: boolean
  dayOffset: number
  withinWindow: boolean
  identity: MerchantIdentityMatch
  amount: AmountCompatibility
  expectedCents: number | null
  movementCents: number | null
}

// Hechos objetivos de una pareja (ocurrencia ↔ movimiento): los comparten la elegibilidad automática y las advertencias de la asociación manual, para que
// nunca puedan contradecirse.
export function pairingFacts(occurrence: OccurrenceForScoring, payment: ForecastPaymentContextForMatching, movement: BankMovementForMatching): PairingFacts {
  const dayOffset = daysBetween(occurrence.expectedPaymentDate, movement.date)
  const identity = compareMerchantIdentity(`${payment.title} ${payment.provider ?? ''} ${occurrence.title}`, movement.description)
  let expectedCents: number | null = null
  let movementCents: number | null = null
  let amount: AmountCompatibility = 'unknown'
  if (occurrence.amountStatus !== 'unknown' && occurrence.amount != null) {
    expectedCents = eurosNumberToCents(occurrence.amount)
    movementCents = eurosNumberToCents(movement.amount)
    const diff = Math.abs(expectedCents - movementCents)
    const ratio = diff / Math.max(1, Math.abs(expectedCents))
    if (diff === 0) amount = 'exact'
    else if (ratio <= RECONCILIATION_KNOWN_TOLERANCE_RATIO && diff <= RECONCILIATION_KNOWN_TOLERANCE_MAX_ABS_CENTS) amount = 'close'
    else if (occurrence.amountStatus === 'estimated' && ratio <= RECONCILIATION_ESTIMATED_TOLERANCE_RATIO) amount = 'variable'
    else amount = 'far'
  }
  return {
    sameAccount: !!payment.bankAccountId && movement.accountId === payment.bankAccountId,
    accountMismatch: !!payment.bankAccountId && movement.accountId !== payment.bankAccountId,
    dayOffset,
    withinWindow: Math.abs(dayOffset) <= RECONCILIATION_DATE_WINDOW_DAYS,
    identity,
    amount,
    expectedCents,
    movementCents,
  }
}

function describeDayOffset(dayOffset: number): string {
  if (dayOffset === 0) return 'mismo día previsto'
  const when = dayOffset > 0 ? 'después' : 'antes'
  return `cargo ${Math.abs(dayOffset)} día${Math.abs(dayOffset) === 1 ? '' : 's'} ${when} de lo previsto`
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

// Puntúa UN candidato (occurrence, movement) ya pre-filtrado por estado — devuelve null cuando algún filtro DURO lo descarta (ver arriba). El motor NUNCA
// concilia: solo propone, y la confirmación es siempre de la persona.
export function scoreReconciliationCandidate(
  occurrence: OccurrenceForScoring,
  payment: ForecastPaymentContextForMatching,
  movement: BankMovementForMatching,
  categoryName?: string | null,
): { score: number; confidence: ReconciliationConfidence; reasons: ReconciliationReason[] } | null {
  // ── 1. Filtros estructurales ───────────────────────────────────────────────────────────────────────────────
  if (occurrence.matchedExpenseId) return null
  if (movement.isIncome) return null
  if (!movement.expenseId) return null
  if (movement.currency !== occurrence.currency) return null
  const facts = pairingFacts(occurrence, payment, movement)
  if (facts.accountMismatch) return null
  if (!facts.withinWindow) return null

  // ── 2. Identidad comercial: obligatoria ────────────────────────────────────────────────────────────────────
  if (facts.identity.kind !== 'match') return null

  // ── 3. Importe compatible según el tipo de pago ────────────────────────────────────────────────────────────
  if (occurrence.amountStatus === 'unknown') {
    // Sin importe que respalde la pareja: identidad sólida y cuenta prevista coincidente (la fecha no sustituye a la identidad).
    if (!facts.identity.strong || !facts.sameAccount) return null
  } else if (facts.amount === 'far' || facts.amount === 'unknown') {
    return null
  }

  // ── Ordenación (solo entre candidatos ya elegibles) ────────────────────────────────────────────────────────
  const reasons: ReconciliationReason[] = []
  let score = 0

  const identityLabel = facts.identity.via === 'reference' ? 'misma referencia de contrato' : facts.identity.via === 'alias' ? 'comercio equivalente' : 'mismo comercio'
  score += facts.identity.strong ? SCORE_IDENTITY_STRONG : SCORE_IDENTITY_WEAK
  reasons.push({ code: facts.identity.via === 'reference' ? 'merchant_reference' : facts.identity.via === 'alias' ? 'merchant_alias' : 'merchant_match', label: identityLabel })

  if (facts.sameAccount) {
    score += SCORE_SAME_ACCOUNT
    reasons.push({ code: 'same_account', label: 'misma cuenta' })
  }

  if (occurrence.amountStatus === 'unknown') {
    reasons.push({ code: 'amount_variable', label: 'importe pendiente de confirmar' })
  } else if (facts.amount === 'exact') {
    score += SCORE_AMOUNT_EXACT
    reasons.push({ code: 'amount_exact', label: 'mismo importe' })
  } else if (facts.amount === 'close') {
    score += SCORE_AMOUNT_CLOSE
    reasons.push({ code: 'amount_close', label: `importe casi igual (esperado ${euros(facts.expectedCents!)} €, real ${euros(facts.movementCents!)} €)` })
  } else if (facts.amount === 'variable') {
    score += SCORE_AMOUNT_VARIABLE
    reasons.push({ code: 'amount_variable', label: `importe variable (estimado ${euros(facts.expectedCents!)} €, real ${euros(facts.movementCents!)} €)` })
  }

  if (facts.dayOffset === 0) {
    score += SCORE_DATE_EXACT
  } else {
    score += Math.max(0, SCORE_DATE_EXACT - SCORE_DATE_PER_DAY_PENALTY * Math.abs(facts.dayOffset))
  }
  reasons.push({ code: facts.dayOffset === 0 ? 'date_exact' : 'date_near', label: describeDayOffset(facts.dayOffset) })

  // Señal complementaria: la categoría REAL ya asignada al movimiento coincide con la de la previsión. Nunca decide nada.
  if (categoryName && !isUninformativeCategory(categoryName) && !isUninformativeCategory(movement.category) && movement.category === categoryName) {
    score += SCORE_CATEGORY_AGREES
    reasons.push({ code: 'category_agrees', label: 'coincide con la categoría real ya asignada al movimiento' })
  }

  return { score, confidence: confidenceForScore(score), reasons }
}

// ── Asociación MANUAL (explícita, distinta de una sugerencia automática) ──────────────────────────────────────
//
// La persona puede vincular un pago previsto con CUALQUIER cargo del banco que siga libre, aunque no supere los filtros automáticos. Antes de confirmar se
// le avisa, sin impedirlo, de lo que no encaja. Devuelve los avisos legibles (vacío = todo coherente).
export function assessManualPairing(occurrence: OccurrenceForScoring, payment: ForecastPaymentContextForMatching, movement: BankMovementForMatching): string[] {
  const facts = pairingFacts(occurrence, payment, movement)
  const warnings: string[] = []
  if (movement.currency !== occurrence.currency) warnings.push('La divisa del movimiento no es la del pago previsto.')
  if (facts.identity.kind === 'conflict') warnings.push('El nombre del banco no se parece al del pago previsto.')
  else if (facts.identity.kind === 'unknown') warnings.push('No se puede comprobar el comercio con el nombre del banco.')
  if (facts.amount === 'far') {
    warnings.push(`El importe es muy distinto: previsto ${euros(facts.expectedCents!)} €, banco ${euros(facts.movementCents!)} €.`)
  }
  if (facts.accountMismatch) warnings.push('El cargo es de una cuenta distinta a la prevista.')
  if (!facts.withinWindow) warnings.push(`La fecha está lejos de lo previsto (${Math.abs(facts.dayOffset)} días ${facts.dayOffset > 0 ? 'después' : 'antes'}).`)
  return warnings
}

// Una ocurrencia pendiente junto con el contexto de SU previsión (cuenta prevista, título, proveedor) y,
// si se conoce, el nombre de su categoría — el motor nunca resuelve esto por sí mismo (nunca toca
// Supabase ni domain/forecast.ts de nuevo), lo recibe ya resuelto de quien llama.
export interface OccurrenceForMatching {
  // El objeto ForecastOccurrence COMPLETO (no un subconjunto): quien llama necesita luego
  // forecastPaymentId/occurrenceDate/installmentSequenceIndex para poder conciliar de verdad el
  // candidato elegido (ver data/forecast.ts: matchForecastOccurrence) — el motor solo usa los campos
  // que puntúa, pero el candidato resultante conserva el objeto entero para ese siguiente paso.
  occurrence: ForecastOccurrence
  payment: ForecastPaymentContextForMatching
  categoryName?: string | null
}

// Identidad de UNA pareja (ocurrencia previsión ↔ movimiento bancario) para "No es este" — misma forma
// que ya usaba candidateKey en FinanceScreen.tsx, ahora exportada desde el propio motor para que el
// cliente y el filtro de descartados nunca puedan desincronizarse construyendo la clave de dos formas
// distintas. Nunca identifica solo un lado: rechazar A↔B no bloquea A con otro movimiento ni B con otra
// previsión, solo esta pareja exacta.
export function reconciliationPairKey(
  occurrence: Pick<ForecastOccurrence, 'forecastPaymentId' | 'occurrenceDate' | 'installmentSequenceIndex'>,
  movement: Pick<BankMovementForMatching, 'bankTransactionId'>,
): string {
  return `${occurrence.forecastPaymentId}:${occurrence.occurrenceDate}:${occurrence.installmentSequenceIndex ?? 0}:${movement.bankTransactionId}`
}

// Busca, para CADA ocurrencia pendiente, el mejor movimiento candidato entre los disponibles — nunca al
// revés (un mismo movimiento no puede proponerse ya usado, ver `alreadyMatchedExpenseIds`). Devuelve como
// mucho UN candidato por ocurrencia (el de mayor puntuación) y como mucho UN candidato por movimiento (si
// el mismo movimiento fuera el mejor para dos ocurrencias, se queda con la de mayor puntuación y la otra
// ocurrencia no se propone con ese movimiento — nunca se duplica una propuesta del mismo movimiento).
// Ordenado por puntuación descendente.
//
// dismissedPairKeys ("No es este" persistido) — una pareja descartada se trata como si no puntuara para
// ESA combinación exacta: la ocurrencia sigue buscando su siguiente mejor candidato entre el resto de
// movimientos, y el movimiento descartado sigue disponible para cualquier OTRA ocurrencia — nunca se
// excluye ninguno de los dos lados por completo, solo esta pareja.
export function findReconciliationCandidates(
  candidates: OccurrenceForMatching[],
  movements: BankMovementForMatching[],
  alreadyMatchedExpenseIds: ReadonlySet<string>,
  dismissedPairKeys: ReadonlySet<string> = new Set(),
): ReconciliationCandidate[] {
  const availableMovements = movements.filter((m) => !m.expenseId || !alreadyMatchedExpenseIds.has(m.expenseId))

  const perOccurrenceBest: ReconciliationCandidate[] = []
  for (const { occurrence, payment, categoryName } of candidates) {
    if (occurrence.matchedExpenseId) continue
    let best: ReconciliationCandidate | null = null
    for (const movement of availableMovements) {
      if (dismissedPairKeys.has(reconciliationPairKey(occurrence, movement))) continue
      const result = scoreReconciliationCandidate(occurrence, payment, movement, categoryName)
      if (!result) continue
      if (!best || result.score > best.score) {
        best = { occurrence, movement, score: result.score, confidence: result.confidence, reasons: result.reasons }
      }
    }
    if (best) perOccurrenceBest.push(best)
  }

  // Un mismo movimiento no puede quedar propuesto para dos ocurrencias a la vez — se queda con la de
  // mayor puntuación; el resto de ocurrencias que lo tenían como mejor candidato simplemente no se
  // proponen esta vez (no se les busca un segundo mejor candidato en esta fase — mantiene el resultado
  // simple y predecible; una vez conciliada la primera, la siguiente pasada ya lo verá libre).
  const bestByMovement = new Map<string, ReconciliationCandidate>()
  for (const candidate of perOccurrenceBest) {
    const key = candidate.movement.bankTransactionId
    const existing = bestByMovement.get(key)
    if (!existing || candidate.score > existing.score) bestByMovement.set(key, candidate)
  }

  return [...bestByMovement.values()].sort((a, b) => b.score - a.score)
}

// ── Fase 1D-f — "Gestionar movimiento": qué categoría proponer al confirmar una conciliación ──────────
//
// Auditoría previa (sin código, antes de diseñar esto): expenses.category es una única columna de texto,
// sobrescrita en el sitio tanto por el sync bancario (categoría adivinada) como por una edición manual
// (classify_purchase) — no existe NINGÚN campo que distinga "todavía es la adivinada por el banco" de "el
// usuario ya la confirmó a mano" (ni columna, ni timestamp, ni un valor centinela: se comprobó leyendo
// TODAS las migraciones que tocan `expenses` y grepeando el repo entero). Inventar esa distinción sería
// arriesgar un UPDATE que pise una decisión manual real sin poder saberlo con certeza — así que esta
// función NUNCA decide sola: siempre expone `currentCategory` para que la pantalla pueda ofrecer
// "Mantener {currentCategory}", y nada se guarda hasta que el usuario pulsa "Guardar y finalizar".
export interface ManagedExpenseCategoryResolution {
  // Qué debe llevar el selector nada más abrir "Gestionar movimiento" — nunca se aplica solo; solo es el
  // punto de partida de un <select> que el usuario puede cambiar libremente antes de guardar.
  preselected: string | null
  // true cuando la categoría ya guardada del expense difiere de la propuesta por la previsión — la
  // pantalla debe mostrar entonces las DOS claramente (nunca ocultar cuál había antes).
  hasConflict: boolean
  // La categoría que YA tenía el expense antes de abrir este paso (null = "Pendiente de clasificar") —
  // siempre presente cuando hasConflict es true, para poder ofrecer "Mantener {currentCategory}".
  currentCategory: string | null
}

export function resolveManagedExpenseCategory(currentCategory: string | null, forecastCategoryName: string | null): ManagedExpenseCategoryResolution {
  if (forecastCategoryName == null) return { preselected: currentCategory, hasConflict: false, currentCategory }
  if (currentCategory == null || currentCategory === forecastCategoryName) return { preselected: forecastCategoryName, hasConflict: false, currentCategory }
  return { preselected: forecastCategoryName, hasConflict: true, currentCategory }
}
