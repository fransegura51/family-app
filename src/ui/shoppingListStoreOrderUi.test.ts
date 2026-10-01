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

const LIST_TAB = slice(SRC, 'function ShoppingListTab() {', '\nfunction StoreManager(')

describe('Título — "Lista de la Compra" en vez de "Pendientes", sin tocar la lógica de abajo', () => {
  it('el título visible es exactamente "Lista de la Compra"', () => {
    expect(LIST_TAB).toContain('<h2 className="section-title">Lista de la Compra</h2>')
    expect(LIST_TAB).not.toContain('>Pendientes<')
  })
})

describe('Orden de tiendas — respeta shopping_stores.sort_order (vía el índice de `stores`), nunca vuelve a ordenar alfabéticamente por delante de eso', () => {
  const sortBlock = slice(LIST_TAB, 'const storeGroups = [...itemsByStore.entries()].sort((a, b) => {', '\n  })')

  it('"Sin tienda" sigue siempre el último bloque, antes de mirar sort_order', () => {
    expect(sortBlock).toContain("if (a[0] === 'Sin tienda') return 1")
    expect(sortBlock).toContain("if (b[0] === 'Sin tienda') return -1")
  })

  it('usa el índice de `stores` (storeOrderIndex, que ya llega ordenada por sort_order) como criterio principal', () => {
    expect(sortBlock).toContain('storeOrderIndex.get(a[0])')
    expect(sortBlock).toContain('storeOrderIndex.get(b[0])')
    expect(sortBlock).toContain('return ia - ib')
  })

  it('un nombre de tienda sin fila registrada en shopping_stores no desaparece: va detrás de las registradas, alfabético entre sí', () => {
    expect(sortBlock).toContain('if (ia != null) return -1')
    expect(sortBlock).toContain('if (ib != null) return 1')
    expect(sortBlock).toContain('return a[0].localeCompare(b[0])')
  })

  it('storeOrderIndex se construye a partir de `stores`, que listShoppingStores() ya devuelve ordenada por sort_order', () => {
    expect(LIST_TAB).toContain('const storeOrderIndex = useMemo(() => new Map(stores.map((s, i) => [s.name, i] as const)), [stores])')
  })
})

describe('Pendientes/Completados dentro de cada tienda', () => {
  const storeBlock = slice(LIST_TAB, 'storeGroups.map(([store, storeItems]) => {', '\n      })}')

  it('cada grupo de tienda separa pendientes y comprados por status, preservando el orden relativo de `storeItems`', () => {
    expect(storeBlock).toContain("const pendingItems = storeItems.filter((i) => i.status === 'pendiente')")
    expect(storeBlock).toContain("const doneItems = storeItems.filter((i) => i.status === 'comprado')")
  })

  it('las clases de producto (classGroupsFor) se aplican SOLO a pendingItems — nunca a doneItems', () => {
    expect(storeBlock).toContain('classGroupsFor(pendingItems)')
    expect(storeBlock).not.toContain('classGroupsFor(storeItems)')
    expect(storeBlock).not.toContain('classGroupsFor(doneItems)')
  })

  it('Completados es un bloque plano aparte, con su propio DraggableStoreGroup (nunca subdividido por clase)', () => {
    const completedBlock = slice(storeBlock, 'doneItems.length > 0 && (', '\n              )}')
    expect(completedBlock).toContain('<p className="shopping-class-heading">✓ Completados</p>')
    expect(completedBlock).toContain('items={doneItems}')
    expect(completedBlock).not.toContain('classGroupsFor')
  })

  it('"Finalizar compra" sigue recibiendo storeItems completo (pendientes + comprados) — su comportamiento no cambia', () => {
    expect(storeBlock).toContain('onConfirm={() => finalizePurchase(storeItems)}')
  })

  it('setStatus (marcar comprado/pendiente) no toca sort_order — solo cambia el status del item', () => {
    const setStatusFn = slice(LIST_TAB, 'async function setStatus(id: string, status: ShoppingItemStatus) {', '\n  }')
    expect(setStatusFn).toContain('updateShoppingItemStatus(id, status)')
    expect(setStatusFn).not.toMatch(/reorder/i)
  })

  it('finalizePurchase sigue intacta: solo borra lo comprado de esa tienda, no toca lo pendiente', () => {
    const finalizeFn = slice(LIST_TAB, 'async function finalizePurchase(storeItems: ShoppingItem[]) {', '\n  }')
    expect(finalizeFn).toContain("storeItems.filter((i) => i.status === 'comprado')")
    expect(finalizeFn).toContain('deleteShoppingItems(boughtIds)')
  })
})

describe('Cabecera de tienda — nombre y logo más grandes, misma info que antes', () => {
  it('el icono de tienda crece de 20 a 30 y recibe el logoAsset resuelto de su cadena', () => {
    expect(LIST_TAB).toContain('<StoreIconBadge name={store} size={30} logoAsset={logoAssetByStoreName.get(store)} />')
  })

  it('logoAssetByStoreName solo resuelve logo cuando la tienda tiene chainKey — null para tiendas personalizadas', () => {
    expect(LIST_TAB).toContain('s.chainKey ? (logoAssetByChainKey.get(s.chainKey) ?? null) : null')
  })
})
