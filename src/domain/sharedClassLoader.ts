// Carga por lotes (y con caché) del aprendizaje compartido para los pares (tienda, texto) que una pantalla necesita.
// PURO: la llamada real a la base de datos se inyecta (src/data/sharedClasses.ts), así que se puede probar sin red.
//
// - Sin N+1: los pares se agrupan y se envían de 500 en 500 en una sola RPC por lote; los ya resueltos no se vuelven a pedir.
// - Tolerante a fallos: si la RPC falla, esos pares simplemente NO tienen resultado y el resolutor sigue con legacy → reglas →
//   respaldo (como antes). Un fallo no se guarda en caché para siempre: se reintenta pasado un tiempo.
// - Privacidad: solo viaja la tienda y el texto comercial (nunca familia, precio, fecha, cantidad, ticket ni banco).
import { sharedPairKey, type SharedClassHint } from './productClass'

export interface SharedPair {
  store: string
  text: string
}

export interface SharedBatchRow {
  idx: number
  status: string
  food_type_key: string | null
}

export type SharedBatchFetcher = (items: { store: string; text: string }[]) => Promise<SharedBatchRow[]>

export const SHARED_BATCH_SIZE = 500
const ERROR_RETRY_MS = 60_000

export interface SharedClassLoader {
  /** Resuelve los pares que falten y devuelve todos los disponibles. Nunca lanza. */
  load(pairs: readonly SharedPair[]): Promise<Map<string, SharedClassHint>>
  /** Lo ya cargado, sin red. */
  peek(store: string, text: string): SharedClassHint | undefined
  clear(): void
}

export function createSharedClassLoader(fetcher: SharedBatchFetcher, now: () => number = Date.now): SharedClassLoader {
  const cache = new Map<string, SharedClassHint>()
  const failedAt = new Map<string, number>()

  return {
    peek: (store, text) => cache.get(sharedPairKey(store, text)),
    clear: () => {
      cache.clear()
      failedAt.clear()
    },
    async load(pairs) {
      const result = new Map<string, SharedClassHint>()
      const missing = new Map<string, SharedPair>()
      for (const pair of pairs) {
        const store = pair.store.trim()
        const text = pair.text.trim()
        if (!store || !text) continue
        const key = sharedPairKey(store, text)
        const cached = cache.get(key)
        if (cached) {
          result.set(key, cached)
          continue
        }
        const failed = failedAt.get(key)
        if (failed != null && now() - failed < ERROR_RETRY_MS) continue
        missing.set(key, { store, text })
      }
      const entries = [...missing.entries()]
      for (let i = 0; i < entries.length; i += SHARED_BATCH_SIZE) {
        const chunk = entries.slice(i, i + SHARED_BATCH_SIZE)
        try {
          const rows = await fetcher(chunk.map(([, p]) => ({ store: p.store, text: p.text })))
          const byIdx = new Map(rows.map((r) => [r.idx, r]))
          chunk.forEach(([key], idx) => {
            const row = byIdx.get(idx)
            if (!row) {
              failedAt.set(key, now())
              return
            }
            // food_type_key solo viaja con "matched": nunca se copia una clase de un estado que no la tiene
            const hint: SharedClassHint = { status: row.status, foodTypeKey: row.status === 'matched' ? row.food_type_key : null }
            cache.set(key, hint)
            result.set(key, hint)
          })
        } catch {
          for (const [key] of chunk) failedAt.set(key, now())
        }
      }
      return result
    },
  }
}
