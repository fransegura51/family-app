// Motor de sincronización de preferencias entre dispositivos (CONFIG-01). Sin dependencias de navegador ni de Supabase: todo entra por `deps`
// (almacenamiento, red, temporizadores, avisos), así se prueba con dos «dispositivos» simulados y un servidor falso.
//
// Reglas:
//  · Una fila por preferencia. Cada escritura lleva la revisión (`baseRev`) de la que parte el cambio; el SERVIDOR decide el orden (revisión creciente), nunca la hora del
//    dispositivo. Si otro cambio ya se confirmó desde esa revisión, prevalece el ya confirmado: el dispositivo recibe el valor ganador, se AVISA y el valor rechazado queda
//    guardado para poder recuperarlo (`recoverRejected`). Nada se descarta en silencio.
//  · Los valores son texto (igual que localStorage). `null` = «volver al valor predeterminado».
//  · localStorage sigue siendo la caché que leen las pantallas; este motor la mantiene al día y avisa (`onChange`) para que se repinten.
//  · Los cambios pendientes sobreviven a cerrar la app (cola guardada en el dispositivo) y se reintentan con espera creciente.
import { MAX_PREF_VALUE_CHARS, isSyncedPrefKey } from '@/state/prefs/prefsRegistry'

export type PrefValue = string | null

export interface PrefRow {
  key: string
  value: PrefValue
  rev: number
}

export interface SetResult {
  applied: boolean
  rev: number
  value: PrefValue
}

export interface PrefsTransport {
  /** Filas de la persona con revisión mayor que `afterRev`, de menor a mayor revisión. */
  fetchSince(afterRev: number): Promise<PrefRow[]>
  /** Comparar y cambiar en el servidor: aplica solo si la fila sigue en `baseRev` (0 = no existía). */
  set(key: string, value: PrefValue, baseRev: number): Promise<SetResult>
  /**
   * Tiempo real de la persona. Solo AVISA de que algo cambió (con una pista para el diagnóstico): el valor NO se toma del aviso, se descarga con `fetchSince`.
   * (Causa de CONFIG-01.1: el valor que viajaba en el aviso no era fiable y dejaba la caché del móvil con un valor equivocado y el cursor ya adelantado.)
   */
  subscribe(onSignal: (hint: SignalHint) => void, onStatus: (status: 'up' | 'down') => void): () => void
}

export interface SignalHint {
  key?: string
  rev?: number
  /** Forma del valor que venía en el aviso (solo diagnóstico, nunca se usa como dato): 'string' | 'array' | 'object' | 'null' | 'missing'… */
  valueKind?: string
  valueLength?: number
}

export interface PrefsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
}

export interface PrefConflict {
  key: string
  /** Lo que la persona había elegido en este dispositivo y fue sustituido. */
  rejectedValue: PrefValue
  /** Lo que prevalece (confirmado antes por otro dispositivo). */
  appliedValue: PrefValue
}

export interface PrefsSyncProblem {
  failing: boolean
  failures: number
  pending: number
  message?: string
}

export interface PrefsEngineDeps {
  userId: string
  storage: PrefsStorage
  transport: PrefsTransport
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  isOnline(): boolean
  now(): number
  /** Las preferencias de estas claves cambiaron en la caché por un cambio que vino de fuera (otro dispositivo): hay que repintar. */
  onRemoteChange(keys: string[]): void
  /** Una preferencia cambió en la caché (por esta persona o por otro dispositivo). */
  onAnyChange?(keys: string[]): void
  onConflict(conflict: PrefConflict): void
  onProblem(problem: PrefsSyncProblem): void
  reportError?(error: unknown, context: string): void
  /** Diagnóstico temporal (sin datos personales: nombres de clave, revisiones y huellas). */
  diag?(event: string, data: Record<string, unknown>): void
}

interface PendingChange {
  value: PrefValue
  baseRev: number
}

interface Meta {
  lastRev: number
  revs: Record<string, number>
  outbox: Record<string, PendingChange>
  rejected: Record<string, PrefValue>
  failures: number
}

export const PREFS_OWNER_KEY = 'pepa:prefs:owner'
export const prefsMetaKey = (userId: string) => `pepa:prefs:meta:v2:${userId}`

const FLUSH_DELAY_MS = 700
const PULL_DELAY_MS = 150
// Las revisiones salen de una secuencia: una escritura con número menor puede confirmarse DESPUÉS de otra con número mayor. Para no saltarse nunca ninguna,
// cada descarga vuelve a pedir una ventana hacia atrás (las filas ya vistas se ignoran).
const PULL_OVERLAP = 200
const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 60_000
const PROBLEM_AFTER_FAILURES = 3
// Errores del servidor que NO se arreglan reintentando: se descartan (con aviso) para no quedarse en un bucle.
const FATAL_CODES = ['INVALID_KEY', 'INVALID_VALUE', 'TOO_MANY_PREFS', 'NOT_AUTHORIZED', '42501', '22023']

export function fingerprint(v: PrefValue | undefined): string {
  if (v === null || v === undefined) return String(v)
  let h = 2166136261
  for (let i = 0; i < v.length; i++) {
    h ^= v.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${v.length}:${(h >>> 0).toString(16)}`
}

export interface PrefsEngine {
  start(): Promise<void>
  stop(): void
  /** Guarda un cambio local: se ve al instante y se sube en cuanto se pueda. */
  set(key: string, value: PrefValue): void
  /** Sube ahora lo pendiente (p. ej. antes de recargar la app). */
  flushNow(): Promise<void>
  /** Pide al servidor lo que falta (al volver a primer plano, al recuperar la red, al reconectar el canal). */
  pull(): Promise<void>
  /** Vuelve a aplicar el valor que el último conflicto rechazó. */
  recoverRejected(key: string): boolean
  pendingCount(): number
  rejectedKeys(): string[]
}

function parseMeta(raw: string | null): Meta {
  const empty: Meta = { lastRev: 0, revs: {}, outbox: {}, rejected: {}, failures: 0 }
  if (!raw) return empty
  try {
    const m = JSON.parse(raw) as Partial<Meta>
    return {
      lastRev: typeof m.lastRev === 'number' ? m.lastRev : 0,
      revs: typeof m.revs === 'object' && m.revs ? m.revs : {},
      outbox: typeof m.outbox === 'object' && m.outbox ? m.outbox : {},
      rejected: typeof m.rejected === 'object' && m.rejected ? m.rejected : {},
      failures: typeof m.failures === 'number' ? m.failures : 0,
    }
  } catch {
    return empty
  }
}

export function createPrefsEngine(deps: PrefsEngineDeps): PrefsEngine {
  const { userId, storage, transport } = deps
  const metaKey = prefsMetaKey(userId)
  let meta: Meta = { lastRev: 0, revs: {}, outbox: {}, rejected: {}, failures: 0 }
  let started = false
  let stopped = false
  let unsubscribe: (() => void) | null = null
  let flushTimer: unknown = null
  let pullTimer: unknown = null
  let flushing: Promise<void> | null = null
  let channelWasDown = true // la primera confirmación del canal vuelve a descargar lo que pudo llegar entre la descarga inicial y la suscripción
  const inflight = new Map<string, PrefValue>()
  let lastReportAt = -Infinity
  const REPORT_EVERY_MS = 10 * 60_000
  // Los fallos repetidos (red caída, servidor lento) se registran como mucho una vez cada 10 minutos.
  function reportThrottled(error: unknown, context: string) {
    const t = deps.now()
    if (t - lastReportAt < REPORT_EVERY_MS) return
    lastReportAt = t
    deps.reportError?.(error, context)
  }

  function persist() {
    try {
      storage.setItem(metaKey, JSON.stringify(meta))
    } catch {
      /* sin almacenamiento: los cambios siguen funcionando mientras la app está abierta */
    }
  }

  function writeCache(key: string, value: PrefValue) {
    try {
      if (value === null) storage.removeItem(key)
      else storage.setItem(key, value)
    } catch {
      /* almacenamiento bloqueado */
    }
  }

  function problem(message?: string) {
    deps.onProblem({ failing: meta.failures >= PROBLEM_AFTER_FAILURES, failures: meta.failures, pending: Object.keys(meta.outbox).length, message })
  }

  // El cursor de descarga (`lastRev`) NO se toca aquí: solo avanza con lo que devuelve una descarga (ver `pull`).
  function applyServerRow(row: PrefRow, source: 'remote' | 'own', why = 'apply') {
    meta.revs[row.key] = Math.max(meta.revs[row.key] ?? 0, row.rev)
    const current = storage.getItem(row.key)
    const changed = current !== row.value
    deps.diag?.(why, { key: row.key, rev: row.rev, wrote: changed, before: fingerprint(current), after: fingerprint(row.value) })
    if (changed) {
      writeCache(row.key, row.value)
      deps.onAnyChange?.([row.key])
      if (source === 'remote') deps.onRemoteChange([row.key])
    }
  }

  // Lo que llega del servidor (descarga o tiempo real). Decide si es un eco, un cambio nuevo o un conflicto con algo pendiente.
  function handleServerRow(row: PrefRow) {
    if (!isSyncedPrefKey(row.key)) return
    const known = meta.revs[row.key] ?? 0
    if (row.rev < known) return // más antigua que lo ya aplicado (solapamiento de la descarga)
    if (row.rev === known) {
      // Ya vista. Auto-reparación: si la caché de ESTE dispositivo no coincide con lo confirmado en el servidor (y no hay un cambio propio pendiente), se corrige.
      if (!meta.outbox[row.key] && !inflight.has(row.key) && storage.getItem(row.key) !== row.value) applyServerRow(row, 'remote', 'heal')
      return
    }
    const pending = meta.outbox[row.key]
    if (inflight.has(row.key) && inflight.get(row.key) === row.value) {
      // Eco de nuestra propia escritura en vuelo: la respuesta de la llamada fijará la revisión.
      return
    }
    if (pending) {
      if (pending.value === row.value) {
        // Otro dispositivo eligió lo mismo: nada que sustituir.
        delete meta.outbox[row.key]
        applyServerRow(row, 'remote')
        persist()
        return
      }
      // Hay un cambio nuestro pendiente que parte de una revisión anterior: prevalece lo ya confirmado y se avisa.
      meta.rejected[row.key] = pending.value
      delete meta.outbox[row.key]
      applyServerRow(row, 'remote')
      persist()
      deps.diag?.('conflict', { key: row.key, via: 'pull' })
      deps.onConflict({ key: row.key, rejectedValue: pending.value, appliedValue: row.value })
      return
    }
    applyServerRow(row, 'remote')
    persist()
  }

  async function pull(full = false): Promise<void> {
    if (stopped) return
    try {
      const startedAt = full ? 0 : Math.max(0, meta.lastRev - PULL_OVERLAP)
      let after = startedAt
      let count = 0
      let maxRev = meta.lastRev
      for (let guard = 0; guard < 20; guard++) {
        const rows = await transport.fetchSince(after)
        count += rows.length
        for (const row of rows) {
          handleServerRow(row)
          maxRev = Math.max(maxRev, row.rev)
        }
        if (rows.length < 1000) break
        after = Math.max(after, ...rows.map((r) => r.rev))
      }
      meta.lastRev = maxRev
      persist()
      deps.diag?.('pull', { after: startedAt, full, rows: count, lastRev: meta.lastRev })
    } catch (error) {
      deps.diag?.('pull-error', { message: error instanceof Error ? error.message.slice(0, 80) : 'error', online: deps.isOnline() })
      if (deps.isOnline()) reportThrottled(error, 'prefs:pull')
    }
  }

  function schedulePull() {
    if (stopped || pullTimer !== null) return
    pullTimer = deps.setTimer(() => {
      pullTimer = null
      void pull()
    }, PULL_DELAY_MS)
  }

  function scheduleFlush(ms = FLUSH_DELAY_MS) {
    if (stopped) return
    if (flushTimer !== null) deps.clearTimer(flushTimer)
    flushTimer = deps.setTimer(() => {
      flushTimer = null
      void flush()
    }, ms)
  }

  function isFatal(error: unknown): boolean {
    const text = typeof error === 'object' && error !== null ? `${(error as { code?: unknown }).code ?? ''} ${(error as { message?: unknown }).message ?? ''}` : String(error ?? '')
    return FATAL_CODES.some((c) => text.includes(c))
  }

  async function flushOnce(): Promise<void> {
    if (stopped) return
    const keys = Object.keys(meta.outbox)
    if (keys.length === 0) return
    if (!deps.isOnline()) {
      scheduleFlush(RETRY_BASE_MS * 2)
      return
    }
    let retryAfter = 0
    for (const key of keys) {
      const pending = meta.outbox[key]
      if (!pending) continue
      const sent = pending.value
      const baseRev = pending.baseRev
      inflight.set(key, sent)
      try {
        const result = await transport.set(key, sent, baseRev)
        inflight.delete(key)
        const now = meta.outbox[key]
        if (result.applied) {
          meta.revs[key] = Math.max(meta.revs[key] ?? 0, result.rev)
          deps.diag?.('set', { key, baseRev, applied: true, rev: result.rev })
          if (now && now.value === sent) delete meta.outbox[key]
          else if (now) meta.outbox[key] = { value: now.value, baseRev: result.rev } // se cambió otra vez durante la subida
          meta.failures = 0
        } else {
          // El servidor ya tenía un cambio más reciente: prevalece y se avisa.
          meta.failures = 0
          deps.diag?.('set', { key, baseRev, applied: false, rev: result.rev })
          if (now && now.value === result.value) {
            // Otro dispositivo ya había guardado exactamente lo mismo: no hay nada que sustituir.
            delete meta.outbox[key]
            applyServerRow({ key, value: result.value, rev: result.rev }, 'remote')
          } else if (now) {
            const rejectedValue = now.value
            delete meta.outbox[key]
            meta.rejected[key] = rejectedValue
            applyServerRow({ key, value: result.value, rev: result.rev }, 'remote')
            deps.diag?.('conflict', { key, via: 'set' })
            deps.onConflict({ key, rejectedValue, appliedValue: result.value })
          } else {
            // Ya se había resuelto por el canal en tiempo real: solo se asegura la revisión.
            meta.revs[key] = Math.max(meta.revs[key] ?? 0, result.rev)
          }
        }
        persist()
      } catch (error) {
        inflight.delete(key)
        if (isFatal(error)) {
          delete meta.outbox[key]
          meta.rejected[key] = sent
          persist()
          deps.reportError?.(error, `prefs:set:${key}`)
          problem('Una preferencia no se pudo guardar y se descartó.')
        } else {
          meta.failures += 1
          retryAfter = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(meta.failures, 6))
          persist()
          if (meta.failures >= PROBLEM_AFTER_FAILURES) {
            reportThrottled(error, `prefs:set:${key}`)
            problem('No se están pudiendo guardar algunos cambios; se reintentará.')
          }
          break
        }
      }
    }
    if (Object.keys(meta.outbox).length === 0) problem()
    if (retryAfter > 0) scheduleFlush(retryAfter)
    else if (Object.keys(meta.outbox).length > 0) scheduleFlush(FLUSH_DELAY_MS)
  }

  function flush(): Promise<void> {
    if (flushing) return flushing
    flushing = flushOnce().finally(() => {
      flushing = null
    })
    return flushing
  }

  function adoptOwner() {
    let owner: string | null = null
    try {
      owner = storage.getItem(PREFS_OWNER_KEY)
    } catch {
      owner = null
    }
    if (owner && owner !== userId) {
      // La caché pertenece a OTRA persona que usó este navegador: se limpia (no se mezclan preferencias entre cuentas).
      for (const key of storage.keys()) if (isSyncedPrefKey(key)) writeCache(key, null)
    }
    try {
      storage.setItem(PREFS_OWNER_KEY, userId)
    } catch {
      /* ignorar */
    }
  }

  function setPref(key: string, value: PrefValue): void {
    if (!isSyncedPrefKey(key)) {
      // No sincronizable: solo caché local.
      if (value === null) storage.removeItem(key)
      else storage.setItem(key, value)
      return
    }
    if (value !== null && value.length > MAX_PREF_VALUE_CHARS) {
      deps.reportError?.(new Error('INVALID_VALUE'), `prefs:set:${key}`)
      problem('Una preferencia es demasiado grande y no se guardó.')
      return
    }
    writeCache(key, value)
    deps.onAnyChange?.([key])
    const existing = meta.outbox[key]
    meta.outbox[key] = { value, baseRev: existing ? existing.baseRev : (meta.revs[key] ?? 0) }
    delete meta.rejected[key]
    persist()
    problem()
    scheduleFlush()
  }

  return {
    async start() {
      if (started) return
      started = true
      stopped = false
      adoptOwner()
      meta = parseMeta(storage.getItem(metaKey))
      deps.diag?.('start', { lastRev: meta.lastRev, knownKeys: Object.keys(meta.revs).length, pending: Object.keys(meta.outbox).length })
      // Al arrancar se descarga TODO lo de la cuenta (son pocas filas) y se compara con la caché: si algo no coincide, se repara aunque el cursor diga que ya se vio.
      await pull(true)
      // Lo local que la cuenta todavía no tiene (primera vez en este dispositivo, o una preferencia nueva tras actualizar la app) se sube; lo que la
      // cuenta ya tiene manda sobre lo local.
      for (const key of storage.keys()) {
        if (!isSyncedPrefKey(key) || key in meta.revs || key in meta.outbox) continue
        const value = storage.getItem(key)
        if (value !== null && value.length <= MAX_PREF_VALUE_CHARS) meta.outbox[key] = { value, baseRev: 0 }
      }
      persist()
      unsubscribe = transport.subscribe(
        (hint) => {
          // El aviso solo despierta la descarga: el valor NO se toma de él.
          deps.diag?.('signal', { key: hint.key, rev: hint.rev, valueKind: hint.valueKind, valueLength: hint.valueLength })
          schedulePull()
        },
        (status) => {
          deps.diag?.('channel', { status })
          if (status === 'down') channelWasDown = true
          else if (channelWasDown) {
            channelWasDown = false
            void pull()
          }
        },
      )
      if (Object.keys(meta.outbox).length > 0) await flush()
      problem()
    },
    stop() {
      stopped = true
      started = false
      if (flushTimer !== null) deps.clearTimer(flushTimer)
      flushTimer = null
      if (pullTimer !== null) deps.clearTimer(pullTimer)
      pullTimer = null
      unsubscribe?.()
      unsubscribe = null
      persist()
    },
    set: setPref,
    flushNow: flush,
    pull,
    recoverRejected(key) {
      if (!(key in meta.rejected)) return false
      const value = meta.rejected[key]
      delete meta.rejected[key]
      setPref(key, value)
      return true
    },
    pendingCount: () => Object.keys(meta.outbox).length,
    rejectedKeys: () => Object.keys(meta.rejected),
  }
}
