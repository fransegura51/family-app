// Estado COMPARTIDO de las alergias e intolerancias de la familia (DATOS DE SALUD, RGPD art. 9) para las pantallas de Familia y de Cocina.
// COSTE: una sola lectura (dietary_list) compartida por todas las pantallas y tarjetas; nada de llamadas por receta ni por tarjeta. Se vuelve a pedir solo si
// quien llama acepta datos más viejos que `maxAgeMs` (las recetas: 10 minutos, para no ignorar una alergia anotada desde otro móvil) o si se pide a la fuerza.
// PRIVACIDAD: los datos viven SOLO en la memoria de esta pestaña. No se guardan en localStorage, sessionStorage, IndexedDB, URL ni registros; se borran al
// cerrar sesión. Los errores solo llevan las frases fijas de DIETARY_ERROR_TEXT.
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { supabase } from '@/data/supabaseClient'
import { DIETARY_ERROR_TEXT, DietaryError, loadDietaryOverview, type DietaryOverview } from '@/data/dietaryRestrictions'
import { isDietaryFeatureEnabled } from '@/domain/dietaryFeature'

export type FamilyDietaryStatus = 'idle' | 'loading' | 'ready' | 'error'
export interface FamilyDietaryState {
  status: FamilyDietaryStatus
  overview: DietaryOverview | null
  // Frase fija (nunca el texto de un error ni datos de salud).
  errorText: string | null
  // Cuándo terminó la última lectura (correcta o fallida), para no repetir la petición enseguida.
  settledAt: number | null
}

const INITIAL: FamilyDietaryState = { status: 'idle', overview: null, errorText: null, settledAt: null }
let state: FamilyDietaryState = INITIAL
let inflight: Promise<void> | null = null
// Cada «reset» (cerrar sesión) sube la generación: una lectura que termina después de cerrar sesión se descarta.
let generation = 0
let authWatched = false
const listeners = new Set<() => void>()

// Tras un fallo no se reintenta solo antes de este tiempo (evita una avalancha de peticiones si el servidor aún no tiene la función).
const ERROR_RETRY_MS = 2 * 60 * 1000

function setState(next: FamilyDietaryState) {
  state = next
  for (const l of [...listeners]) l()
}

export function getFamilyDietaryState(): FamilyDietaryState {
  return state
}
export function subscribeFamilyDietary(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Al cerrar sesión se borra todo de la memoria (otra persona podría entrar después en el mismo navegador).
function watchSignOut() {
  if (authWatched) return
  authWatched = true
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') resetFamilyDietary()
    })
  } catch {
    // Sin suscripción (entornos sin Supabase): el estado sigue siendo solo de memoria.
  }
}

export function resetFamilyDietary(): void {
  generation += 1
  inflight = null
  setState(INITIAL)
}

function load(): Promise<void> {
  // Interruptor apagado (domain/dietaryFeature.ts): ninguna llamada al servidor.
  if (!isDietaryFeatureEnabled()) return Promise.resolve()
  if (inflight) return inflight
  watchSignOut()
  const gen = generation
  // Si ya hay datos se siguen enseñando mientras se refrescan (status no vuelve a «loading»).
  setState({ ...state, status: state.overview ? state.status : 'loading', errorText: null })
  const run = (async () => {
    try {
      const overview = await loadDietaryOverview()
      if (gen !== generation) return
      setState({ status: 'ready', overview, errorText: null, settledAt: Date.now() })
    } catch (e) {
      if (gen !== generation) return
      const text = e instanceof DietaryError ? e.message : DIETARY_ERROR_TEXT.network
      // Un refresco fallido no tira los datos que ya había.
      if (state.overview) setState({ ...state, status: 'ready', errorText: null, settledAt: Date.now() })
      else setState({ status: 'error', overview: null, errorText: text, settledAt: Date.now() })
    } finally {
      if (gen === generation) inflight = null
    }
  })()
  inflight = run
  return run
}

// Pide la lectura si hace falta: nunca si ya hay una en curso; con datos recientes tampoco.
export function ensureFamilyDietaryLoaded(options: { maxAgeMs?: number } = {}): Promise<void> {
  if (!isDietaryFeatureEnabled()) return Promise.resolve()
  if (inflight) return inflight
  const { maxAgeMs = Number.POSITIVE_INFINITY } = options
  const age = state.settledAt === null ? Number.POSITIVE_INFINITY : Date.now() - state.settledAt
  if (state.status === 'idle') return load()
  if (state.status === 'error') return age >= ERROR_RETRY_MS ? load() : Promise.resolve()
  if (state.status === 'ready' && age >= maxAgeMs) return load()
  return Promise.resolve()
}

// Lectura a la fuerza (botón «Volver a intentarlo»).
export function reloadFamilyDietary(): Promise<void> {
  return load()
}

// Cambios hechos aquí (alta, edición, borrado, consentimiento): se reflejan en memoria SIN volver a leer del servidor.
export function updateFamilyDietaryOverview(change: (current: DietaryOverview) => DietaryOverview): void {
  if (!state.overview) return
  setState({ ...state, overview: change(state.overview) })
}

export interface UseFamilyDietaryOptions {
  // false = no pide nada al montar (la tarjeta de Familia pide al abrirse). Por defecto true (las recetas).
  autoLoad?: boolean
  maxAgeMs?: number
}

export function useFamilyDietary(options: UseFamilyDietaryOptions = {}) {
  const { autoLoad = true, maxAgeMs } = options
  const snapshot = useSyncExternalStore(subscribeFamilyDietary, getFamilyDietaryState, getFamilyDietaryState)
  useEffect(() => {
    if (autoLoad) void ensureFamilyDietaryLoaded({ maxAgeMs })
  }, [autoLoad, maxAgeMs])
  const ensureLoaded = useCallback((opts?: { maxAgeMs?: number }) => ensureFamilyDietaryLoaded(opts), [])
  return { ...snapshot, ensureLoaded, reload: reloadFamilyDietary, update: updateFamilyDietaryOverview }
}
