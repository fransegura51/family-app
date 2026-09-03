// Reconoce preguntas sobre calendario o sobre la compra dentro de lo
// que se dicta, sin usar ningún servicio de IA de pago — solo
// coincidencia de palabras clave. Ya no hace falta ADIVINAR de cuál de
// las dos categorías se trata (bug real, repetido: "Mercadona, patata,
// huevo" se apuntaba en el calendario; preguntar por la compra de
// Mercadona a veces contestaba también con la de Aldi) — ahora hay un
// botón para cada cosa ("🐣📅 Pepa Calendario" / "🐣🛒 Pepa Compra" /
// "🎤📅 Apuntar Calendario" / "🎤🛒 Apuntar Compra"), así que la
// categoría ya la da el botón, no hace falta reconocerla en el texto.
import { extractSpokenDate, MONTHS } from '@/domain/spokenDate'

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos: qué -> que
    .trim()
}

// "Lo siguiente que tengo en el calendario" — a diferencia de las
// tareas, esto pregunta por el próximo EVENTO del calendario (cita,
// cumpleaños...), no por tareas del día. Como con la compra: en forma
// de expresión en vez de frases exactas sueltas, porque el plural
// "qué TENEMOS en el calendario" (tan natural como "qué tengo") no
// coincidía con nada y se guardaba como una cita nueva en vez de
// responder (mismo bug repetido, reportado varias veces).
const NEXT_EVENT_RE =
  /\blo siguiente\b|\b(que tengo|que tenemos)\b[\s\S]*\b(en el calendario|apuntado)\b|\b(proxim[oa]|siguiente)\b[\s\S]*\b(cita|evento)\b/

// Pepa todavía no borra nada por voz — sin este aviso, "borra la cita
// del nueve de septiembre" no se reconocía como nada especial y caía
// en la creación de un evento nuevo con ese texto literal por título
// (bug real reportado: se apuntaba "Borra la cita del" como una cita
// más, justo lo contrario de lo que se pedía). Mismo criterio que el
// resto: cualquier verbo de borrar con cualquiera de los dos nombres
// (antes faltaban "quita el evento"/"quitar el evento").
const DELETE_RE = /\b(borra|borrar|elimina|eliminar|quita|quitar)\b[\s\S]*\b(la cita|el evento)\b/

export function isUnsupportedDelete(text: string): boolean {
  return DELETE_RE.test(normalize(text))
}

// Quita "Pepa" (con "oye"/"vale" delante si los hay) de lo dictado antes
// de interpretarlo — si no, "Pepa, apunta leche y pan" se guardaría
// literalmente con "Pepa" dentro del título. No hace falta que vaya al
// principio de la frase: "vale Pepa, ponme..." también cuenta.
export function stripWakeWord(text: string): string {
  return text
    .replace(/\b(oye|vale)?\s*pepa\b[,.]?\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// "Pepa, activa" (o variantes parecidas) es la señal explícita para que
// Pepa deje de escuchar YA y apunte lo dicho — el equivalente hablado de
// tocar "Apuntar", para no tener que esperar los 5 segundos de silencio
// si no hace falta.
const ACTIVATE_PATTERNS = [
  /pepa,?\s*activa(la)?\b/i,
  /pepa,?\s*apunta(lo)?\s*ya\b/i,
  /pepa,?\s*guarda(lo)?\s*ya\b/i,
  /\bactiva(la)?\s*pepa\b/i,
]

export function stripActivateCommand(text: string): { activated: boolean; text: string } {
  for (const re of ACTIVATE_PATTERNS) {
    if (re.test(text)) {
      return { activated: true, text: text.replace(re, ' ').replace(/\s+/g, ' ').trim() }
    }
  }
  return { activated: false, text }
}

// Coletillas naturales al pedirle a Pepa que apunte algo en tareas o en
// la lista de la compra ("vamos a hacer la lista de la compra, leche y
// pan") — sin esto, la frase entera se guardaba como un apunte más
// junto a "leche" y "pan" (bug real: salían tres apuntes en vez de dos,
// el primero sin sentido). Se prueba cada patrón una vez, el primero
// que encaje gana.
// Formas naturales de referirse a un sitio, no solo la frase exacta
// "la lista de la compra" — "ponlo en la compra" o "apúntamelo en las
// compras" son tan habituales como esa (bug real: solo se reconocía la
// frase larga).
const TARGET_PLACE = '(?:tareas|la lista de la compra|la compra|las compras)'

// "Apúntamelo", "ponlo", "apúntala"... los pronombres pegados al verbo
// ("me", "lo", "la") son tan naturales como decir "apunta" a secas —
// antes solo se reconocía el verbo suelto o con "me", y con un
// pronombre pegado detrás la frase entera se colaba en el título en vez
// de quitarse como coletilla.
const SAVE_VERB_ALT = '(?:apunta|anota|pon)(?:me)?(?:lo|la)?'

const LIST_FILLER_PREFIXES = [
  new RegExp(`^vamos a hacer\\s*(${TARGET_PLACE})?[,.]?\\s*`, 'i'),
  new RegExp(`^hagamos\\s*(${TARGET_PLACE})?[,.]?\\s*`, 'i'),
  new RegExp(`^vamos a apuntar\\s*(en ${TARGET_PLACE})?[,.]?\\s*(que)?\\s*`, 'i'),
  new RegExp(`^${SAVE_VERB_ALT}\\s*(en ${TARGET_PLACE})?[,.]?\\s*(que)?\\s*`, 'i'),
]

export function stripListFillers(text: string): string {
  for (const re of LIST_FILLER_PREFIXES) {
    if (re.test(text)) return text.replace(re, '').trim()
  }
  return text
}

// "Mercadona, lista de la compra, patatas" -> apunta solo "patatas" en
// la lista de la compra, con "Mercadona" como tienda, en vez de meter la
// frase entera en el nombre del producto (petición real: "que no me
// ponga todo el texto, que reconozca el nombre de la tienda... y en la
// lista de la compra de Mercadona me ponga patatas"). Solo tiene sentido
// llamarla cuando ya se sabe que el destino es la compra — reconoce la
// tienda tanto delante ("Mercadona, lista de la compra, patatas") como
// detrás ("lista de la compra de Mercadona, patatas") de la frase de la
// compra.
const SHOPPING_PLACE_PLAIN = '(?:la lista de la compra|lista de la compra|la compra|las compras)'

// Delante de "lista de la compra", al dictar en voz alta casi nunca hay
// coma de verdad (el móvil no la pone salvo pausa muy marcada) — exigir
// coma rompía el caso más habitual ("Mercadona lista de la compra
// cepillo de dientes", sin comas, bug real reportado). Sin coma no hay
// forma de saber por la puntuación si lo que va antes es una tienda o
// una palabra suelta ("mañana en la lista de la compra..."), así que en
// su lugar se descarta si es una de estas palabras que claramente NO
// son una tienda — sea lo que sea el resto, se acepta como tienda.
// Se compara ya normalizada (sin acentos/mayúsculas) para no tener que
// acordarse de cada variante con tilde ("mañana", "añade"...) a mano.
const NOT_A_STORE_WORDS = new Set([
  'pepa',
  'vamos',
  'hagamos',
  'voy',
  'vale',
  'oye',
  'manana',
  'hoy',
  'ayer',
  'ahora',
  'luego',
  'despues',
  'entonces',
  'bueno',
  'ademas',
  'tambien',
  'en',
  'de',
  'para',
  'el',
  'la',
  'los',
  'las',
  'y',
  'que',
])
const NOT_A_STORE_PREFIXES = ['apunta', 'anota', 'pon', 'guarda', 'anade', 'anadir', 'registra', 'mete', 'escribe']

function looksLikeStoreCandidate(words: string): boolean {
  const parts = words.trim().split(/\s+/)
  if (parts.length === 0 || parts.length > 3) return false
  return parts.every((w) => {
    const n = normalize(w)
    if (NOT_A_STORE_WORDS.has(n)) return false
    return !NOT_A_STORE_PREFIXES.some((p) => n.startsWith(p))
  })
}

// Quita "lista de la compra" (con "en"/"de" delante si los hay) de lo
// que quede tras reconocer una tienda CONOCIDA — para que "Mercadona
// lista de la compra cepillo de dientes" deje solo "cepillo de dientes"
// como producto, igual que si no se hubiera dicho la frase de la
// compra en absoluto ("Mercadona cepillo de dientes").
function stripShoppingPhrase(text: string): string {
  return text
    .replace(new RegExp(`\\b(?:en\\s+|de\\s+)?${SHOPPING_PLACE_PLAIN}\\b`, 'i'), ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,:]\s*/, '')
    .replace(/[,:]\s*$/, '')
    .trim()
}

// Busca una tienda de la lista de tiendas CONOCIDAS de la familia
// (editable desde Compras — petición real: "que puedas añadir los
// supermercados que quieras... que yo le diga Mercadona, patata,
// Hiperve, leche, y no hayan equivocaciones") en cualquier posición de
// la frase, no solo delante o detrás de "lista de la compra" — así
// funciona igual de bien con o sin esa frase de por medio. Compara
// palabra a palabra, ya normalizado (sin acentos/mayúsculas), para que
// dictados con o sin tilde ("Líder"/"lider") cuenten igual. Se prueban
// las tiendas más largas primero para que un nombre de dos palabras no
// quede tapado por una coincidencia parcial de una sola palabra.
export function findKnownStore(text: string, knownStores: string[]): { store: string; text: string } | null {
  if (knownStores.length === 0) return null
  const tokens = text.split(/(\s+)/)
  const wordIndices: number[] = []
  tokens.forEach((t, i) => {
    if (t.trim()) wordIndices.push(i)
  })
  const normWords = wordIndices.map((i) => normalize(tokens[i]).replace(/[.,;:!?]+$/, ''))

  const candidates = knownStores
    .filter((s) => s.trim())
    .map((raw) => ({ raw, words: normalize(raw).split(/\s+/).filter(Boolean) }))
    .sort((a, b) => b.words.length - a.words.length)

  for (const candidate of candidates) {
    const len = candidate.words.length
    if (len === 0) continue
    for (let start = 0; start + len <= normWords.length; start++) {
      let matched = true
      for (let k = 0; k < len; k++) {
        if (normWords[start + k] !== candidate.words[k]) {
          matched = false
          break
        }
      }
      if (!matched) continue
      const firstTokenIdx = wordIndices[start]
      const lastTokenIdx = wordIndices[start + len - 1]
      const remaining = [...tokens.slice(0, firstTokenIdx), ...tokens.slice(lastTokenIdx + 1)].join('')
      return { store: candidate.raw, text: remaining.replace(/\s+/g, ' ').trim() }
    }
  }
  return null
}

export function extractShoppingStore(
  text: string,
  knownStores: string[] = [],
): { store: string | null; text: string } {
  const known = findKnownStore(text, knownStores)
  if (known) {
    return { store: known.store, text: stripShoppingPhrase(known.text) }
  }

  // A partir de aquí, respaldo por heurística para tiendas que todavía
  // no están en la lista de conocidas.

  // Delante de la frase ("Mercadona, lista de la compra, cepillo de
  // dientes" / "Mercadona lista de la compra cepillo de dientes", con o
  // sin coma) — ver NOT_A_STORE_RE arriba para cómo se descartan las
  // palabras sueltas que no son una tienda.
  const beforeRe = new RegExp(`^([a-zà-ÿ][a-zà-ÿ' ]{1,30}?)\\s*,?\\s*(?:en\\s+)?${SHOPPING_PLACE_PLAIN}\\b\\s*[,:]?\\s*(.*)$`, 'i')
  const before = text.match(beforeRe)
  if (before && before[1].trim() && looksLikeStoreCandidate(before[1])) {
    return { store: before[1].trim(), text: before[2].trim() }
  }

  // Detrás de la frase con "de" ("lista de la compra de Mercadona,
  // patatas" / "lista de la compra de Hipervel Leche") — "de" es la
  // señal inequívoca de que lo que sigue es la tienda. Con coma detrás
  // puede tener varias palabras (misma razón que arriba); sin coma solo
  // se coge la primera palabra, porque ahí no hay nada que marque dónde
  // acaba el nombre de la tienda y empieza el producto.
  const afterWithDeCommaRe = new RegExp(`${SHOPPING_PLACE_PLAIN}\\s+de\\s+([a-zà-ÿ][a-zà-ÿ' ]{1,30}?)\\s*,\\s*(.*)$`, 'i')
  const afterWithDeComma = text.match(afterWithDeCommaRe)
  if (afterWithDeComma && afterWithDeComma[1].trim()) {
    return { store: afterWithDeComma[1].trim(), text: afterWithDeComma[2].trim() }
  }
  const afterWithDeRe = new RegExp(`${SHOPPING_PLACE_PLAIN}\\s+de\\s+([a-zà-ÿ']+)\\b\\s*[,:]?\\s*(.*)$`, 'i')
  const afterWithDe = text.match(afterWithDeRe)
  if (afterWithDe && afterWithDe[1].trim()) {
    return { store: afterWithDe[1].trim(), text: afterWithDe[2].trim() }
  }

  // Detrás de la frase SIN "de" ("lista de la compra Mercadona
  // patatas") — aquí no hay ninguna palabra que marque dónde empieza la
  // tienda, así que solo se reconoce si esa primera palabra empieza en
  // mayúscula (como dicta el móvil los nombres propios/marcas
  // reconocidos) — si no, "leche" en "lista de la compra leche y pan"
  // se colaría como si fuera una tienda.
  const afterNoDeRe = new RegExp(`${SHOPPING_PLACE_PLAIN}\\s+([A-ZÀ-Ÿ][a-zà-ÿ']*)\\b\\s*[,:]?\\s*(.*)$`)
  const afterNoDe = text.match(afterNoDeRe)
  if (afterNoDe && afterNoDe[1].trim()) {
    return { store: afterNoDe[1].trim(), text: afterNoDe[2].trim() }
  }

  return { store: null, text }
}

// Un verbo de guardar explícito al principio de la frase ("apunta",
// "apúntame", "anota", "ponme"...) es una señal mucho más fuerte que
// cualquier palabra suelta de pregunta que pueda aparecer dentro —
// "apunta que tengo que comprar leche" es un ENCARGO para la lista de
// la compra, no la pregunta "¿qué tengo que comprar?" (bug real: se
// confundían porque una y otra comparten ese trocito de frase). Cuando
// la frase empieza así, se salta toda la detección de preguntas y se
// deja caer directo en crear/guardar, tal cual se ha pedido.
const SAVE_VERB_RE = new RegExp(
  `^(?:${SAVE_VERB_ALT}|anade(?:me)?|agrega(?:me)?|crea|guarda(?:me)?(?:lo|la)?|vamos a apuntar|vamos a hacer|hagamos)\\b`,
)

// "Apunta que tengo que comprar leche" empieza como un ENCARGO, no como
// la pregunta "¿qué tengo que comprar?" aunque comparta ese trocito de
// frase (bug real: se confundían). Ahora que cada botón de Pepa ya deja
// claro que se trata de una PREGUNTA, esto solo hace falta como último
// filtro de seguridad: si se pulsa el botón de preguntar pero lo dicho
// suena claramente a un encargo para guardar, mejor decir que no se ha
// entendido que contestar con datos viejos como si fuera la respuesta.
export function looksLikeSaveInstruction(text: string): boolean {
  return SAVE_VERB_RE.test(normalize(text))
}

export type CalendarQuery =
  | { type: 'tasks_today'; memberHint: string | null; when: 'today' | 'tomorrow'; explicitDate: string | null; nowOnly: boolean }
  | { type: 'next_calendar_event' }

// El botón "🐣📅 Pepa Calendario" ya deja claro que la pregunta es sobre
// el calendario — no hace falta reconocer palabras clave concretas
// ("qué tengo", "hoy"...) para saber DE QUÉ trata, solo para sacar el
// día/persona/hora de lo dicho. Lo único que sigue distinguiéndose
// dentro de esta categoría es "el próximo evento en general" frente a
// "lo de un día concreto" — para lo demás, cualquier frase se entiende
// como una pregunta sobre un día (hoy, salvo que diga otra cosa).
// `today` se recibe desde fuera (no `new Date()` aquí) para poder
// probar esta función con una fecha fija.
export function parseCalendarQuery(text: string, today: Date): CalendarQuery {
  const n = normalize(text)

  if (NEXT_EVENT_RE.test(n)) {
    return { type: 'next_calendar_event' }
  }

  const spokenDate = extractSpokenDate(n, today)
  // "de septiembre" no puede colarse como nombre de persona a través
  // del "de X" suelto — solo cuenta si la palabra no es un mes.
  const deMatch = n.match(/\bde (\w+)\b/)
  const deFallback = deMatch && !MONTHS.includes(deMatch[1]) ? deMatch : null
  const match = n.match(/\bsoy (\w+)/) ?? n.match(/\bpara (\w+)/) ?? deFallback
  const when: 'today' | 'tomorrow' = /\bmanana\b/.test(n) ? 'tomorrow' : 'today'
  const nowOnly = /\bahora\b/.test(n)
  return {
    type: 'tasks_today',
    memberHint: match ? match[1] : null,
    when,
    explicitDate: spokenDate?.date ?? null,
    nowOnly,
  }
}

// El botón "🐣🛒 Pepa Compra" ya deja claro que la pregunta es sobre la
// lista de la compra — lo único que hace falta sacar de lo dicho es de
// QUÉ tienda, si se ha nombrado alguna. Antes esto solo miraba si
// aparecía la palabra "de" justo delante del nombre de la tienda ("lista
// de la compra DE Mercadona") — el reconocimiento de voz del móvil no
// siempre transcribe esa palabra suelta (bug real: preguntar por
// Mercadona a veces contestaba también con lo de Aldi, porque al perderse
// el "de" se entendía como pregunta general). Ahora se busca primero
// cualquier tienda YA DADA DE ALTA en cualquier parte de la frase — igual
// de fiable esté o no la palabra "de" de por medio — y solo si no hay
// ninguna conocida se cae al truco antiguo del "de X" como respaldo para
// tiendas que todavía no están en la lista.
export function parseShoppingQuery(
  text: string,
  knownStores: string[] = [],
): { storeHint: string | null; general: boolean } {
  const known = findKnownStore(text, knownStores)
  if (known) return { storeHint: known.store, general: false }

  const storeMatch = text.match(/(?:lista de la compra|la compra|las compras)\s+de\s+([a-zà-ÿ][a-zà-ÿ' ]{1,30})/i)
  const storeHint = storeMatch ? storeMatch[1].trim() : null
  return { storeHint, general: storeHint === null }
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}

// Empareja lo dicho ("soy pago") con un nombre real de la familia ("Paco")
// de forma tolerante — el reconocimiento de voz no siempre acierta el
// nombre exacto. Primero por substring (cubre diminutivos: "Fer" dentro
// de "Fernando"); si no hay, por distancia de edición corta (bug real:
// "soy pago" no reconocía a "Paco" — ninguno es substring del otro pero
// se diferencian en una sola letra).
export function matchMemberByHint<T extends { name: string }>(hint: string, members: T[]): T | null {
  const n = normalize(hint)

  const substringMatch = members.find((m) => {
    const mn = normalize(m.name)
    return mn.includes(n) || n.includes(mn)
  })
  if (substringMatch) return substringMatch

  let best: T | null = null
  let bestDist = Infinity
  for (const m of members) {
    const dist = levenshtein(normalize(m.name), n)
    if (dist < bestDist) {
      bestDist = dist
      best = m
    }
  }
  const threshold = n.length <= 4 ? 1 : 2
  return bestDist <= threshold ? best : null
}

// A veces el nombre no viene con "soy X"/"para X" delante, se dice
// suelto ("Jennifer, ¿qué tengo que hacer hoy?") — se busca directamente
// en toda la frase por si algún nombre de la familia aparece tal cual
// (bug real: preguntar así no filtraba por persona, así que salían
// también las tareas de otro miembro).
export function findMemberInText<T extends { name: string }>(text: string, members: T[]): T | null {
  const n = normalize(text)
  for (const m of members) {
    const re = new RegExp(`\\b${normalize(m.name)}\\b`)
    if (re.test(n)) return m
  }
  return null
}
