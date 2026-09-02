// Antes, el watchPosition vivía dentro de LocationScreen: en cuanto se
// salía de la pantalla de Ubicación (a Tareas, al Calendario, a
// cualquier otra), React desmontaba el componente y su efecto de
// limpieza paraba el GPS — así que la ubicación solo se actualizaba
// mientras alguien se quedaba mirando esa pantalla, y en cuanto
// navegaba a otro sitio (lo normal) se quedaba congelada en el último
// punto para siempre (bug real reportado: "se queda fija en un punto,
// no se actualiza"). Aquí el watch vive en un módulo aparte, fuera de
// cualquier componente de React, así que sigue en marcha aunque se
// navegue por toda la app — solo se para si se toca "Dejar de
// compartir" o si se deniega el permiso.
//
// El consentimiento y la elección de "qué dispositivo soy yo" siguen
// siendo un gesto explícito de la persona (Skill 23) — lo único que
// cambia es que, una vez elegido, se recuerda (localStorage) y se
// retoma solo al volver a abrir la aplicación, en vez de tener que
// volver a la pantalla de Ubicación y tocarlo cada vez.
import { updateMemberLocation } from '@/data/location'
import { watchPosition } from '@/services/geolocation'

const STORAGE_KEY = 'familyapp:location-sharing-member-id'

export interface LastPosition {
  memberId: string
  latitude: number
  longitude: number
}

type Listener = () => void

let currentMemberId: string | null = null
let currentStop: (() => void) | null = null
let lastError: string | null = null
let lastPosition: LastPosition | null = null
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach((l) => l())
}

function persist(memberId: string | null) {
  try {
    if (memberId) localStorage.setItem(STORAGE_KEY, memberId)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage puede fallar en privado/incógnito — no es crítico,
    // solo no se retomará sola la próxima vez que se abra la app.
  }
}

export function getSharingMemberId(): string | null {
  return currentMemberId
}

export function getLastError(): string | null {
  return lastError
}

export function getLastPosition(): LastPosition | null {
  return lastPosition
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function stopSharing() {
  currentStop?.()
  currentStop = null
  currentMemberId = null
  lastError = null
  lastPosition = null
  persist(null)
  notify()
}

export function startSharing(memberId: string) {
  if (currentMemberId === memberId && currentStop) return // ya en marcha como esta persona
  currentStop?.()
  lastError = null
  currentMemberId = memberId
  persist(memberId)
  currentStop = watchPosition(
    (coords) => {
      lastError = null
      updateMemberLocation(memberId, coords.latitude, coords.longitude)
        .then(() => {
          lastPosition = { memberId, latitude: coords.latitude, longitude: coords.longitude }
          notify()
        })
        .catch((err: Error) => {
          lastError = err.message
          notify()
        })
    },
    (message, code) => {
      lastError = message
      if (code === 1) {
        // PERMISSION_DENIED: seguir "compartiendo" sin permiso no tiene
        // sentido, se para del todo.
        stopSharing()
        return
      }
      notify()
    },
  )
  notify()
}

// Se llama una sola vez al arrancar la aplicación (ver
// LocationSharingWatcher) — el propio watchPosition no sobrevive a
// recargar la página o volver a abrir la PWA, así que hace falta
// retomarlo explícitamente a partir de la última elección guardada.
export function resumeFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) startSharing(saved)
  } catch {
    // ignorar — sin localStorage no se puede retomar solo
  }
}
