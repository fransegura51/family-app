// Escritura de preferencias de la persona, sin dependencias de red: las pantallas y los módulos de `state/` llaman a `prefSet` en lugar de `localStorage.setItem`.
// Con la sincronización nueva (PREFS_V2) el valor pasa por el motor (se sube a la cuenta y se reparte a los demás dispositivos); sin ella, solo se guarda en el
// dispositivo y el mecanismo anterior (prefsSyncLegacy) lo sube. En los dos casos se avisa a las pantallas (`pepa:pref-changed`).
import { isPrefsV2 } from '@/state/prefs/flags'
import { isSyncedPrefKey } from '@/state/prefs/prefsRegistry'
import { PREF_CHANGED_EVENT } from '@/state/prefs/usePrefChange'
import type { PrefValue } from '@/state/prefs/prefsEngine'

type Writer = (key: string, value: PrefValue) => void

let engineWriter: Writer | null = null
const queuedBeforeStart = new Map<string, PrefValue>()

// Se avisa FUERA del renderizado actual (algunas pantallas guardan dentro de una función de actualización de estado).
export function announcePrefChange(keys: string[]): void {
  const fire = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PREF_CHANGED_EVENT, { detail: { keys } }))
  }
  if (typeof queueMicrotask === 'function') queueMicrotask(fire)
  else setTimeout(fire, 0)
}

export function setEngineWriter(writer: Writer | null): void {
  engineWriter = writer
}

/** Aplica al motor lo que se guardó antes de que arrancara (los primeros instantes tras abrir la app). */
export function drainQueuedPrefs(): void {
  if (!engineWriter) return
  for (const [key, value] of queuedBeforeStart) engineWriter(key, value)
  queuedBeforeStart.clear()
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* almacenamiento bloqueado: el cambio vale hasta cerrar la app */
  }
}

export function prefSet(key: string, value: string): void {
  if (isPrefsV2() && isSyncedPrefKey(key)) {
    if (engineWriter) {
      engineWriter(key, value)
      return
    }
    writeLocal(key, value)
    queuedBeforeStart.set(key, value)
    announcePrefChange([key])
    return
  }
  writeLocal(key, value)
  announcePrefChange([key])
}
