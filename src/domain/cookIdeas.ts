// «¿Qué cocino hoy?»: entender lo que la persona tiene en casa («tengo pepino, lechuga y tomate, ¿qué cocino?»), y contar por voz las ideas que propone la IA.
// Solo reglas, sin IA ni red: la IA se llama desde services/whatToCook.ts.
import type { RecipeDraftData } from '@/domain/recipeDraft'
import { normalize } from '@/domain/voiceQuery'

export interface CookIdeaData {
  title: string
  summary: string
  // Ingredientes importantes que no estaban en la lista (para avisar: «te faltaría…»).
  missing: string[]
  recipe: RecipeDraftData
}

export const MAX_COOK_INGREDIENTS = 20

const ARTICLES = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'algo', 'de', 'del'])
// Relleno que se cuela al dictar: «tengo tomate en casa», «lentejas hoy», «y nada más»…
const FILLER_TAIL_RE = /\s+(?:en casa|en la nevera|en el frigorifico|en la despensa|hoy|ahora|nada mas|por ahi|y ya)$/
const MAX_WORDS_PER_INGREDIENT = 4

// «pepino, lechuga y tomate» → ['pepino', 'lechuga', 'tomate'] (sin acentos tocados: se conserva lo escrito, solo se limpia lo que sobra).
export function parseIngredientList(text: string): string[] {
  const cleaned = text
    .replace(/[¿?¡!.;:]+/g, ' ')
    .replace(/\n+/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
  const out: string[] = []
  for (const piece of cleaned.split(/\s*,\s*|\s+y\s+|\s+e\s+|\s+más\s+/i)) {
    let words = piece.trim().split(' ').filter(Boolean)
    // Se quitan los artículos del principio («un pepino» → «pepino»).
    while (words.length > 1 && ARTICLES.has(normalize(words[0]))) words = words.slice(1)
    let item = words.join(' ')
    for (let i = 0; i < 2; i++) item = item.replace(new RegExp(FILLER_TAIL_RE.source, 'i'), '').trim()
    if (item.length < 2 || item.length > 40 || item.split(' ').length > MAX_WORDS_PER_INGREDIENT) continue
    if (!/^[\p{L}\p{N}][\p{L}\p{N}\s.'’-]*$/u.test(item)) continue
    if (out.some((x) => normalize(x) === normalize(item))) continue
    out.push(item)
    if (out.length >= MAX_COOK_INGREDIENTS) break
  }
  return out
}

// La parte de la pregunta de la frase: «¿qué puedo cocinar?», «¿qué cocino hoy?», «¿qué hago de comer?», «dame ideas», «recetas con…».
const QUESTION_PHRASE =
  '(?:que (?:puedo |podria |podemos )?(?:cocinar|cocino|cocinamos|hacer|hago|hacemos|preparar|preparo|preparamos)(?: de comer| de cenar| para comer| para cenar| para hoy| hoy| con (?:eso|esto|ello|todo eso|todo esto))?' +
  '|que (?:comemos|cenamos|como|ceno) con (?:eso|esto|ello)' +
  '|dame (?:ideas|recetas)(?: para hoy| para comer| para cenar)?' +
  '|(?:ideas|recetas) (?:con|para) (?:eso|esto|ello))'

const HAVE_RE = new RegExp(`^(?:pepa,? )?(?:oye,? )?(?:mira,? )?(?:pues,? )?(?:hoy,? )?(?:en casa,? )?tengo (.+?)[ ,]+(?:y )?${QUESTION_PHRASE}$`)
// Con una lista delante: «tengo X, Y, ¿qué cocino?»; o con ella detrás: «qué puedo cocinar con X, Y», «recetas con X y Y».
const QUESTION_WITH_LIST_RE =
  /^(?:pepa,? )?(?:oye,? )?(?:dime |dame )?(?:que (?:puedo |podria |podemos )?(?:cocinar|cocino|cocinamos|hacer|hago|hacemos|preparar|preparo|preparamos)(?: de comer| de cenar| para comer| para cenar| hoy)? con|que (?:comemos|cenamos|como|ceno) con|(?:ideas|recetas) (?:de cocina )?con|(?:una |alguna )?receta con|algo (?:para (?:comer|cenar) )?con) (.+)$/

export function parseCookRequest(text: string): { ingredients: string[] } | null {
  // Los signos se quitan para que no se peguen palabras; «normalize» (minúsculas y sin acentos) se usa solo para ENTENDER la frase: los ingredientes se
  // recortan del texto original (con sus tildes: «calabacín», «atún»), que tiene el mismo largo carácter a carácter.
  const original = text.replace(/[¿?¡!.;:]+/g, ' ').replace(/\s+/g, ' ').trim()
  const plain = normalize(original)
  if (!plain) return null
  for (const re of [HAVE_RE, QUESTION_WITH_LIST_RE]) {
    const match = re.exec(plain)
    if (!match) continue
    const start = plain.indexOf(match[1], match.index)
    const raw = plain.length === original.length && start >= 0 ? original.slice(start, start + match[1].length) : match[1]
    const ingredients = parseIngredientList(raw)
    return ingredients.length > 0 ? { ingredients } : null
  }
  return null
}

const ORDINALS: { re: RegExp; index: number }[] = [
  // Solo ordinales y «la 1/la uno»: un «dos» o «una» sueltos (como en «dos limones») no son una elección.
  { re: /\b(?:primera|primero|la 1|el 1|la uno|el uno)\b/, index: 0 },
  { re: /\b(?:segunda|segundo|la 2|el 2|la dos|el dos)\b/, index: 1 },
  { re: /\b(?:tercera|tercero|la 3|el 3|la tres|el tres)\b/, index: 2 },
]

// «la primera», «la segunda», «la de la ensalada», «ensalada mixta» → la idea elegida (o null si no se sabe cuál).
export function pickCookIdea(text: string, ideas: CookIdeaData[]): CookIdeaData | null {
  const plain = normalize(text).replace(/[¿?¡!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!plain || ideas.length === 0) return null
  // Con una sola idea, «sí», «vale», «enséñamela»… es esa.
  if (ideas.length === 1 && /\b(?:si|vale|ok|dale|venga|claro|por favor|ensenamela|dimela|muestramela|quiero verla)\b/.test(plain)) return ideas[0]
  const wordsOf = (s: string) => normalize(s).split(/\s+/).filter((w) => w.length >= 4)
  // Por nombre: la idea cuyo título comparte más palabras con lo dicho (mínimo una palabra de 4+ letras).
  let best: { idea: CookIdeaData; score: number } | null = null
  for (const idea of ideas) {
    const titleWords = wordsOf(idea.title)
    const score = titleWords.filter((w) => plain.includes(w)).length
    if (score > 0 && (!best || score > best.score)) best = { idea, score }
  }
  if (best) return best.idea
  for (const { re, index } of ORDINALS) {
    if (re.test(plain) && index < ideas.length) return ideas[index]
  }
  return null
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

// Lo que Pepa dice en voz alta (y escribe) al enseñar las ideas.
export function describeCookIdeas(ingredients: string[], ideas: CookIdeaData[]): string {
  const have = listWords(ingredients.slice(0, 6)) + (ingredients.length > 6 ? ' y más' : '')
  const items = ideas.map((idea) => (idea.recipe.timeMinutes ? `${idea.title}, en unos ${idea.recipe.timeMinutes} minutos` : idea.title))
  const ordinals = ['la primera', 'la segunda', 'la tercera']
  const first = ideas[0]
  const missing = first && first.missing.length > 0 ? ` Para ${first.title.toLowerCase()} te faltaría ${listWords(first.missing)}.` : ''
  const askWhich = ideas.length > 1 ? `Dime ${ordinals.slice(0, ideas.length).join(', ').replace(/, ([^,]*)$/, ' o $1')} y te enseño la receta para guardarla.` : 'Dime «sí» y te enseño la receta para guardarla.'
  return `Con ${have} puedes hacer: ${listWords(items)}.${missing} ${askWhich}`
}
