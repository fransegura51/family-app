// Al volver a una lista (desde una publicación, por ejemplo) se conservan la posición de desplazamiento, los filtros, el orden y lo ya cargado. Vive en
// sessionStorage (se pierde al cerrar la pestaña, como debe ser) y siempre con try/catch: puede no estar disponible.
//
// Regla aprobada: al VOLVER ATRÁS (navegación POP de React Router) se restaura todo; al entrar de nuevo en la sección (navegación normal) el orden vuelve a
// «Más recientes». Quien usa esto debe llamar a loadListState solo cuando `useNavigationType() === 'POP'`.

export interface ListState<T = unknown> {
  scrollY: number
  order: string
  topic: string | null
  kind: string | null
  query?: string
  offset: number
  items: T[]
  savedAt: number
}

const PREFIX = 'pepa:community-list:'
const MAX_AGE_MS = 30 * 60 * 1000

export function saveListState<T>(key: string, state: Omit<ListState<T>, 'savedAt'>): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ ...state, savedAt: Date.now() }))
  } catch {
    // Sin almacenamiento: la lista simplemente se recarga.
  }
}

export function loadListState<T>(key: string): ListState<T> | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return null
    const state = JSON.parse(raw) as ListState<T>
    if (!state || typeof state.savedAt !== 'number' || Date.now() - state.savedAt > MAX_AGE_MS) return null
    return state
  } catch {
    return null
  }
}

export function clearListState(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key)
  } catch {
    // Nada que borrar.
  }
}

// Portada de Comunidad: no es una lista paginada sino varios bloques, así que guarda lo suyo (bloques ya cargados, texto del buscador y posición).
// Misma regla que las listas: solo se recupera al VOLVER ATRÁS (POP) y caduca a los 30 minutos.
export interface HomeState<B = unknown> {
  scrollY: number
  text: string
  blocks: B
  savedAt: number
}

export const HOME_STATE_KEY = 'home'

export function saveHomeState<B>(state: Omit<HomeState<B>, 'savedAt'>): void {
  try {
    sessionStorage.setItem(PREFIX + HOME_STATE_KEY, JSON.stringify({ ...state, savedAt: Date.now() }))
  } catch {
    // Sin almacenamiento: la portada simplemente se recarga.
  }
}

export function loadHomeState<B>(): HomeState<B> | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + HOME_STATE_KEY)
    if (!raw) return null
    const state = JSON.parse(raw) as HomeState<B>
    if (!state || typeof state.savedAt !== 'number' || Date.now() - state.savedAt > MAX_AGE_MS) return null
    if (typeof state.scrollY !== 'number' || typeof state.text !== 'string' || typeof state.blocks !== 'object' || state.blocks === null) return null
    return state
  } catch {
    return null
  }
}
