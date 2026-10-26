import { useEffect, useRef } from 'react'
import { supabase } from '@/data/supabaseClient'

// Sincronización entre dispositivos de los datos COMPARTIDOS de la familia (27/10/2026). Hasta ahora solo las preferencias (user_prefs) tenían canal en vivo: el resto de
// pantallas cargaban una vez al abrirse y solo se enteraban de los cambios hechos en ESTE dispositivo (eventos `family-app:*-changed`). Este gancho reutiliza el mismo
// patrón que prefsTransport: el canal solo AVISA («algo cambió en esta tabla») y la pantalla vuelve a pedir sus datos; el valor nunca viaja por el canal, así que las
// políticas de seguridad (RLS) siguen decidiendo qué ve cada persona.
//
//  · Un canal por TABLA y por dispositivo, compartido por todas las pantallas que la usan (cuenta de referencias): se cierra cuando ya nadie la escucha.
//  · Ráfagas (reordenar 21 platos = 21 avisos) → UNA sola recarga (debounce).
//  · `paused` (se está editando, arrastrando o hay un formulario abierto): no se recarga mientras tanto, se anota y se recarga al terminar. Nunca se pisa lo que alguien teclea.
//  · Al volver a la pestaña, recuperar el foco o la conexión, y al reconectar el canal tras una caída, se recarga (por si se perdió algún aviso).
//  · La recarga debe ser SILENCIOSA (sin «Cargando…» si ya hay datos) y no puede escribir nada: así no hay bucles.

type Listener = () => void
interface Entry {
  listeners: Set<Listener>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channel: any
  down: boolean
}
const registry = new Map<string, Entry>()

function subscribeTable(table: string, listener: Listener): () => void {
  let entry = registry.get(table)
  if (!entry) {
    entry = { listeners: new Set(), channel: null, down: false }
    registry.set(table, entry)
    const e = entry
    try {
      if (typeof supabase.channel === 'function') {
        e.channel = supabase
          .channel(`family-data:${table}`)
          .on('postgres_changes', { event: '*', schema: 'public', table }, () => e.listeners.forEach((l) => l()))
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              // Tras una caída puede haberse perdido algún aviso: se recarga una vez al volver.
              if (e.down) {
                e.down = false
                e.listeners.forEach((l) => l())
              }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              e.down = true
            }
          })
      }
    } catch {
      /* sin canal en vivo (p. ej. sin red al abrir): quedan la recarga al volver a la pestaña y al recuperar la conexión */
    }
  }
  entry.listeners.add(listener)
  return () => {
    const e = registry.get(table)
    if (!e) return
    e.listeners.delete(listener)
    if (e.listeners.size === 0) {
      registry.delete(table)
      try {
        if (e.channel && typeof supabase.removeChannel === 'function') void supabase.removeChannel(e.channel)
      } catch {
        /* ya cerrado */
      }
    }
  }
}

/** Solo para pruebas: cuántas tablas tienen canal abierto y cuántas pantallas las escuchan. */
export function realtimeDebugState(): Record<string, number> {
  const out: Record<string, number> = {}
  registry.forEach((v, k) => (out[k] = v.listeners.size))
  return out
}

export interface RealtimeRefreshOptions {
  /** Espera tras el último aviso antes de recargar (junta ráfagas). */
  debounceMs?: number
  /** true = hay algo en edición: no se recarga hasta que vuelva a false. */
  paused?: boolean
  /** Mínimo entre recargas por volver a la pestaña / recuperar el foco o la conexión. */
  focusThrottleMs?: number
}

export function useRealtimeRefresh(tables: readonly string[], reload: () => void | Promise<void>, options: RealtimeRefreshOptions = {}): void {
  const { debounceMs = 700, paused = false, focusThrottleMs = 3000 } = options
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  const pausedRef = useRef(paused)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const lastRun = useRef(Date.now())
  const key = tables.join('|')

  const run = useRef(() => {
    lastRun.current = Date.now()
    dirty.current = false
    try {
      void Promise.resolve(reloadRef.current()).catch(() => undefined)
    } catch {
      /* una recarga fallida no debe romper la pantalla: se reintentará con el siguiente aviso */
    }
  })

  // Al terminar la edición se recarga lo que llegó mientras tanto.
  useEffect(() => {
    pausedRef.current = paused
    if (!paused && dirty.current) {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => run.current(), 150)
    }
  }, [paused])

  useEffect(() => {
    const schedule = () => {
      if (pausedRef.current) {
        dirty.current = true
        return
      }
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        if (pausedRef.current) dirty.current = true
        else run.current()
      }, debounceMs)
    }
    const offs = key ? key.split('|').map((t) => subscribeTable(t, schedule)) : []

    const refetchNow = () => {
      if (document.visibilityState === 'hidden') return
      if (Date.now() - lastRun.current < focusThrottleMs) return
      if (pausedRef.current) {
        dirty.current = true
        return
      }
      run.current()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetchNow()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refetchNow)
    window.addEventListener('online', refetchNow)
    window.addEventListener('pageshow', refetchNow)
    return () => {
      offs.forEach((off) => off())
      window.clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refetchNow)
      window.removeEventListener('online', refetchNow)
      window.removeEventListener('pageshow', refetchNow)
    }
  }, [key, debounceMs, focusThrottleMs])
}
