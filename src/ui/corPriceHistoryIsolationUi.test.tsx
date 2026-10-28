// @vitest-environment jsdom
// COR-04D/E — la ficha de un producto enseña SU historial: dos productos equivalentes (mousse de chocolate y natillas de vainilla de Mercadona, marcados como comparables) no mezclan
// compras, precios ni solicitudes de formato; «+ Equivalentes» enseña los precios de AMBOS (identificados) aunque no tengan formato conocido; una equivalencia confirmada no vuelve a
// preguntarse como pendiente. COR-04C — cada registro enlaza con SU compra por identificador, y sin referencia válida no hay enlace.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product, ProductPrice } from '@/domain/types'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : () => empty()) }) }))

type Decision = { productA: string; productB: string; relation: 'same' | 'equivalent' | 'different' }
const eq = vi.hoisted(() => ({
  decisions: [] as { productA: string; productB: string; relation: 'same' | 'equivalent' | 'different' }[],
  shared: [] as { keyA: string; keyB: string; level: 'validated' | 'provisional' | 'blocked' }[],
  commons: { commons: [] as { id: string; name: string }[], members: [] as { productId: string; commonId: string }[], skipped: [] as unknown[], rejected: [] as unknown[], available: true },
  setDecision: vi.fn(),
}))
// La base de datos simulada: lo que se guarda lo ve cualquier lectura posterior (cerrar y reabrir la ficha).
vi.mock('@/data/productEquivalences', () => ({
  listFamilyDecisions: async () => eq.decisions.map((d) => ({ ...d })),
  loadSharedEquivalences: async () => eq.shared,
  setFamilyDecision: async (a: string, b: string, relation: Decision['relation']) => {
    eq.setDecision(a, b, relation)
    eq.decisions = [...eq.decisions.filter((d) => !((d.productA === a && d.productB === b) || (d.productA === b && d.productB === a))), { productA: a, productB: b, relation }]
  },
  clearFamilyDecision: async (a: string, b: string) => {
    eq.decisions = eq.decisions.filter((d) => !((d.productA === a && d.productB === b) || (d.productA === b && d.productB === a)))
  },
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
  eq.setDecision.mockClear()
  // El usuario las marcó como comparables (equivalentes), y además están en el mismo producto común «Postres +Proteínas».
  eq.decisions = [{ productA: 'p-mousse', productB: 'p-natilla', relation: 'equivalent' }]
  eq.shared = []
  eq.commons = { commons: [{ id: 'c1', name: 'Postres +Proteínas' }], members: [{ productId: 'p-mousse', commonId: 'c1' }, { productId: 'p-natilla', commonId: 'c1' }], skipped: [], rejected: [], available: true }
})
afterEach(cleanup)

function sheet(productId: string, onViewPurchase = vi.fn(), extra: Partial<Parameters<typeof ProductPriceComparison>[0]> = {}) {
  render(<ProductPriceComparison productId={productId} products={products} prices={prices} receipts={receipts} onViewPurchase={onViewPurchase} {...extra} />)
  return onViewPurchase
}
const unformattedSection = async () => (await screen.findByText(/Compras sin formato conocido/)).parentElement as HTMLElement
const equivalents = () => screen.findByRole('button', { name: '+ Equivalentes' }).then((b) => fireEvent.click(b))

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

  it('por defecto la ficha NO mezcla equivalentes (alcance «Solo el mismo») y ahí NO salen los precios del mousse', async () => {
    sheet('p-natilla')
    await unformattedSection()
    expect(screen.getByRole('button', { name: 'Solo el mismo' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '+ Equivalentes' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByText(/Precios registrados de los equivalentes/)).toBeNull()
    expect(document.body.textContent).not.toContain('2,55 €')
  })

  it('la relación de equivalencia (y el producto común) se conserva: sigue apareciendo «Producto común: Postres +Proteínas»', async () => {
    sheet('p-natilla')
    await unformattedSection()
    expect(screen.getByText(/Postres \+Proteínas/)).toBeTruthy()
  })
})

describe('COR-04E · «+ Equivalentes» y equivalencias confirmadas / pendientes', () => {
  it('«+ Equivalentes» enseña los precios de AMBOS: natillas 1,75 € y mousse 2,55 € (16/10 y 26/10), cada uno con su nombre, aunque no tengan formato conocido', async () => {
    sheet('p-natilla')
    await equivalents()
    const block = (await screen.findByText(/Precios registrados de los equivalentes/)).parentElement as HTMLElement
    const mouseCard = block.querySelector('[data-product-id="p-mousse"]') as HTMLElement
    expect(mouseCard.textContent).toContain('+PROTEINAS MOUSSE CH.')
    expect(mouseCard.textContent).toContain('16/10/2026')
    expect(mouseCard.textContent).toContain('26/10/2026')
    expect(mouseCard.textContent).toContain('2,55 €')
    expect(mouseCard.textContent).not.toContain('1,75 €')
    // y las natillas, en su propia lista de compras sin formato conocido
    expect((await unformattedSection()).textContent).toContain('1,75 €')
    // las solicitudes de formato siguen siendo SOLO del producto abierto
    expect(within(await unformattedSection()).getAllByRole('button', { name: 'Indicar formato' })).toHaveLength(1)
    expect(within(mouseCard).queryByRole('button', { name: 'Indicar formato' })).toBeNull()
  })

  it('cada precio del equivalente enlaza con SU compra (r-16 con ticket, r-26 sin él)', async () => {
    const onView = sheet('p-natilla')
    await equivalents()
    const mouseCard = (await screen.findByText(/Precios registrados de los equivalentes/)).parentElement!.querySelector('[data-product-id="p-mousse"]') as HTMLElement
    fireEvent.click(within(mouseCard).getByRole('button', { name: 'Ver ticket' }))
    expect(onView).toHaveBeenLastCalledWith('r-16')
    fireEvent.click(within(mouseCard).getByRole('button', { name: 'Ver compra' }))
    expect(onView).toHaveBeenLastCalledWith('r-26')
  })

  it('con tamaño conocido en el nombre, «+ Equivalentes» también calcula la comparación por tienda y los identifica por separado', async () => {
    const sized = [product('p-mousse', '+PROTEINAS MOUSSE CH. 2x125 g'), product('p-natilla', '+PROT NATILLA VAINI. 2x125 g')]
    render(<ProductPriceComparison productId="p-natilla" products={sized} prices={prices} receipts={receipts} onViewPurchase={() => undefined} />)
    await equivalents()
    await waitFor(() => expect(screen.getAllByText(/\+PROTEINAS MOUSSE CH\. 2x125 g/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/Compras sin formato conocido/)).toBeNull()
  })

  it('una equivalencia YA CONFIRMADA aparece en «Equivalencias confirmadas» (en cualquier alcance) y NO como pendiente («¿Es lo mismo?»)', async () => {
    sheet('p-natilla')
    await unformattedSection()
    expect(screen.queryByText('¿Es lo mismo?')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sí, equivalente' })).toBeNull()
    const confirmed = (await screen.findByText('Equivalencias confirmadas:')).parentElement as HTMLElement
    expect(confirmed.textContent).toContain('+PROTEINAS MOUSSE CH.')
    expect(within(confirmed).getByRole('button', { name: 'Retirar equivalencia' })).toBeTruthy()
    // lo mismo con «+ Equivalentes»
    await equivalents()
    await screen.findByText(/Precios registrados de los equivalentes/)
    expect(screen.queryByText('¿Es lo mismo?')).toBeNull()
  })

  it('una posible equivalencia (pendiente): «Sí, equivalente» guarda una decisión NUEVA, desaparece de pendientes, pasa a confirmadas y no se vuelve a preguntar al cerrar y reabrir', async () => {
    const milk = [product('a', 'Leche entera 1 L'), product('d', 'Leche Pascual')]
    const milkPrices = [price('l1', 'a', null, 1, '2026-10-01', 'Lidl')]
    eq.decisions = []
    eq.commons = { commons: [], members: [], skipped: [], rejected: [], available: true }
    const first = render(<ProductPriceComparison productId="a" products={milk} prices={milkPrices} />)
    expect(await screen.findByText('¿Es lo mismo?')).toBeTruthy()
    expect(screen.queryByText('Equivalencias confirmadas:')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, equivalente' }))
    await waitFor(() => expect(eq.setDecision).toHaveBeenCalledWith('a', 'd', 'equivalent'))
    await waitFor(() => expect(screen.queryByText('¿Es lo mismo?')).toBeNull()) // cambio visible inmediato
    const confirmed = (await screen.findByText('Equivalencias confirmadas:')).parentElement as HTMLElement
    expect(confirmed.textContent).toContain('Leche Pascual')
    expect(eq.decisions).toEqual([{ productA: 'a', productB: 'd', relation: 'equivalent' }]) // una sola relación, sin duplicados
    // cerrar y reabrir: la confirmación persiste y no vuelve a preguntar
    first.unmount()
    render(<ProductPriceComparison productId="a" products={milk} prices={milkPrices} />)
    expect((await screen.findByText('Equivalencias confirmadas:')).parentElement!.textContent).toContain('Leche Pascual')
    expect(screen.queryByText('¿Es lo mismo?')).toBeNull()
    expect(eq.setDecision).toHaveBeenCalledTimes(1)
  })

  it('«Retirar equivalencia» usa la acción existente (decisión «distintos»), la quita de confirmadas y de «+ Equivalentes»', async () => {
    eq.commons = { commons: [], members: [], skipped: [], rejected: [], available: true }
    sheet('p-natilla')
    await equivalents()
    await screen.findByText(/Precios registrados de los equivalentes/)
    fireEvent.click(within((await screen.findByText('Equivalencias confirmadas:')).parentElement as HTMLElement).getByRole('button', { name: 'Retirar equivalencia' }))
    await waitFor(() => expect(eq.setDecision).toHaveBeenCalledWith('p-natilla', 'p-mousse', 'different'))
    await waitFor(() => expect(screen.queryByText('Equivalencias confirmadas:')).toBeNull())
    expect(screen.queryByText(/Precios registrados de los equivalentes/)).toBeNull()
  })

  it('un equivalente por producto común (sin decisión propia) se muestra como confirmado «(mismo producto común)», sin pregunta pendiente y sin botón de retirar aquí', async () => {
    eq.decisions = []
    sheet('p-natilla')
    const confirmed = (await screen.findByText('Equivalencias confirmadas:')).parentElement as HTMLElement
    expect(confirmed.textContent).toContain('(mismo producto común)')
    expect(within(confirmed).queryByRole('button', { name: 'Retirar equivalencia' })).toBeNull()
    expect(screen.queryByText('¿Es lo mismo?')).toBeNull()
  })

  it('las agrupaciones legítimas de productos idénticos se mantienen: el mismo producto con otro nombre sigue contando en «Solo el mismo»', async () => {
    const same = [product('a1', 'Leche entera Hacendado 1 L'), product('a2', 'LECHE ENTERA HACENDADO 1L')]
    eq.decisions = []
    eq.commons = { commons: [], members: [], skipped: [], rejected: [], available: true }
    render(<ProductPriceComparison productId="a1" products={same} prices={[price('x1', 'a1', null, 0.9, '2026-10-01', 'Mercadona'), price('x2', 'a2', null, 0.8, '2026-10-02', 'Lidl')]} />)
    await screen.findByText('Lidl') // el mismo artículo con otro nombre entra aunque la ficha arranque en «Solo el mismo»
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

  it('el mismo ticket (r-16) lo comparten el mousse y las natillas, pero cada ficha enlaza SU línea', async () => {
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
