// @vitest-environment jsdom
// COR-04 — desde los desgloses de Estadística compras (p. ej. «Reparto del gasto por tipo de alimento» → Carne), cada fila de PRODUCTO abre su ficha exacta en Historial de precios
// (por identificador, nunca por nombre), se puede reclasificar con las herramientas de siempre, y al volver la estadística conserva periodo, Alimentos/Otros y clasificación
// desplegada y ya refleja el cambio (sin recargar la página). Las filas que no son un producto (compra sin desglose) no se tocan.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FamilyFoodType } from '@/data/foodTypes'
import type { BudgetCategory, Expense, Product, ProductPrice, Receipt } from '@/domain/types'
import { takePendingMovementsFilter } from '@/state/pendingMovementsFilter'
import { takeStatsReturnContext } from '@/state/statsReturnContext'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty, neq: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : p === 'removeChannel' ? () => undefined : () => empty()) }) }))
vi.mock('@/services/voice', async (o) => ({ ...(await o<typeof import('@/services/voice')>()), isSpeechSupported: () => false, isDictationSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))

const ex = (o: Partial<Expense> & Pick<Expense, 'id'>): Expense =>
  ({ familyId: 'f', expenseDate: '2026-10-16', amount: 1, category: 'Alimentación', store: 'Coviran', kind: 'real', notes: null, isIncome: false, budgetGroup: 'alimentacion', tagId: null, source: 'ticket', isFixedOverride: null, ownerMemberId: null, shared: false, sharedFromExpenseId: null, productClassification: null, paymentMethod: null, ...o }) as Expense
const cat = (o: Partial<BudgetCategory> & Pick<BudgetCategory, 'id' | 'name'>): BudgetCategory => ({ familyId: 'f', icon: '🏷️', budgetGroup: 'generales', sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: null, ...o }) as BudgetCategory
const categories: BudgetCategory[] = [cat({ id: 'ali', name: 'Alimentación', icon: '🍎', budgetGroup: 'alimentacion' }), cat({ id: 'cf', name: 'Compras y familia', icon: '🛍️' })]
const types = [
  { id: 'a1', familyId: 'f', name: 'Carne', icon: '🥩', kind: 'alimentacion' },
  { id: 'a2', familyId: 'f', name: 'Lácteos', icon: '🥛', kind: 'alimentacion' },
  { id: 'n1', familyId: 'f', name: 'Ropa y calzado', icon: '👕', kind: 'no_alimentos' },
] as unknown as FamilyFoodType[]

const data = vi.hoisted(() => ({
  expenses: [] as unknown[],
  receipts: [] as unknown[],
  prices: [] as unknown[],
  products: [] as unknown[],
  setProductFoodType: vi.fn(),
}))
vi.mock('@/data/finance', async (o) => ({ ...(await o<typeof import('@/data/finance')>()), listExpenses: async () => data.expenses, listBudgetCategories: async () => categories, listTags: async () => [], listBudgets: async () => [], listClassSharesSafe: async () => new Map(), listResolvedInternalTransferDestinations: async () => [] }))
vi.mock('@/data/family', async (o) => ({ ...(await o<typeof import('@/data/family')>()), getFinanceMonthStartDay: async () => 1, listFamilyMembers: async () => [] }))
vi.mock('@/data/foodTypes', async (o) => ({
  ...(await o<typeof import('@/data/foodTypes')>()),
  listFamilyFoodTypes: async (kind?: string) => types.filter((t) => !kind || t.kind === kind),
  setProductFoodType: async (id: string, name: string | null, kind?: 'alimentacion' | 'no_alimentos') => {
    data.setProductFoodType(id, name, kind)
    // Persistencia simulada: lo que se guarda lo ve cualquier lectura posterior (como en la base de datos).
    data.products = (data.products as Product[]).map((p) => (p.id === id ? ({ ...p, category: name, classConfirmedAt: name ? '2026-10-25' : null, classKind: kind ?? null, nonFood: kind === 'no_alimentos' } as Product) : p))
  },
}))
vi.mock('@/data/products', async (o) => ({ ...(await o<typeof import('@/data/products')>()), listAllProductPrices: async () => data.prices, listProducts: async () => data.products }))
vi.mock('@/data/receipts', async (o) => ({ ...(await o<typeof import('@/data/receipts')>()), listReceipts: async () => data.receipts }))
vi.mock('@/data/bank', async (o) => ({ ...(await o<typeof import('@/data/bank')>()), listBankAccounts: async () => [], listBankTransactions: async () => [], listBankConnections: async () => [] }))

const { ShoppingScreen } = await import('@/ui/ShoppingScreen')

const product = (id: string, name: string, className: string): Product => ({ id, familyId: 'f', normalizedName: name.toLowerCase(), displayName: name, category: className, brand: null, nonFood: false, classConfirmedAt: '2026-10-01', classKind: 'alimentacion' }) as unknown as Product
const receipt = (id: string, expenseId: string, store: string): Receipt => ({ id, familyId: 'f', expenseId, store, receiptDate: '2026-10-16', totalAmount: 1, category: 'Alimentación', storagePath: null, notes: null, purchasedByMemberId: null }) as unknown as Receipt
const price = (id: string, productId: string, receiptId: string, amount: number, store: string): ProductPrice => ({ id, productId, receiptId, price: amount, quantity: '1', unit: null, store, recordedDate: '2026-10-16' }) as unknown as ProductPrice

const scrollTo = vi.fn()
beforeEach(() => {
  takeStatsReturnContext() // nada pendiente de pruebas anteriores
  takePendingMovementsFilter()
  data.setProductFoodType.mockClear()
  scrollTo.mockClear()
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  Object.defineProperty(window, 'scrollY', { value: 420, configurable: true }) // posición de la página al tocar el producto
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T10:00:00'))
  // Dos productos con el MISMO nombre y distinta identidad («Lonchas», en dos tiendas), uno de «Carne» con otro nombre y uno de «Lácteos».
  data.products = [
    product('p-lonchas-reserva', 'Lonchas', 'Carne'),
    product('p-lonchas-venta', 'Lonchas', 'Carne'),
    product('p-pollo', 'Pollo', 'Carne'),
    product('p-leche', 'Leche', 'Lácteos'),
  ]
  data.expenses = [ex({ id: 'e1', amount: 50 }), ex({ id: 'e2', amount: 28.66, store: 'Carnicería' }), ex({ id: 'e3', amount: 21.4 }), ex({ id: 'e4', amount: 3 }), ex({ id: 'e5', amount: 9, source: 'banco', productClassification: 'Carne' })]
  data.receipts = [receipt('r1', 'e1', 'Reserva'), receipt('r2', 'e2', 'Carnicería'), receipt('r3', 'e3', 'Coviran'), receipt('r4', 'e4', 'Coviran')]
  data.prices = [
    price('1', 'p-lonchas-reserva', 'r1', 50, 'Reserva'),
    price('2', 'p-lonchas-venta', 'r2', 28.66, 'Carnicería'),
    price('3', 'p-pollo', 'r3', 21.4, 'Coviran'),
    price('4', 'p-leche', 'r4', 3, 'Coviran'),
  ]
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function openStatsExpandedOnCarne() {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/compras', state: { tab: 'Estadística compras' } }]}>
      <ShoppingScreen />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getAllByText(/Reparto del gasto por tipo de alimento/).length).toBeGreaterThan(0))
  fireEvent.click(await screen.findByText(/🥩 Carne/))
}

describe('COR-04 · fila de producto → ficha exacta en Historial de precios', () => {
  it('cada producto real de «Carne» es tocable, también los de nombre repetido, con su identificador', async () => {
    await openStatsExpandedOnCarne()
    const rows = await screen.findAllByRole('button', { name: /Abrir la ficha de Lonchas en Historial de precios/ })
    expect(rows).toHaveLength(2) // dos productos distintos con el mismo nombre: dos filas distintas
    expect(screen.getByRole('button', { name: /Abrir la ficha de Pollo/ })).toBeTruthy()
  })

  it('una compra sin desglose de ticket (no es un producto) NO es tocable', async () => {
    await openStatsExpandedOnCarne()
    await screen.findAllByRole('button', { name: /Abrir la ficha de Lonchas/ })
    // «e5» (9 € clasificados a mano como Carne, sin ticket) aparece como fila de la tienda/compra, sin botón de ficha.
    expect(screen.queryAllByRole('button', { name: /Abrir la ficha de Coviran/ })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /Abrir la ficha de Compra/ })).toHaveLength(0)
  })

  it('abre la ficha del producto TOCADO (el segundo «Lonchas», no el primero), al cambiar su clase se guarda solo ese y al volver todo sigue como estaba', async () => {
    await openStatsExpandedOnCarne()
    // Periodo distinto del de arranque: debe conservarse.
    fireEvent.click(screen.getByRole('button', { name: /Fecha:/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Últimos 3 meses' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Fecha: Últimos 3 meses/ })).toBeTruthy())
    expect(screen.queryAllByRole('button', { name: /Abrir la ficha de Lonchas/ }).length).toBe(2)
    // El segundo «Lonchas» por importe es el de 28,66 € (Carnicería).
    const lonchasRows = screen.getAllByRole('button', { name: /Abrir la ficha de Lonchas/ })
    const venta = lonchasRows.find((r) => (r.textContent ?? '').includes('28.66'))!
    fireEvent.click(venta)

    // Ficha abierta en Historial de precios, con el botón de volver.
    const sheet = await screen.findByText('← Volver a Estadística compras')
    expect(sheet).toBeTruthy()
    const select = await waitFor(() => {
      const el = document.querySelector('select[data-help-id="shopping.product-class"]') as HTMLSelectElement | null
      expect(el).not.toBeNull()
      return el!
    })
    expect(select.value).toBe('Carne')

    // Reclasificar con la herramienta de siempre.
    fireEvent.change(select, { target: { value: 'Lácteos' } })
    await waitFor(() => expect(data.setProductFoodType).toHaveBeenCalledTimes(1))
    expect(data.setProductFoodType).toHaveBeenCalledWith('p-lonchas-venta', 'Lácteos', 'alimentacion') // solo ese producto
    expect((data.products as Product[]).find((p) => p.id === 'p-lonchas-reserva')?.category).toBe('Carne') // el otro «Lonchas» intacto
    expect((data.products as Product[]).find((p) => p.id === 'p-pollo')?.category).toBe('Carne')

    // Volver: Estadística compras con el mismo periodo y «Carne» desplegada, ya actualizada (sin recargar la página).
    fireEvent.click(screen.getByText('← Volver a Estadística compras'))
    await waitFor(() => expect(screen.getAllByText(/Reparto del gasto por tipo de alimento/).length).toBeGreaterThan(0))
    expect(await screen.findByRole('button', { name: /Fecha: Últimos 3 meses/ })).toBeTruthy()
    expect(scrollTo).toHaveBeenCalledWith(0, 420) // y en la misma posición de la página
    // «Carne» sigue desplegada y ya solo tiene el «Lonchas» de Reserva (50 €) y «Pollo»; el de Carnicería ha pasado a Lácteos.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Abrir la ficha de Lonchas/ })).toHaveLength(1))
    expect(screen.getAllByRole('button', { name: /Abrir la ficha de Lonchas/ })[0].textContent).toContain('50.00')
    fireEvent.click(await screen.findByText(/🥛 Lácteos/))
    const lacteos = await screen.findAllByRole('button', { name: /Abrir la ficha de Lonchas/ })
    expect(lacteos.some((r) => (r.textContent ?? '').includes('28.66'))).toBe(true)
    expect(within(lacteos.find((r) => (r.textContent ?? '').includes('28.66'))!).getByText(/28.66/)).toBeTruthy()
  })

  it('el total registrado en compras no cambia al reclasificar: solo se mueve entre clases (sin duplicar ni perder importe)', async () => {
    await openStatsExpandedOnCarne()
    const before = document.body.textContent ?? ''
    expect(before).toContain('112.06 €') // 50 + 28,66 + 21,40 + 3 + 9
    fireEvent.click(screen.getAllByRole('button', { name: /Abrir la ficha de Lonchas/ })[0])
    const select = await waitFor(() => {
      const el = document.querySelector('select[data-help-id="shopping.product-class"]') as HTMLSelectElement | null
      expect(el).not.toBeNull()
      return el!
    })
    fireEvent.change(select, { target: { value: 'Lácteos' } })
    await waitFor(() => expect(data.setProductFoodType).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('← Volver a Estadística compras'))
    await waitFor(() => expect(screen.getAllByText(/Reparto del gasto por tipo de alimento/).length).toBeGreaterThan(0))
    expect(document.body.textContent ?? '').toContain('112.06 €')
  })
})

describe('COR-04A/B · las filas conservan su diseño de siempre', () => {
  it('la fila de un producto pulsable es la MISMA (div.price-row): sin botón, sin altura ni fondo nuevos; toda la fila es la zona táctil', async () => {
    await openStatsExpandedOnCarne()
    const row = (await screen.findAllByRole('button', { name: /Abrir la ficha de Pollo/ }))[0]
    expect(row.tagName).toBe('DIV')
    expect(row.className).toBe('price-row')
    expect(row.style.minHeight).toBe('')
    expect(row.style.border).toBe('')
    expect(row.style.font).toBe('')
    expect(row.style.width).toBe('')
    expect(row.querySelectorAll('.price-row-name, .price-row-price')).toHaveLength(2) // nombre e importe, como antes; nada de botones visibles dentro
    expect(row.querySelector('button')).toBeNull()
  })

  it('COR-04G: un movimiento bancario clasificado (sin producto individual) sigue en su estadística con la fila de siempre, subrayado y pulsable', async () => {
    await openStatsExpandedOnCarne()
    await screen.findAllByRole('button', { name: /Abrir la ficha de Pollo/ })
    const bank = screen.getAllByText('Coviran').map((n) => n.closest('.price-row')).find((r) => r && (r.textContent ?? '').includes('9.00')) as HTMLElement
    expect(bank).toBeTruthy()
    expect(bank.tagName).toBe('DIV')
    expect(bank.className).toBe('price-row') // misma fila: sin clases nuevas
    expect(bank.getAttribute('role')).toBe('button')
    expect(bank.style.minHeight).toBe('')
    expect((bank.querySelector('.price-row-name') as HTMLElement).style.textDecoration).toBe('underline')
    expect(bank.textContent).toContain('9.00') // sigue contabilizado
  })

  it('COR-04G: el subrayado solo cambia el nombre; la fila de producto y la de movimiento son idénticas salvo eso (mismo tamaño, color y altura)', async () => {
    await openStatsExpandedOnCarne()
    const product = (await screen.findAllByRole('button', { name: /Abrir la ficha de Pollo/ }))[0]
    const name = product.querySelector('.price-row-name') as HTMLElement
    expect(name.style.textDecoration).toBe('underline')
    expect(name.style.fontSize).toBe('')
    expect(name.style.color).toBe('')
    expect(name.style.fontWeight).toBe('')
    expect(product.style.height).toBe('')
    expect(product.style.minHeight).toBe('')
    expect(product.style.padding).toBe('')
    expect(product.style.margin).toBe('')
    // una clasificación sin destino no se subraya
    const price = product.querySelector('.price-row-price') as HTMLElement
    expect(price.style.textDecoration).toBe('')
  })

})

describe('COR-04C · «Ver ticket» / «Ver compra» desde un precio del Historial de precios', () => {
  async function openSheetOfReservaLonchas() {
    await openStatsExpandedOnCarne()
    const rows = await screen.findAllByRole('button', { name: /Abrir la ficha de Lonchas/ })
    fireEvent.click(rows.find((r) => (r.textContent ?? '').includes('50.00'))!)
    await screen.findByText('← Volver a Estadística compras')
  }

  it('cada registro de la ficha enlaza con SU compra por identificador: «Ver ticket» si tiene foto, «Ver compra» si no', async () => {
    data.receipts = [{ ...(data.receipts[0] as object), storagePath: 'f/r1.jpg' }, ...(data.receipts.slice(1) as object[])]
    await openSheetOfReservaLonchas()
    // el precio de 50 € (sin formato conocido) sale en «Compras sin formato conocido» con el enlace de SU ticket (r1, con foto)
    const section = (await screen.findByText(/Compras sin formato conocido/)).parentElement as HTMLElement
    expect(within(section).getByRole('button', { name: 'Ver ticket' })).toBeTruthy()
    expect(within(section).queryByRole('button', { name: 'Ver compra' })).toBeNull()
  })

  it('pulsarlo abre exactamente esa compra en Tickets (fecha, carpeta, resaltada y desplegada) y ofrece volver a la ficha del producto, que se reabre', async () => {
    data.receipts = [{ ...(data.receipts[0] as object), storagePath: 'f/r1.jpg' }, ...(data.receipts.slice(1) as object[])]
    await openSheetOfReservaLonchas()
    const section = (await screen.findByText(/Compras sin formato conocido/)).parentElement as HTMLElement
    fireEvent.click(within(section).getByRole('button', { name: 'Ver ticket' }))
    // Tickets: solo esa compra (rango = su fecha), su carpeta abierta y ella resaltada
    const back = await screen.findByRole('button', { name: /Volver a Historial de precios/ })
    expect(back).toBeTruthy()
    await waitFor(() => expect(document.querySelectorAll('[data-highlighted="true"]')).toHaveLength(1))
    const highlighted = document.querySelector('[data-highlighted="true"]') as HTMLElement
    expect(highlighted.textContent).toContain('Alimentación')
    expect(highlighted.textContent).toContain('16/10/2026')
    // volver: la ficha del MISMO producto (por id), en la misma posición, y sigue devolviendo a Estadística compras
    fireEvent.click(back)
    const heading = await screen.findByRole('heading', { name: 'Lonchas' })
    expect(heading).toBeTruthy()
    expect(await screen.findByText('← Volver a Estadística compras')).toBeTruthy()
    expect(scrollTo).toHaveBeenCalledWith(0, 420)
  })

  it('si la compra ya no existe al llegar a Tickets, lo dice (no hay enlace roto) y el resto de la pantalla funciona', async () => {
    data.receipts = [{ ...(data.receipts[0] as object), storagePath: 'f/r1.jpg' }, ...(data.receipts.slice(1) as object[])]
    await openSheetOfReservaLonchas()
    const section = (await screen.findByText(/Compras sin formato conocido/)).parentElement as HTMLElement
    const link = within(section).getByRole('button', { name: 'Ver ticket' })
    data.receipts = (data.receipts as { id: string }[]).filter((r) => r.id !== 'r1') // se borró entre medias
    fireEvent.click(link)
    expect(await screen.findByText(/No se ha encontrado esa compra/)).toBeTruthy()
  })
})

describe('COR-04G · movimientos bancarios desde la estadística', () => {
  it('pulsar la fila del movimiento guarda el filtro con su identificador exacto (y abre su ficha) y el contexto de la estadística para volver', async () => {
    await openStatsExpandedOnCarne()
    fireEvent.click(screen.getByRole('button', { name: /Fecha:/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Últimos 3 meses' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Fecha: Últimos 3 meses/ })).toBeTruthy())
    const bank = screen.getAllByText('Coviran').map((n) => n.closest('.price-row')).find((r) => r && (r.textContent ?? '').includes('9.00')) as HTMLElement
    fireEvent.click(bank)
    const filter = takePendingMovementsFilter()
    expect(filter?.expenseIds).toEqual(['e5']) // solo ese movimiento, por id (no por nombre del comercio)
    expect(filter?.openExpenseId).toBe('e5')
    expect(filter?.returnTo).toEqual({ path: '/compras', tab: 'Estadística compras', label: 'Compras' })
    // el contexto de la estadística queda guardado para volver igual: periodo, Alimentos, «Carne» desplegada y posición
    const ctx = takeStatsReturnContext()
    expect(ctx).toMatchObject({ preset: 'ultimos_3_meses', scope: 'alimentacion', expandedClassType: 'Carne', scrollY: 420 })
  })

  it('varias compras del mismo establecimiento: cada fila abre SU movimiento', async () => {
    data.expenses = [...(data.expenses as Expense[]), ex({ id: 'e6', amount: 12, store: 'Coviran', source: 'banco', productClassification: 'Carne' })]
    await openStatsExpandedOnCarne()
    const rows = screen.getAllByText('Coviran').map((n) => n.closest('.price-row') as HTMLElement).filter((r) => r && r.getAttribute('role') === 'button')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const twelve = rows.find((r) => (r.textContent ?? '').includes('12.00'))!
    fireEvent.click(twelve)
    expect(takePendingMovementsFilter()?.expenseIds).toEqual(['e6'])
  })
})

describe('COR-04F · volver al Historial de precios desde la compra', () => {
  it('la barra «← Volver a Historial de precios» queda pegada arriba, devuelve a la MISMA ficha y conserva «+ Equivalentes»', async () => {
    data.receipts = [{ ...(data.receipts[0] as object), storagePath: 'f/r1.jpg' }, ...(data.receipts.slice(1) as object[])]
    await openStatsExpandedOnCarne()
    fireEvent.click((await screen.findAllByRole('button', { name: /Abrir la ficha de Lonchas/ })).find((r) => (r.textContent ?? '').includes('50.00'))!)
    await screen.findByText('← Volver a Estadística compras')
    fireEvent.click(await screen.findByRole('button', { name: '+ Equivalentes' }))
    expect(screen.getByRole('button', { name: '+ Equivalentes' }).getAttribute('aria-pressed')).toBe('true')
    const section = (await screen.findByText(/Compras sin formato conocido/)).parentElement as HTMLElement
    fireEvent.click(within(section).getByRole('button', { name: 'Ver ticket' }))
    const bar = await screen.findByTestId('receipt-back-bar')
    expect(bar.className).toBe('receipt-back-bar') // clase con position: sticky (ver styles.css)
    fireEvent.click(within(bar).getByRole('button', { name: /Volver a Historial de precios/ }))
    expect(await screen.findByRole('heading', { name: 'Lonchas' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Equivalentes' }).getAttribute('aria-pressed')).toBe('true') // mismo alcance
    expect(scrollTo).toHaveBeenCalledWith(0, 420)
  })

  it('entrar en Tickets directamente (sin venir del historial) no muestra ninguna barra de regreso', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/compras', state: { tab: 'Tickets' } }]}>
        <ShoppingScreen />
      </MemoryRouter>,
    )
    await screen.findByText(/Historial de compras/)
    expect(screen.queryByTestId('receipt-back-bar')).toBeNull()
  })
})
