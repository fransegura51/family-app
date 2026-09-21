// Economía por voz, SOLO CONSULTA: entender la pregunta. Aquí no se calcula nada ni se toca ningún
// dato; el resultado es una consulta estructurada que ejecutan financeCompute (cifras) y
// financeAnalysis (análisis y conclusiones).
//
// ARQUITECTURA (en este orden, nunca al revés):
//   1. NORMALIZAR: sin acentos, sin signos, sin "Pepa" ni muletillas.
//   2. INTENCIÓN: se detectan SEÑALES léxicas de la frase completa (gastar, analizar, comparar, por qué,
//      recortar...) y una tabla de decisión elige la métrica. Todavía no se mira ningún filtro.
//   3. PERIODO: se extrae y se QUITA el periodo ("este mes", "el mes pasado", "en agosto"...).
//   4. CANDIDATO DE FILTRO: de lo que queda se descartan las palabras vacías (artículos, preposiciones,
//      verbos y palabras de la propia pregunta). Lo que sobra, si sobra algo, es el candidato ("luz",
//      "restaurantes", "mercadona"). NUNCA se le pasa "el resto de la frase" al resolvedor.
//   5. RESOLUCIÓN contra los datos reales (categorías, tiendas, conceptos): en financeCompute.
//
// Si con esto no hay seguridad suficiente (no hay intención clara o quedan demasiadas palabras sueltas),
// la consulta se marca `uncertain` y quien llama puede pedir a la IA que ESTRUCTURE la frase (nunca que
// calcule); el resultado se vuelve a validar (ver financeIntent).
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
  | 'why_cuts' // "¿por qué?" tras una sugerencia de dónde ajustar
  | 'cuts'
  | 'attention'
  | 'simpler'
  | 'category_focus'
  // Presupuestos: cuánto queda del presupuesto del mes (consulta; los cambios van por pepa/financeActions).
  | 'budget_left'

// Las que usa el motor de análisis (financeAnalysis) en vez de las cifras sueltas de la fase 1.
export const ANALYSIS_METRICS: readonly FinanceMetric[] = ['analyze', 'where_money', 'top_increase', 'changes', 'savings_trend', 'why_savings', 'why_cuts', 'cuts', 'attention', 'simpler', 'category_focus']

export type AnalysisFocus = 'overview' | 'conclusions' | 'explain'

export interface FinanceQuery {
  metric: FinanceMetric
  period: PeriodSpec | null
  // El CANDIDATO de filtro ("luz", "alimentacion", "mercadona"): solo las palabras con contenido, ya sin
  // verbos ni relleno. Se resuelve contra las categorías, tiendas y conceptos REALES de la familia.
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
  // Cómo se cuenta: 'brief' (por defecto: corto, natural, casi sin cifras) o 'full' (importes, diferencias,
  // porcentajes y desglose). Solo cambia la PRESENTACIÓN; el cálculo es el mismo.
  detail: 'brief' | 'full'
}

export type FinanceParse =
  // `uncertain`: la intención está, pero la frase trae más cosas de las que las reglas saben ubicar.
  | { kind: 'query'; query: FinanceQuery; uncertain?: boolean }
  // Escribir en Economía no está habilitado desde Hablar con PEPA.
  | { kind: 'write-refused' }
  // Es de economía pero todavía no se responde desde aquí (presupuestos, saldos...).
  | { kind: 'unsupported'; what: 'budgets' | 'balances' }
  // Suena a economía pero las reglas no la entienden: se dice o se estructura con IA, nunca se adivina.
  | { kind: 'not-understood' }

// ─── 1. Normalizar ───

export function cleanFinanceText(text: string): string {
  return normalize(text)
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// "Pepa," / "oye Pepa" / "vale Pepa" al principio o en medio de lo dictado. No es parte de la pregunta.
export function withoutWakeWord(cleaned: string): string {
  return cleaned
    .replace(/\b(?:oye|vale|hola|hey)?\s*pep[ae]\b\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Escribir en Economía: rechazado ───

const FINANCE_NOUNS =
  /\b(?:gasto|gastos|movimiento|movimientos|presupuesto|presupuestos|ingreso|ingresos|cuenta|cuentas|categoria|categorias|ticket|tickets|transferencia|transferencias|precio|precios|banco|bancaria|bancario)\b/
const WRITE_VERBS =
  /^(?:por favor\s+)?(?:(?:puedes|podrias|quiero que|necesito que)\s+)?(?:borra|borrar|borrame|elimina|eliminar|quita|quitar|cambia|cambiar|cambiame|modifica|modificar|edita|editar|pon|ponme|poner|crea|crear|anade|anadir|agrega|agregar|apunta|apuntame|apuntar|registra|registrar|mueve|mover|transfiere|transferir|traspasa|traspasar|paga|pagar|ingresa|ingresar|recategoriza|reclasifica|asigna|asignar|sube|baja|reduce|reducir|recorta|recortar|aumenta|aumentar|incrementa|limita|limitar|ajusta|ajustar|define|fija|activa|desactiva|invierte|invertir|cancela|cancelar|deja de pagar|etiqueta|etiquetar|marca|marcar|clasifica|clasificar|categoriza|categorizar)\b/
// Cambiar de categoría: "cambia todos los restaurantes a ocio".
const RECLASSIFY_VERBS = /^(?:por favor\s+)?(?:cambia|cambiar|mueve|mover|pasa|pasar|recategoriza|reclasifica|asigna|asignar|convierte|convertir)\b/
const CATEGORY_WORDS = /\b(?:restaurantes?|ocio|alimentacion|transporte|vivienda|hogar|salud|ropa|regalos?|supermercados?|suscripciones)\b/
const MONEY_AMOUNT = /\b\d+(?:[.,]\d+)?\s*(?:€|euros?)/

export function isWriteRequest(cleaned: string): boolean {
  if (/\bcuanto\b/.test(cleaned) || /^(?:que|como|donde|por que|cual)\b/.test(cleaned)) return false
  if (WRITE_VERBS.test(cleaned) && (FINANCE_NOUNS.test(cleaned) || MONEY_AMOUNT.test(cleaned))) return true
  return RECLASSIFY_VERBS.test(cleaned) && CATEGORY_WORDS.test(cleaned)
}

// Palabras que hacen que una frase "suene" a economía (para no mandarla al calendario ni a la compra).
const FINANCE_TOPIC =
  /\b(?:gast\w*|ingres\w*|ahorr\w*|presupuest\w*|sald[oa]s?|barato|barata|baratos|baratas|subido|bajado|subid[oa]s?|bajad[oa]s?|precio|precios|econom\w*|anali[zc]\w*|conclusion\w*|recort\w*|llam\w+ la atencion|categoria|categorias)\b|\b(?:se nos va|se nos esta yendo|esta yendo el dinero|que ha cambiado)\b|\bcuanto\b.*\b(?:pagad[oa]s?|pagamos|pagas|pagais)\b/

export function looksLikeFinance(cleaned: string): boolean {
  return FINANCE_TOPIC.test(cleaned)
}

// ─── 2. Intención: señales léxicas + tabla de decisión ───

interface Signals {
  why: boolean
  explain: boolean
  spend: boolean
  save: boolean
  saveNow: boolean // ahorrando / ahorramos
  saveInf: boolean // ahorrar
  income: boolean
  change: boolean
  rise: boolean
  fall: boolean
  price: boolean
  productWord: boolean
  cheap: boolean
  where: boolean
  analyze: boolean
  economy: boolean
  whatsHappening: boolean
  cut: boolean
  attention: boolean
  goingWhere: boolean
  categoryWord: boolean
  more: boolean
  less: boolean
  enQue: boolean
}

function signalsOf(n: string): Signals {
  const t = (re: RegExp) => re.test(n)
  return {
    why: t(/\bpor que\b/),
    explain: t(/\bexplic\w+/),
    spend: t(/\bgast\w*|\bpagad[oa]s?\b|\bpagamos\b|\bdesembols\w+/),
    save: t(/\bahorr\w+/),
    saveNow: t(/\bahorr(?:ando|amos)\b/),
    saveInf: t(/\bahorrar\b/),
    income: t(/\bingres\w+|\bcobrad[oa]s?\b|\bsueldos?\b|\bnominas?\b/),
    change: t(/\bcambiado\b|\bcambios\b|\bque cambia\b/),
    rise: t(/\bsubid[oa]s?\b|\bsuben\b|\bsubir\b|\baument\w+|\bencarec\w+|\bcrec\w+/),
    fall: t(/\bbajad[oa]s?\b|\bbajan\b|\babarat\w+/),
    price: t(/\bprecios?\b/),
    productWord: t(/\b(?:productos?|cosas|articulos?|alimentos?)\b/),
    cheap: t(/\bbarat[oa]s?\b|\beconomic[oa]s?\b/),
    where: t(/\b(?:donde|en que tienda|que tienda|en que supermercado)\b/),
    analyze: t(/\banali[zc]\w*|\banalisis\b|\bconclusion\w*|\bsituacion\b|\bpanorama\b|\bresum\w+/),
    economy: t(/\beconomia\b|\bfinanzas\b|\bdinero\b/),
    whatsHappening: t(/\bque esta pasando\b|\bque pasa con\b|\bcomo (?:vamos|va|esta|estamos)\b/),
    cut: t(/\brecort\w+|\breduc\w+/),
    attention: t(/\bllam\w+ la atencion\b|\balgo raro\b|\bextran\w+/),
    goingWhere: t(/\bse nos (?:esta )?(?:va|yendo)\b|\bestamos perdiendo\b|\byendo el dinero\b|\bdemasiado\b/),
    categoryWord: t(/\bcategorias?\b/),
    more: t(/\bmas\b/),
    less: t(/\bmenos\b/),
    enQue: t(/\ben que\b/),
  }
}

function metricOf(n: string): FinanceMetric | null {
  const s = signalsOf(n)

  if (s.why && s.save) return 'why_savings'
  if ((s.why && (s.spend || s.change || s.rise)) || (s.explain && s.spend) || /\bpor que ha cambiado\b/.test(n)) return 'why_changed'

  // Precios de productos (tickets)
  if ((s.rise && (s.productWord || s.price)) || /\bmas caros?\b/.test(n)) return 'price_up'
  if (s.fall && (s.productWord || s.price)) return 'price_down'
  if (s.cheap && (s.where || /\bmas barat[oa]s?\b/.test(n))) return 'cheapest_store'

  // Análisis y conclusiones
  if (s.analyze || (s.explain && s.economy) || (s.whatsHappening && (s.spend || s.economy || s.analyze))) return 'analyze'
  if (s.cut || s.saveInf) return 'cuts'
  if (s.saveNow && (s.more || s.less)) return 'savings_trend'
  if (s.attention) return 'attention'
  if (s.goingWhere) return 'where_money'
  if ((s.categoryWord && s.rise) || (s.rise && s.more && !s.productWord && !s.price)) return 'top_increase'
  if (s.change) return 'changes'

  // Cifras
  if ((s.enQue && s.spend) || /\bque\b.*\bgast\w+\b.*\bmas\b|\bdonde\b.*\bgast\w+\b.*\bmas\b/.test(n)) return 'top_categories'
  if (/\bgast\w*\b.*\b(?:mas|menos)\b.*\bque\b|\b(?:mas|menos)\b.*\bque\b.*\b(?:mes|semana|ano)\b.*\bgast/.test(n) || /\bcompar\w+\b/.test(n)) return 'compare'
  if (s.save) return 'saved'
  if (s.income && !s.spend) return 'income'
  if (s.spend) return 'spent'
  return null
}

// ─── 4. Candidato de filtro: solo lo que tiene contenido ───

// Palabras funcionales del español y palabras propias de la pregunta. No son frases hechas: es el
// vocabulario que NUNCA puede ser el nombre de una categoría, tienda o concepto.
const FUNCTION_WORDS = new Set(
  (
    'a al algo alguien alguna alguno algunos algunas ante aqui asi aun aunque bien cada casi como con contra cual cuales cuando cuanto cuanta cuantos cuantas ' +
    'de del dentro desde donde dos el ella ellas ello ellos en entre era eran eres es esa esas ese eso esos esta estaba estado estamos estan estais estar estas este esto estos estoy ' +
    'fue fueron fui ha habeis haber habia han has hasta hay he hemos hizo la las le les lo los mas me mi mis mucho mucha muy nada ni no nos nosotros nosotras ' +
    'nuestra nuestras nuestro nuestros o os otra otro para pero poco por porque pues que quien quienes se sea segun ser si sido sin sobre solo somos son soy su sus tambien tanto te ' +
    'tengo tenemos tiene tienen todo toda todos todas tu tus un una uno unos unas vamos ver vosotros y ya ' +
    'dime dimelo dinos decir decirme saber sepamos quiero queremos quisiera quisieramos puedes puedo podrias podeis podemos pepa pepe oye vale hola hey favor porfa gracias ' +
    'total totales dinero plata euro euros importe cantidad mes meses semana semanas dia dias ano anos pasado pasada anterior proximo proxima siguiente hoy ayer ultimo ultima ultimos ultimas ' +
    'actual actuales cosa cosas lado vez veces general conjunto familia casa nosotros ' +
    'llevamos llevais llevado llevo van va ido vamos estado estamos tenido ' +
    'cuenta cuentas movimiento movimientos gasto gastos ingreso ingresos ahorro ahorros'
  ).split(' '),
)
// Verbos y palabras de la propia pregunta, por raíz: gastar, ingresar, ahorrar, analizar, pagar, cobrar...
const QUESTION_STEMS = /^(?:gast\w*|ingres\w*|ahorr\w*|analiz\w*|pag\w*|cobr\w*|recort\w*|reduc\w*|compar\w*|explic\w*|resum\w*|dec\w*|cuent\w*|calcul\w*|mostr\w*|ense\w*|dime\w*|muestr\w*)$/

const MAX_CANDIDATE_WORDS = 4

function contentWords(text: string): string[] {
  return text
    .split(' ')
    .map((w) => w.replace(/[^a-z0-9ñ]/g, ''))
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !FUNCTION_WORDS.has(w) && !QUESTION_STEMS.test(w))
}

// "lo que gaste el mes pasado en luz" -> (sin el periodo) "lo que gaste en luz" -> ["luz"].
// "analiza nuestros gastos de este mes" -> (sin el periodo) "analiza nuestros gastos de" -> [].
export function filterCandidate(restWithoutPeriod: string): { candidate: string | null; words: string[] } {
  const words = contentWords(restWithoutPeriod)
  return { candidate: words.length > 0 && words.length <= MAX_CANDIDATE_WORDS ? words.join(' ') : null, words }
}

// ─── Otras señales de la frase ───

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
  return { metric, period: null, target: null, product: null, full: false, baseline: null, premise: null, focus: null, detail: 'brief', ...over }
}

// Palabras que sobran en la frase del producto ("dónde compramos más barato el queso" -> "queso").
const PRODUCT_NOISE = new Set('donde compramos compro comprais comprar tienda tiendas supermercado supermercados sale esta estan barato barata baratos baratas economico economica cuesta'.split(' '))

export function parseFinanceQuestion(text: string, today: Date): FinanceParse | null {
  const n = withoutWakeWord(cleanFinanceText(text))
  if (!n) return null

  if (isWriteRequest(n)) return { kind: 'write-refused' }
  if (!looksLikeFinance(n)) return null

  if (/\bpresupuest\w*\b/.test(n)) return { kind: 'query', query: baseQuery('budget_left', { target: budgetTarget(n) }) }
  if (/\bsald[oa]s?\b/.test(n) || /\bcuanto (?:dinero )?(?:tenemos|tengo|hay|queda)\b.*\b(?:cuenta|cuentas|banco)\b/.test(n)) return { kind: 'unsupported', what: 'balances' }

  const metric = metricOf(n)
  if (!metric) return { kind: 'not-understood' }
  const analysis = ANALYSIS_METRICS.includes(metric) || metric === 'why_changed'

  // 3. Periodo. Uno dicho con "respecto a / frente a / comparado con" no es el consultado, es la referencia.
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
    // Producto = las palabras con contenido que quedan sin las de la propia pregunta.
    const words = contentWords(rest).filter((w) => !PRODUCT_NOISE.has(w))
    if (words.length === 0) return { kind: 'not-understood' }
    return { kind: 'query', query: baseQuery(metric, { product: words.join(' ') }), uncertain: words.length > MAX_CANDIDATE_WORDS }
  }

  // 4. Candidato de filtro: solo aplica a preguntas de cifras ("gasto en luz"); un análisis no lleva filtro.
  let target: string | null = null
  let uncertain = false
  if (metric === 'spent') {
    const { candidate, words } = filterCandidate(rest)
    target = candidate
    uncertain = words.length > MAX_CANDIDATE_WORDS
  }
  const premise = metric === 'savings_trend' || metric === 'why_savings' || metric === 'why_changed' ? premiseOf(n) : null
  return {
    kind: 'query',
    query: baseQuery(metric, { period, target, full, baseline, premise, focus: metric === 'analyze' ? focusOf(n) : null }),
    uncertain: uncertain || undefined,
  }
}

// "¿Cuánto me queda del presupuesto de restaurantes?": lo que queda tras quitar las palabras de la pregunta.
const BUDGET_NOISE = new Set(
  'cuanto cuanta cuantos me nos queda quedan falta faltan sobra sobran llevamos llevo llevas gastado gastados gastada del de el la los las presupuesto presupuestos que como va van vamos estamos dentro ya este esta mes en para tengo tenemos hay dime dame mira mirame y por favor a con'.split(' '),
)
function budgetTarget(n: string): string | null {
  const words = n.split(' ').filter((w) => w && !BUDGET_NOISE.has(w))
  return words.length > 0 && words.length <= 3 ? words.join(' ') : null
}
const BUDGET_REMAINING = /^(?:y\s+)?cuanto (?:me|nos) (?:queda|falta|sobra|quedan)(?: en total| ahi| de eso)?$/

// ─── Continuaciones cortas: "¿En qué?", "¿Y el mes pasado?", "¿Solo alimentación?", "¿Y Mercadona?",
// "¿Por qué?", "¿En qué categoría?", "¿Y comparado con agosto?", "Explícamelo más sencillo" ───
// Solo se interpretan con una consulta anterior VIVA (contexto corto, con caducidad; ver pepa/finance).
const BREAKDOWN = /^(?:y\s+)?(?:en que(?:\s+(?:lo\s+)?(?:hemos|habeis|has|he)?\s*(?:gastado|gastamos))?|desglosa(?:me)?(?:lo)?|desglose|detalle|detallamelo|detallalo|por categorias?|que categorias|en que categorias|en que se ha ido)$/
const ONLY = /^(?:y\s+)?(?:solo|solamente|unicamente|y solo)\s+(?:en\s+|de\s+|con\s+)?(.+)$/
const AND_TARGET = /^y\s+(?:en\s+|de\s+|con\s+|a\s+)?(.+)$/
const WHY = /^(?:y\s+)?por que(?:\s+(?:ha\s+pasado|es|ha\s+sido|pasa|ha\s+cambiado))?$/
const DETAIL = /^(?:y\s+)?(?:(?:dame|dime|ensename|muestrame|quiero|me das|puedes darme|necesito)\s+)?(?:(?:las|los|el|mas)\s+)*(?:cifras|numeros|importes|datos|detalles?|detalle)(?:\s+(?:exactas?|completas?|por favor))?$|^(?:cuanto|cuantos euros|de cuanto)\s+(?:es\s+|son\s+|seria\s+|fue\s+|fueron\s+|suma\s+)?(?:exactamente|exacto|en concreto|en total|en euros)$|^exactamente cuanto$|^con (?:cifras|numeros)$|^(?:dame|dime) mas detalles?$/
const ORDINAL = /^(?:y\s+)?(?:(?:cual|que) (?:es|seria|fue) )?(?:la|el) (primera|segunda|tercera|ultima|primero|segundo|tercero|ultimo)$/
const ORDINAL_INDEX: Record<string, number> = { primera: 0, primero: 0, segunda: 1, segundo: 1, tercera: 2, tercero: 2, ultima: -1, ultimo: -1 }
const WHICH_CATEGORY = /^(?:y\s+)?(?:en\s+)?que categoria(?:\s+(?:ha\s+sido|es|fue))?$/
const SIMPLER =
  /^(?:explicamelo|explicamela|dimelo|dilo|explicalo|resumemelo|resumelo)(?:\s+(?:de forma|de manera|mas|un poco mas|algo mas))*\s*(?:sencill[oa]|facil|simple|claro|corto|breve|resumido)?$|^(?:mas sencillo|en sencillo|mas simple|mas facil|mas claro|mas corto|resumido)$/
const VS_BASELINE = /^(?:y\s+)?(?:comparad[oa] (?:con|a|al)|frente a|respecto a|contra|en comparacion con)\s+(.+)$/

function isAnalysisMetric(m: FinanceMetric): boolean {
  return ANALYSIS_METRICS.includes(m)
}

// "¿Y solo alimentación?" -> "alimentacion": mismo criterio que la pregunta completa (solo palabras con contenido).
function followUpTarget(raw: string): string | null {
  return filterCandidate(raw).candidate
}

// `items`: lo último que PEPA nombró por orden (categorías), para "¿y cuál es la segunda?".
export function parseFinanceFollowUp(text: string, previous: FinanceQuery, today: Date, items: string[] = []): FinanceQuery | null {
  const n = withoutWakeWord(cleanFinanceText(text))
  if (!n) return null
  const prevIsAnalysis = isAnalysisMetric(previous.metric) || previous.metric === 'why_changed'

  if (previous.metric === 'budget_left' && BUDGET_REMAINING.test(n)) return { ...previous }

  if (SIMPLER.test(n)) return { ...previous, metric: 'simpler', detail: 'brief' }

  // "¿Y cuál es la segunda?": el elemento que PEPA nombró en esa posición, sin volver a empezar el análisis.
  const ordinal = ORDINAL.exec(n)
  if (ordinal && items.length > 0) {
    const at = ORDINAL_INDEX[ordinal[1]]
    const name = at === -1 ? items[items.length - 1] : items[at]
    if (name) return { ...previous, metric: 'category_focus', target: name, detail: 'brief' }
  }

  // Nivel 2, bajo petición: "dame las cifras", "¿cuánto exactamente?", "enséñame los números"...
  if (DETAIL.test(n)) {
    if (prevIsAnalysis) return { ...previous, detail: 'full' }
    if (previous.metric === 'spent' || previous.metric === 'income' || previous.metric === 'compare') return { ...previous, metric: 'top_categories', detail: 'full' }
    return null
  }

  if (WHY.test(n)) {
    if (previous.metric === 'cuts' || previous.metric === 'why_cuts') return { ...previous, metric: 'why_cuts' }
    if (previous.metric === 'savings_trend' || previous.metric === 'why_savings') return { ...previous, metric: 'why_savings' }
    if (previous.metric === 'price_up' || previous.metric === 'price_down' || previous.metric === 'cheapest_store') return null
    return { ...previous, metric: 'why_changed', target: null }
  }
  if (WHICH_CATEGORY.test(n)) return { ...previous, metric: 'top_increase', target: null }

  if (BREAKDOWN.test(n) && (previous.metric === 'spent' || previous.metric === 'income' || previous.metric === 'compare' || previous.metric === 'top_categories' || prevIsAnalysis)) {
    // Tras un análisis, "desglósamelo"/"¿en qué?" pide el detalle por categorías (con cifras).
    if (previous.metric === 'cuts' || previous.metric === 'why_cuts') return { ...previous, metric: 'cuts', detail: 'full' }
    return { ...previous, metric: prevIsAnalysis && previous.metric !== 'category_focus' ? 'where_money' : 'top_categories', detail: prevIsAnalysis ? 'full' : previous.detail }
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
  if (only) {
    const t = followUpTarget(only[1])
    if (t) return { ...previous, target: t, metric: filterMetric() }
  }
  const and = AND_TARGET.exec(n)
  if (and && !extractPeriod(and[1], today)) {
    const t = followUpTarget(and[1])
    if (t) return { ...previous, target: t, metric: filterMetric() }
  }
  return null
}
