// @vitest-environment jsdom
// «Comparar precios»: Resultados (dos modos) y Emparejar en sus componentes reales (datos simulados con Mercadona, Hiperber, Consum y otra tienda).
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
// «PASCUAL SEMIDESNATADA 1L» (x) es el caso real: PEPA lo reconoce como leche, pero no sabe de qué tipo → no se compara sola y hay que emparejarlo.
const products = [
  prod('m', 'LECHE SEMI P-6 HACENDADO'), prod('h', 'LECHE ASTURIANA S'), prod('k', 'Leche Pascual semidesnatada'), prod('o', 'Leche Kaiku semi caja'),
  prod('x', 'PASCUAL SEMIDESNATADA 1L'), prod('cer', 'CERVEZA ESTRELLA'), prod('cer2', 'CERVEZA SUAVE'), prod('det', 'DETERGENTE ROPA 3L'),
  prod('xa', 'XILOFON AZUL'), prod('xr', 'XILOFON ROJO'),
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
  price('pa', 'xa', 'Hiperber', 2, '2026-10-02'),
  price('pr', 'xr', 'Mercadona', 2.5, '2026-10-03'),
]
const base: CompareDataset = { products, prices, commons: [leche], members, skipped: [], decisions: [], shared: [], available: true }

type Spies = Record<keyof CompareActions, ReturnType<typeof vi.fn>>
function actions(): CompareActions & Spies {
  return {
    assign: vi.fn(async () => undefined), unassign: vi.fn(async () => undefined), createCommon: vi.fn(async (name: string) => ({ id: 'c-new', name, normalizedName: name.toLowerCase() })),
    rename: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), skip: vi.fn(async () => undefined), unskip: vi.fn(async () => undefined),
    decide: vi.fn(async () => undefined), setPack: vi.fn(async () => undefined), separatePepa: vi.fn(async () => undefined), confirmGroup: vi.fn(async () => undefined), discardGroup: vi.fn(async () => undefined),
  } as never
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Resultados', () => {
  const view = (data: CompareDataset = base, a: CompareActions = actions(), onNotice: (n: { text: string; undo?: () => Promise<void> }) => void = () => undefined) =>
    render(<ResultsView data={data} actions={a} onNotice={onNotice} onError={() => undefined} onPickGroup={() => undefined} />)
  const group = (name: string) => screen.getByText(name, { selector: 'strong' }).closest('.cmp-group') as HTMLElement

  it('los dos modos están arriba, al mismo nivel, y por defecto se comparan productos idénticos', () => {
    view()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Productos idénticos', 'Alternativas comparables'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
  })
  it('la comparación se ve sin abrir nada: grupo, presentaciones y lo más barato por litro', () => {
    view()
    const g = group('Leche semidesnatada')
    expect(within(g).getByText(/4 presentaciones · 4 tiendas · 4 compras · más barata: Hiperber 0,953 €\/l/)).toBeTruthy()
    expect(within(g).getAllByText(/· paquete/)).toHaveLength(3) // las tres primeras; la cuarta se despliega
    expect(within(g).getByRole('button', { name: 'Ver las 4 presentaciones' })).toBeTruthy()
  })
  it('cada fila lleva tienda, formato, precio del paquete, fecha y precio por unidad', () => {
    view()
    const row = within(group('Leche semidesnatada')).getAllByText(/· paquete/)[0].closest('.cmp-row') as HTMLElement
    expect(row.textContent).toContain('Hiperber')
    expect(row.textContent).toContain('1,5 l · paquete 1,43 €')
    expect(row.textContent).toContain('05/10/2026')
    expect(row.textContent).toContain('0,953 €/l')
    expect(row.textContent).toContain('la más económica')
  })
  it('las presentaciones van de menor a mayor precio por litro y se pueden ver todas', () => {
    view()
    const g = group('Leche semidesnatada')
    fireEvent.click(within(g).getByRole('button', { name: 'Ver las 4 presentaciones' }))
    const rows = within(g).getAllByText(/· paquete/)
    expect(rows).toHaveLength(4)
    expect(rows[3].textContent).toMatch(/\+\d/)
    expect(within(g).getByText(/6 × 1 l = 6 l · paquete 6,30 €/)).toBeTruthy()
    // La explicación común va una sola vez encima de la lista, no repetida en cada grupo.
    expect(screen.getAllByText(/una presentación grande puede salir más barata por unidad/i)).toHaveLength(1)
    expect(screen.getAllByText(/Son precios que habéis pagado vosotros, con su fecha: no son ofertas de hoy/)).toHaveLength(1)
  })
  it('lo que no tiene formato se ve en su fila, se avisa y se completa sin tocar el precio', async () => {
    const a = actions()
    view({ ...base, prices: [...prices, price('pz', 'k', 'Lidl', 0.99, '2026-10-20')] }, a)
    const g = group('Leche semidesnatada')
    expect(within(g).getByText(/1 sin formato/)).toBeTruthy()
    fireEvent.click(within(g).getByRole('button', { name: 'Ver las 5 presentaciones' }))
    const row = within(g).getByText(/Lidl · sin formato · paquete 0,99 €/).closest('.cmp-row') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: /Editar/ }))
    fireEvent.click(within(row).getByRole('button', { name: 'Indicar formato' }))
    fireEvent.change(screen.getByLabelText('Cantidad de cada envase'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Unidad del envase'), { target: { value: 'l' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar formato' }))
    await waitFor(() => expect(a.setPack).toHaveBeenCalledWith('pz', { count: 1, amount: 1, unit: 'l', source: 'manual' }))
  })
  it('separar un artículo del grupo se puede deshacer', async () => {
    const a = actions()
    const onNotice = vi.fn()
    view(base, a, onNotice)
    const row = within(group('Leche semidesnatada')).getAllByText(/· paquete/)[0].closest('.cmp-row') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: /Editar/ }))
    fireEvent.click(within(row).getByRole('button', { name: 'Separar' }))
    await waitFor(() => expect(a.unassign).toHaveBeenCalledWith('h'))
    await onNotice.mock.calls[0][0].undo()
    expect(a.assign).toHaveBeenCalledWith('h', 'c-leche', 'manual')
  })
  it('eliminar el grupo pide confirmación y deja los artículos y precios', async () => {
    const a = actions()
    view(base, a)
    const g = group('Leche semidesnatada')
    fireEvent.click(within(g).getByRole('button', { name: 'Opciones del grupo' }))
    fireEvent.click(within(g).getByRole('button', { name: 'Eliminar grupo' }))
    expect(a.remove).not.toHaveBeenCalled()
    fireEvent.click(within(g).getByRole('button', { name: /Sí, eliminar el grupo/ }))
    await waitFor(() => expect(a.remove).toHaveBeenCalledWith('c-leche'))
  })
  it('sin nada que comparar lo explica según el modo', () => {
    view({ ...base, products: [prod('q', 'XILOFON AZUL')], prices: [price('pq', 'q', 'Dia', 3, '2026-10-01')], commons: [], members: [] })
    expect(screen.getByText(/Todavía no hay productos idénticos que comparar/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Alternativas comparables' }))
    expect(screen.getByText(/Todavía no hay alternativas que comparar/)).toBeTruthy()
  })
  it('lo que PEPA reconoce con seguridad aparece sin emparejar nada a mano', () => {
    const colas = [prod('c1', 'COCA COLA 1,5 L'), prod('c2', 'COCA COLA LATA 33 CL')]
    const pk = (amount: number, unit: 'l' | 'ml') => ({ count: 1, amount, unit, source: 'manual' as const })
    view({ ...base, products: colas, prices: [price('a', 'c1', 'Mercadona', 1.65, '2026-10-01', { pack: pk(1.5, 'l') }), price('b', 'c2', 'Dia', 0.75, '2026-10-02', { pack: pk(330, 'ml') })], commons: [], members: [] })
    const card = document.querySelector('.cmp-group[data-origin="identidad"]') as HTMLElement
    expect(card).toBeTruthy()
    expect(card.textContent).toContain('1,10 €/l')
    expect(card.textContent).toContain('Mercadona')
    expect(card.textContent).toContain('Dia')
  })
  it('Alternativas comparables: productos distintos de una familia, sin fundir sus identidades', () => {
    view()
    fireEvent.click(screen.getByRole('tab', { name: 'Alternativas comparables' }))
    const g = group('Cerveza')
    expect(within(g).getByText(/2 productos distintos/)).toBeTruthy()
    expect(screen.getAllByText(/Son productos distintos: aquí se comparan, no se mezclan sus historiales/)).toHaveLength(1)
  })
  it('ordena (por categoría, A–Z…), filtra y busca', () => {
    view()
    fireEvent.click(screen.getByRole('tab', { name: 'Alternativas comparables' }))
    expect(screen.getAllByTestId('cmp-category').length).toBeGreaterThan(1)
    fireEvent.change(screen.getByLabelText('Ordenar los resultados'), { target: { value: 'az' } })
    expect(screen.queryAllByTestId('cmp-category')).toHaveLength(0)
    const names = () => Array.from(document.querySelectorAll('.cmp-group-name')).map((n) => (n.textContent ?? '').replace(/^\S+ /, ''))
    expect(names()).toEqual([...names()].sort((a, b) => a.localeCompare(b, 'es')))
    fireEvent.change(screen.getByLabelText('Buscar en los resultados'), { target: { value: 'hiperber' } })
    expect(names().length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Buscar en los resultados'), { target: { value: 'zzz' } })
    expect(screen.getByText(/Ningún resultado coincide/)).toBeTruthy()
  })
  it('recuerda el modo y la ordenación elegidos', () => {
    const first = view()
    fireEvent.click(screen.getByRole('tab', { name: 'Alternativas comparables' }))
    fireEvent.change(screen.getByLabelText('Ordenar los resultados'), { target: { value: 'frecuencia' } })
    first.unmount()
    view()
    expect(screen.getByRole('tab', { name: 'Alternativas comparables' }).getAttribute('aria-selected')).toBe('true')
    expect((screen.getByLabelText('Ordenar los resultados') as HTMLSelectElement).value).toBe('frecuencia')
  })
  it('cambiar el producto o la variante de una fila usa el selector de catálogo y no toca el ticket', async () => {
    const setCatalogKey = vi.fn(async () => undefined)
    view(base, { ...actions(), setCatalogKey })
    const row = within(group('Leche semidesnatada')).getAllByText(/· paquete/)[0].closest('.cmp-row') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: /Editar/ }))
    fireEvent.click(within(row).getByRole('button', { name: 'Cambiar producto o variante' }))
    fireEvent.change(screen.getByLabelText('Buscar el producto'), { target: { value: 'leche semidesnatada' } })
    fireEvent.click(screen.getByRole('button', { name: /^Leche semidesnatada Variante/ }))
    await waitFor(() => expect(setCatalogKey).toHaveBeenCalledWith('h', 'lac.leche.v_tipoleche_semi'))
  })
})

describe('Emparejar', () => {
  it('muestra los pendientes con su tienda, precio y compras; los agrupados no salen y los que PEPA reconoce con seguridad se comparan solos', () => {
    render(<PairingView data={base} actions={actions()} onNotice={() => undefined} onError={() => undefined} />)
    expect(screen.getByText('PASCUAL SEMIDESNATADA 1L')).toBeTruthy()
    expect(screen.queryByText('LECHE SEMI P-6 HACENDADO')).toBeNull()
    expect(screen.queryByText('CERVEZA ESTRELLA')).toBeNull() // identidad segura: no hace falta emparejarla
    expect(screen.getByText(/artículos se comparan solos/)).toBeTruthy()
    expect(screen.getByText(/pendientes de emparejar/)).toBeTruthy()
    expect(screen.getByText(/No hace falta terminar/)).toBeTruthy()
  })
  it('aceptar la sugerencia agrupa con un toque y se puede deshacer', async () => {
    const a = actions()
    const onNotice = vi.fn()
    render(<PairingView data={base} actions={a} onNotice={onNotice} onError={() => undefined} />)
    const card = screen.getByText('PASCUAL SEMIDESNATADA 1L').closest('[data-help-id="compare.pairing-card"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /→ Leche semidesnatada/ }))
    await waitFor(() => expect(a.assign).toHaveBeenCalledWith('x', 'c-leche', expect.stringMatching(/sugerido/)))
    await onNotice.mock.calls[0][0].undo()
    expect(a.unassign).toHaveBeenCalledWith('x')
  })
  it('«Buscar otro» encuentra cualquier artículo del historial aunque no esté sugerido y crea un producto común con los dos', async () => {
    const a = actions()
    render(<PairingView data={base} actions={a} onNotice={() => undefined} onError={() => undefined} />)
    const card = screen.getByText('XILOFON AZUL').closest('[data-help-id="compare.pairing-card"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /Buscar otro/ }))
    fireEvent.change(screen.getByLabelText('Buscar producto común o artículo'), { target: { value: 'rojo' } })
    fireEvent.click(screen.getByRole('button', { name: /XILOFON ROJO/ }))
    expect(screen.getByText(/Se creará con «XILOFON AZUL» y «XILOFON ROJO»/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nombre del producto común'), { target: { value: 'Xilófono' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear y agrupar' }))
    await waitFor(() => expect(a.createCommon).toHaveBeenCalledWith('Xilófono'))
    await waitFor(() => expect(a.assign).toHaveBeenCalledTimes(2))
    expect(a.assign.mock.calls.map((c) => c[0]).sort()).toEqual(['xa', 'xr'])
  })
  it('también se pueden elegir productos comunes ya creados desde el buscador', async () => {
    const a = actions()
    render(<PairingView data={base} actions={a} onNotice={() => undefined} onError={() => undefined} />)
    const card = screen.getByText('DETERGENTE ROPA 3L').closest('[data-help-id="compare.pairing-card"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /Buscar otro/ }))
    fireEvent.click(within(screen.getByText('¿Con qué se compara?').closest('.modal-sheet') as HTMLElement).getByRole('button', { name: /Leche semidesnatada/ }))
    await waitFor(() => expect(a.assign).toHaveBeenCalledWith('det', 'c-leche', 'manual'))
  })
  it('crear un producto común nuevo propone el nombre y ofrece artículos parecidos para unir de una vez, con la casilla a la izquierda', async () => {
    const a = actions()
    render(<PairingView data={base} actions={a} onNotice={() => undefined} onError={() => undefined} />)
    const card = screen.getByText('XILOFON AZUL').closest('[data-help-id="compare.pairing-card"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /Crear producto común/ }))
    expect((screen.getByLabelText('Nombre del producto común') as HTMLInputElement).value).toBe('Xilofon azul')
    const row = screen.getByLabelText('XILOFON ROJO').closest('label') as HTMLElement
    expect(row.className).toContain('cmp-check-row')
    expect(row.firstElementChild?.getAttribute('type')).toBe('checkbox') // casilla a la izquierda, nombre a la derecha
    fireEvent.click(screen.getByLabelText('XILOFON ROJO'))
    fireEvent.click(screen.getByRole('button', { name: 'Crear y agrupar' }))
    await waitFor(() => expect(a.assign).toHaveBeenCalledTimes(2))
  })
  it('cada tarjeta deja los tres botones en una sola fila compacta', () => {
    render(<PairingView data={base} actions={actions()} onNotice={() => undefined} onError={() => undefined} />)
    const card = screen.getByText('XILOFON AZUL').closest('[data-help-id="compare.pairing-card"]') as HTMLElement
    const actionsRow = card.querySelector('.cmp-pair-actions') as HTMLElement
    expect(Array.from(actionsRow.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['🔎 Buscar otro', '＋ Crear producto común', 'No emparejar'])
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
    fireEvent.click(screen.getByRole('button', { name: /Confirmados \(4\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Separar LECHE ASTURIANA S' }))
    await waitFor(() => expect(a.unassign).toHaveBeenCalledWith('h'))
  })
  it('filtra por tienda y por texto sin limitarse a dos tiendas', () => {
    render(<PairingView data={base} actions={actions()} onNotice={() => undefined} onError={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hiperber' }))
    expect(screen.getByText('XILOFON AZUL')).toBeTruthy()
    expect(screen.queryByText('DETERGENTE ROPA 3L')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hiperber' }))
    fireEvent.change(screen.getByLabelText('Buscar artículos por emparejar'), { target: { value: 'deterg' } })
    expect(screen.queryByText('XILOFON AZUL')).toBeNull()
    expect(screen.getByText('DETERGENTE ROPA 3L')).toBeTruthy()
  })
  it('sin la migración lo dice sin romper', () => {
    render(<PairingView data={{ ...base, available: false }} actions={actions()} onNotice={() => undefined} onError={() => undefined} />)
    expect(screen.getByText(/aún no están disponibles/)).toBeTruthy()
  })
  it('no emparejes lo que no es lo mismo: quesadilla de pollo ≠ pollo y Aquarius zero ≠ refresco de cola zero', async () => {
    const { suggestCommons } = await import('@/domain/commonProducts')
    const asCmp = (id: string, displayName: string) => ({ id, displayName })
    const pollo: CommonProduct = { id: 'c-pollo', name: 'Pollo', normalizedName: 'pollo' }
    const cola: CommonProduct = { id: 'c-cola', name: 'Refresco de cola zero', normalizedName: 'refresco de cola zero' }
    const all = [asCmp('p', 'PECHUGA DE POLLO'), asCmp('q', 'QUESADILLA DE POLLO'), asCmp('c', 'COCA COLA ZERO 2 L'), asCmp('a', 'AQUARIUS ZERO 1,5 L')]
    const mem: CommonMember[] = [{ productId: 'p', commonId: 'c-pollo', source: 'manual' }, { productId: 'c', commonId: 'c-cola', source: 'manual' }]
    expect(suggestCommons(asCmp('q', 'QUESADILLA DE POLLO'), [pollo, cola], mem, all).map((s) => s.common.id)).not.toContain('c-pollo')
    expect(suggestCommons(asCmp('a', 'AQUARIUS ZERO 1,5 L'), [pollo, cola], mem, all).map((s) => s.common.id)).not.toContain('c-cola')
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

describe('lista compacta: lo reconocido con una sola presentación ocupa una fila', () => {
  it('una tarjeta sin cabecera ni notas repetidas, con su fila y su botón Editar', () => {
    render(<ResultsView data={{ ...base, commons: [], members: [], products: [prod('c1', 'COCA COLA 1,5 L')], prices: [price('a', 'c1', 'Mercadona', 1.65, '2026-10-01', { pack: { count: 1, amount: 1.5, unit: 'l', source: 'manual' } })] }} actions={actions()} onNotice={() => undefined} onError={() => undefined} onPickGroup={() => undefined} />)
    const card = document.querySelector('.cmp-group') as HTMLElement
    expect(card.querySelector('.cmp-group-head')).toBeNull()
    expect(card.querySelectorAll('.cmp-row')).toHaveLength(1)
    expect(within(card).queryByRole('button', { name: 'Opciones del grupo' })).toBeNull()
    expect(within(card).getByRole('button', { name: /Editar/ })).toBeTruthy()
    expect(card.textContent).toContain('1,10 €/l')
  })
})
