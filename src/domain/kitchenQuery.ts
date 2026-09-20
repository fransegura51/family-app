// Entiende, solo con reglas (sin IA), las frases de Cocina que se le dicen a
// Pepa: preguntar qué hay de comer ("¿qué cenamos hoy?", "¿qué tengo
// mañana para comer?"), apuntar un plato en el menú ("pon tortilla el
// viernes") y pasar los ingredientes de una receta a la lista de la compra
// ("añade los ingredientes a la compra").
//
// Es conservador a propósito: si la frase no encaja con claridad devuelve
// null y todo sigue por el camino de siempre — así no se le quita nada a lo
// que ya funcionaba ("pon dentista el viernes" sigue siendo del calendario).
// `today` se recibe de fuera para poder probarlo con una fecha fija.
import { extractSpokenDate } from '@/domain/spokenDate'
import { normalize } from '@/domain/voiceQuery'
import type { MealType } from '@/domain/types'

export type KitchenIntent =
  | { kind: 'menu_query'; date: string; meals: MealType[] }
  | { kind: 'menu_set'; date: string; meal: MealType | null; dish: string; explicit: boolean }
  | { kind: 'ingredients'; recipeText: string | null; date: string | null; meal: MealType | null }

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  copy.setDate(copy.getDate() + days)
  return copy
}

// "hoy" / "mañana" / "el viernes 25 de septiembre" — para las respuestas y
// las tarjetas de confirmación.
export function kitchenDateLabel(date: string, today: Date): string {
  if (date === isoDate(today)) return 'hoy'
  if (date === isoDate(addDays(today, 1))) return 'mañana'
  const label = new Date(`${date}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return `el ${label}`
}

interface Range {
  start: number
  end: number
}

interface DateRef extends Range {
  date: string
}

// `fromTomorrow`: al ESCRIBIR ("pon tortilla el viernes") un día de la
// semana que coincide con hoy se entiende como el de la semana que viene; al
// PREGUNTAR ("qué comemos el viernes") vale hoy. La tarjeta de confirmación
// enseña siempre la fecha completa, así que un malentendido se ve antes de
// guardar.
function findDateRef(n: string, today: Date, fromTomorrow: boolean): DateRef | null {
  const spoken = extractSpokenDate(n, today)
  if (spoken) {
    const start = n.indexOf(spoken.matchText)
    if (start >= 0) return { date: spoken.date, start, end: start + spoken.matchText.length }
  }
  let m = /\bpasado manana\b/.exec(n)
  if (m) return { date: isoDate(addDays(today, 2)), start: m.index, end: m.index + m[0].length }
  // "por la mañana" es un momento del día, no el día de mañana.
  m = /(?<!\bla )\bmanana\b/.exec(n)
  if (m) return { date: isoDate(addDays(today, 1)), start: m.index, end: m.index + m[0].length }
  m = /\b(?:hoy|esta noche)\b/.exec(n)
  if (m) return { date: isoDate(today), start: m.index, end: m.index + m[0].length }
  m = /\b(?:el\s+)?(?:proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.exec(n)
  if (m) {
    let diff = (WEEKDAYS.indexOf(m[1]) - today.getDay() + 7) % 7
    if (fromTomorrow && diff === 0) diff = 7
    return { date: isoDate(addDays(today, diff)), start: m.index, end: m.index + m[0].length }
  }
  return null
}

const MEAL_WORDS: [RegExp, MealType][] = [
  [/\b(?:desayuno|desayunar|desayunamos|desayunaremos)\b/, 'desayuno'],
  [/\b(?:comida|comer|comemos|comeremos|almuerzo|almorzar|almorzamos)\b/, 'comida'],
  [/\b(?:merienda|merendar|merendamos|merendaremos)\b/, 'merienda'],
  [/\b(?:cena|cenar|cenamos|cenaremos|esta noche)\b/, 'cena'],
]

function extractMeals(n: string): MealType[] {
  return MEAL_WORDS.filter(([re]) => re.test(n)).map(([, meal]) => meal)
}

const SHOPPING_WORDS = /\b(compra|comprar|lista|tienda|tiendas|mercadona|supermercado)\b/
const TIME_EXPR = /\b\d{1,2}[:.]\d{2}\b|\ba las\b|\ba la una\b/

const QUERY_A =
  /\bque\s+(?:vamos a\s+)?(?:cenamos|comemos|desayunamos|merendamos|almorzamos|cocinamos|cocino|cocinar|cenar|comer|desayunar|merendar|almorzar|cenaremos|comeremos|cocinaremos|desayunaremos|merendaremos)\b/
const QUERY_B = /\b(?:que|cual)\b[^?]*\bpara\s+(?:la\s+)?(?:comer|cenar|desayunar|merendar|almorzar|comida|cena|desayuno|merienda|almuerzo)\b/
const QUERY_C = /\b(?:que|cual)\b[^?]*\b(?:hay|toca|tenemos|tengo|hay apuntado|esta apuntado)\s+(?:de|en)\s+(?:la\s+)?(?:comida|cena|desayuno|merienda|almuerzo)\b/
const QUERY_D = /\b(?:que|cual)\b[^?]*\bmenu\b/

function parseMenuQuery(n: string, today: Date): KitchenIntent | null {
  if (SHOPPING_WORDS.test(n)) return null
  if (![QUERY_A, QUERY_B, QUERY_C, QUERY_D].some((re) => re.test(n))) return null
  let meals = extractMeals(n)
  if (meals.length === 0) meals = ['comida', 'cena']
  // "¿qué cocinamos hoy?" habla de cocinar: comida y cena.
  if (/\bcocin/.test(n)) meals = ['comida', 'cena']
  const date = findDateRef(n, today, false)?.date ?? isoDate(today)
  return { kind: 'menu_query', date, meals }
}

const SET_VERB = /^(?:pon|poner|ponme|ponnos|apunta|apuntame|apuntar|anota|anotar|anade|anadir|agrega|agregar|mete|meter|planifica|planificar|programa|programar)\b\s*/
const MEAL_PHRASE =
  /\b(?:(?:para|de|en|a)\s+(?:la\s+|el\s+|las\s+|los\s+)?(?:comida|cena|desayuno|merienda|almuerzo|comer|cenar|desayunar|merendar|almorzar|menu)|(?:en|al|del|para)\s+(?:el\s+)?menu|comida|cena|desayuno|merienda|almuerzo|comer|cenar|desayunar|merendar|almorzar|menu|esta noche)\b/g
const EDGE_STOPWORDS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'para', 'de', 'del', 'al', 'a', 'en', 'que', 'sea', 'como'])

function removeRanges(text: string, ranges: Range[]): string {
  const asc = [...ranges].sort((a, b) => a.start - b.start)
  const merged: Range[] = []
  for (const r of asc) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else merged.push({ ...r })
  }
  let out = text
  for (const r of merged.reverse()) out = out.slice(0, r.start) + ' ' + out.slice(r.end)
  return out
}

function tidyDish(text: string): string {
  let words = text
    .replace(/[¿?¡!,.;:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  while (words.length > 0 && EDGE_STOPWORDS.has(normalize(words[0]))) words = words.slice(1)
  while (words.length > 0 && EDGE_STOPWORDS.has(normalize(words[words.length - 1]))) words = words.slice(0, -1)
  return words.join(' ')
}

function parseMenuSet(orig: string, n: string, today: Date): KitchenIntent | null {
  const verb = SET_VERB.exec(n)
  if (!verb) return null
  if (TIME_EXPR.test(n) || SHOPPING_WORDS.test(n)) return null
  const dateRef = findDateRef(n, today, true)
  if (!dateRef) return null
  const meals = extractMeals(n)
  const explicit = meals.length > 0 || /\bmenu\b/.test(n)

  // `normalize` conserva la longitud con texto en formato compuesto (NFC),
  // que es lo que da el reconocimiento de voz; así se puede recortar el
  // original —con sus acentos— por las mismas posiciones.
  const ranges: Range[] = [{ start: 0, end: verb[0].length }, { start: dateRef.start, end: dateRef.end }]
  MEAL_PHRASE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MEAL_PHRASE.exec(n)) !== null) ranges.push({ start: m.index, end: m.index + m[0].length })
  const source = orig.length === n.length ? orig : n
  const dish = tidyDish(removeRanges(source, ranges))
  if (!dish) return null

  return { kind: 'menu_set', date: dateRef.date, meal: meals.length === 1 ? meals[0] : null, dish, explicit }
}

const INGREDIENT_VERB = /\b(?:anade|anadir|agrega|agregar|apunta|apuntar|pon|poner|mete|meter|pasa|pasar|manda|mandar|necesito|quiero|traspasa)\b/
const GENERIC_WORDS = new Set([
  'lo', 'eso', 'esa', 'esta', 'este', 'esto', 'receta', 'la', 'el', 'los', 'las', 'de', 'del', 'que', 'antes', 'dije', 'ultima',
  'anterior', 'menu', 'compra', 'lista', 'a', 'en', 'para', 'con', 'todo', 'todos', 'todas', 'ingredientes',
])

function parseIngredients(n: string, today: Date): KitchenIntent {
  const dateRef = findDateRef(n, today, false)
  const meal = extractMeals(n)[0] ?? null
  const m = /\bingredientes\s+(?:de|del|para)\s+(?:la\s+|el\s+|las\s+|los\s+)?(?:receta\s+(?:de\s+|del\s+)?)?(.+?)(?:\s+(?:a|en|para)\s+(?:la\s+)?(?:compra|lista)\b.*)?$/d.exec(n)
  let recipeText: string | null = null
  if (m && m.indices) {
    const [gs, ge] = m.indices[1]
    let phrase = n.slice(gs, ge)
    if (dateRef) phrase = phrase.replace(n.slice(dateRef.start, dateRef.end), ' ')
    phrase = phrase.replace(MEAL_PHRASE, ' ')
    // Solo se quitan las palabras de relleno de los extremos: "lentejas con
    // chorizo" conserva su "con".
    let words = phrase.split(/\s+/).filter(Boolean)
    while (words.length > 0 && GENERIC_WORDS.has(words[0])) words = words.slice(1)
    while (words.length > 0 && GENERIC_WORDS.has(words[words.length - 1])) words = words.slice(0, -1)
    recipeText = words.length > 0 ? words.join(' ') : null
  }
  return { kind: 'ingredients', recipeText, date: dateRef?.date ?? null, meal }
}

export function parseKitchenIntent(text: string, today: Date): KitchenIntent | null {
  const orig = text.normalize('NFC').trim()
  const n = normalize(orig)
  if (!n) return null

  if (/\bingredientes\b/.test(n) && INGREDIENT_VERB.test(n)) return parseIngredients(n, today)
  return parseMenuQuery(n, today) ?? parseMenuSet(orig, n, today)
}
