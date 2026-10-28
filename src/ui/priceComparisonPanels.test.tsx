// @vitest-environment jsdom
// Comparador de precios en pantalla: ficha del producto (precio por tienda, sugerencias corregibles) y lista de la compra (totales con
// cobertura). Datos de mentira; la base de datos real se probó aparte (aislamiento entre familias) en docs/PEPA_CONTROL_REQUISITOS.md.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product, ProductPrice, ShoppingItem } from '@/domain/types'

let decisions: { productA: string; productB: string; relation: string }[] = []
let shared: { keyA: string; keyB: string; level: string }[] = []
const setFamilyDecision = vi.fn(async (a: string, b: string, relation: string) => {
  decisions = [...decisions.filter((d) => !(d.productA === a && d.productB === b)), { productA: a, productB: b, relation }]
})
const clearFamilyDecision = vi.fn(async () => undefined)
const loadSharedSpy = vi.fn(async (_names: readonly string[]) => shared)
let storedProducts: Product[] = []
let storedPrices: ProductPrice[] = []

vi.mock('@/data/productEquivalences', () => ({
  listFamilyDecisions: async () => decisions,
  setFamilyDecision: (...a: [string, string, string]) => setFamilyDecision(...a),
  clearFamilyDecision: () => clearFamilyDecision(),
  loadSharedEquivalences: (names: readonly string[]) => loadSharedSpy(names),
}))
vi.mock('@/data/products', () => ({ listProducts: async () => storedProducts, listAllProductPrices: async () => storedPrices, setPriceLinePack: async () => undefined }))
vi.mock('@/data/commonProducts', () => ({ listCommonProductsData: async () => ({ commons: [], members: [], skipped: [], available: true }), assignToCommon: async () => undefined, createCommonProduct: async (name: string) => ({ id: 'new', name, normalizedName: name }) }))
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

const { ProductPriceComparison, ListPriceComparison } = await import('@/ui/PriceComparisonPanels')

const prod = (id: string, displayName: string): Product => ({ id, familyId: 'f', normalizedName: displayName.toLowerCase(), displayName, category: null, brand: null, nonFood: false, classConfirmedAt: null, photoPath: null })
const price = (productId: string, p: number, store: string, recordedDate: string): ProductPrice => ({ id: `${productId}${store}${recordedDate}`, productId, price: p, store, quantity: '1', unit: 'ud', recordedDate, receiptId: null })
const item = (name: string, quantity = '1'): ShoppingItem => ({ id: name, familyId: 'f', tripId: null, eventId: null, name, quantity, unit: 'ud', priority: 'normal', status: 'pendiente', store: null, sortOrder: 0, price: null } as ShoppingItem)

const today = new Date().toISOString().slice(0, 10)

beforeEach(() => {
  decisions = []
  shared = []
  setFamilyDecision.mockClear()
  loadSharedSpy.mockClear()
})
afterEach(cleanup)

describe('ficha del producto', () => {
  const products = [prod('a', 'Arroz redondo 1 kg'), prod('b', 'Arroz redondo 500 g'), prod('c', 'Arroz integral 1 kg')]
  const prices = [price('a', 1.6, 'Mercadona', today), price('b', 0.9, 'Lidl', today), price('c', 1.9, 'Lidl', today)]

  // COR-04D: la ficha arranca con SU historial («Solo el mismo»); los equivalentes se comparan al elegir «+ Equivalentes».
  const withEquivalents = async () => {
    fireEvent.click(await screen.findByRole('button', { name: '+ Equivalentes' }))
  }

  it('enseña el precio por kg de cada tienda, el más barato, y no mezcla el arroz integral', async () => {
    render(<ProductPriceComparison productId="a" products={products} prices={prices} />)
    await withEquivalents()
    expect(await screen.findByText('Mercadona')).toBeTruthy()
    expect(screen.getByText(/🏷️ más barato/)).toBeTruthy()
    expect(screen.getByText('Lidl')).toBeTruthy()
    expect(screen.getByText(/1,80 .*kg/)).toBeTruthy() // 0,90 € por 500 g = 1,80 €/kg
    expect(screen.queryByText(/integral/)).toBeNull()
    expect(screen.getByText(/no ofertas de hoy/)).toBeTruthy()
  })

  it('«Solo el mismo» (el alcance con el que arranca la ficha) deja fuera el producto equivalente; «+ Equivalentes» lo suma', async () => {
    render(<ProductPriceComparison productId="a" products={products} prices={prices} />)
    await screen.findByText('Mercadona')
    expect(screen.queryByText('Lidl')).toBeNull()
    expect(screen.getByText(/solo hay precios de una tienda/i)).toBeTruthy()
    await withEquivalents()
    expect(await screen.findByText('Lidl')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Solo el mismo' }))
    await waitFor(() => expect(screen.queryByText('Lidl')).toBeNull())
  })

  it('la familia corrige una equivalencia: «No es equivalente» la guarda como decisión de la familia', async () => {
    render(<ProductPriceComparison productId="a" products={products} prices={prices} />)
    await withEquivalents()
    fireEvent.click(await screen.findByRole('button', { name: 'No es equivalente' }))
    await waitFor(() => expect(setFamilyDecision).toHaveBeenCalledWith('a', 'b', 'different'))
    await waitFor(() => expect(screen.queryByText('Lidl')).toBeNull()) // ya no entra en la comparación
  })

  it('una duda se muestra como sugerencia corregible, no como dato', async () => {
    const ps = [prod('a', 'Leche entera 1 L'), prod('d', 'Leche Pascual')]
    render(<ProductPriceComparison productId="a" products={ps} prices={[price('a', 1, 'Lidl', today)]} />)
    expect(await screen.findByText('¿Es lo mismo?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, equivalente' }))
    await waitFor(() => expect(setFamilyDecision).toHaveBeenCalledWith('a', 'd', 'equivalent'))
  })

  it('sin tamaño en el nombre dice que no se puede calcular una comparación exacta', async () => {
    render(<ProductPriceComparison productId="l" products={[prod('l', 'Leche entera')]} prices={[price('l', 1, 'Lidl', today)]} />)
    expect(await screen.findByText(/no se puede calcular una comparación exacta/)).toBeTruthy()
  })

  it('al consultar lo compartido solo viajan NOMBRES de producto (nunca precios, tiendas ni fechas)', async () => {
    render(<ProductPriceComparison productId="a" products={products} prices={prices} />)
    await withEquivalents()
    await screen.findByText('Lidl')
    const sent = JSON.stringify(loadSharedSpy.mock.calls)
    expect(sent).toContain('Arroz redondo 1 kg')
    expect(sent).not.toMatch(/Mercadona|Lidl|1\.6|0\.9|2026/)
  })
})

describe('lista de la compra', () => {
  beforeEach(() => {
    storedProducts = [prod('m1', 'Leche entera Hacendado 1 L'), prod('m2', 'Leche entera Milbona 1 L'), prod('a1', 'Arroz redondo 1 kg'), prod('h1', 'Huevos 12 ud'), prod('p1', 'Pan de molde')]
    storedPrices = [
      price('m1', 0.9, 'Mercadona', today), price('m2', 0.8, 'Lidl', today),
      price('a1', 1.6, 'Mercadona', today), price('a1', 1.4, 'Lidl', today),
      price('h1', 2.4, 'Mercadona', today), price('h1', 2.2, 'Lidl', today),
      price('p1', 1.2, 'Mercadona', today),
    ]
  })

  it('no calcula nada hasta que se pide y entonces enseña totales con cobertura', async () => {
    render(<ListPriceComparison items={[item('Leche entera Hacendado 1 L', '6'), item('Arroz redondo 1 kg', '2'), item('Huevos 12 ud')]} />)
    expect(screen.queryByText(/Lidl/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Comparar la lista entre tiendas/ }))
    expect(await screen.findByText(/Lidl/)).toBeTruthy()
    expect(screen.getByText(/9,80 €/)).toBeTruthy() // Lidl: 6×0,80 + 2×1,40 + 2,20
    expect(document.body.textContent).toContain("más barato (−1,20 €)") // Mercadona: 11,00 €
    expect(screen.getAllByText(/3 de 3 artículos con precio/).length).toBe(2)
    expect(screen.getByText(/no con ofertas de hoy/)).toBeTruthy()
  })

  it('una tienda con precios solo de parte de la lista no gana por tener un total menor', async () => {
    render(<ListPriceComparison items={[item('Leche entera Hacendado 1 L'), item('Arroz redondo 1 kg'), item('Huevos 12 ud'), item('Pan de molde')]} />)
    fireEvent.click(screen.getByRole('button', { name: /Comparar la lista entre tiendas/ }))
    expect(await screen.findByText(/Solo se comparan los 3 artículos/)).toBeTruthy()
    expect(screen.queryByText(/solo 3 de 4/)).toBeNull()
  })

  it('con precios de hace meses avisa de que pueden haber cambiado', async () => {
    storedPrices = storedPrices.map((p) => ({ ...p, recordedDate: '2025-01-10' }))
    render(<ListPriceComparison items={[item('Leche entera Hacendado 1 L'), item('Arroz redondo 1 kg'), item('Huevos 12 ud')]} />)
    fireEvent.click(screen.getByRole('button', { name: /Comparar la lista entre tiendas/ }))
    expect(await screen.findByText(/más de 2 meses/)).toBeTruthy()
  })

  it('sin datos suficientes lo dice y no nombra ninguna tienda', async () => {
    render(<ListPriceComparison items={[item('Caviar'), item('Trufa')]} />)
    fireEvent.click(screen.getByRole('button', { name: /Comparar la lista entre tiendas/ }))
    expect(await screen.findByText(/no hay precios suficientes/i)).toBeTruthy()
    expect(screen.queryByText(/más barato/)).toBeNull()
  })
})
