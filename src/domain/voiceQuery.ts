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

const TASK_PATTERNS = ['tarea', 'que tengo que hacer', 'que hago ahora', 'que hago hoy', 'que me toca']

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

// Empareja lo dicho ("soy pago") con un nombre real de la familia ("Paco")
// de forma tolerante — el reconocimiento de voz no siempre acierta el
// nombre exacto, así que basta con que uno contenga al otro.
export function matchMemberByHint<T extends { name: string }>(hint: string, members: T[]): T | null {
  const n = normalize(hint)
  return members.find((m) => {
    const mn = normalize(m.name)
    return mn.includes(n) || n.includes(mn)
  }) ?? null
}
