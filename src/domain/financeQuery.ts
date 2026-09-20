// Economía por voz, SOLO CONSULTA: entender la pregunta con reglas. Aquí no se calcula nada ni se
// toca ningún dato; el resultado es una consulta estructurada que ejecuta financeCompute.
//
// También aquí: las frases que piden ESCRIBIR en Economía (borrar, cambiar, crear...) se
// reconocen para rechazarlas con claridad y no convertirlas en consultas por accidente.
import { extractPeriod, type PeriodSpec } from '@/domain/financePeriod'
import { normalize } from '@/domain/voiceQuery'

export type FinanceMetric = 'spent' | 'income' | 'saved' | 'top_categories' | 'compare' | 'why_changed' | 'price_up' | 'price_down' | 'cheapest_store'

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

const FINANCE_NOUNS = /\b(?:gasto|gastos|movimiento|movimientos|presupuesto|presupuestos|ingreso|ingresos|cuenta|cuentas|categoria|categorias|ticket|tickets|transferencia|transferencias|precio|precios|banco|bancaria|bancario)\b/
const WRITE_VERBS =
  /^(?:por favor\s+)?(?:(?:puedes|podrias|quiero que|necesito que)\s+)?(?:borra|borrar|borrame|elimina|eliminar|quita|quitar|cambia|cambiar|cambiame|modifica|modificar|edita|editar|pon|ponme|poner|crea|crear|anade|anadir|agrega|agregar|apunta|apuntame|apuntar|registra|registrar|mueve|mover|transfiere|transferir|paga|pagar|ingresa|ingresar|recategoriza|asigna|asignar|sube|baja|ajusta|ajustar|define|fija|activa|desactiva)\b/

// Palabras que hacen que una frase "suene" a economía (para no mandarla a la IA ni al calendario).
const FINANCE_TOPIC =
  /\b(?:gast\w*|ingres\w*|ahorr\w*|presupuest\w*|sald[oa]s?|barato|barata|baratos|baratas|subido|bajado|subid[oa]s?|bajad[oa]s?|precio|precios)\b/

export function isWriteRequest(cleaned: string): boolean {
  return WRITE_VERBS.test(cleaned) && FINANCE_NOUNS.test(cleaned) && !/\bcuanto\b/.test(cleaned)
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
  if (/\bpor que\b.*\b(?:gast\w*|cambiado|subido|aumentado)\b|\bpor que ha cambiado (?:mi|el|nuestro)\b|\bexplic\w+\b.*\bgast\w*/.test(n)) return 'why_changed'
  if (/\b(?:productos?|cosas|articulos?|alimentos?)\b.*\b(?:subid[oa]s?|suben|subir|aumentad[oa]s?|encarecid[oa]s?)\b|\b(?:subid[oa]s?|suben)\b.*\bprecio\b|\bmas caros?\b/.test(n)) return 'price_up'
  if (/\b(?:productos?|cosas|articulos?|alimentos?)\b.*\b(?:bajad[oa]s?|bajan|abaratad[oa]s?)\b|\b(?:bajad[oa]s?|bajan)\b.*\bprecio\b/.test(n)) return 'price_down'
  if (/\b(?:donde|en que tienda|que tienda|en que supermercado)\b.*\b(?:barat[oa]s?|economic[oa]s?)\b|\bmas barat[oa]s?\b/.test(n)) return 'cheapest_store'
  if (/\ben que\b.*\b(?:gast\w+)\b.*\bmas\b|\ben que\b.*\bgast\w+\b|\bque\b.*\bgast\w+\b.*\bmas\b|\bdonde\b.*\bgast\w+\b.*\bmas\b/.test(n)) return 'top_categories'
  if (/\bgast\w*\b.*\b(?:mas|menos)\b.*\bque\b|\b(?:mas|menos)\b.*\bque\b.*\b(?:mes|semana|ano)\b.*\bgast/.test(n) || /\bcomparad?\w*\b.*\bgast/.test(n) || /\bcompar\w+\b/.test(n)) return 'compare'
  if (/\bahorr\w+\b/.test(n)) return 'saved'
  if (/\bingres\w+\b/.test(n) && !/\bgast/.test(n)) return 'income'
  if (/\bgast\w*\b/.test(n)) return 'spent'
  return null
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

  // En "¿Hemos gastado más que el mes pasado?" el periodo consultado es el actual y "el mes pasado" es
  // solo la referencia: lo que va tras "más/menos que" no se toma como periodo de la consulta.
  const subject = metric === 'compare' ? n.replace(/\b(?:mas|menos)\s+(?:que|de lo que)\b.*$/, ' ').replace(/\s+/g, ' ').trim() : n
  const match = extractPeriod(subject, today)
  const period = match?.spec ?? null
  const rest = match?.rest ?? n
  const full = /\bcomplet[oa]s?\b/.test(n)

  if (metric === 'cheapest_store') {
    // Lo que queda sin las palabras de la pregunta es el producto: "queso", "queso rallado".
    const term = rest.replace(PRODUCT_STOP, ' ').replace(/\s+/g, ' ').trim()
    if (!term) return { kind: 'not-understood' }
    return { kind: 'query', query: { metric, period: null, target: null, product: term, full: false } }
  }

  const target = metric === 'spent' ? targetFrom(rest) : null
  return { kind: 'query', query: { metric, period, target, product: null, full } }
}

// ─── Continuaciones cortas: "¿En qué?", "¿Y el mes pasado?", "¿Solo alimentación?", "¿Y Mercadona?" ───
// Solo se interpretan con una consulta anterior VIVA (contexto corto, con caducidad; ver pepa/finance).
const BREAKDOWN = /^(?:y\s+)?(?:en que(?:\s+(?:lo\s+)?(?:hemos|habeis|has|he)?\s*(?:gastado|gastamos))?|desglosa(?:me)?(?:lo)?|desglose|detalle|detallamelo|detallalo|por categorias?|que categorias|en que categorias|en que se ha ido)$/
const ONLY = /^(?:y\s+)?(?:solo|solamente|unicamente|y solo)\s+(?:en\s+|de\s+|con\s+)?(.+)$/
const AND_TARGET = /^y\s+(?:en\s+|de\s+|con\s+|a\s+)?(.+)$/

export function parseFinanceFollowUp(text: string, previous: FinanceQuery, today: Date): FinanceQuery | null {
  const n = cleanFinanceText(text)
  if (!n) return null

  if (BREAKDOWN.test(n) && (previous.metric === 'spent' || previous.metric === 'income' || previous.metric === 'compare' || previous.metric === 'top_categories')) {
    return { ...previous, metric: 'top_categories' }
  }

  // "¿Y el mes pasado?" / "y en agosto" / "el mes pasado": mismo asunto, otro periodo.
  const stripped = n.replace(/^y\s+(?:en\s+|durante\s+|del\s+|de\s+)?/, '')
  const period = extractPeriod(stripped, today)
  if (period && /^(?:y\s|el\s|la\s|en\s|este\s|esta\s|desde\s|los\s|ultimos|ultimas)/.test(n) && period.rest.replace(/\b(?:el|la|en|de|del|y)\b/g, '').trim() === '') {
    return { ...previous, period: period.spec }
  }

  // "¿Solo alimentación?" / "¿Y Mercadona?": mismo periodo, otro filtro.
  const only = ONLY.exec(n)
  if (only) return { ...previous, target: only[1].replace(/^(?:la|el|los|las)\s+/, ''), metric: previous.metric === 'top_categories' ? 'spent' : previous.metric }
  const and = AND_TARGET.exec(n)
  if (and && !extractPeriod(and[1], today)) {
    const t = and[1].replace(/^(?:la|el|los|las)\s+/, '').trim()
    if (t && t.split(' ').length <= 4) return { ...previous, target: t, metric: previous.metric === 'top_categories' ? 'spent' : previous.metric }
  }
  return null
}
