// Economía en "Hablar con PEPA": SOLO CONSULTA. El código calcula con los datos reales
// (domain/financeCompute) y contesta; no se llama a la IA y no se escribe nada.
//
// Contexto de conversación (para "¿En qué?", "¿Y el mes pasado?", "¿Solo alimentación?", "¿Y Mercadona?"):
// se recuerda ÚNICAMENTE la última consulta estructurada (métrica, periodo, filtro), en memoria del
// navegador y solo 10 minutos. Se borra al pasar a otra tarea. No se guarda ni se envía a ningún sitio.
import { listBankConnections } from '@/data/bank'
import { getFinanceMonthStartDay } from '@/data/family'
import { listBudgetCategories, listExpenses } from '@/data/finance'
import { listAllProductPrices, listProducts } from '@/data/products'
import { listReceipts } from '@/data/receipts'
import { listShoppingStores } from '@/data/shoppingStores'
import { supabase } from '@/data/supabaseClient'
import { requestFinanceAnalysis } from '@/services/financeAnalysis'
import { recordPepaAnswer } from '@/services/pepaUsage'
import { runFinanceQuery, type AiAnalyzer } from '@/domain/financeAnswer'
import type { FinanceData } from '@/domain/financeCompute'
import { ANALYSIS_METRICS, parseFinanceFollowUp, parseFinanceQuestion, type FinanceQuery } from '@/domain/financeQuery'

export const FINANCE_WRITE_REFUSED =
  'Economía es solo de consulta desde 💬 Hablar con PEPA por ahora: no puedo borrar, cambiar ni crear gastos, ingresos, presupuestos, categorías ni movimientos. Puedes hacerlo tú desde la pantalla de Economía.'
export const FINANCE_NOT_UNDERSTOOD =
  'No he entendido esa consulta de Economía. Prueba, por ejemplo: «cuánto hemos gastado este mes», «en qué hemos gastado más», «estamos gastando más que el mes pasado» o «qué productos han subido de precio».'
export const FINANCE_NO_ACCESS = 'Economía no está disponible para tu perfil.'
const FINANCE_FAILED = 'No he podido consultar Economía ahora mismo. Inténtalo de nuevo en un momento.'

const CONTEXT_TTL_MS = 10 * 60 * 1000
let context: { query: FinanceQuery; at: number } | null = null

export function forgetFinanceContext(): void {
  context = null
}

export function financeContextQuery(): FinanceQuery | null {
  return context && Date.now() - context.at <= CONTEXT_TTL_MS ? context.query : null
}

export interface FinanceDeps {
  canAccess(): Promise<boolean>
  load(needTickets: boolean): Promise<FinanceData>
  // Solo el análisis abierto la usa (hechos agregados -> respuesta validada, o null).
  ai?: AiAnalyzer
  // Contador de respuestas (solo números): función usada y si necesitó IA.
  record?(fn: string, usedAi: boolean): void
}

// Mismo criterio que el menú de la app: si el perfil tiene secciones limitadas y 'dinero' no
// está entre ellas, Economía no se enseña (ni se consulta por voz).
// Un fallo de red o de sesión NO es "sin acceso": se lanza y PEPA dice que no ha podido consultar. Solo un
// perfil leído correctamente con las secciones limitadas devuelve false.
async function canAccessFinance(): Promise<boolean> {
  const { data: userResult, error: userError } = await supabase.auth.getUser()
  if (userError || !userResult.user) throw new Error('sin sesión')
  const { data, error } = await supabase.from('profiles').select('allowed_sections').eq('id', userResult.user.id).maybeSingle()
  if (error || !data) throw new Error('perfil no disponible')
  const sections = data.allowed_sections as string[] | null
  return sections == null || sections.includes('dinero')
}

async function loadFinanceData(needTickets: boolean): Promise<FinanceData> {
  const [expenses, categories, monthStartDay, stores, connections] = await Promise.all([
    listExpenses(),
    listBudgetCategories(),
    getFinanceMonthStartDay(),
    listShoppingStores(),
    listBankConnections().catch(() => []),
  ])
  const [prices, products, receipts] = needTickets ? await Promise.all([listAllProductPrices(), listProducts(), listReceipts()]) : [[], [], []]
  const today = new Date().toISOString().slice(0, 10)
  return {
    expenses,
    categories,
    receipts,
    prices,
    products,
    storeNames: stores.map((s) => s.name),
    monthStartDay,
    bankStale: connections.some((c) => c.status !== 'active' || (c.validUntil != null && c.validUntil.slice(0, 10) < today)),
  }
}

const defaultDeps: FinanceDeps = { canAccess: canAccessFinance, load: loadFinanceData, ai: requestFinanceAnalysis, record: recordPepaAnswer }

const NEEDS_TICKETS = new Set(['why_changed', 'price_up', 'price_down', 'cheapest_store', 'analyze', 'changes', 'attention', 'where_money', 'simpler', 'category_focus'])

// Devuelve el texto de la respuesta, o null si la frase no es de Economía (entonces sigue su camino).
export async function handleFinanceText(text: string, today: Date = new Date(), deps: FinanceDeps = defaultDeps): Promise<string | null> {
  const parsed = parseFinanceQuestion(text, today)
  const previous = financeContextQuery()

  let query: FinanceQuery | null = null
  if (parsed) {
    if (parsed.kind === 'write-refused') return FINANCE_WRITE_REFUSED
    if (parsed.kind === 'unsupported') {
      return parsed.what === 'budgets'
        ? 'Los presupuestos todavía no los consulto desde aquí; míralos en la pantalla de Economía.'
        : 'Los saldos de las cuentas todavía no los consulto desde aquí; míralos en la pantalla de Economía.'
    }
    if (parsed.kind === 'not-understood') return FINANCE_NOT_UNDERSTOOD
    query = parsed.query
    // "¿Y cuánto hemos ingresado?" justo después de hablar de agosto: se mantiene el periodo. Igual con
    // un análisis seguido de otra pregunta de análisis ("¿qué podríamos recortar?"): mismo periodo y misma referencia.
    const analysis = ANALYSIS_METRICS.includes(query.metric) || query.metric === 'why_changed'
    if (previous && !query.period && (/^\s*[¿¡]?\s*y\b/i.test(text) || analysis)) query = { ...query, period: previous.period, baseline: query.baseline ?? (analysis ? previous.baseline : null) }
  } else if (previous) {
    query = parseFinanceFollowUp(text, previous, today)
  }
  if (!query) return null

  try {
    if (!(await deps.canAccess())) return FINANCE_NO_ACCESS
    const data = await deps.load(NEEDS_TICKETS.has(query.metric))
    const run = await runFinanceQuery(query, data, today, deps.ai)
    // El contexto recuerda la consulta, salvo "explícamelo más sencillo": eso reformula, no cambia de tema.
    if (query.metric !== 'simpler') context = { query: run.query, at: Date.now() }
    else if (context) context = { query: context.query, at: Date.now() }
    deps.record?.(run.fn, run.usedAi)
    return run.text
  } catch {
    return FINANCE_FAILED
  }
}
