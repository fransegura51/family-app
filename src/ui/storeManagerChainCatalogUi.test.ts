import { describe, expect, it } from 'vitest'

const SRC = (import.meta.glob('/src/ui/ShoppingScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/ShoppingScreen.tsx'
]

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

// StoreManager es la última función del archivo — igual que FileOrPdfPicker en su propio test, se toma
// todo lo que queda hasta el final del archivo para no depender de un heurístico de fin de bloque.
const MANAGER_FN = SRC.slice(SRC.indexOf('function StoreManager({'))

describe('Catálogo global de cadenas — solo supermercados activos, nunca duplicados por familia', () => {
  it('listSupermarketChains()/listStoreChainAliases() se cargan junto al resto de la pestaña (misma Promise.all, mismo reload)', () => {
    expect(SRC).toContain('listSupermarketChains()')
    expect(SRC).toContain('listStoreChainAliases()')
    expect(SRC).toContain('setStoreChains(chains)')
    expect(SRC).toContain('setStoreChainAliases(aliases)')
  })

  it('el data layer filtra por kind=supermarket y status=active — nunca ofrece Repsol/Amazon/tiendas locales en el selector', () => {
    const dataFile = (import.meta.glob('/src/data/storeChains.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
      '/src/data/storeChains.ts'
    ]
    expect(dataFile).toContain(".eq('kind', 'supermarket')")
    expect(dataFile).toContain(".eq('status', 'active')")
  })

  it('unlinkedChains excluye las cadenas que la familia ya tiene vinculadas (linkedChainKeys, por s.chainKey)', () => {
    expect(MANAGER_FN).toContain('const linkedChainKeys = new Set(stores.map((s) => s.chainKey).filter((k): k is string => !!k))')
    expect(MANAGER_FN).toContain('const unlinkedChains = chains.filter((c) => !linkedChainKeys.has(c.key))')
  })
})

describe('Sugerencia de vínculo — nunca fusión automática, siempre confirmación explícita', () => {
  const suggestFn = slice(MANAGER_FN, 'function suggestedMatchFor(chain: StoreChainRow): ShoppingStoreEntry | null {', '\n  }')

  it('suggestedMatchFor reutiliza resolveStoreChain/aliases ya existentes — no inventa su propio matching por texto', () => {
    expect(suggestFn).toContain('resolveStoreChain(s.name, chains, aliases)')
    expect(suggestFn).toContain("resolution.status === 'resolved'")
  })

  it('solo mira tiendas SIN chainKey todavía — una ya vinculada no se vuelve a sugerir', () => {
    expect(suggestFn).toContain('if (s.chainKey) continue')
  })

  it('clic en una cadena con sugerencia abre confirmación (setLinkingChain) en vez de vincular directamente', () => {
    expect(MANAGER_FN).toContain('onClick={() => (match ? setLinkingChain({ chain, match }) : handleAddChain(chain))}')
  })

  it('"Sí, vincular" llama a linkShoppingStoreToChain — el nombre de la tienda ya creada no se toca', () => {
    const confirmFn = slice(MANAGER_FN, 'async function handleConfirmLink() {', '\n  }')
    expect(confirmFn).toContain('linkShoppingStoreToChain(linkingChain.match.id, linkingChain.chain.key)')
  })

  it('"No, es otra tienda" crea una fila nueva (handleAddChain) en vez de vincular la existente — ninguna fusión silenciosa', () => {
    const rejectBlock = slice(MANAGER_FN, 'onClick={() => {\n                    const chain = linkingChain.chain', 'No, es otra tienda')
    expect(rejectBlock).toContain('setLinkingChain(null)')
    expect(rejectBlock).toContain('handleAddChain(chain)')
  })

  it('handleAddChain crea la tienda ya con su chain_key — createShoppingStoreFromChain, nunca createShoppingStore a secas', () => {
    const addFn = slice(MANAGER_FN, 'async function handleAddChain(chain: StoreChainRow) {', '\n  }')
    expect(addFn).toContain('createShoppingStoreFromChain(chain.key, chain.name)')
  })
})

describe('Tiendas personalizadas — siguen funcionando exactamente igual, sin obligar a elegir una cadena', () => {
  it('el formulario libre "+ Añadir otra tienda" sigue llamando a createShoppingStore (sin chain_key)', () => {
    expect(MANAGER_FN).toContain('onSubmit={handleAdd}')
    const handleAddFn = slice(MANAGER_FN, 'async function handleAdd(e: FormEvent) {', '\n  }')
    expect(handleAddFn).toContain('createShoppingStore(newName.trim())')
  })

  it('el catálogo de cadenas solo se muestra cuando hay alguna sin vincular todavía (no estorba si no aporta nada)', () => {
    expect(MANAGER_FN).toContain('{unlinkedChains.length > 0 && (')
  })
})
