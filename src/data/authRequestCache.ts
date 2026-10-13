// Memoria corta de las dos consultas que la app repetía ANTES de cada operación: «¿quién eres?» (supabase.auth.getUser, una llamada de red al servidor de
// sesiones) y «¿de qué familia eres?» (select family_id de profiles). Hay ~60 funciones de datos que empiezan por ahí, y cada una pagaba esos dos viajes:
// guardar 6 productos de la compra eran 18 llamadas seguidas, y una respuesta de Pepa podía tardar segundos (queja real: «tarda mucho en guardar»,
// «la respuesta es muy lenta»). También gastaba llamadas de Supabase por nada.
//
// Seguridad: no se salta ninguna comprobación del servidor. Cada petición real sigue llevando el token y pasando por RLS; solo se evita REPETIR la misma
// pregunta de identidad en unos segundos. Se vacía al iniciar o cerrar sesión (supabaseClient.ts). Todo es puro (sin importar Supabase) para poder probarlo.

export const GETUSER_TTL_MS = 60_000
export const FAMILY_TTL_MS = 30_000

type Clock = () => number

// «supabase.auth.getUser()» sin argumentos, con la última respuesta buena recordada mientras no cambie el token ni pase el tiempo.
export function memoizeGetUser<R extends { error: unknown; data: { user: unknown } }>(
  original: () => Promise<R>,
  currentToken: () => Promise<string | null>,
  now: Clock = Date.now,
  ttlMs = GETUSER_TTL_MS,
): { call: () => Promise<R>; clear: () => void } {
  let cached: { token: string; at: number; result: R } | null = null
  let inflight: { token: string; promise: Promise<R> } | null = null

  return {
    call: async () => {
      const token = await currentToken()
      if (!token) return original() // sin sesión: el comportamiento de siempre (da el error de «no autenticado»)
      if (cached && cached.token === token && now() - cached.at < ttlMs) return cached.result
      if (inflight && inflight.token === token) return inflight.promise
      const promise = original()
        .then((result) => {
          if (!result.error && result.data.user) cached = { token, at: now(), result }
          return result
        })
        .finally(() => {
          if (inflight?.promise === promise) inflight = null
        })
      inflight = { token, promise }
      return promise
    },
    clear: () => {
      cached = null
      inflight = null
    },
  }
}

// Solo la consulta exacta de familia que hacen las funciones de datos: GET .../rest/v1/profiles?select=family_id&id=eq.<uuid>
const FAMILY_QUERY_RE = /\/rest\/v1\/profiles\?select=family_id&id=eq\.[0-9a-f-]{36}$/i
const FAMILY_CHANGE_RE = /\/rest\/v1\/(?:profiles(?:\?|$)|rpc\/(?:create_family|join_family_with_code)(?:\?|$))/i

interface FamilyEntry {
  at: number
  body: string
  status: number
  statusText: string
  headers: [string, string][]
}

function responseFrom(entry: FamilyEntry): Response {
  return new Response(entry.body, { status: entry.status, statusText: entry.statusText, headers: entry.headers })
}

export function memoizeFamilyFetch(
  baseFetch: typeof fetch,
  now: Clock = Date.now,
  ttlMs = FAMILY_TTL_MS,
): { fetch: typeof fetch; clear: () => void } {
  const cache = new Map<string, FamilyEntry>()
  const inflight = new Map<string, Promise<FamilyEntry | null>>()

  const wrapped: typeof fetch = async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    // Si algo cambia la familia de la persona (crear una familia, unirse con un código, editar su perfil), lo recordado se olvida al momento.
    if (method !== 'GET' && FAMILY_CHANGE_RE.test(url)) cache.clear()
    if (method !== 'GET' || !FAMILY_QUERY_RE.test(url)) return baseFetch(input, init)

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    // La clave incluye el token: otra sesión nunca recibe lo de la anterior.
    const key = `${url}|${headers.get('authorization') ?? ''}|${headers.get('accept') ?? ''}`
    const hit = cache.get(key)
    if (hit && now() - hit.at < ttlMs) return responseFrom(hit)
    const running = inflight.get(key)
    if (running) {
      // Otra llamada igual ya está en camino: se espera su respuesta en vez de repetirla.
      const entry = await running
      return entry ? responseFrom(entry) : baseFetch(input, init)
    }

    let resolveEntry: (entry: FamilyEntry | null) => void = () => undefined
    inflight.set(
      key,
      new Promise<FamilyEntry | null>((resolve) => {
        resolveEntry = resolve
      }),
    )
    try {
      const response = await baseFetch(input, init)
      if (response.status === 200) {
        const copy = response.clone()
        const entry: FamilyEntry = { at: now(), body: await copy.text(), status: copy.status, statusText: copy.statusText, headers: [...copy.headers.entries()] }
        cache.set(key, entry)
        resolveEntry(entry)
      } else {
        resolveEntry(null)
      }
      return response
    } catch (err) {
      resolveEntry(null)
      throw err
    } finally {
      inflight.delete(key)
    }
  }

  return { fetch: wrapped, clear: () => cache.clear() }
}
