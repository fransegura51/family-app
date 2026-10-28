// @vitest-environment jsdom
// COR-04D — la ficha de un producto enseña SU historial: dos productos equivalentes (mousse de chocolate y natillas de vainilla de Mercadona, marcados como comparables) no mezclan
// compras, precios ni solicitudes de formato. COR-04C — cada registro enlaza con SU compra por identificador, y sin referencia válida no hay enlace.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product, ProductPrice } from '@/domain/types'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : () => empty()) }) }))

const eq = vi.hoisted(() => ({
  decisions: [] as { productA: string; productB: string; relation: 'same' | 'equivalent' | 'different' }[],
  commons: { commons: [] as { id: string; name: string }[], members: [] as { productId: string; commonId: string }[], skipped: [] as unknown[], rejected: [] as unknown[], available: true },
}))
vi.mock('@/data/productEquivalences', () => ({
  listFamilyDecisions: async () => eq.decisions,
  loadSharedEquivalences: async () => [],
  setFamilyDecision: async () => undefined,
  clearFamilyDecision: async () => undefined,
}))
vi.mock('@/data/commonProducts', async (o) => ({ ...(await o<typeof import('@/data/commonProducts')>()), listCommonProductsData: async () => eq.commons }))

const { ProductPriceComparison } = await import('@/ui/PriceComparisonPanels')

const product = (id: string, name: string): Product => ({ id, familyId: 'f', normalizedName: name.toLowerCase(), displayName: name, category: null, brand: null, nonFood: false, classConfirmedAt: null, classKind: null }) as unknown as Product
const price = (id: string, productId: string, receiptId: string | null, amount: number, date: string, store = 'Mercadona'): ProductPrice => ({ id, productId, receiptId, price: amount, quantity: '2', unit: null, store, recordedDate: date, pack: null }) as unknown as ProductPrice

const mousse = product('p-mousse', '+PROTEINAS MOUSSE CH.')
const natilla = product('p-natilla', '+PROT NATILLA VAINI.')
const products = [mousse, natilla]
const prices = [
  price('pr-m16', 'p-mousse', 'r-16', 2.55, '2026-10-16'),
  price('pr-m26', 'p-mousse', 'r-26', 2.55, '2026-10-26'),
  price('pr-n16', 'p-natilla', 'r-16', 1.75, '2026-10-16'),
]
const receipts = [
  { id: 'r-16', storagePath: 'f/r16.jpg' },
  { id: 'r-26', storagePath: null },
]

beforeEach(() => {
  // El usuario las marcó como comparables (equivalentes), y además están en el mismo producto común «Postres +Proteínas».
  eq.decisions = [{ productA: 'p-mousse', productB: 'p-natilla', relation: 'equivalent' }]
  eq.commons = { commons: [{ id: 'c1', name: 'Postres +Proteínas' }], members: [{ productId: 'p-mousse', commonId: 'c1' }, { productId: 'p-natilla', commonId: 'c1' }], skipped: [], rejected: [], available: true }
})
afterEach(cleanup)

function sheet(productId: string, onViewPurchase = vi.fn(), extra: Partial<Parameters<typeof ProductPriceComparison>[0]> = {}) {
  render(<ProductPriceComparison productId={productId} products={products} prices={prices} receipts={receipts} onViewPurchase={onViewPurchase} {...extra} />)
  return onViewPurchase
}
const unformattedSection = async () => (await screen.findByText(/Compras sin formato conocido/)).parentElement as HTMLElement

describe('COR-04D · historiales independientes entre productos equivalentes', () => {
  it('la ficha de las natillas solo enseña SUS compras y SUS solicitudes de formato (una), nunca las del mousse', async () => {
    sheet('p-natilla')
    const section = await unformattedSection()
    expect(within(section).getAllByRole('button', { name: 'Indicar formato' })).toHaveLength(1) // las natillas tienen 1 compra; el mousse 2
    expect(section.textContent).toContain('16/10/2026')
    expect(section.textContent).toContain('1,75 €')
    expect(section.textContent).not.toContain('2,55 €')
    expect(section.textContent).not.toContain('26/10/2026')
  })

  it('la ficha del mousse solo enseña las suyas (2), con sus fechas y su precio', async () => {
    sheet('p-mousse')
    const section = await unformattedSection()
    expect(within(section).getAllByRole('button', { name: 'Indicar formato' })).toHaveLength(2)
    expect(section.textContent).toContain('2,55 €')
    expect(section.textContent).not.toContain('1,75 €')
  })

  it('«+ Equivalentes» compara los dos pero IDENTIFICADOS por separado; las solicitudes de formato siguen siendo solo del producto abierto', async () => {
    // damos tamaño a los dos nombres para que haya precio comparable y se vean filas
    const sized = [product('p-mousse', '+PROTEINAS MOUSSE CH. 2x125 g'), product('p-natilla', '+PROT NATILLA VAINI. 2x125 g')]
    render(<ProductPriceComparison productId="p-natilla" products={sized} prices={prices} receipts={receipts} onViewPurchase={() => undefined} />)
    const chip = await screen.findByRole('button', { name: '+ Equivalentes' })
    fireEvent.click(chip)
    await waitFor(() => expect(screen.getByText(/Se comparan también con/)).toBeTruthy())
    expect(screen.getAllByText(/\+PROTEINAS MOUSSE CH\. 2x125 g/).length).toBeGreaterThan(0) // el mousse aparece como producto distinto, con su nombre
    expect(screen.queryByText(/Compras sin formato conocido/)).toBeNull() // con tamaño conocido no hay solicitudes; y nunca se cruzan
  })

  it('por defecto la ficha NO mezcla equivalentes (alcance «Solo el mismo»)', async () => {
    sheet('p-natilla')
    await unformattedSection()
    expect(screen.getByRole('button', { name: 'Solo el mismo' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '+ Equivalentes' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('la relación de equivalencia (y el producto común) se conserva: sigue apareciendo «Producto común: Postres +Proteínas»', async () => {
    sheet('p-natilla')
    await unformattedSection()
    expect(screen.getByText(/Postres \+Proteínas/)).toBeTruthy()
  })
})

describe('COR-04C · enlace de cada registro con su compra original', () => {
  it('cada registro lleva SU compra: el mousse del 16/10 → r-16 (con ticket: «Ver ticket»), el del 26/10 → r-26 (sin ticket: «Ver compra»)', async () => {
    const onView = sheet('p-mousse')
    const section = await unformattedSection()
    const cards = [...section.querySelectorAll('.receipt-line-card')] as HTMLElement[]
    expect(cards).toHaveLength(2)
    const c26 = cards.find((c) => c.textContent?.includes('26/10/2026'))!
    const c16 = cards.find((c) => c.textContent?.includes('16/10/2026'))!
    fireEvent.click(within(c16).getByRole('button', { name: 'Ver ticket' }))
    expect(onView).toHaveBeenLastCalledWith('r-16')
    fireEvent.click(within(c26).getByRole('button', { name: 'Ver compra' }))
    expect(onView).toHaveBeenLastCalledWith('r-26')
  })

  it('el mismo ticket (r-16) lo comparten el mousse y las natillas, pero cada ficha enlaza SU línea: el enlace de las natillas abre también r-16 sin mostrar el mousse', async () => {
    const onView = sheet('p-natilla')
    const section = await unformattedSection()
    fireEvent.click(within(section).getByRole('button', { name: 'Ver ticket' }))
    expect(onView).toHaveBeenCalledTimes(1)
    expect(onView).toHaveBeenCalledWith('r-16')
  })

  it('sin referencia válida (registro sin compra, o compra que ya no existe) no se enseña ningún enlace', async () => {
    const orphan = [price('pr-x', 'p-natilla', null, 1.75, '2026-10-01'), price('pr-y', 'p-natilla', 'r-borrada', 1.75, '2026-10-02')]
    render(<ProductPriceComparison productId="p-natilla" products={products} prices={orphan} receipts={receipts} onViewPurchase={() => undefined} />)
    const section = await unformattedSection()
    expect(within(section).getAllByRole('button', { name: 'Indicar formato' })).toHaveLength(2)
    expect(within(section).queryByRole('button', { name: /Ver ticket|Ver compra/ })).toBeNull()
  })

  it('sin la función de navegación (otras pantallas que reutilizan la ficha) no aparece ningún enlace', async () => {
    render(<ProductPriceComparison productId="p-natilla" products={products} prices={prices} receipts={receipts} />)
    const section = await unformattedSection()
    expect(within(section).queryByRole('button', { name: /Ver ticket|Ver compra/ })).toBeNull()
  })
})
