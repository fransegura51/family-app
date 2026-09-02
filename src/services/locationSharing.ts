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
let lastUpdateAt = 0
const listeners = new Set<Listener>()

// El navegador (sobre todo en móvil, con la pantalla apagada o la app
// en segundo plano) a veces mata el watchPosition por dentro SIN avisar
// — ni onerror ni onend, simplemente deja de llegar nada, y desde fuera
// parece que "se ha quedado fija" otra vez aunque el código siga
// pensando que está compartiendo. Dos redes de seguridad: en cuanto la
// pestaña vuelve a primer plano se reinicia el watch (por si murió
// mientras estaba en segundo plano), y un latido cada 15s comprueba si
// hace demasiado que no llega nada y reinicia también si hace falta —
// "no podemos fallar en ubicación", así que no basta con confiar en que
// el navegador avise. Umbral corto (45s): con la pantalla encendida y
// la app abierta tiene que notarse el movimiento enseguida, no al cabo
// de minutos (bug real reportado: "solo se actualiza si desactivas y
// vuelves a activar").
const STALE_THRESHOLD_MS = 45_000

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
  lastUpdateAt = 0
  persist(null)
  notify()
}

// `force`: reinicia el watch aunque ya se esté compartiendo como esa
// misma persona — hace falta para las redes de seguridad de abajo
// (volver a primer plano, latido de "no llega nada hace rato"), donde
// lo normal es que memberId no haya cambiado pero el watch de verdad sí
// necesite reiniciarse.
export function startSharing(memberId: string, force = false) {
  if (currentMemberId === memberId && currentStop && !force) return // ya en marcha como esta persona
  currentStop?.()
  lastError = null
  currentMemberId = memberId
  lastUpdateAt = Date.now()
  persist(memberId)
  currentStop = watchPosition(
    (coords) => {
      lastError = null
      lastUpdateAt = Date.now()
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

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentMemberId) {
      startSharing(currentMemberId, true)
    }
  })

  setInterval(() => {
    if (currentMemberId && document.visibilityState === 'visible' && Date.now() - lastUpdateAt > STALE_THRESHOLD_MS) {
      startSharing(currentMemberId, true)
    }
  }, 15_000)
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
