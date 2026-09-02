// Reconoce un puñado de preguntas frecuentes dentro de lo que se dicta
// ("¿qué tareas tengo hoy?", "repásame la lista de la compra") sin usar
// ningún servicio de IA de pago — solo coincidencia de palabras clave.
// Deliberadamente limitado a estas dos preguntas: cubre lo que se ha
// pedido sin fingir entender cualquier frase libre.
import { extractSpokenDate, MONTHS } from '@/domain/spokenDate'

export type VoiceIntent =
  | { type: 'tasks_today'; memberHint: string | null; when: 'today' | 'tomorrow'; explicitDate: string | null; nowOnly: boolean }
  | { type: 'shopping_list'; storeHint: string | null }
  | { type: 'next_calendar_event' }
  | { type: 'unsupported_delete' }
  | { type: 'none' }

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos: qué -> que
    .trim()
}

// OJO: nunca la frase suelta "lista de la compra" — eso también aparece
// en frases que NO son una pregunta ("Pepa, vamos a hacer la lista de
// la compra, leche y pan"), y antes se confundía con "qué hay en la
// lista de la compra" y respondía con lo que ya había en vez de añadir
// los productos nuevos (bug real). Solo cuentan como pregunta las
// formas que de verdad preguntan algo.
// Antes era una lista de frases EXACTAS ("qué hay en la lista de la
// compra"...) que se quedaba corta en cuanto se decía de otra forma tan
// natural como esa — "qué TENEMOS en lista de la compra" no coincidía
// con nada y Pepa lo guardaba como un apunte nuevo en vez de responder
// (bug real repetido varias veces). Con una expresión que junta
// cualquier forma de preguntar (hay/tengo/tenemos/falta) con cualquier
// forma de decir "la compra" no hace falta seguir añadiendo frases
// sueltas cada vez que se dice de una manera distinta.
const SHOPPING_RE =
  /\b(que hay|que tengo|que tenemos|que falta)\b[\s\S]*\b(en (la )?(lista de la )?compra|que comprar|para comprar)\b|\b(repasa|repasame)\b[\s\S]*\bcompra\b/

// En 1ª persona singular ("qué tengo que hacer"), plural ("qué tenemos
// que hacer todos") y en 3ª ("qué tiene que hacer Paco") — bug real
// repetido varias veces: cada vez que faltaba UNA combinación concreta
// de persona (tengo/tiene/tenemos) y tiempo (hoy/mañana/ahora/una
// fecha) en la lista de frases exactas, esa combinación se colaba como
// una tarea nueva en vez de responder (los últimos dos encontrados:
// "qué TIENE ahora" y "qué TENEMOS ahora" — solo estaba "qué TENGO
// ahora"). En vez de seguir añadiendo frases sueltas una a una, se
// junta cualquier persona con cualquier tiempo de una sola vez, para
// que no pueda volver a faltar ninguna combinación.
const TASK_RE =
  /\btareas?\b|\b(que tengo|que tiene|que tenemos)\b[\s\S]*\b(que hacer|hoy|manana|ahora|el)\b|\b(que hago|que hace|que hacemos)\b[\s\S]*\b(ahora|hoy)\b|\bque (me|le|nos) toca\b|\bque toca hacer\b/

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

// A qué pantalla se refiere lo dictado, mirando el CONTENIDO en vez de
// solo la pantalla en la que estés — "Pepa, ponme en el calendario que
// el 27 de octubre es el cumpleaños de mi mujer" tiene que ir al
// calendario aunque lo digas estando en Compras, no guardarse donde
// estuvieras (bug real: antes solo miraba la pantalla actual). Cuando no
// hay ninguna pista clara, se deja en null y quien llame cae en la
// pantalla actual, como antes.
export function detectTargetFromText(text: string): 'calendario' | 'compras' | null {
  const n = normalize(text)
  if (/\bcalendario\b/.test(n) || MONTHS.some((m) => n.includes(` de ${m}`))) return 'calendario'
  // Cualquier palabra de la familia "compr-" (compra, compras, comprar,
  // comprado...) — antes solo contaba el verbo "comprar" o la frase
  // exacta "lista de la compra", y decir "ponlo en la compra" o
  // "apúntamelo en las compras" (formas tan naturales como esas) no
  // coincidía con nada y se perdía la pista (bug real reportado: se
  // apuntaba en Tareas en vez de en la lista de la compra).
  if (/\bcompr\w*\b/.test(n)) return 'compras'
  // Ya no hay una pestaña de "tareas" aparte — una tarea es un evento
  // del calendario (petición real: "quitamos la pestaña de tarea...
  // lo dejamos todo como evento"), así que decir "tarea" también apunta
  // a Calendario, que ya reconoce a quién es, la fecha y la hora.
  if (/\btarea\w*\b/.test(n)) return 'calendario'
  return null
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

export function extractShoppingStore(text: string): { store: string | null; text: string } {
  // Delante de la frase, siempre con coma detrás ("Mercadona, lista de
  // la compra, patatas") — la coma es lo que distingue de verdad un
  // nombre de tienda de una palabra suelta que venga antes por otro
  // motivo (p. ej. "mañana en la lista de la compra..."), que sin coma
  // no debe confundirse con una tienda.
  // Con coma, la tienda puede tener varias palabras ("Hiper Ber, lista
  // de la compra, aceite") porque la coma ya marca sin ambigüedad dónde
  // acaba el nombre.
  const beforeRe = new RegExp(`^([a-zà-ÿ][a-zà-ÿ' ]{1,30}?)\\s*,\\s*(?:en\\s+)?${SHOPPING_PLACE_PLAIN}\\b\\s*[,:]?\\s*(.*)$`, 'i')
  const before = text.match(beforeRe)
  if (before && before[1].trim()) {
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

// `today` se recibe desde fuera (no `new Date()` aquí) para poder
// probar esta función con una fecha fija, igual que el resto del
// reconocimiento de calendario.
export function detectIntent(text: string, today: Date): VoiceIntent {
  const n = normalize(text)

  // Antes que nada: si claramente se pide BORRAR algo, no se intenta
  // interpretar como pregunta ni como cita nueva — Pepa todavía no
  // borra por voz, así que hay que decirlo en vez de crear basura.
  if (DELETE_RE.test(n)) {
    return { type: 'unsupported_delete' }
  }

  if (SAVE_VERB_RE.test(n)) {
    return { type: 'none' }
  }

  // Antes que las tareas: "lo siguiente que tengo en el calendario"
  // también contiene "que tengo", que si no se comprobara esto primero
  // se colaría como pregunta de tareas.
  if (NEXT_EVENT_RE.test(n)) {
    return { type: 'next_calendar_event' }
  }

  if (SHOPPING_RE.test(n)) {
    // "Qué tengo en la lista de la compra DE MERCADONA" — si nombra una
    // tienda concreta, se guarda tal cual se ha dicho (con mayúsculas
    // originales) para poder filtrar solo esa tienda al responder.
    const storeMatch = text.match(/(?:lista de la compra|la compra|las compras)\s+de\s+([a-zà-ÿ][a-zà-ÿ' ]{1,30})/i)
    return { type: 'shopping_list', storeHint: storeMatch ? storeMatch[1].trim() : null }
  }

  // "¿Qué tengo que hacer el nueve de septiembre?" es tan pregunta como
  // "¿qué tengo que hacer hoy?" — antes solo se reconocían "hoy"/
  // "mañana"/"ahora", así que decir una fecha concreta hacía que la
  // frase entera cayera en la creación de un evento nuevo en vez de
  // responder (bug real: dos citas basura creadas a partir de la propia
  // pregunta).
  if (TASK_RE.test(n)) {
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

  return { type: 'none' }
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
