// @vitest-environment jsdom
// «Comparar precios»: Resultados y Emparejar en sus componentes reales (datos simulados con Mercadona, Hiperber, Consum y otra tienda).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommonMember, CommonProduct } from '@/domain/commonProducts'
import type { Product, ProductPrice } from '@/domain/types'

const empty = (): unknown => ({
  then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
  eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty,
})
vi.mock('@/data/supabaseClient', () => ({
  supabase: new Proxy({}, { get: (_t, prop) => (prop === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : () => empty()) }),
}))

const { PairingView, ResultsView } = await import('@/ui/CompareScreen')
type CompareDataset = import('@/ui/CompareScreen').CompareDataset
type CompareActions = import('@/ui/CompareScreen').CompareActions

const prod = (id: string, displayName: string): Product => ({ id, displayName, normalizedName: displayName.toLowerCase(), familyId: 'f', category: null, brand: null, nonFood: false, classConfirmedAt: null, photoPath: null }) as Product
const price = (id: string, productId: string, store: string, value: number, date: string, o: Partial<ProductPrice> = {}): ProductPrice => ({ id, productId, price: value, store, quantity: '1', unit: 'ud', recordedDate: date, receiptId: null, pack: null, ...o })

const leche: CommonProduct = { id: 'c-leche', name: 'Leche semidesnatada', normalizedName: 'leche semidesnatada' }
const products = [
  prod('m', 'LECHE SEMI P-6 HACENDADO'), prod('h', 'LECHE ASTURIANA S'), prod('k', 'Leche Pascual semidesnatada'), prod('o', 'Leche Kaiku semi caja'),
  prod('x', 'LECHE SEMIDESNATADA PASCUAL 1L'), prod('cer', 'CERVEZA ESTRELLA'), prod('cer2', 'CERVEZA SUAVE'), prod('det', 'DETERGENTE ROPA 3L'),
]
const members: CommonMember[] = ['m', 'h', 'k', 'o'].map((productId) => ({ productId, commonId: 'c-leche', source: 'manual' as const }))
const prices: ProductPrice[] = [
  price('pm', 'm', 'Mercadona', 6.3, '2026-10-01', { pack: { count: 6, amount: 1, unit: 'l', source: 'manual' } }),
  price('ph', 'h', 'Hiperber', 1.43, '2026-10-05', { pack: { count: 1, amount: 1.5, unit: 'l', source: 'manual' } }),
  price('pk', 'k', 'Consum', 1.1, '2026-10-08', { pack: { count: 1, amount: 1, unit: 'l', source: 'manual' } }),
  price('po', 'o', 'Otra tienda', 6, '2026-10-10', { pack: { count: 12, amount: 500, unit: 'ml', source: 'manual' } }),
  price('px', 'x', 'Consum', 1.2, '2026-10-12', { pack: { count: 1, amount: 1, unit: 'l', source: 'manual' } }),
  price('pc1', 'cer', 'Hiperber', 0.95, '2026-10-21'),
  price('pc2', 'cer2', 'Mercadona', 3.12, '2026-10-16'),
  price('pd', 'det', 'Mercadona', 9.5, '2026-10-01'),
]
const base: CompareDataset = { products, prices, commons: [leche], members, skipped: [], decisions: [], shared: [], available: true }

type Spies = Record<keyof CompareActions, ReturnType<typeof vi.fn>>
function actions(): CompareActions & Spies {
  return {
    assign: vi.fn(async () => undefined), unassign: vi.fn(async () => undefined), createCommon: vi.fn(async (name: string) => ({ id: 'c-new', name, normalizedName: name.toLowerCase() })),
    rename: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), skip: vi.fn(async () => undefined), unskip: vi.fn(async () => undefined),
    decide: vi.fn(async () => undefined), setPack: vi.fn(async () => undefined),
  } as never
}
afterEach(cleanup)

describe('Resultados', () => {
  it('lista el producto común plegado con lo más barato por litro', () => {
    render(<ResultsView data={base} actions={actions()} onNotice={() => undefined} onError={() => undefined} onPickGroup={() => undefined} />)
    expect(screen.getByText('Leche semidesnatada')).toBeTruthy()
    expect(screen.getByText(/4 presentaciones · 4 tiendas · más barata: Hiperber 0,953 €\/l/)).toBeTruthy()
    expect(screen.queryByText(/Ordenado por precio/)).toBeNull()
  })
  it('al abrirlo enseña todas las presentaciones de menor a mayor, con paquete, fecha y la más económica destacada', () => {
    render(<ResultsView data={base} actions={actions()} onNotice={() => undefined} onError={() => undefined} onPickGroup={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Leche semidesnatada/ }))
    const rows = screen.getAllByText(/· paquete/)
    expect(rows).toHaveLength(4)
    expect(rows[0].textContent).toContain('1,5 l · paquete')
    expect(rows[0].textContent).toContain('paquete 1,43 €')
    expect(rows[0].textContent).toContain('05/10/2026')
    expect(rows[0].textContent).toContain('la más económica')
    expect(rows[rows.length - 1].textContent).toMatch(/\+\d/)
    expect(screen.getByText(/6 × 1 l = 6 l · paquete 6,30 €/)).toBeTruthy()
    expect(screen.getByText(/Son precios que habéis pagado vosotros, con su fecha: no son ofertas de hoy/)).toBeTruthy()
    expect(screen.getByText(/el precio del paquete se enseña aparte/i)).toBeTruthy()
  })
  it('lo que no tiene formato se pide completar y se guarda sin tocar el precio', async () => {
    const a = actions()
    const withMissing: CompareDataset = { ...base, prices: [...prices, price('pz', 'k', 'Lidl', 0.99, '2026-10-20')] }
    render(<ResultsView data={withMissing} actions={a} onNotice={() => undefined} onError={() => undefined} onPickGroup={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Leche semidesnatada/ }))
    expect(screen.getByText(/Sin formato conocido/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Indicar formato' }))
    fireEvent.change(screen.getByLabelText('Cantidad de cada envase'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Unidad del envase'), { target: { value: 'l' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar formato' }))
    await waitFor(() => expect(a.setPack).toHaveBeenCalledWith('pz', { count: 1, amount: 1, unit: 'l', source: 'manual' }))
  })
  it('separar un artículo del grupo se puede deshacer', async () => {
    const a = actions()
    const onNotice = vi.fn()
    render(<ResultsView data={base} actions={a} onNotice={onNotice} onError={() => undefined} onPickGroup={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Leche semidesnatada/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Separar' })[0])
    await waitFor(() => expect(a.unassign).toHaveBeenCalledWith('h'))
    await onNotice.mock.calls[0][0].undo()
    expect(a.assign).toHaveBeenCalledWith('h', 'c-leche', 'manual')
  })
  it('eliminar el grupo pide confirmación y deja los artículos y precios', async () => {
    const a = actions()
    render(<ResultsView data={base} actions={a} onNotice={() => undefined} onError={() => undefined} onPickGroup={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Leche semidesnatada/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar grupo' }))
    expect(a.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Sí, eliminar el grupo/ }))
    await waitFor(() => expect(a.remove).toHaveBeenCalledWith('c-leche'))
  })
  it('sin productos comunes lo explica', () => {
    render(<ResultsView data={{ ...base, commons: [], members: [] }} actions={actions()} onNotice={() => undefined} onError={() => undefined} onPickGroup={() => undefined} />)
    expect(screen.getByText(/Todavía no hay productos comunes/)).toBeTruthy()
  })
})

describe('Emparejar', () => {
  it('muestra los pendientes con su tienda, precio y compras, y los ya agrupados no salen', () => {
    render(<PairingView data={base} actions={actions()} onNotice={() => undefined} onError={() => undefined} />)
    expect(screen.getByText('LECHE SEMIDESNATADA PASCUAL 1L')).toBeTruthy()
    expect(screen.queryByText('LECHE SEMI P-6 HACENDADO')).toBeNull()
    expect(screen.getByText(/4 artículos por agrupar · 4 ya agrupados/)).toBeTruthy()
    expect(screen.getByText(/No hace falta terminar/)).toBeTruthy()
  })
  it('aceptar la sugerencia agrupa con un toque y se puede deshacer', async () => {
    const a = actions()
    const onNotice = vi.fn()
    render(<PairingView data={base} actions={a} onNotice={onNotice} onError={() => undefined} />)
    const card = screen.getByText('LECHE SEMIDESNATADA PASCUAL 1L').closest('[data-help-id="compare.pairing-card"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /→ Leche semidesnatada/ }))
    await waitFor(() => expect(a.assign).toHaveBeenCalledWith('x', 'c-leche', expect.stringMatching(/sugerido/)))
    await onNotice.mock.calls[0][0].undo()
    expect(a.unassign).toHaveBeenCalledWith('x')
  })
  it('«Buscar otro» encuentra cualquier artículo del historial aunque no esté sugerido y crea un producto común con los dos', async () => {
    const a = actions()
    render(<PairingView data={base} actions={a} onNotice={() => undefined} onError={() => undefined} />)
    const card = screen.getByText('CERVEZA ESTRELLA').closest('[data-help-id="compare.pairing-card"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /Buscar otro/ }))
    fireEvent.change(screen.getByLabelText('Buscar producto común o artículo'), { target: { value: 'suave' } })
    fireEvent.click(screen.getByRole('button', { name: /CERVEZA SUAVE/ }))
    expect(screen.getByText(/Se creará con «CERVEZA ESTRELLA» y «CERVEZA SUAVE»/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nombre del producto común'), { target: { value: 'Cerveza' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear y agrupar' }))
    await waitFor(() => expect(a.createCommon).toHaveBeenCalledWith('Cerveza'))
    await waitFor(() => expect(a.assign).toHaveBeenCalledTimes(2))
    expect(a.assign.mock.calls.map((c) => c[0]).sort()).toEqual(['cer', 'cer2'])
  })
  it('también se pueden elegir productos comunes ya creados desde el buscador', async () => {
    const a = actions()
    render(<PairingView data={base} actions={a} onNotice={() => undefined} onError={() => undefined} />)
    const card = screen.getByText('DETERGENTE ROPA 3L').closest('[data-help-id="compare.pairing-card"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /Buscar otro/ }))
    fireEvent.click(within(screen.getByText('¿Con qué se compara?').closest('.modal-sheet') as HTMLElement).getByRole('button', { name: /Leche semidesnatada/ }))
    await waitFor(() => expect(a.assign).toHaveBeenCalledWith('det', 'c-leche', 'manual'))
  })
  it('crear un producto común nuevo propone el nombre y ofrece artículos parecidos para unir de una vez', async () => {
    const a = actions()
    render(<PairingView data={base} actions={a} onNotice={() => undefined} onError={() => undefined} />)
    const card = screen.getByText('CERVEZA ESTRELLA').closest('[data-help-id="compare.pairing-card"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /Crear producto común/ }))
    expect((screen.getByLabelText('Nombre del producto común') as HTMLInputElement).value).toBe('Cerveza estrella')
    fireEvent.click(screen.getByLabelText('CERVEZA SUAVE'))
    fireEvent.click(screen.getByRole('button', { name: 'Crear y agrupar' }))
    await waitFor(() => expect(a.assign).toHaveBeenCalledTimes(2))
  })
  it('«No emparejar» lo quita de la cola y se puede recuperar', async () => {
    const a = actions()
    const onNotice = vi.fn()
    render(<PairingView data={base} actions={a} onNotice={onNotice} onError={() => undefined} />)
    const card = screen.getByText('DETERGENTE ROPA 3L').closest('[data-help-id="compare.pairing-card"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: 'No emparejar' }))
    await waitFor(() => expect(a.skip).toHaveBeenCalledWith('det'))
    await onNotice.mock.calls[0][0].undo()
    expect(a.unskip).toHaveBeenCalledWith('det')
  })
  it('lo ya omitido sale en «No emparejados» y vuelve a la cola', async () => {
    const a = actions()
    render(<PairingView data={{ ...base, skipped: ['det'] }} actions={a} onNotice={() => undefined} onError={() => undefined} />)
    expect(screen.queryByText('DETERGENTE ROPA 3L')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /No emparejados \(1\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la cola' }))
    await waitFor(() => expect(a.unskip).toHaveBeenCalledWith('det'))
  })
  it('se puede separar un artículo ya agrupado desde «Agrupados»', async () => {
    const a = actions()
    render(<PairingView data={base} actions={a} onNotice={() => undefined} onError={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Agrupados \(4\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Separar LECHE ASTURIANA S' }))
    await waitFor(() => expect(a.unassign).toHaveBeenCalledWith('h'))
  })
  it('filtra por tienda y por texto sin limitarse a dos tiendas', () => {
    render(<PairingView data={base} actions={actions()} onNotice={() => undefined} onError={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hiperber' }))
    expect(screen.getByText('CERVEZA ESTRELLA')).toBeTruthy()
    expect(screen.queryByText('DETERGENTE ROPA 3L')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hiperber' }))
    fireEvent.change(screen.getByLabelText('Buscar artículos por emparejar'), { target: { value: 'deterg' } })
    expect(screen.queryByText('CERVEZA ESTRELLA')).toBeNull()
    expect(screen.getByText('DETERGENTE ROPA 3L')).toBeTruthy()
  })
  it('sin la migración lo dice sin romper', () => {
    render(<PairingView data={{ ...base, available: false }} actions={actions()} onNotice={() => undefined} onError={() => undefined} />)
    expect(screen.getByText(/aún no están disponibles/)).toBeTruthy()
  })
})

describe('agrupar desde el buscador (misma lógica en Emparejar, Resultados y la ficha)', () => {
  it('en un producto común existente', async () => {
    const { applyPick } = await import('@/ui/CompareScreen')
    const a = actions()
    await applyPick({ id: 'det' }, { kind: 'common', common: leche }, base, a)
    expect(a.assign).toHaveBeenCalledWith('det', 'c-leche', 'manual')
  })
  it('junto a un artículo que ya está en un grupo: se une a ese grupo, sin crear otro', async () => {
    const { applyPick } = await import('@/ui/CompareScreen')
    const a = actions()
    await applyPick({ id: 'x' }, { kind: 'article', product: products[0] }, base, a)
    expect(a.createCommon).not.toHaveBeenCalled()
    expect(a.assign).toHaveBeenCalledWith('x', 'c-leche', 'manual')
  })
  it('junto a un artículo sin grupo: crea uno con los dos', async () => {
    const { applyPick } = await import('@/ui/CompareScreen')
    const a = actions()
    await applyPick({ id: 'cer' }, { kind: 'article', product: products[6] }, base, a)
    expect(a.createCommon).toHaveBeenCalledTimes(1)
    expect(a.assign.mock.calls.map((c) => c[0]).sort()).toEqual(['cer', 'cer2'])
  })
  it('uno nuevo con el nombre escrito', async () => {
    const { applyPick } = await import('@/ui/CompareScreen')
    const a = actions()
    await applyPick({ id: 'det' }, { kind: 'new', name: 'Detergente' }, base, a)
    expect(a.createCommon).toHaveBeenCalledWith('Detergente')
    expect(a.assign).toHaveBeenCalledWith('det', 'c-new', 'manual')
  })
})
