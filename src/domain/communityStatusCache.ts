// Comunidad PEPA — recuerda unos minutos «¿puede esta persona ver Comunidad?» para NO preguntarlo al servidor cada vez que una pantalla de la Cocina o el Inicio
// lo necesita (coste de Supabase, INC-17). Lógica pura y sin red: la consulta real se le pasa de fuera, así se prueba sin navegador.
//   · Dentro del tiempo de vida (TTL) se reutiliza la última respuesta; dos pantallas que preguntan a la vez comparten UNA sola consulta en vuelo.
//   · Un fallo (sin red) NO se guarda: la próxima pantalla lo intentará de nuevo.
//   · `prime` deja que Comunidad (que ya trae su propio estado) alimente la memoria sin una consulta extra.
// Ojo: esto solo decide si se ENSEÑAN botones y avisos. La seguridad real (edad, permisos, lanzamiento) la aplica el servidor en cada llamada.
import type { CommunityStatus } from './community'

export const COMMUNITY_STATUS_TTL_MS = 2 * 60 * 1000

export interface CommunityStatusCache {
  // Estado actual: de la memoria si está fresco; si no, una consulta (compartida entre quienes la piden a la vez).
  get(options?: { fresh?: boolean }): Promise<CommunityStatus>
  // Estado recordado sin tocar la red (null si no hay o ha caducado).
  peek(): CommunityStatus | null
  // Guarda un estado que ya se tiene (por ejemplo el que acaba de pedir CommunityProvider).
  prime(status: CommunityStatus): void
  // Olvida todo (cierre de sesión o cambio de persona).
  clear(): void
}

export function createCommunityStatusCache(fetchStatus: () => Promise<CommunityStatus>, now: () => number = Date.now, ttlMs: number = COMMUNITY_STATUS_TTL_MS): CommunityStatusCache {
  let entry: { at: number; status: CommunityStatus } | null = null
  let inflight: Promise<CommunityStatus> | null = null
  // Cada «generación» invalida las consultas que estaban en vuelo cuando se limpió la memoria (la respuesta de otra persona no debe quedar guardada).
  let generation = 0

  const isFresh = () => entry !== null && now() - entry.at >= 0 && now() - entry.at < ttlMs

  return {
    peek: () => (isFresh() ? entry!.status : null),
    prime(status) {
      entry = { at: now(), status }
    },
    clear() {
      entry = null
      inflight = null
      generation += 1
    },
    get(options) {
      if (!options?.fresh && isFresh()) return Promise.resolve(entry!.status)
      if (inflight && !options?.fresh) return inflight
      const mine = generation
      const p = fetchStatus().then((status) => {
        if (mine === generation) entry = { at: now(), status }
        return status
      })
      const tracked = p.finally(() => {
        if (inflight === tracked) inflight = null
      })
      inflight = tracked
      // Si falla, el que llamó recibe el error y no queda nada guardado (ni consulta pendiente).
      tracked.catch(() => undefined)
      return tracked
    },
  }
}
