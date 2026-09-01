// Reconoce un puñado de preguntas frecuentes dentro de lo que se dicta
// ("¿qué tareas tengo hoy?", "repásame la lista de la compra") sin usar
// ningún servicio de IA de pago — solo coincidencia de palabras clave.
// Deliberadamente limitado a estas dos preguntas: cubre lo que se ha
// pedido sin fingir entender cualquier frase libre.

export type VoiceIntent =
  | { type: 'tasks_today'; memberHint: string | null }
  | { type: 'shopping_list' }
  | { type: 'none' }

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos: qué -> que
    .trim()
}

const SHOPPING_PATTERNS = [
  'lista de la compra',
  'que hay que comprar',
  'que tengo que comprar',
  'que falta en la compra',
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
]

export function detectIntent(text: string): VoiceIntent {
  const n = normalize(text)

  if (SHOPPING_PATTERNS.some((p) => n.includes(p))) {
    return { type: 'shopping_list' }
  }

  if (TASK_PATTERNS.some((p) => n.includes(p))) {
    const match = n.match(/\bsoy (\w+)/) ?? n.match(/\bpara (\w+)/) ?? n.match(/\bde (\w+)\b/)
    return { type: 'tasks_today', memberHint: match ? match[1] : null }
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
