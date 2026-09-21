// Economía en "Hablar con PEPA": SOLO CONSULTA. El código calcula con los datos reales
// (domain/financeCompute) y contesta; no se llama a la IA y no se escribe nada.
//
// Contexto de conversación (para "¿En qué?", "¿Y el mes pasado?", "¿Solo alimentación?", "¿Y Mercadona?"):
// se recuerda ÚNICAMENTE la última consulta estructurada (métrica, periodo, filtro), en memoria del
// navegador y solo 10 minutos. Se borra al pasar a otra tarea. No se guarda ni se envía a ningún sitio.
import { listBankConnections } from '@/data/bank'
import { getAccountsMode, getFinanceMonthStartDay } from '@/data/family'
import { listBudgetCategories, listBudgets, listExpenses } from '@/data/finance'
import { listAllProductPrices, listProducts } from '@/data/products'
import { listReceipts } from '@/data/receipts'
import { listShoppingStores } from '@/data/shoppingStores'
import { supabase } from '@/data/supabaseClient'
import { requestFinanceAnalysis } from '@/services/financeAnalysis'
import { classifyFinanceIntent } from '@/services/financeIntent'
import { queryFromIntent } from '@/domain/financeIntent'
import type { IntentOutput } from '../../supabase/functions/_shared/ai/purposes/financeIntentCore.ts'
import { recordPepaAnswer } from '@/services/pepaUsage'
import { runFinanceQuery, type AiAnalyzer } from '@/domain/financeAnswer'
import type { FinanceData } from '@/domain/financeCompute'
import { ANALYSIS_METRICS, parseFinanceFollowUp, parseFinanceQuestion, type FinanceQuery } from '@/domain/financeQuery'

export const FINANCE_WRITE_REFUSED =
  'Desde 💬 Hablar con PEPA solo puedo preparar presupuestos (con tu confirmación). No puedo borrar ni cambiar gastos, ingresos, categorías ni movimientos, y nunca hago transferencias ni pagos. Puedes hacerlo tú desde la pantalla de Economía.'
export const FINANCE_NOT_UNDERSTOOD =
  'No he entendido esa consulta de Economía. Prueba, por ejemplo: «cuánto hemos gastado este mes», «en qué hemos gastado más», «estamos gastando más que el mes pasado» o «qué productos han subido de precio».'
export const FINANCE_NO_ACCESS = 'Economía no está disponible para tu perfil.'
const FINANCE_FAILED = 'No he podido consultar Economía ahora mismo. Inténtalo de nuevo en un momento.'

const CONTEXT_TTL_MS = 10 * 60 * 1000
let context: { query: FinanceQuery; at: number; items: string[] } | null = null

export function forgetFinanceContext(): void {
  context = null
}

// Tras guardar un presupuesto, "¿cuánto me queda?" se refiere a él.
export function rememberFinanceQuery(query: FinanceQuery): void {
  context = { query, at: Date.now(), items: [] }
}

export function financeContextQuery(): FinanceQuery | null {
  return context && Date.now() - context.at <= CONTEXT_TTL_MS ? context.query : null
}

// Lo último que PEPA nombró por orden (categorías): permite "¿y cuál es la segunda?". Solo nombres, en memoria.
function contextItems(): string[] {
  return context && Date.now() - context.at <= CONTEXT_TTL_MS ? context.items : []
}

export interface FinanceDeps {
  canAccess(): Promise<boolean>
  load(needTickets: boolean, needBudgets?: boolean): Promise<FinanceData>
  // Solo el análisis abierto la usa (hechos agregados -> respuesta validada, o null).
  ai?: AiAnalyzer
  // Solo cuando las reglas no entienden la frase con seguridad: la IA la ESTRUCTURA (intención, periodo, filtro).
  // Nunca calcula ni ve datos; lo que devuelve se valida y el código lo resuelve contra los datos reales.
  interpret?(text: string, today: Date): Promise<IntentOutput | null>
  // Contador de respuestas (solo números): función usada y si necesitó IA.
  record?(fn: string, usedAi: boolean): void
}

// Mismo criterio que el menú de la app: si el perfil tiene secciones limitadas y 'dinero' no
// está entre ellas, Economía no se enseña (ni se consulta por voz).
// Un fallo de red o de sesión NO es "sin acceso": se lanza y PEPA dice que no ha podido consultar. Solo un
// perfil leído correctamente con las secciones limitadas devuelve false.
export async function canAccessFinance(): Promise<boolean> {
  const { data: userResult, error: userError } = await supabase.auth.getUser()
  if (userError || !userResult.user) throw new Error('sin sesión')
  const { data, error } = await supabase.from('profiles').select('allowed_sections').eq('id', userResult.user.id).maybeSingle()
  if (error || !data) throw new Error('perfil no disponible')
  const sections = data.allowed_sections as string[] | null
  return sections == null || sections.includes('dinero')
}

async function loadFinanceData(needTickets: boolean, needBudgets = false): Promise<FinanceData> {
  const [expenses, categories, monthStartDay, stores, connections] = await Promise.all([
    listExpenses(),
    listBudgetCategories(),
    getFinanceMonthStartDay(),
    listShoppingStores(),
    listBankConnections().catch(() => []),
  ])
  const [prices, products, receipts] = needTickets ? await Promise.all([listAllProductPrices(), listProducts(), listReceipts()]) : [[], [], []]
  const [budgets, accountsMode] = needBudgets ? await Promise.all([listBudgets(), getAccountsMode()]) : [undefined, undefined]
  const today = new Date().toISOString().slice(0, 10)
  return {
    budgets,
    accountsMode,
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

const defaultDeps: FinanceDeps = { canAccess: canAccessFinance, load: loadFinanceData, ai: requestFinanceAnalysis, interpret: classifyFinanceIntent, record: recordPepaAnswer }

const NEEDS_TICKETS = new Set(['why_changed', 'price_up', 'price_down', 'cheapest_store', 'analyze', 'changes', 'attention', 'where_money', 'simpler', 'category_focus'])

// Devuelve el texto de la respuesta, o null si la frase no es de Economía (entonces sigue su camino).
export async function handleFinanceText(text: string, today: Date = new Date(), deps: FinanceDeps = defaultDeps): Promise<string | null> {
  const parsed = parseFinanceQuestion(text, today)
  const previous = financeContextQuery()

  let query: FinanceQuery | null = null
  let interpretedByAi = false
  if (parsed) {
    if (parsed.kind === 'write-refused') return FINANCE_WRITE_REFUSED
    if (parsed.kind === 'unsupported') {
      return parsed.what === 'budgets'
        ? 'Los presupuestos todavía no los consulto desde aquí; míralos en la pantalla de Economía.'
        : 'Los saldos de las cuentas todavía no los consulto desde aquí; míralos en la pantalla de Economía.'
    }
    if (parsed.kind === 'not-understood' || (parsed.kind === 'query' && parsed.uncertain)) {
      // Las reglas no ubican la frase con seguridad. Antes de rendirse, la IA puede ESTRUCTURARLA (nunca calcular).
      try {
        if (!(await deps.canAccess())) return FINANCE_NO_ACCESS
        const out = deps.interpret ? await deps.interpret(text, today) : null
        if (out && out.intent === 'none') return null // no es de economía: sigue su camino
        const fromAi = out ? queryFromIntent(out, today) : null
        if (!fromAi) return FINANCE_NOT_UNDERSTOOD
        query = fromAi
        interpretedByAi = true
      } catch {
        return FINANCE_FAILED
      }
    } else {
      query = parsed.query
    }
    // "¿Y cuánto hemos ingresado?" justo después de hablar de agosto: se mantiene el periodo. Igual con
    // un análisis seguido de otra pregunta de análisis ("¿qué podríamos recortar?"): mismo periodo y misma referencia.
    const analysis = ANALYSIS_METRICS.includes(query.metric) || query.metric === 'why_changed'
    if (previous && !query.period && (/^\s*[¿¡]?\s*y\b/i.test(text) || analysis)) query = { ...query, period: previous.period, baseline: query.baseline ?? (analysis ? previous.baseline : null) }
  } else if (previous) {
    query = parseFinanceFollowUp(text, previous, today, contextItems())
  }
  if (!query) return null

  try {
    if (!(await deps.canAccess())) return FINANCE_NO_ACCESS
    const data = await deps.load(NEEDS_TICKETS.has(query.metric), query.metric === 'budget_left')
    const run = await runFinanceQuery(query, data, today, deps.ai)
    // El contexto recuerda la consulta, salvo "explícamelo más sencillo": eso reformula, no cambia de tema.
    if (query.metric !== 'simpler') context = { query: run.query, at: Date.now(), items: run.items ?? contextItems() }
    else if (context) context = { query: context.query, at: Date.now(), items: context.items }
    deps.record?.(run.fn, run.usedAi || interpretedByAi)
    return run.text
  } catch {
    return FINANCE_FAILED
  }
}
