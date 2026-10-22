import { normalizeText } from '@/help/search/normalize'

// Cliente de la búsqueda con IA de la Ayuda. Limita el consumo y protege de llamadas repetitivas ANTES de salir del dispositivo:
//  - como mucho una llamada cada 2,5 segundos y 20 por sesión de la app;
//  - la misma pregunta (normalizada) no se repite: se reutiliza la respuesta de la sesión;
//  - cualquier fallo (sin red, IA apagada, cuenta no adulta, tope diario del servidor) devuelve null y la Ayuda sigue con la búsqueda local.
// Solo viaja la pregunta (con los nombres de personas sustituidos por alias), las últimas preguntas de la consulta y la lista de fichas (identificador + título) que esa persona
// puede ver. Nunca datos de la familia ni contenido de las pantallas. Se pide a la IA que devuelva identificadores de esa lista; la app descarta cualquier otro.
export interface HelpAiCandidate {
  id: string
  title: string
}

export interface HelpAiDeps {
  call: (name: string, body: Record<string, unknown>) => Promise<unknown>
  aliasize: (text: string) => Promise<string>
  now: () => number
}

export const HELP_AI_MIN_INTERVAL_MS = 2500
export const HELP_AI_SESSION_CAP = 20
const MAX_QUERY = 300

let lastCallAt = 0
let callsThisSession = 0
const cache = new Map<string, string[]>()

export function resetHelpAiForTests(): void {
  lastCallAt = 0
  callsThisSession = 0
  cache.clear()
}

async function defaultDeps(): Promise<HelpAiDeps> {
  // Import perezoso: así la Ayuda sin IA no arrastra el cliente del servidor.
  const { callAiFunction, loadAliasMap } = await import('@/services/aiClient')
  return {
    call: callAiFunction,
    aliasize: async (text) => (await loadAliasMap()).aliasize(text),
    now: () => Date.now(),
  }
}

export async function rankHelpWithAi(query: string, pool: HelpAiCandidate[], recent: string[], deps?: HelpAiDeps): Promise<string[] | null> {
  const q = query.trim().slice(0, MAX_QUERY)
  if (!q || pool.length === 0) return null
  const key = normalizeText(q)
  const cached = cache.get(key)
  if (cached) return cached
  const d = deps ?? (await defaultDeps())
  const t = d.now()
  if (callsThisSession >= HELP_AI_SESSION_CAP) return null
  if (t - lastCallAt < HELP_AI_MIN_INTERVAL_MS) return null
  lastCallAt = t
  callsThisSession += 1
  try {
    const body = {
      query: await d.aliasize(q),
      candidates: pool.slice(0, 140).map((c) => ({ id: c.id, title: c.title })),
      recent: await Promise.all(recent.slice(-3).map((r) => d.aliasize(r.slice(0, MAX_QUERY)))),
    }
    const json = (await d.call('help-search', body)) as { ids?: unknown }
    const allowed = new Set(pool.map((c) => c.id))
    const ids = Array.isArray(json?.ids) ? json.ids.filter((x): x is string => typeof x === 'string' && allowed.has(x)).slice(0, 3) : []
    cache.set(key, ids)
    return ids
  } catch {
    return null
  }
}
