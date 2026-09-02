// Reconoce un puñado de preguntas frecuentes dentro de lo que se dicta
// ("¿qué tareas tengo hoy?", "repásame la lista de la compra") sin usar
// ningún servicio de IA de pago — solo coincidencia de palabras clave.
// Deliberadamente limitado a estas dos preguntas: cubre lo que se ha
// pedido sin fingir entender cualquier frase libre.
import { extractSpokenDate, MONTHS } from '@/domain/spokenDate'

export type VoiceIntent =
  | { type: 'tasks_today'; memberHint: string | null; when: 'today' | 'tomorrow'; explicitDate: string | null; nowOnly: boolean }
  | { type: 'shopping_list' }
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
const SHOPPING_PATTERNS = [
  'que hay en la lista de la compra',
  'que hay en la compra',
  'que hay que comprar',
  'que tengo que comprar',
  'que falta en la compra',
  'que falta en la lista de la compra',
  'repasa la lista de la compra',
  'repasame la lista de la compra',
]

// En 1ª persona singular ("qué tengo que hacer"), plural ("qué tenemos
// que hacer todos") y en 3ª ("qué tiene que hacer Paco") — bug real:
// preguntar en plural o por otro miembro en 3ª persona no se reconocía
// como pregunta y se guardaba como una tarea nueva.
const TASK_PATTERNS = [
  'tarea',
  'que tengo que hacer',
  'que tiene que hacer',
  'que tenemos que hacer',
  'que hago ahora',
  'que hace ahora',
  'que hacemos ahora',
  'que hago hoy',
  'que hace hoy',
  'que hacemos hoy',
  'que me toca',
  'que le toca',
  'que nos toca',
  'que toca hacer',
  // Formas cortas sin "que hacer" — "¿qué tengo mañana?" es tan natural
  // como "¿qué tengo que hacer mañana?" (bug real: la forma corta no se
  // reconocía como pregunta).
  'que tengo hoy',
  'que tengo manana',
  'que tengo para hoy',
  'que tengo para manana',
  'que tengo ahora',
  'que tiene hoy',
  'que tiene manana',
  'que tiene para hoy',
  'que tiene para manana',
  'que tenemos hoy',
  'que tenemos manana',
  // "Para" en medio ("qué tenemos PARA hoy") no coincidía con ninguna
  // de las anteriores y la frase entera caía en crear una cita nueva en
  // vez de responder (bug real reportado: "sigue poniéndome una nota
  // en el calendario").
  'que tenemos para hoy',
  'que tenemos para manana',
  // "¿Qué tengo el nueve de septiembre?" es tan pregunta como "¿qué
  // tengo hoy?", pero sin "hoy"/"mañana"/"ahora" no coincidía con nada
  // de lo anterior y se guardaba como una cita nueva con ese literal
  // por título (bug real reportado: hacía falta distinguir preguntar
  // por una fecha de apuntar algo en ella). El guardián SAVE_VERB_RE de
  // más abajo evita que esto se confunda con un encargo real que
  // mencione una fecha ("apunta que tengo cita el 9 de septiembre").
  'que tengo el',
  'que tiene el',
  'que tenemos el',
]

// "Lo siguiente que tengo en el calendario" — a diferencia de las
// tareas, esto pregunta por el próximo EVENTO del calendario (cita,
// cumpleaños...), no por tareas del día.
const NEXT_EVENT_PATTERNS = [
  'lo siguiente en el calendario',
  'lo siguiente que tengo',
  'que tengo en el calendario',
  'que tengo apuntado',
  'proxima cita',
  'proximo evento',
  'siguiente cita',
  'siguiente evento',
]

// Pepa todavía no borra nada por voz — sin este aviso, "borra la cita
// del nueve de septiembre" no se reconocía como nada especial y caía
// en la creación de un evento nuevo con ese texto literal por título
// (bug real reportado: se apuntaba "Borra la cita del" como una cita
// más, justo lo contrario de lo que se pedía).
const DELETE_PATTERNS = [
  'borra la cita',
  'borra el evento',
  'borrar la cita',
  'borrar el evento',
  'elimina la cita',
  'elimina el evento',
  'eliminar la cita',
  'eliminar el evento',
  'quita la cita',
  'quitar la cita',
]

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

const LIST_FILLER_PREFIXES = [
  new RegExp(`^vamos a hacer\\s*(${TARGET_PLACE})?[,.]?\\s*`, 'i'),
  new RegExp(`^hagamos\\s*(${TARGET_PLACE})?[,.]?\\s*`, 'i'),
  new RegExp(`^vamos a apuntar\\s*(en ${TARGET_PLACE})?[,.]?\\s*(que)?\\s*`, 'i'),
  new RegExp(`^(apunta|apuntame|anota|anotame|ponme|pon)\\s*(en ${TARGET_PLACE})?[,.]?\\s*(que)?\\s*`, 'i'),
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
// calendario aunque lo digas estando en Tareas, no guardarse donde
// estuvieras (bug real: antes solo miraba la pantalla actual). Cuando no
// hay ninguna pista clara, se deja en null y quien llame cae en la
// pantalla actual, como antes.
export function detectTargetFromText(text: string): 'calendario' | 'compras' | 'tareas' | null {
  const n = normalize(text)
  if (/\bcalendario\b/.test(n) || MONTHS.some((m) => n.includes(` de ${m}`))) return 'calendario'
  // Cualquier palabra de la familia "compr-" (compra, compras, comprar,
  // comprado...) — antes solo contaba el verbo "comprar" o la frase
  // exacta "lista de la compra", y decir "ponlo en la compra" o
  // "apúntamelo en las compras" (formas tan naturales como esas) no
  // coincidía con nada y se perdía la pista (bug real reportado: se
  // apuntaba en Tareas en vez de en la lista de la compra).
  if (/\bcompr\w*\b/.test(n)) return 'compras'
  // Sin el límite de palabra al final ("tarea\b"), el plural "tareas" —
  // la forma más natural de decirlo — no coincidía nunca (mismo bug).
  if (/\btarea\w*\b/.test(n)) return 'tareas'
  return null
}

// Un verbo de guardar explícito al principio de la frase ("apunta",
// "apúntame", "anota", "ponme"...) es una señal mucho más fuerte que
// cualquier palabra suelta de pregunta que pueda aparecer dentro —
// "apunta que tengo que comprar leche" es un ENCARGO para la lista de
// la compra, no la pregunta "¿qué tengo que comprar?" (bug real: se
// confundían porque una y otra comparten ese trocito de frase). Cuando
// la frase empieza así, se salta toda la detección de preguntas y se
// deja caer directo en crear/guardar, tal cual se ha pedido.
const SAVE_VERB_RE =
  /^(apunta(me)?|anota(me)?|pon(me)?|anade(me)?|agrega(me)?|crea|guarda(me)?|vamos a apuntar|vamos a hacer|hagamos)\b/

// `today` se recibe desde fuera (no `new Date()` aquí) para poder
// probar esta función con una fecha fija, igual que el resto del
// reconocimiento de calendario.
export function detectIntent(text: string, today: Date): VoiceIntent {
  const n = normalize(text)

  // Antes que nada: si claramente se pide BORRAR algo, no se intenta
  // interpretar como pregunta ni como cita nueva — Pepa todavía no
  // borra por voz, así que hay que decirlo en vez de crear basura.
  if (DELETE_PATTERNS.some((p) => n.includes(p))) {
    return { type: 'unsupported_delete' }
  }

  if (SAVE_VERB_RE.test(n)) {
    return { type: 'none' }
  }

  // Antes que las tareas: "lo siguiente que tengo en el calendario"
  // también contiene "que tengo", que si no se comprobara esto primero
  // se colaría como pregunta de tareas.
  if (NEXT_EVENT_PATTERNS.some((p) => n.includes(p))) {
    return { type: 'next_calendar_event' }
  }

  if (SHOPPING_PATTERNS.some((p) => n.includes(p))) {
    return { type: 'shopping_list' }
  }

  // "¿Qué tengo que hacer el nueve de septiembre?" es tan pregunta como
  // "¿qué tengo que hacer hoy?" — antes solo se reconocían "hoy"/
  // "mañana"/"ahora", así que decir una fecha concreta hacía que la
  // frase entera cayera en la creación de un evento nuevo en vez de
  // responder (bug real: dos citas basura creadas a partir de la propia
  // pregunta).
  if (TASK_PATTERNS.some((p) => n.includes(p))) {
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
