// @vitest-environment jsdom
// «Revisar PEPA»: las agrupaciones que propone PEPA se confirman, corrigen o descartan; mientras no se confirman son provisionales; los grupos de la familia no se tocan.
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

const { ReviewView, ResultsView, PairingView } = await import('@/ui/CompareScreen')
type CompareDataset = import('@/ui/CompareScreen').CompareDataset
type CompareActions = import('@/ui/CompareScreen').CompareActions

const prod = (id: string, displayName: string): Product => ({ id, displayName, normalizedName: displayName.toLowerCase(), familyId: 'f', category: null, brand: null, nonFood: false, classConfirmedAt: null, photoPath: null }) as Product
const price = (id: string, productId: string, store: string, value: number, date: string, o: Partial<ProductPrice> = {}): ProductPrice => ({ id, productId, price: value, store, quantity: '1', unit: 'ud', recordedDate: date, receiptId: null, pack: null, ...o })

const mine: CommonProduct = { id: 'c-leche', name: 'Leche semidesnatada', normalizedName: 'leche semidesnatada', status: 'confirmed' }
const pepa: CommonProduct = { id: 'c-limon', name: 'Limón', normalizedName: 'limon', status: 'pending' }
const products = [prod('m', 'LECHE SEMI P-6'), prod('x', 'LECHE SEMIDESNATADA PASCUAL 1L'), prod('l1', 'LIMON'), prod('l2', 'LIMÓN'), prod('z', 'DETERGENTE ROPA 3L')]
const members: CommonMember[] = [
  { productId: 'm', commonId: 'c-leche', source: 'manual' },
  { productId: 'l1', commonId: 'c-limon', source: 'pepa' },
  { productId: 'l2', commonId: 'c-limon', source: 'pepa' },
]
const prices: ProductPrice[] = [
  price('pm', 'm', 'Mercadona', 10.74, '2026-10-26'),
  price('px', 'x', 'Consum', 1.2, '2026-10-12', { pack: { count: 1, amount: 1, unit: 'l', source: 'manual' } }),
  price('p1', 'l1', 'Mercadona', 1.99, '2026-10-01', { unit: 'kg' }),
  price('p2', 'l2', 'Charter', 2.5, '2026-10-05', { unit: 'kg' }),
  price('pz', 'z', 'Mercadona', 9.5, '2026-10-01'),
]
const base: CompareDataset = { products, prices, commons: [mine, pepa], members, skipped: [], rejected: [], decisions: [], shared: [], available: true }

type Spies = Record<keyof CompareActions, ReturnType<typeof vi.fn>>
function actions(): CompareActions & Spies {
  return {
    assign: vi.fn(async () => undefined), unassign: vi.fn(async () => undefined), createCommon: vi.fn(async (name: string) => ({ id: 'c-new', name, normalizedName: name.toLowerCase() })),
    rename: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), skip: vi.fn(async () => undefined), unskip: vi.fn(async () => undefined),
    decide: vi.fn(async () => undefined), setPack: vi.fn(async () => undefined), confirmGroup: vi.fn(async () => undefined), discardGroup: vi.fn(async () => undefined), separatePepa: vi.fn(async () => undefined),
  } as never
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const noop = () => undefined

describe('Revisar PEPA', () => {
  it('enseña el grupo propuesto por PEPA como pendiente de revisar, con sus tiendas y artículos', () => {
    render(<ReviewView data={base} actions={actions()} onNotice={noop} onError={noop} />)
    expect(screen.getByText('Limón')).toBeTruthy()
    expect(screen.getByText(/2 artículos · .*agrupado por PEPA, pendiente de revisar/)).toBeTruthy()
    expect(screen.queryByText('Leche semidesnatada', { selector: 'strong' })).toBeTruthy() // solo en «Para tus grupos»
  })
  it('confirmar el grupo', async () => {
    const a = actions()
    const onNotice = vi.fn()
    render(<ReviewView data={base} actions={a} onNotice={onNotice} onError={noop} />)
    fireEvent.click(screen.getByRole('button', { name: '✓ Confirmar grupo' }))
    await waitFor(() => expect(a.confirmGroup).toHaveBeenCalledWith('c-limon'))
  })
  it('corregir: cambiar el nombre y separar un artículo (PEPA no se lo vuelve a proponer)', async () => {
    const a = actions()
    render(<ReviewView data={base} actions={a} onNotice={noop} onError={noop} />)
    fireEvent.click(screen.getByRole('button', { name: /Cambiar nombre/ }))
    fireEvent.change(screen.getByLabelText('Nombre del producto común'), { target: { value: 'Limones' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }))
    await waitFor(() => expect(a.rename).toHaveBeenCalledWith('c-limon', 'Limones'))
    fireEvent.click(screen.getByRole('button', { name: 'Separar LIMÓN' }))
    await waitFor(() => expect(a.separatePepa).toHaveBeenCalledWith('l2'))
  })
  it('descartar el grupo: los artículos se anotan para no volver a proponerlos', async () => {
    const a = actions()
    render(<ReviewView data={base} actions={a} onNotice={noop} onError={noop} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descartar grupo' }))
    await waitFor(() => expect(a.discardGroup).toHaveBeenCalledWith('c-limon', expect.arrayContaining(['l1', 'l2'])))
  })
  it('«Para tus grupos»: PEPA ofrece artículos parecidos a un grupo confirmado pero NO los añade sola', async () => {
    const a = actions()
    render(<ReviewView data={base} actions={a} onNotice={noop} onError={noop} />)
    expect(screen.getByText(/PEPA no cambia los grupos que ya habéis confirmado/)).toBeTruthy()
    expect(a.assign).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Añadir LECHE SEMIDESNATADA PASCUAL 1L a Leche semidesnatada/ }))
    await waitFor(() => expect(a.assign).toHaveBeenCalledWith('x', 'c-leche', 'sugerido'))
  })
  it('sin propuestas lo dice', () => {
    render(<ReviewView data={{ ...base, commons: [mine], members: [members[0]] }} actions={actions()} onNotice={noop} onError={noop} />)
    expect(screen.getByText(/No hay agrupaciones de PEPA pendientes de revisar/)).toBeTruthy()
  })
})

describe('Resultados con grupos de PEPA sin revisar', () => {
  const view = (data: CompareDataset = base, a: CompareActions = actions()) => render(<ResultsView data={data} actions={a} onNotice={noop} onError={noop} onPickGroup={noop} />)
  const group = (name: string) => screen.getByText(name, { selector: 'strong' }).closest('.cmp-group') as HTMLElement
  it('se marcan como pendientes y la comparación es provisional', () => {
    view()
    const g = group('Limón')
    expect(within(g).getByText(/agrupado por PEPA/)).toBeTruthy()
    expect(within(g).getByText(/más barata \(provisional\): Mercadona/)).toBeTruthy()
    expect(within(g).getByText(/la más económica \(provisional\)/)).toBeTruthy()
    fireEvent.click(within(g).getByRole('button', { name: 'Opciones del grupo' }))
    expect(within(g).getByText(/la comparación es provisional/)).toBeTruthy()
  })
  it('confirmar desde Resultados', async () => {
    const a = actions()
    view(base, a)
    const g = group('Limón')
    fireEvent.click(within(g).getByRole('button', { name: 'Opciones del grupo' }))
    fireEvent.click(within(g).getByRole('button', { name: '✓ Confirmar grupo' }))
    await waitFor(() => expect(a.confirmGroup).toHaveBeenCalledWith('c-limon'))
  })
  it('por defecto se ordena por categoría (ya no por «confirmado primero»), con el nombre de la categoría encima', () => {
    view()
    const headings = screen.getAllByTestId('cmp-category').map((h) => h.textContent ?? '')
    expect(headings.length).toBeGreaterThan(1)
    expect([...headings].map((h) => h.replace(/^\S+ /, ''))).toEqual([...headings].map((h) => h.replace(/^\S+ /, '')).sort((a, b) => a.localeCompare(b, 'es')))
  })
  it('grupo con un solo artículo de formato conocido: se conserva, avisa de lo que falta y no declara «más barata»', () => {
    view({ ...base, members: [...members, { productId: 'x', commonId: 'c-leche', source: 'manual' }] })
    const g = group('Leche semidesnatada')
    expect(g.textContent).toContain('1 sin formato')
    expect(g.textContent).not.toMatch(/más barata:/)
    fireEvent.click(within(g).getByRole('button', { name: 'Opciones del grupo' }))
    expect(within(g).getByText(/Formato de los artículos: 1 de 2 conocidos/)).toBeTruthy()
    expect(within(g).getByText(/Solo indica cuántas unidades trae|El nombre solo dice cuántas unidades trae/)).toBeTruthy()
    expect(within(g).queryByText(/la más económica/)).toBeNull()
  })
  it('PEPA propone el formato que lee en el nombre y la persona lo confirma (desde la propia fila)', async () => {
    const a = actions()
    const data = { ...base, members: [...members, { productId: 'x', commonId: 'c-leche', source: 'manual' as const }], prices: prices.map((p) => (p.id === 'px' ? { ...p, pack: null } : p)) }
    view(data, a)
    const g = group('Leche semidesnatada')
    const row = within(g).getAllByText(/Consum · 1 l \(del nombre\)/)[0].closest('.cmp-row') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: /Editar/ }))
    fireEvent.click(within(row).getByRole('button', { name: /Confirmar 1 l/ }))
    await waitFor(() => expect(a.setPack).toHaveBeenCalledWith('px', { count: 1, amount: 1, unit: 'l', source: 'nombre' }))
  })
})

describe('Emparejar distingue los tres estados', () => {
  it('confirmados por la familia, agrupados por PEPA pendientes y pendientes de emparejar', () => {
    render(<PairingView data={base} actions={actions()} onNotice={noop} onError={noop} />)
    const line = screen.getByText((_, el) => el?.tagName === 'P' && /confirmado por vosotros/.test(el.textContent ?? ''))
    expect(line.textContent).toMatch(/1 confirmado por vosotros · 2 agrupados por PEPA, pendientes de revisar · \d+ pendientes de emparejar/)
  })
})
