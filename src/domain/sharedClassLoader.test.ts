import { describe, expect, it, vi } from 'vitest'
import { createSharedClassLoader, SHARED_BATCH_SIZE, type SharedBatchFetcher, type SharedBatchRow } from './sharedClassLoader'
import { sharedPairKey } from './productClass'

// Fetcher de mentira: «Mercadona» resuelve, el resto no encuentra nada.
const okFetcher = (): SharedBatchFetcher =>
  vi.fn(async (items: { store: string; text: string }[]) =>
    items.map<SharedBatchRow>((it, idx) =>
      it.store.toLowerCase() === 'mercadona'
        ? { idx, status: 'matched', food_type_key: 'food.fruta' }
        : { idx, status: 'not_found', food_type_key: null },
    ),
  )

describe('carga por lotes del aprendizaje compartido', () => {
  it('una sola RPC para muchos pares (sin N+1) y solo viajan tienda y texto', async () => {
    const fetcher = okFetcher()
    const loader = createSharedClassLoader(fetcher)
    const pairs = Array.from({ length: 120 }, (_, i) => ({ store: 'Mercadona', text: `producto ${i}` }))
    const result = await loader.load(pairs)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.size).toBe(120)
    const sent = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>[]
    expect(sent).toHaveLength(120)
    for (const item of sent) expect(Object.keys(item).sort()).toEqual(['store', 'text']) // ni familia, ni precio, ni fecha, ni ticket
  })

  it('parte los pares en lotes de 500', async () => {
    const fetcher = okFetcher()
    const loader = createSharedClassLoader(fetcher)
    const pairs = Array.from({ length: 1200 }, (_, i) => ({ store: 'Mercadona', text: `p${i}` }))
    await loader.load(pairs)
    expect(SHARED_BATCH_SIZE).toBe(500)
    expect((fetcher as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as unknown[]).length)).toEqual([500, 500, 200])
  })

  it('caché: lo ya resuelto no se vuelve a pedir; los pares repetidos se piden una vez', async () => {
    const fetcher = okFetcher()
    const loader = createSharedClassLoader(fetcher)
    await loader.load([{ store: 'Mercadona', text: 'Leche' }, { store: ' mercadona', text: 'LECHE ' }])
    expect((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(1)
    await loader.load([{ store: 'Mercadona', text: 'leche' }])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(loader.peek('Mercadona', 'leche')).toEqual({ status: 'matched', foodTypeKey: 'food.fruta' })
  })

  it('solo pide lo que falta cuando llegan pares nuevos', async () => {
    const fetcher = okFetcher()
    const loader = createSharedClassLoader(fetcher)
    await loader.load([{ store: 'Mercadona', text: 'a' }])
    await loader.load([{ store: 'Mercadona', text: 'a' }, { store: 'Mercadona', text: 'b' }])
    expect((fetcher as ReturnType<typeof vi.fn>).mock.calls[1][0]).toEqual([{ store: 'Mercadona', text: 'b' }])
  })

  it('pares sin tienda o sin texto no viajan', async () => {
    const fetcher = okFetcher()
    const loader = createSharedClassLoader(fetcher)
    const result = await loader.load([{ store: '', text: 'a' }, { store: 'Mercadona', text: '  ' }])
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })

  it('food_type_key solo se conserva con «matched»', async () => {
    const fetcher: SharedBatchFetcher = async () => [
      { idx: 0, status: 'ambiguous', food_type_key: 'food.carne' }, // una fila defectuosa nunca debe dar clase
      { idx: 1, status: 'matched', food_type_key: 'food.fruta' },
    ]
    const loader = createSharedClassLoader(fetcher)
    const res = await loader.load([{ store: 'Charter', text: 'sup bebida fria' }, { store: 'Mercadona', text: 'manzana' }])
    expect(res.get(sharedPairKey('Charter', 'sup bebida fria'))).toEqual({ status: 'ambiguous', foodTypeKey: null })
    expect(res.get(sharedPairKey('Mercadona', 'manzana'))).toEqual({ status: 'matched', foodTypeKey: 'food.fruta' })
  })
})

describe('RPC caída: el aprendizaje compartido es una mejora, no una dependencia', () => {
  it('un error de la RPC no lanza: los pares simplemente no tienen resultado', async () => {
    const loader = createSharedClassLoader(async () => {
      throw new Error('network down')
    })
    const result = await loader.load([{ store: 'Mercadona', text: 'leche' }])
    expect(result.size).toBe(0)
    expect(loader.peek('Mercadona', 'leche')).toBeUndefined()
  })

  it('un error no se cachea para siempre: se reintenta pasado un tiempo, y no se martillea antes', async () => {
    let t = 0
    let fail = true
    const fetcher = vi.fn(async (items: { store: string; text: string }[]) => {
      if (fail) throw new Error('down')
      return items.map<SharedBatchRow>((_, idx) => ({ idx, status: 'matched', food_type_key: 'food.carne' }))
    })
    const loader = createSharedClassLoader(fetcher, () => t)
    const pair = [{ store: 'Mercadona', text: 'pollo' }]
    await loader.load(pair)
    t = 10_000
    await loader.load(pair) // dentro de la ventana de espera: no reintenta
    expect(fetcher).toHaveBeenCalledTimes(1)
    fail = false
    t = 61_000
    const ok = await loader.load(pair)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(ok.get(sharedPairKey('Mercadona', 'pollo'))).toEqual({ status: 'matched', foodTypeKey: 'food.carne' })
  })

  it('si falla un lote, los demás se cargan igualmente', async () => {
    let call = 0
    const fetcher: SharedBatchFetcher = async (items) => {
      call++
      if (call === 1) throw new Error('lote 1 caído')
      return items.map((_, idx) => ({ idx, status: 'matched', food_type_key: 'food.fruta' }))
    }
    const loader = createSharedClassLoader(fetcher)
    const pairs = Array.from({ length: 700 }, (_, i) => ({ store: 'Mercadona', text: `p${i}` }))
    const res = await loader.load(pairs)
    expect(res.size).toBe(200) // el primer lote de 500 falló; el de 200 sí
  })

  it('una respuesta incompleta deja sin resultado solo lo que falta', async () => {
    const fetcher: SharedBatchFetcher = async () => [{ idx: 0, status: 'matched', food_type_key: 'food.fruta' }]
    const loader = createSharedClassLoader(fetcher)
    const res = await loader.load([{ store: 'Mercadona', text: 'a' }, { store: 'Mercadona', text: 'b' }])
    expect(res.size).toBe(1)
  })

  it('clear() vacía la caché', async () => {
    const fetcher = okFetcher()
    const loader = createSharedClassLoader(fetcher)
    await loader.load([{ store: 'Mercadona', text: 'a' }])
    loader.clear()
    expect(loader.peek('Mercadona', 'a')).toBeUndefined()
  })
})
