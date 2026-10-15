import { useCallback, useEffect, useRef, useState } from 'react'
import { communityErrorText } from '@/domain/communityErrors'

// Carga UNA vez al entrar (y otra solo si se pide `reload`): nada de consultas periódicas. `loader` debe estar memorizado con useCallback por quien lo usa;
// si cambia (por ejemplo, otro filtro), se vuelve a cargar. Los resultados que llegan tarde de una carga anterior se descartan.
export interface AdminData<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
  setData: (updater: (prev: T | null) => T | null) => void
}

export function useAdminData<T>(loader: () => Promise<T>): AdminData<T> {
  const [data, setDataState] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    loader()
      .then((d) => {
        if (!alive) return
        setDataState(d)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(communityErrorText(e))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [loader, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((updater: (prev: T | null) => T | null) => setDataState((p) => updater(p)), [])
  return { data, loading, error, reload, setData }
}

// Ejecuta una acción del servidor con «ocupado», mensaje de éxito y error claro; evita el doble toque mientras trabaja.
export interface AdminAction {
  busy: boolean
  error: string | null
  message: string | null
  run: <R>(fn: () => Promise<R>, okMessage?: string | ((r: R) => string)) => Promise<{ ok: true; result: R } | { ok: false }>
  clear: () => void
}

export function useAdminAction(): AdminAction {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const busyRef = useRef(false)

  const run = useCallback(async <R,>(fn: () => Promise<R>, okMessage?: string | ((r: R) => string)) => {
    if (busyRef.current) return { ok: false as const }
    busyRef.current = true
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await fn()
      if (okMessage) setMessage(typeof okMessage === 'function' ? okMessage(result) : okMessage)
      return { ok: true as const, result }
    } catch (e) {
      setError(communityErrorText(e))
      return { ok: false as const }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const clear = useCallback(() => {
    setError(null)
    setMessage(null)
  }, [])

  return { busy, error, message, run, clear }
}
