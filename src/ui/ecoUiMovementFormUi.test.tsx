// @vitest-environment jsdom
// ECO-UI-01/03/04 en el formulario REAL de edición de un movimiento (Economía → Movimientos).
//  · «✓ Compra vinculada» (con o sin foto del ticket) cuando hay una compra realmente vinculada al movimiento.
//  · Compra con productos reales: se oculta el bloque de clasificación (manda el desglose) sin perder nada de lo guardado.
//  · Compra vinculada SIN productos reales (sin líneas, o solo el marcador «Pendiente»): se indica y se conserva el selector de clasificación.
//  · Sin compra vinculada: el selector y «Repartir entre varias clasificaciones» como siempre.
//  · Etiquetas: selectores + «+ Añadir etiqueta» (buscador a demanda); los repartos se conservan al guardar.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FamilyFoodType } from '@/data/foodTypes'
import type { BudgetCategory, Expense, Tag } from '@/domain/types'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : () => empty()) }) }))

const ex = (o: Partial<Expense> & Pick<Expense, 'id'>): Expense =>
  ({ familyId: 'f', expenseDate: '2026-10-16', amount: 20, category: 'Alimentación', store: 'Mercadona', kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'ticket_banco', isFixedOverride: null, ownerMemberId: 'm1', shared: false, sharedFromExpenseId: null, productClassification: null, paymentMethod: null, ...o }) as Expense
const categories = [
  { id: 'ali', familyId: 'f', name: 'Alimentación', icon: '🛒', budgetGroup: 'generales', sortOrder: 1, parentId: null, necessity: 'necesito', isFixed: null, catalogKey: null },
  { id: 'sue', familyId: 'f', name: 'Sueldo', icon: '💶', budgetGroup: 'ingresos', sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: null },
] as unknown as BudgetCategory[]
const tags = [
  { id: 'jen', name: 'Jennifer', color: '#f06595', sortOrder: 0 },
  { id: 'alv', name: 'Cumpleaños Álvaro 2026', color: '#4dabf7', sortOrder: 1 },
  { id: 'vac', name: 'Vacaciones', color: '#51cf66', sortOrder: 2 },
] as unknown as Tag[]
const foodTypes = [
  { id: 'a1', familyId: 'f', name: 'Lácteos', icon: '🥛', kind: 'alimentacion' },
  { id: 'a2', familyId: 'f', name: 'Carne', icon: '🥩', kind: 'alimentacion' },
] as unknown as FamilyFoodType[]

const data = vi.hoisted(() => ({
  expenses: [] as unknown[],
  tagShares: new Map<string, { tagId: string; amount: number }[]>(),
  classShares: new Map<string, { className: string; amount: number }[]>(),
  ticketLines: new Map<string, { normalizedName: string | null; displayName: string | null }[] | null>(),
  ticketQueries: [] as string[],
  updateExpense: vi.fn(async () => undefined),
  setExpenseTags: vi.fn(async () => undefined),
  setExpenseClasses: vi.fn(async () => undefined),
}))
vi.mock('@/data/finance', async (o) => ({
  ...(await o<typeof import('@/data/finance')>()),
  listExpenses: async () => data.expenses,
  listBudgetCategories: async () => categories,
  listTags: async () => tags,
  listTagSharesSafe: async () => data.tagShares,
  listClassSharesSafe: async () => data.classShares,
  listResolvedInternalTransferDestinations: async () => [],
  updateExpense: data.updateExpense,
  setExpenseTags: data.setExpenseTags,
  setExpenseClasses: data.setExpenseClasses,
}))
vi.mock('@/data/family', async (o) => ({ ...(await o<typeof import('@/data/family')>()), getFinanceMonthStartDay: async () => 31, listFamilyMembers: async () => [{ id: 'm1', name: 'Jennifer', color: '#f06595', linkedProfileId: 'p1' }] }))
vi.mock('@/data/foodTypes', async (o) => ({ ...(await o<typeof import('@/data/foodTypes')>()), listFamilyFoodTypes: async (kind?: string) => foodTypes.filter((t) => !kind || t.kind === kind) }))
vi.mock('@/data/products', async (o) => ({ ...(await o<typeof import('@/data/products')>()), listAllProductPrices: async () => [], listProducts: async () => [] }))
vi.mock('@/data/receipts', async (o) => ({
  ...(await o<typeof import('@/data/receipts')>()),
  listReceipts: async () => [],
  listLinkedTicketProducts: async (id: string) => {
    data.ticketQueries.push(id)
    return data.ticketLines.get(id) ?? null
  },
}))
vi.mock('@/data/bank', async (o) => ({ ...(await o<typeof import('@/data/bank')>()), listBankAccounts: async () => [], listBankTransactions: async () => [], listBankConnections: async () => [] }))
vi.mock('@/data/cash', async (o) => ({ ...(await o<typeof import('@/data/cash')>()), listWalletsSafe: async () => [], listAllMovementsSafe: async () => [] }))

const { ExpensesTab } = await import('@/ui/FinanceScreen')

const real = [{ normalizedName: 'yogur natural', displayName: 'Yogur natural' }]
const placeholder = [{ normalizedName: 'pendiente', displayName: 'Pendiente' }]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T10:00:00'))
  data.updateExpense.mockClear()
  data.setExpenseTags.mockClear()
  data.setExpenseClasses.mockClear()
  data.ticketQueries.length = 0
  data.tagShares = new Map()
  data.classShares = new Map()
  data.ticketLines = new Map([
    ['con-ticket', real],
    ['solo-pendiente', placeholder],
    ['sin-lineas', []], // compra anotada a mano sin ticket ni desglose, vinculada al movimiento
    ['banco-con-compra', real], // origen «banco» pero con una compra vinculada de verdad
  ])
  data.expenses = [
    ex({ id: 'con-ticket', store: 'Con ticket', productClassification: 'Lácteos' }), // compra con productos reales + clasificación antigua que NO se debe borrar
    ex({ id: 'solo-pendiente', store: 'Solo pendiente' }), // el único producto es el marcador «Pendiente»
    ex({ id: 'sin-lineas', store: 'Sin lineas', source: 'banco', productClassification: 'Carne' }),
    ex({ id: 'banco-con-compra', store: 'Banco con compra', source: 'banco', productClassification: 'Carne' }),
    ex({ id: 'sin-compra', store: 'Sin compra', source: 'banco', productClassification: 'Carne' }), // apunte bancario sin compra vinculada
    ex({ id: 'repartida', store: 'Repartida', source: 'banco', tagId: 'jen' }),
  ]
  data.tagShares = new Map([['repartida', [{ tagId: 'jen', amount: 12 }, { tagId: 'alv', amount: 8 }]]])
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function openEdit(store: string) {
  render(
    <MemoryRouter>
      <ExpensesTab onClearFilter={() => undefined} myMemberId="m1" />
    </MemoryRouter>,
  )
  const row = await screen.findByText(new RegExp(store))
  fireEvent.click(row.closest('.movement-row') as HTMLElement)
  await screen.findByRole('button', { name: 'Guardar' })
}
const linkedBadge = () => screen.getByTestId('movement-purchase-linked')

describe('ECO-UI-04 · «✓ Compra vinculada»', () => {
  it('compra con productos reales: «✓ Compra vinculada» y NADA del bloque de clasificación (ni desplegable, ni reparto, ni explicación, ni enlaces ni productos)', async () => {
    await openEdit('Con ticket')
    await waitFor(() => expect(linkedBadge().textContent).toContain('Compra vinculada'))
    expect(screen.queryByText(/Ticket vinculado/)).toBeNull()
    expect(screen.queryByText(/Clasificación \(opcional\)/)).toBeNull()
    expect(screen.queryByText(/Repartir entre varias clasificaciones/)).toBeNull()
    expect(screen.queryByText(/Reparto por clasificación/)).toBeNull()
    expect(data.ticketQueries).toEqual(['con-ticket']) // se mira el vínculo real de ESTE gasto, nunca por comercio ni fecha
    expect(screen.queryByText(/Ver ticket|Ver compra|Editar productos|Yogur/)).toBeNull()
  })

  it('al guardar NO se borra la clasificación antigua ni se toca el reparto de clasificaciones ni los importes', async () => {
    await openEdit('Con ticket')
    await screen.findByTestId('movement-purchase-linked')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.updateExpense).toHaveBeenCalledTimes(1))
    const patch = (data.updateExpense.mock.calls[0] as unknown as [string, Record<string, unknown>])[1]
    expect(patch.productClassification).toBe('Lácteos')
    expect(patch.amount).toBe(20)
    expect(data.setExpenseClasses).not.toHaveBeenCalled()
  })

  it('el vínculo se mira sea cual sea el origen del gasto: un apunte «banco» con compra vinculada también muestra «Compra vinculada» y oculta el selector', async () => {
    await openEdit('Banco con compra')
    await waitFor(() => expect(linkedBadge()).toBeTruthy())
    expect(screen.queryByText(/Clasificación \(opcional\)/)).toBeNull()
    expect(data.ticketQueries).toEqual(['banco-con-compra'])
  })

  it('compra vinculada SIN productos (anotada a mano, sin desglose): se indica «Compra vinculada» pero se conserva el selector de clasificación', async () => {
    await openEdit('Sin lineas')
    await waitFor(() => expect(linkedBadge()).toBeTruthy())
    expect(screen.getByText(/Clasificación \(opcional\)/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Repartir entre varias clasificaciones/ })).toBeTruthy()
    expect((screen.getByDisplayValue(/Carne/) as HTMLSelectElement).value).toBe('Carne')
  })

  it('compra cuyo único producto es el marcador «Pendiente»: no es un desglose real -> «Compra vinculada» + selector', async () => {
    await openEdit('Solo pendiente')
    await waitFor(() => expect(linkedBadge()).toBeTruthy())
    expect(screen.getByText(/Clasificación \(opcional\)/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Repartir entre varias clasificaciones/ })).toBeTruthy()
  })

  it('sin compra vinculada: ni etiqueta de vínculo ni nada oculto; selector y reparto como siempre, con la clasificación guardada puesta', async () => {
    await openEdit('Sin compra')
    await waitFor(() => expect(data.ticketQueries).toContain('sin-compra'))
    expect(screen.queryByTestId('movement-purchase-linked')).toBeNull()
    expect(screen.getByText(/Clasificación \(opcional\)/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Repartir entre varias clasificaciones/ })).toBeTruthy()
    expect((screen.getByDisplayValue(/Carne/) as HTMLSelectElement).value).toBe('Carne')
  })

  it('al desvincular la compra el movimiento recupera el selector de clasificación (con su clasificación manual intacta)', async () => {
    data.ticketLines.set('con-ticket', null) // la compra se desvincula: ya no hay receipts para ese gasto
    await openEdit('Con ticket')
    await waitFor(() => expect(data.ticketQueries).toContain('con-ticket'))
    expect(screen.queryByTestId('movement-purchase-linked')).toBeNull()
    expect(screen.getByText(/Clasificación \(opcional\)/)).toBeTruthy()
    expect((screen.getByDisplayValue(/Lácteos/) as HTMLSelectElement).value).toBe('Lácteos')
  })
})

describe('ECO-UI-02/03 · etiquetas en el formulario de edición', () => {
  it('no hay lista de botones ni buscador a la vista: un desplegable por etiqueta asignada y el enlace «+ Añadir etiqueta»', async () => {
    await openEdit('Sin compra')
    expect(screen.queryAllByLabelText(/^Etiqueta \d+$/)).toHaveLength(0) // este movimiento no tiene etiquetas: no hay desplegables vacíos
    expect(screen.queryByRole('button', { name: 'Vacaciones' })).toBeNull()
    expect(screen.queryByLabelText('Buscar etiqueta')).toBeNull()
    expect(screen.getByRole('button', { name: '+ Añadir etiqueta' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Gestionar etiquetas/ })).toBeTruthy()
  })

  it('un movimiento con dos etiquetas repartidas se abre con sus dos selectores y sus importes, y al guardar sin tocar nada conserva el reparto', async () => {
    await openEdit('Repartida')
    expect((screen.getByLabelText('Etiqueta 1') as HTMLSelectElement).value).toBe('jen')
    expect((screen.getByLabelText('Etiqueta 2') as HTMLSelectElement).value).toBe('alv')
    expect((screen.getByLabelText('Importe de Jennifer') as HTMLInputElement).value).toBe('12.00')
    expect((screen.getByLabelText('Importe de Cumpleaños Álvaro 2026') as HTMLInputElement).value).toBe('8.00')
    expect(screen.getByText(/Suma 20,00 € ✓/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(data.setExpenseTags).toHaveBeenCalledTimes(1))
    expect(data.setExpenseTags).toHaveBeenCalledWith('repartida', [{ tagId: 'jen', amount: 12 }, { tagId: 'alv', amount: 8 }])
  })

  it('añadir una tercera etiqueta (desde el selector a demanda) conserva los dos importes y exige completar la suma antes de guardar', async () => {
    await openEdit('Repartida')
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir etiqueta' }))
    fireEvent.click(within(screen.getByTestId('tag-picker')).getByRole('option', { name: /Vacaciones/ }))
    expect((screen.getByLabelText('Importe de Jennifer') as HTMLInputElement).value).toBe('12.00')
    expect((screen.getByLabelText('Importe de Cumpleaños Álvaro 2026') as HTMLInputElement).value).toBe('8.00')
    // 12 + 8 ya suman 20: a la nueva no le queda nada y el formulario lo dice en vez de guardar mal
    expect(screen.getAllByText(/Escribe un importe mayor que cero|no suman|Sobran|Faltan/i).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.getAllByText(/Escribe un importe mayor que cero|no suman|Sobran|Faltan/i).length).toBeGreaterThan(0))
    expect(data.updateExpense).not.toHaveBeenCalled()
    expect(data.setExpenseTags).not.toHaveBeenCalled()
  })
})
