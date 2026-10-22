// Punto de entrada de la sincronización de preferencias en la aplicación (CONFIG-01): arranca el motor con los servicios reales, escribe las preferencias
// (`prefSet`), avisa a las pantallas (`pepa:pref-changed` + los avisos propios que ya escuchaban) y ofrece los avisos de conflicto y de fallo.
import { createPrefsEngine, type PrefConflict, type PrefsEngine, type PrefsSyncProblem, type PrefsStorage, type PrefValue } from '@/state/prefs/prefsEngine'
import { createSupabasePrefsTransport } from '@/state/prefs/prefsTransport'
import { announcePrefChange, drainQueuedPrefs, setEngineWriter, setPrefsDiagSink } from '@/state/prefs/prefsWrite'
import { isNativeApp } from '@/services/nativeApp'
import { RELOAD_TO_APPLY_KEYS } from '@/state/prefs/prefsRegistry'
import { reportClientError } from '@/data/errorReports'

export type PrefsNotice =
  | { id: string; kind: 'conflict'; key: string; label: string; rejectedValue: PrefValue }
  | { id: string; kind: 'problem'; message: string }
  | { id: string; kind: 'reload'; key: string; label: string }

let engine: PrefsEngine | null = null
let notices: PrefsNotice[] = []
const noticeListeners = new Set<(n: PrefsNotice[]) => void>()
let problemState: PrefsSyncProblem = { failing: false, failures: 0, pending: 0 }
const problemListeners = new Set<(p: PrefsSyncProblem) => void>()

function emitNotices() {
  noticeListeners.forEach((l) => l(notices))
}
export function subscribePrefsNotices(listener: (n: PrefsNotice[]) => void): () => void {
  noticeListeners.add(listener)
  listener(notices)
  return () => {
    noticeListeners.delete(listener)
  }
}
export function dismissPrefsNotice(id: string): void {
  notices = notices.filter((n) => n.id !== id)
  emitNotices()
}
export function subscribePrefsProblem(listener: (p: PrefsSyncProblem) => void): () => void {
  problemListeners.add(listener)
  listener(problemState)
  return () => {
    problemListeners.delete(listener)
  }
}
function pushNotice(n: PrefsNotice) {
  notices = [...notices.filter((x) => x.id !== n.id), n]
  emitNotices()
}

// Nombre comprensible de una preferencia para los avisos.
export function prefLabel(key: string): string {
  if (key === 'familyapp:tab-order:bottom-nav') return 'el orden del menú'
  if (key === 'familyapp:home-card-order') return 'el orden de las tarjetas de Inicio'
  if (key === 'familyapp:home-carousel') return 'el carrusel de Inicio'
  if (key === 'familyapp:color-theme' || key === 'familyapp:chart-color-theme') return 'el estilo de color'
  if (key.endsWith('-menu-layout') || key.endsWith('-pinned-tabs') || key === 'familyapp:community-menu-order') return 'el menú de una sección'
  if (key === 'pepa:auto-confirm') return '«Hacerlo directamente, sin tarjeta»'
  if (key === 'pepa:show-classic-buttons') return 'los botones clásicos de Pepa'
  if (key === 'familyapp:voice-response-mode') return 'el modo de respuesta de Pepa'
  return 'una preferencia'
}

const browserStorage: PrefsStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* almacenamiento bloqueado */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* almacenamiento bloqueado */
    }
  },
  keys: () => {
    const out: string[] = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k) out.push(k)
      }
    } catch {
      /* almacenamiento bloqueado */
    }
    return out
  },
}

// Los avisos propios que ya escuchaban algunas pantallas (así no hace falta tocar a todos sus lectores).
function dispatchLegacyEvents(keys: string[]) {
  for (const key of keys) {
    if (key.startsWith('familyapp:tab-order:')) window.dispatchEvent(new CustomEvent('family-app:tab-order-changed', { detail: { key: key.slice('familyapp:tab-order:'.length) } }))
    else if (key === 'familyapp:movement-color-mode') window.dispatchEvent(new CustomEvent('family-app:movement-color-mode-changed'))
    else if (key === 'pepa:show-classic-buttons') window.dispatchEvent(new CustomEvent('family-app:classic-buttons-changed'))
    else if (key === 'familyapp:home-carousel') window.dispatchEvent(new Event('pepa:home-carousel-changed'))
  }
}

/** Sube ahora lo pendiente (antes de recargar la app, por ejemplo). */
export async function flushPrefsNow(): Promise<void> {
  if (engine) await engine.flushNow()
}

export function recoverRejectedPref(key: string): void {
  engine?.recoverRejected(key)
}

export function retryPrefsNow(): void {
  void engine?.flushNow()
}

export function pendingPrefsCount(): number {
  return engine?.pendingCount() ?? 0
}

// DIAGNÓSTICO TEMPORAL (CONFIG-01.1): un anillo de los últimos sucesos en el propio dispositivo (`pepa:prefs:diag`) y, con tope, un registro en la tabla de errores de
// la app para poder revisarlo desde el panel. Sin datos personales (claves, revisiones, longitudes y huellas de los valores). Se retira al cerrar la incidencia.
const DIAG_RING_KEY = 'pepa:prefs:diag'
const DIAG_RING_MAX = 80
const DIAG_REPORT_MAX = 40
let diagReported = 0
const DIAG_REPORTED_EVENTS = new Set(['start', 'signal', 'pull', 'apply', 'heal', 'set', 'conflict', 'pull-error', 'channel', 'navshell-order'])

function deviceKind(): string {
  try {
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
    return `${isNativeApp() ? 'nativa' : standalone ? 'pwa' : 'web'}|sw=${navigator.serviceWorker?.controller ? 'si' : 'no'}`
  } catch {
    return 'desconocido'
  }
}

function diagSinkImpl(event: string, data: Record<string, unknown>) {
  const entry = { t: new Date().toISOString().slice(11, 23), e: event, ...data }
  try {
    const ring = JSON.parse(localStorage.getItem(DIAG_RING_KEY) ?? '[]') as unknown[]
    ring.push(entry)
    localStorage.setItem(DIAG_RING_KEY, JSON.stringify(ring.slice(-DIAG_RING_MAX)))
  } catch {
    /* sin almacenamiento */
  }
  const interesting = event !== 'apply' || data.wrote === true || String(data.key).endsWith(':bottom-nav')
  if (!DIAG_REPORTED_EVENTS.has(event) || !interesting || diagReported >= DIAG_REPORT_MAX) return
  diagReported += 1
  void reportClientError(new Error(`prefs-diag ${deviceKind()} ${JSON.stringify(entry)}`))
}

/** Arranca la sincronización para esta persona. Devuelve la función que la para. */
export function startPrefsV2(userId: string): () => void {
  if (engine) engine.stop()
  const e = createPrefsEngine({
    userId,
    storage: browserStorage,
    transport: createSupabasePrefsTransport(userId),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (h) => window.clearTimeout(h as number),
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    now: () => Date.now(),
    onAnyChange: (keys) => announcePrefChange(keys),
    onRemoteChange: (keys) => {
      dispatchLegacyEvents(keys)
      for (const key of keys) {
        if (RELOAD_TO_APPLY_KEYS.includes(key)) pushNotice({ id: `reload:${key}`, kind: 'reload', key, label: prefLabel(key) })
      }
    },
    onConflict: (c: PrefConflict) => pushNotice({ id: `conflict:${c.key}`, kind: 'conflict', key: c.key, label: prefLabel(c.key), rejectedValue: c.rejectedValue }),
    onProblem: (p) => {
      problemState = p
      problemListeners.forEach((l) => l(p))
      if (p.failing && p.message) pushNotice({ id: 'problem', kind: 'problem', message: p.message })
      else if (!p.failing) dismissPrefsNotice('problem')
    },
    diag: (event, data) => diagSinkImpl(event, data),
    reportError: (error, context) => {
      void reportClientError(error instanceof Error ? new Error(`${context}: ${error.message}`) : new Error(`${context}: ${String(error)}`))
    },
  })
  engine = e
  setPrefsDiagSink(diagSinkImpl)
  setEngineWriter((key, value) => e.set(key, value))
  void e.start().then(() => drainQueuedPrefs())

  const refresh = () => {
    if (document.visibilityState === 'visible') void e.pull()
    void e.flushNow()
  }
  const online = () => {
    void e.pull()
    void e.flushNow()
  }
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('online', online)
  window.addEventListener('pageshow', online)
  window.addEventListener('pagehide', refresh)
  return () => {
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('online', online)
    window.removeEventListener('pageshow', online)
    window.removeEventListener('pagehide', refresh)
    e.stop()
    if (engine === e) {
      engine = null
      setEngineWriter(null)
      setPrefsDiagSink(null)
    }
  }
}
