import { useEffect, useMemo, useState } from 'react'
import { sharedClassLoader } from '@/data/sharedClasses'
import { sharedPairKey, type SharedClassHint } from '@/domain/productClass'
import type { SharedPair } from '@/domain/sharedClassLoader'
import { isSharedClassEnabled } from '@/state/sharedClassFlag'

const EMPTY: ReadonlyMap<string, SharedClassHint> = new Map()

// Resultados del aprendizaje compartido para los (tienda, texto) que enseña una pantalla, cargados por lotes y con caché.
// Mientras carga (o si falla, o si el interruptor está apagado) el mapa va vacío y el resolutor usa clase guardada → reglas → respaldo.
// `debounceMs`: para textos que se escriben a mano (líneas de un ticket) y no lanzar una consulta por pulsación.
export function useSharedClasses(pairs: readonly SharedPair[], debounceMs = 0): ReadonlyMap<string, SharedClassHint> {
  const enabled = isSharedClassEnabled()
  const [map, setMap] = useState<ReadonlyMap<string, SharedClassHint>>(EMPTY)
  const signature = useMemo(
    () =>
      pairs
        .filter((p) => p.store.trim() && p.text.trim())
        .map((p) => sharedPairKey(p.store, p.text))
        .sort()
        .join(''),
    [pairs],
  )

  useEffect(() => {
    if (!enabled || signature === '') {
      setMap(EMPTY)
      return
    }
    let cancelled = false
    const run = () => {
      sharedClassLoader
        .load(pairs)
        .then((loaded) => {
          if (!cancelled) setMap(loaded)
        })
        .catch(() => {
          // load() nunca lanza; por si acaso, se sigue sin aprendizaje compartido
        })
    }
    const timer = debounceMs > 0 ? setTimeout(run, debounceMs) : null
    if (timer == null) run()
    return () => {
      cancelled = true
      if (timer != null) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled, debounceMs])

  return map
}

/** Resultado compartido de un (tienda, texto) de ESTE contexto; null si no hay tienda inequívoca o no está cargado. */
export function sharedHintFor(map: ReadonlyMap<string, SharedClassHint>, store: string | null | undefined, text: string): SharedClassHint | null {
  if (!store?.trim()) return null
  return map.get(sharedPairKey(store, text)) ?? null
}
