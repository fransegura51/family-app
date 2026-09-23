// Previsión de pagos — Fase 1D-e: conciliación bancaria. Motor PURO y determinista: dado un movimiento
// bancario real (ya convertido en expense por el sync, ver enable-banking-sync-transactions) y una lista
// de ocurrencias previstas ya resueltas (expandForecastOccurrences — nunca se recalcula nada aquí),
// encuentra candidatos plausibles con una puntuación explicable. Nunca decide ni concilia por sí solo —
// solo propone; la confirmación es siempre del usuario (Fase 1D-e, sección 7: nada de auto-conciliación
// todavía, ni para "high"). La IA no participa en absoluto en este cálculo — todo es aritmética y
// comparación de fechas/importes/cuenta, código determinista de principio a fin.
import { eurosNumberToCents } from './forecastMoneyCents'
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
}

export type ReconciliationReasonCode =
  | 'same_account'
  | 'amount_exact'
  | 'amount_close'
  | 'date_exact'
  | 'date_near'
  | 'text_match'
  | 'category_match'

export interface ReconciliationReason {
  code: ReconciliationReasonCode
  label: string
}

export type ReconciliationConfidence = 'high' | 'medium' | 'low'

export interface ReconciliationCandidate {
  occurrence: ForecastOccurrence
  movement: BankMovementForMatching
  score: number
  confidence: ReconciliationConfidence
  reasons: ReconciliationReason[]
}

// ── Constantes de la fórmula — nada de "números mágicos" sin nombre: cada una documenta qué representa
// y de dónde sale, para poder ajustarlas más adelante con experiencia real sin tener que releer el
// cálculo entero. ──

// Ventana de fecha: el vencimiento previsto puede caer en fin de semana/festivo y el banco liquidar el
// primer día laborable siguiente (caso real de esta fase: previsto 05/12, cargo real 07/12, +2 días).
// Fuera de esta ventana, un movimiento NUNCA se propone como candidato — no es solo una penalización de
// puntuación, es un filtro duro (auditoría: no hay precedente validado de una tolerancia distinta para
// previsión↔banco en este repo; se documenta aquí como punto de partida, ajustable con datos reales).
export const RECONCILIATION_DATE_WINDOW_DAYS = 3

// Tolerancia relativa para un importe Estimado o para un importe Conocido que no coincide exacto (p. ej.
// el banco cobra 146,20 € cuando se esperaban 144,54 €, sección 10 del encargo: la coincidencia por
// cuenta/fecha puede seguir siendo suficiente para proponerlo). Por encima de esta tolerancia, el importe
// deja de sumar puntos — pero nunca excluye el candidato por sí solo (cuenta+fecha pueden bastar).
export const RECONCILIATION_AMOUNT_TOLERANCE_RATIO = 0.15

const SCORE_SAME_ACCOUNT = 30
const SCORE_AMOUNT_EXACT = 40
const SCORE_AMOUNT_CLOSE = 20
const SCORE_DATE_EXACT = 30
const SCORE_DATE_PER_DAY_PENALTY = 5 // por cada día de distancia hasta la ventana — nunca negativo
const SCORE_TEXT_MATCH = 10
const SCORE_CATEGORY_MATCH = 5

// Umbrales de confianza — deliberadamente conservadores: "high" solo con cuenta+importe+fecha alineados
// a la vez (el caso SUMA: misma cuenta + importe exacto + 2 días = 30+40+20 = 90). Documentados aquí,
// nunca implícitos en el código que los usa.
export const RECONCILIATION_CONFIDENCE_HIGH_MIN = 70
export const RECONCILIATION_CONFIDENCE_MEDIUM_MIN = 35

function confidenceForScore(score: number): ReconciliationConfidence {
  if (score >= RECONCILIATION_CONFIDENCE_HIGH_MIN) return 'high'
  if (score >= RECONCILIATION_CONFIDENCE_MEDIUM_MIN) return 'medium'
  return 'low'
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number)
  const [ty, tm, td] = toDateStr.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

// Fase 1D-g.4 — auditoría real (Netflix vs Anthropic): la deduplicación debe buscar identidad del
// COMPROMISO/comercio, nunca del MEDIO DE PAGO. "COMPRA TARJ. 5402XXXXXXXX4041 NETFLIX.COM-Madrid" y
// "COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN" compartían "COMPRA", "TARJ" y el número
// de tarjeta enmascarado — ninguno de los tres identifica al comercio, los tres son boilerplate del
// banco (misma tarjeta paga Netflix, Anthropic, Orange...). Lista MÍNIMA y conservadora — solo lo
// demostrado con un caso real, nunca un diccionario bancario extenso (si aparecen más casos, se añaden
// uno a uno con su propia evidencia, nunca por anticipado).
const GENERIC_BANK_BOILERPLATE_WORDS = new Set(['compra', 'tarj'])

// Referencia de tarjeta enmascarada: ESTRUCTURAL (dígitos y "x" mezclados, nada más), nunca una lista de
// números concretos — así detecta cualquier formato de enmascarado ("5402XXXXXXXX4041" y cualquier
// variante futura) sin tener que hardcodear ningún número. Un identificador real (número de préstamo,
// de contrato...) es SIEMPRE solo dígitos — nunca lleva "x" — así que nunca se ve afectado: "8078183410"
// sigue siendo significativo, tal como debe seguir relacionando "PRESTAMOS ADEUDO CUOTA N.8078183410"
// con "Hipoteca Casa N.8078183410". Una palabra con letras reales además de dígitos/"x" (p. ej. "xbox360")
// tampoco encaja aquí — solo cuenta si TODO el token es exclusivamente dígitos y "x".
function isMaskedCardReference(word: string): boolean {
  return /^[0-9x]+$/.test(word) && /\d/.test(word) && /x/.test(word)
}

// Texto libre → palabras "útiles" (3+ letras, sin acentos) para una coincidencia de texto simple y
// explicable — nunca IA, nunca similitud semántica inventada. Una palabra en común entre el concepto
// bancario y el título/proveedor de la previsión es una señal secundaria, nunca obligatoria.
// Exportadas (Fase 1D-g): la detección de posibles recurrencias reutiliza EXACTAMENTE esta misma
// comparación para no crear una cuarta normalización de texto en el repo (auditoría previa a esa fase).
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

// Puntúa UN candidato (occurrence, movement) ya pre-filtrado por estado (nunca se llama con una ocurrencia
// ya conciliada, saltada, de una previsión inactiva o fuera de ciclo — expandForecastOccurrences ya
// garantiza eso por construcción) — devuelve null cuando algún filtro DURO excluye el candidato:
//   - el movimiento es un ingreso (una previsión siempre es dinero que SALE, nunca al revés)
//   - el movimiento no tiene expense vinculado todavía (nada que conciliar)
//   - divisas distintas (nunca se comparan como equivalentes, aunque el número coincida)
//   - la previsión tiene cuenta asignada y el movimiento es de OTRA cuenta (nunca se propone automáticamente
//     contra otra cuenta; forzarlo explícitamente queda fuera de esta fase)
//   - la fecha del movimiento cae fuera de la ventana de ±RECONCILIATION_DATE_WINDOW_DAYS respecto a
//     expected_payment_date (nunca due_date cuando son distintas — pedido explícito)
export function scoreReconciliationCandidate(
  occurrence: Pick<ForecastOccurrence, 'expectedPaymentDate' | 'amountStatus' | 'amount' | 'currency' | 'title' | 'matchedExpenseId'>,
  payment: ForecastPaymentContextForMatching,
  movement: BankMovementForMatching,
  categoryName?: string | null,
): { score: number; confidence: ReconciliationConfidence; reasons: ReconciliationReason[] } | null {
  if (occurrence.matchedExpenseId) return null
  if (movement.isIncome) return null
  if (!movement.expenseId) return null
  if (movement.currency !== occurrence.currency) return null
  if (payment.bankAccountId && movement.accountId !== payment.bankAccountId) return null

  const dayOffset = daysBetween(occurrence.expectedPaymentDate, movement.date) // + = el banco cobra DESPUÉS de lo previsto
  if (Math.abs(dayOffset) > RECONCILIATION_DATE_WINDOW_DAYS) return null

  const reasons: ReconciliationReason[] = []
  let score = 0

  if (payment.bankAccountId && movement.accountId === payment.bankAccountId) {
    score += SCORE_SAME_ACCOUNT
    reasons.push({ code: 'same_account', label: 'misma cuenta' })
  }

  if (occurrence.amountStatus !== 'unknown' && occurrence.amount != null) {
    const expectedCents = eurosNumberToCents(occurrence.amount)
    const movementCents = eurosNumberToCents(movement.amount)
    const diffCents = Math.abs(expectedCents - movementCents)
    if (diffCents === 0) {
      score += SCORE_AMOUNT_EXACT
      reasons.push({ code: 'amount_exact', label: 'mismo importe' })
    } else {
      const relativeDiff = diffCents / Math.max(1, Math.abs(expectedCents))
      if (relativeDiff <= RECONCILIATION_AMOUNT_TOLERANCE_RATIO) {
        score += SCORE_AMOUNT_CLOSE
        reasons.push({ code: 'amount_close', label: `importe parecido (esperado ${(expectedCents / 100).toFixed(2)} €, real ${(movementCents / 100).toFixed(2)} €)` })
      }
    }
  }
  // amountStatus === 'unknown': nunca aporta puntos — un importe no confirmado no es una señal fuerte
  // (pedido explícito de la auditoría).

  if (dayOffset === 0) {
    score += SCORE_DATE_EXACT
    reasons.push({ code: 'date_exact', label: 'mismo día previsto' })
  } else {
    score += Math.max(0, SCORE_DATE_EXACT - SCORE_DATE_PER_DAY_PENALTY * Math.abs(dayOffset))
    const when = dayOffset > 0 ? 'después' : 'antes'
    reasons.push({ code: 'date_near', label: `cargo ${Math.abs(dayOffset)} día${Math.abs(dayOffset) === 1 ? '' : 's'} ${when} de lo previsto` })
  }

  if (movement.description && hasSharedWord(movement.description, `${occurrence.title} ${payment.provider ?? ''}`)) {
    score += SCORE_TEXT_MATCH
    reasons.push({ code: 'text_match', label: 'coincidencia en el concepto del banco' })
  }

  if (categoryName && movement.description && hasSharedWord(movement.description, categoryName)) {
    score += SCORE_CATEGORY_MATCH
    reasons.push({ code: 'category_match', label: 'coincide con la categoría prevista' })
  }

  return { score, confidence: confidenceForScore(score), reasons }
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

// Busca, para CADA ocurrencia pendiente, el mejor movimiento candidato entre los disponibles — nunca al
// revés (un mismo movimiento no puede proponerse ya usado, ver `alreadyMatchedExpenseIds`). Devuelve como
// mucho UN candidato por ocurrencia (el de mayor puntuación) y como mucho UN candidato por movimiento (si
// el mismo movimiento fuera el mejor para dos ocurrencias, se queda con la de mayor puntuación y la otra
// ocurrencia no se propone con ese movimiento — nunca se duplica una propuesta del mismo movimiento).
// Ordenado por puntuación descendente.
export function findReconciliationCandidates(
  candidates: OccurrenceForMatching[],
  movements: BankMovementForMatching[],
  alreadyMatchedExpenseIds: ReadonlySet<string>,
): ReconciliationCandidate[] {
  const availableMovements = movements.filter((m) => !m.expenseId || !alreadyMatchedExpenseIds.has(m.expenseId))

  const perOccurrenceBest: ReconciliationCandidate[] = []
  for (const { occurrence, payment, categoryName } of candidates) {
    if (occurrence.matchedExpenseId) continue
    let best: ReconciliationCandidate | null = null
    for (const movement of availableMovements) {
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
