// Comunidad PEPA — memoria de «¿esta persona puede adjuntar fotos?» (las personas menores de edad participan SIN fotos). Sin React ni red propia: quien la usa le pasa
// la función que pregunta al servidor (`community_get_access()`), así se puede probar en aislamiento.
// Coste Supabase: UNA sola consulta por persona y sesión (recordada 30 minutos), y solo cuando una pantalla va a enseñar de verdad un selector de fotos
// (editor de publicaciones, campo de comentario desplegado, hoja de compartir receta). Las consultas simultáneas se comparten y nunca hay consultas periódicas.
// La seguridad NO depende de esto: el servidor rechaza las fotos de una persona menor con PHOTOS_NOT_ALLOWED; esto solo evita enseñar un botón que no va a funcionar.
import { photosAllowedFrom } from '@/domain/communityAccess'

export const PHOTOS_ALLOWED_TTL_MS = 30 * 60 * 1000

interface Entry {
  key: string
  value: boolean
  at: number
}

let entry: Entry | null = null
let inflight: { key: string; promise: Promise<boolean> } | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of [...listeners]) listener()
}

// Lo recordado para esta persona (clave = su id público), o null si no se sabe o ya caducó.
export function peekPhotosAllowed(key: string, now: number = Date.now()): boolean | null {
  return entry && entry.key === key && now - entry.at < PHOTOS_ALLOWED_TTL_MS ? entry.value : null
}

export function loadPhotosAllowed(key: string, fetcher: () => Promise<{ photosAllowed?: boolean }>, now: () => number = Date.now): Promise<boolean> {
  const known = peekPhotosAllowed(key, now())
  if (known !== null) return Promise.resolve(known)
  if (inflight && inflight.key === key) return inflight.promise
  const promise: Promise<boolean> = Promise.resolve()
    .then(fetcher)
    .then(
      (access) => {
        const value = photosAllowedFrom(access)
        entry = { key, value, at: now() }
        notify()
        return value
      },
      // Sin red o error: no se recuerda nada (la próxima pantalla lo vuelve a intentar) y se deja ver el selector; si no procede, el servidor responde PHOTOS_NOT_ALLOWED.
      () => true,
    )
    .finally(() => {
      if (inflight && inflight.promise === promise) inflight = null
    })
  inflight = { key, promise }
  return promise
}

// El servidor ha respondido PHOTOS_NOT_ALLOWED: desde ya no se enseña el selector (sin otra consulta).
export function forbidPhotos(key: string, now: number = Date.now()) {
  entry = { key, value: false, at: now }
  notify()
}

export function subscribePhotosAllowed(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Solo para pruebas.
export function resetPhotosAllowedStore() {
  entry = null
  inflight = null
  listeners.clear()
}
