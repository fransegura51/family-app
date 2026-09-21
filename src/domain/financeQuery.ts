// Economía por voz, SOLO CONSULTA: entender la pregunta con reglas. Aquí no se calcula nada ni se
// toca ningún dato; el resultado es una consulta estructurada que ejecutan financeCompute (cifras) y
// financeAnalysis (análisis y conclusiones).
//
// También aquí: las frases que piden ESCRIBIR en Economía (borrar, cambiar, crear, transferir...) se
// reconocen para rechazarlas con claridad y no convertirlas en consultas por accidente.
import { extractPeriod, type PeriodSpec } from '@/domain/financePeriod'
import { normalize } from '@/domain/voiceQuery'

export type FinanceMetric =
  // Fase 1: cifras
  | 'spent'
  | 'income'
  | 'saved'
  | 'top_categories'
  | 'compare'
  | 'why_changed'
  | 'price_up'
  | 'price_down'
  | 'cheapest_store'
  // Fase 2: análisis y conclusiones
  | 'analyze' // análisis abierto: el único que puede usar IA (con datos agregados)
  | 'where_money'
  | 'top_increase'
  | 'changes'
  | 'savings_trend'
  | 'why_savings'
  | 'cuts'
  | 'attention'
  | 'simpler'
  | 'category_focus'

// Las que usa el motor de análisis (financeAnalysis) en vez de las cifras sueltas de la fase 1.
export const ANALYSIS_METRICS: readonly FinanceMetric[] = ['analyze', 'where_money', 'top_increase', 'changes', 'savings_trend', 'why_savings', 'cuts', 'attention', 'simpler', 'category_focus']

export type AnalysisFocus = 'overview' | 'conclusions' | 'explain'

export interface FinanceQuery {
  metric: FinanceMetric
  period: PeriodSpec | null
  // Lo que se ha dicho tras "en/de" ("alimentación", "Mercadona", "restaurantes"); se resuelve contra
  // las categorías y tiendas REALES de la familia.
  target: string | null
  // Solo para cheapest_store.
  product: string | null
  // "compara septiembre completo con agosto completo": meses enteros en vez del mismo tramo.
  full: boolean
  // "¿Y comparado con agosto?": periodo de referencia distinto del anterior (solo análisis).
  baseline: PeriodSpec | null
  // Lo que da por hecho la pregunta ("¿por qué estamos ahorrando MENOS?"): si los datos dicen otra cosa, se corrige.
  premise: 'more' | 'less' | null
  // Para el análisis abierto: qué se pide (solo orienta el tono; no lleva texto de la persona).
  focus: AnalysisFocus | null
}

export type FinanceParse =
  | { kind: 'query'; query: FinanceQuery }
  // Escribir en Economía no está habilitado desde Hablar con PEPA.
  | { kind: 'write-refused' }
  // Es de economía pero todavía no se responde desde aquí (presupuestos, saldos...).
  | { kind: 'unsupported'; what: 'budgets' | 'balances' }
  // Suena a economía pero las reglas no lo entienden: se dice, sin mandarlo a la IA.
  | { kind: 'not-understood' }

export function cleanFinanceText(text: string): string {
  return normalize(text)
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const FINANCE_NOUNS =
  /\b(?:gasto|gastos|movimiento|movimientos|presupuesto|presupuestos|ingreso|ingresos|cuenta|cuentas|categoria|categorias|ticket|tickets|transferencia|transferencias|precio|precios|banco|bancaria|bancario)\b/
const WRITE_VERBS =
  /^(?:por favor\s+)?(?:(?:puedes|podrias|quiero que|necesito que)\s+)?(?:borra|borrar|borrame|elimina|eliminar|quita|quitar|cambia|cambiar|cambiame|modifica|modificar|edita|editar|pon|ponme|poner|crea|crear|anade|anadir|agrega|agregar|apunta|apuntame|apuntar|registra|registrar|mueve|mover|transfiere|transferir|traspasa|traspasar|paga|pagar|ingresa|ingresar|recategoriza|reclasifica|asigna|asignar|sube|baja|reduce|reducir|recorta|recortar|aumenta|aumentar|incrementa|limita|limitar|ajusta|ajustar|define|fija|activa|desactiva|invierte|invertir|cancela|cancelar|deja de pagar)\b/
// Cambiar de categoría: "cambia todos los restaurantes a ocio".
const RECLASSIFY_VERBS = /^(?:por favor\s+)?(?:cambia|cambiar|mueve|mover|pasa|pasar|recategoriza|reclasifica|asigna|asignar|convierte|convertir)\b/
const CATEGORY_WORDS = /\b(?:restaurantes?|ocio|alimentacion|transporte|vivienda|hogar|salud|ropa|regalos?|supermercados?|suscripciones)\b/
const MONEY_AMOUNT = /\b\d+(?:[.,]\d+)?\s*(?:€|euros?)/

// Palabras que hacen que una frase "suene" a economía (para no mandarla a la IA ni al calendario).
const FINANCE_TOPIC =
  /\b(?:gast\w*|ingres\w*|ahorr\w*|presupuest\w*|sald[oa]s?|barato|barata|baratos|baratas|subido|bajado|subid[oa]s?|bajad[oa]s?|precio|precios|econom\w*|analiz\w*|conclusion\w*|recort\w*|llam\w+ la atencion|categoria|categorias)\b|\b(?:se nos va|se nos esta yendo|esta yendo el dinero|que ha cambiado)\b/

export function isWriteRequest(cleaned: string): boolean {
  if (/\bcuanto\b/.test(cleaned) || /^(?:que|como|donde|por que|cual)\b/.test(cleaned)) return false
  if (WRITE_VERBS.test(cleaned) && (FINANCE_NOUNS.test(cleaned) || MONEY_AMOUNT.test(cleaned))) return true
  return RECLASSIFY_VERBS.test(cleaned) && CATEGORY_WORDS.test(cleaned)
}

export function looksLikeFinance(cleaned: string): boolean {
  return FINANCE_TOPIC.test(cleaned)
}

const GENERIC_TARGETS = new Set(['total', 'todo', 'general', 'conjunto', 'nosotros', 'familia', 'casa', 'todos'])

function stripLead(s: string): string {
  return s
    .replace(/^(?:por favor\s+|dime\s+|dime cuanto\s+|me dices\s+|sabes\s+)/, '')
    .replace(/^(?:cuanto|cuantos|cuanta|cuantas|que|cual)\s+(?:dinero\s+|plata\s+)?/, '')
    .replace(/^(?:hemos|has|he|habeis|han|llevamos|llevais|se ha|se han|estamos|estan|estais|vamos|hay)\s+/, '')
    .replace(/^(?:gastado|gastamos|gastando|gastais|gasto|gastos|ingresado|ingresamos|ingresos|ahorrado|ahorramos|ahorrando|ahorro)\s*/, '')
    .replace(/^(?:dinero|plata)\s+/, '')
    .trim()
}

// "en alimentacion" / "de comida" / "con mercadona" -> "alimentacion".
function targetFrom(rest: string): string | null {
  let s = stripLead(rest)
  s = s.replace(/^(?:\w+\s+)?(?:en|de|del|con|a)\s+/, (m) => (/^(?:en|de|del|con|a)\s+$/.test(m) ? '' : m))
  s = s.replace(/^(?:en|de|del|con|a)\s+/, '')
  s = s.replace(/^(?:la|el|los|las|mi|nuestro|nuestra|nuestros|nuestras|tienda|categoria|supermercado)\s+(?=\S)/, '')
  s = s.replace(/\s+(?:en total|en general|en conjunto)$/, '')
  s = s.replace(/^(?:en|de)\s+/, '').trim()
  if (!s || GENERIC_TARGETS.has(s)) return null
  return s
}

const PRODUCT_STOP =
  /\b(?:donde|en que|que|tienda|tiendas|supermercado|compramos|compro|comprais|comprar|se|sale|es|esta|estan|mas|barato|barata|baratos|baratas|economico|economica|el|la|los|las|un|una|de|del|en|cuesta)\b/g

function metricOf(n: string): FinanceMetric | null {
  if (/\bpor que\b.*\bahorr\w*/.test(n)) return 'why_savings'
  if (/\bpor que\b.*\b(?:gast\w*|cambiado|subido|aumentado)\b|\bpor que ha cambiado (?:mi|el|nuestro)\b|\bexplic\w+\b.*\bgast\w*/.test(n)) return 'why_changed'
  if (/\b(?:productos?|cosas|articulos?|alimentos?)\b.*\b(?:subid[oa]s?|suben|subir|aumentad[oa]s?|encarecid[oa]s?)\b|\b(?:subid[oa]s?|suben)\b.*\bprecios?\b|\bmas caros?\b/.test(n)) return 'price_up'
  if (/\b(?:productos?|cosas|articulos?|alimentos?)\b.*\b(?:bajad[oa]s?|bajan|abaratad[oa]s?)\b|\b(?:bajad[oa]s?|bajan)\b.*\bprecios?\b/.test(n)) return 'price_down'
  if (/\b(?:donde|en que tienda|que tienda|en que supermercado)\b.*\b(?:barat[oa]s?|economic[oa]s?)\b|\bmas barat[oa]s?\b/.test(n)) return 'cheapest_store'

  // Fase 2: análisis y conclusiones.
  if (/\b(?:analiza\w*|analisis|conclusiones|explicame (?:nuestra |la )?(?:economia|situacion)|resumen (?:de )?(?:nuestra |la )?economia|que esta pasando|que pasa con (?:nuestros|los) gastos|como (?:vamos|va|esta) (?:de dinero|nuestra economia|la economia))\b/.test(n)) return 'analyze'
  if (/\b(?:recort\w+|reducir|podemos ahorrar|podriamos ahorrar|ahorrar (?:un poco )?mas|como ahorrar|donde ahorrar)\b/.test(n)) return 'cuts'
  if (/\bahorr(?:ando|amos)\b/.test(n) && /\b(?:mas|menos)\b/.test(n)) return 'savings_trend'
  if (/\bllam\w+ la atencion\b|\balgo raro\b/.test(n)) return 'attention'
  if (/\bse nos (?:esta )?(?:va|yendo)\b|\besta yendo el dinero\b|\bdemasiado\b/.test(n)) return 'where_money'
  if (/\bque categoria\b.*\b(?:aument|sub|crec)\w*|\bque (?:ha )?(?:aumentado|subido) mas\b/.test(n)) return 'top_increase'
  if (/\bque ha cambiado\b|\bque cambios\b/.test(n)) return 'changes'

  if (/\ben que\b.*\b(?:gast\w+)\b.*\bmas\b|\ben que\b.*\bgast\w+\b|\bque\b.*\bgast\w+\b.*\bmas\b|\bdonde\b.*\bgast\w+\b.*\bmas\b/.test(n)) return 'top_categories'
  if (/\bgast\w*\b.*\b(?:mas|menos)\b.*\bque\b|\b(?:mas|menos)\b.*\bque\b.*\b(?:mes|semana|ano)\b.*\bgast/.test(n) || /\bcomparad?\w*\b.*\bgast/.test(n) || /\bcompar\w+\b/.test(n)) return 'compare'
  if (/\bahorr\w+\b/.test(n)) return 'saved'
  if (/\bingres\w+\b/.test(n) && !/\bgast/.test(n)) return 'income'
  if (/\bgast\w*\b/.test(n)) return 'spent'
  return null
}

const BASELINE_CLAUSE = /\b(?:respecto (?:a|al|del?)|frente (?:a|al)|comparad[oa] (?:con|a|al)|comparando con|en comparacion (?:con|al)|contra)\s+(.+)$/

function premiseOf(n: string): 'more' | 'less' | null {
  if (/\bmas o menos\b|\bmenos o mas\b/.test(n)) return null
  const more = /\bmas\b/.test(n)
  const less = /\bmenos\b/.test(n)
  if (more && !less) return 'more'
  if (less && !more) return 'less'
  return null
}

function focusOf(n: string): AnalysisFocus {
  if (/\bconclusiones\b/.test(n)) return 'conclusions'
  if (/\bexplic\w+\b/.test(n)) return 'explain'
  return 'overview'
}

export function baseQuery(metric: FinanceMetric, over: Partial<FinanceQuery> = {}): FinanceQuery {
  return { metric, period: null, target: null, product: null, full: false, baseline: null, premise: null, focus: null, ...over }
}

export function parseFinanceQuestion(text: string, today: Date): FinanceParse | null {
  const n = cleanFinanceText(text)
  if (!n) return null

  if (isWriteRequest(n)) return { kind: 'write-refused' }
  if (!looksLikeFinance(n)) return null

  if (/\bpresupuest\w*\b/.test(n)) return { kind: 'unsupported', what: 'budgets' }
  if (/\bsald[oa]s?\b/.test(n) || /\bcuanto (?:dinero )?(?:tenemos|tengo|hay|queda)\b.*\b(?:cuenta|cuentas|banco)\b/.test(n)) return { kind: 'unsupported', what: 'balances' }

  const metric = metricOf(n)
  if (!metric) return { kind: 'not-understood' }
  const analysis = ANALYSIS_METRICS.includes(metric) || metric === 'why_changed'

  // Un periodo de referencia dicho con "respecto a / frente a / comparado con" no es el periodo consultado.
  let subjectText = n
  let baseline: PeriodSpec | null = null
  if (analysis) {
    const clause = BASELINE_CLAUSE.exec(subjectText)
    if (clause) {
      const b = extractPeriod(clause[1], today)
      if (b) {
        baseline = b.spec
        subjectText = subjectText.slice(0, clause.index).trim()
      }
    }
  }
  // En "¿Hemos gastado más que el mes pasado?" el periodo consultado es el actual y "el mes pasado" es
  // solo la referencia: lo que va tras "más/menos que" no se toma como periodo de la consulta.
  if (metric === 'compare') subjectText = subjectText.replace(/\b(?:mas|menos)\s+(?:que|de lo que)\b.*$/, ' ').replace(/\s+/g, ' ').trim()

  const match = extractPeriod(subjectText, today)
  const period = match?.spec ?? null
  const rest = match?.rest ?? subjectText
  const full = /\bcomplet[oa]s?\b/.test(n)

  if (metric === 'cheapest_store') {
    // Lo que queda sin las palabras de la pregunta es el producto: "queso", "queso rallado".
    const term = rest.replace(PRODUCT_STOP, ' ').replace(/\s+/g, ' ').trim()
    if (!term) return { kind: 'not-understood' }
    return { kind: 'query', query: baseQuery(metric, { product: term }) }
  }

  const target = metric === 'spent' ? targetFrom(rest) : null
  const premise = metric === 'savings_trend' || metric === 'why_savings' ? premiseOf(n) : null
  return {
    kind: 'query',
    query: baseQuery(metric, { period, target, full, baseline, premise, focus: metric === 'analyze' ? focusOf(n) : null }),
  }
}

// ─── Continuaciones cortas: "¿En qué?", "¿Y el mes pasado?", "¿Solo alimentación?", "¿Y Mercadona?",
// "¿Por qué?", "¿En qué categoría?", "¿Y comparado con agosto?", "Explícamelo más sencillo" ───
// Solo se interpretan con una consulta anterior VIVA (contexto corto, con caducidad; ver pepa/finance).
const BREAKDOWN = /^(?:y\s+)?(?:en que(?:\s+(?:lo\s+)?(?:hemos|habeis|has|he)?\s*(?:gastado|gastamos))?|desglosa(?:me)?(?:lo)?|desglose|detalle|detallamelo|detallalo|por categorias?|que categorias|en que categorias|en que se ha ido)$/
const ONLY = /^(?:y\s+)?(?:solo|solamente|unicamente|y solo)\s+(?:en\s+|de\s+|con\s+)?(.+)$/
const AND_TARGET = /^y\s+(?:en\s+|de\s+|con\s+|a\s+)?(.+)$/
const WHY = /^(?:y\s+)?por que(?:\s+(?:ha\s+pasado|es|ha\s+sido|pasa|ha\s+cambiado))?$/
const WHICH_CATEGORY = /^(?:y\s+)?(?:en\s+)?que categoria(?:\s+(?:ha\s+sido|es|fue))?$/
const SIMPLER =
  /^(?:explicamelo|explicamela|dimelo|dilo|explicalo|resumemelo|resumelo)(?:\s+(?:de forma|de manera|mas|un poco mas|algo mas))*\s*(?:sencill[oa]|facil|simple|claro|corto|breve|resumido)?$|^(?:mas sencillo|en sencillo|mas simple|mas facil|mas claro|mas corto|resumido)$/
const VS_BASELINE = /^(?:y\s+)?(?:comparad[oa] (?:con|a|al)|frente a|respecto a|contra|en comparacion con)\s+(.+)$/

function isAnalysisMetric(m: FinanceMetric): boolean {
  return ANALYSIS_METRICS.includes(m)
}

export function parseFinanceFollowUp(text: string, previous: FinanceQuery, today: Date): FinanceQuery | null {
  const n = cleanFinanceText(text)
  if (!n) return null
  const prevIsAnalysis = isAnalysisMetric(previous.metric) || previous.metric === 'why_changed'

  if (SIMPLER.test(n)) return { ...previous, metric: 'simpler' }

  if (WHY.test(n)) {
    if (previous.metric === 'savings_trend' || previous.metric === 'why_savings') return { ...previous, metric: 'why_savings' }
    if (previous.metric === 'price_up' || previous.metric === 'price_down' || previous.metric === 'cheapest_store') return null
    return { ...previous, metric: 'why_changed', target: null }
  }
  if (WHICH_CATEGORY.test(n)) return { ...previous, metric: 'top_increase', target: null }

  if (BREAKDOWN.test(n) && (previous.metric === 'spent' || previous.metric === 'income' || previous.metric === 'compare' || previous.metric === 'top_categories' || prevIsAnalysis)) {
    return { ...previous, metric: prevIsAnalysis && previous.metric !== 'category_focus' ? 'where_money' : 'top_categories' }
  }

  // "¿Y comparado con agosto?": otro periodo de referencia.
  const vs = VS_BASELINE.exec(n)
  if (vs) {
    const b = extractPeriod(vs[1], today)
    if (b && b.rest.replace(/\b(?:el|la|en|de|del|y)\b/g, '').trim() === '') {
      return { ...previous, metric: prevIsAnalysis ? previous.metric : 'changes', baseline: b.spec }
    }
  }

  // "¿Y el mes pasado?" / "y en agosto" / "el mes pasado": mismo asunto, otro periodo.
  const stripped = n.replace(/^y\s+(?:en\s+|durante\s+|del\s+|de\s+)?/, '')
  const period = extractPeriod(stripped, today)
  if (period && /^(?:y\s|el\s|la\s|en\s|este\s|esta\s|desde\s|los\s|ultimos|ultimas)/.test(n) && period.rest.replace(/\b(?:el|la|en|de|del|y)\b/g, '').trim() === '') {
    return { ...previous, period: period.spec, baseline: null }
  }

  // "¿Solo alimentación?" / "¿Y Mercadona?": mismo periodo, otro filtro.
  const filterMetric = (): FinanceMetric => (prevIsAnalysis ? 'category_focus' : previous.metric === 'top_categories' ? 'spent' : previous.metric)
  const only = ONLY.exec(n)
  if (only) return { ...previous, target: only[1].replace(/^(?:la|el|los|las)\s+/, ''), metric: filterMetric() }
  const and = AND_TARGET.exec(n)
  if (and && !extractPeriod(and[1], today)) {
    const t = and[1].replace(/^(?:la|el|los|las)\s+/, '').trim()
    if (t && t.split(' ').length <= 4) return { ...previous, target: t, metric: filterMetric() }
  }
  return null
}
