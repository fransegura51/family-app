// @vitest-environment jsdom
// COR-02 (puntos de colores, uno por etiqueta) y COR-03 (importe imputado al llegar desde una estadística filtrada) en la lista REAL de Movimientos de Economía, con datos simulados.
// Caso real: Hiperber 13,55 € repartido Jennifer 60 % = 8,13 € + Cumpleaños Álvaro 2026 40 % = 5,42 €.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BudgetCategory, Expense, Tag } from '@/domain/types'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : () => empty()) }) }))

const ex = (o: Partial<Expense> & Pick<Expense, 'id'>): Expense =>
  ({ familyId: 'f', expenseDate: '2026-10-16', amount: 1, category: 'Supermercado', store: null, kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'manual', isFixedOverride: null, ownerMemberId: 'm1', shared: false, sharedFromExpenseId: null, productClassification: null, paymentMethod: null, ...o }) as Expense
const categories = [
  { id: 'sup', familyId: 'f', name: 'Supermercado', icon: '🛒', budgetGroup: 'generales', sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: null },
  // Con alguna categoría de ingresos la pantalla no intenta sembrarlas (eso necesitaría sesión).
  { id: 'sue', familyId: 'f', name: 'Sueldo', icon: '💶', budgetGroup: 'ingresos', sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: null },
] as unknown as BudgetCategory[]
const tags = [
  { id: 'jen', name: 'Jennifer', color: '#f06595', sortOrder: 0 },
  { id: 'alv', name: 'Cumpleaños Álvaro 2026', color: '#4dabf7', sortOrder: 1 },
  { id: 'vac', name: 'Vacaciones', color: '#51cf66', sortOrder: 2 },
  { id: 'cas', name: 'Casa', color: '#fcc419', sortOrder: 3 },
  { id: 'col', name: 'Cole', color: '#845ef7', sortOrder: 4 },
] as unknown as Tag[]

const data = vi.hoisted(() => ({ expenses: [] as unknown[], shares: new Map<string, { tagId: string; amount: number }[]>() }))
vi.mock('@/data/finance', async (o) => ({
  ...(await o<typeof import('@/data/finance')>()),
  listExpenses: async () => data.expenses,
  listBudgetCategories: async () => categories,
  listTags: async () => tags,
  listTagSharesSafe: async () => data.shares,
  listClassSharesSafe: async () => new Map(),
  listResolvedInternalTransferDestinations: async () => [],
}))
vi.mock('@/data/family', async (o) => ({ ...(await o<typeof import('@/data/family')>()), getFinanceMonthStartDay: async () => 31, listFamilyMembers: async () => [{ id: 'm1', name: 'Jennifer', color: '#f06595', linkedProfileId: 'p1' }] }))
vi.mock('@/data/products', async (o) => ({ ...(await o<typeof import('@/data/products')>()), listAllProductPrices: async () => [], listProducts: async () => [] }))
vi.mock('@/data/receipts', async (o) => ({ ...(await o<typeof import('@/data/receipts')>()), listReceipts: async () => [] }))
vi.mock('@/data/bank', async (o) => ({ ...(await o<typeof import('@/data/bank')>()), listBankAccounts: async () => [], listBankTransactions: async () => [], listBankConnections: async () => [] }))
vi.mock('@/data/cash', async (o) => ({ ...(await o<typeof import('@/data/cash')>()), listWalletsSafe: async () => [], listAllMovementsSafe: async () => [] }))

const { ExpensesTab } = await import('@/ui/FinanceScreen')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T10:00:00'))
  data.expenses = [
    ex({ id: 'hiperber', amount: 13.55, store: 'Hiperber', tagId: 'jen' }), // 60 % Jennifer + 40 % Álvaro
    ex({ id: 'solo-jen', amount: 10, store: 'Mercadona', tagId: 'jen' }), // una sola etiqueta
    ex({ id: 'tres', amount: 30, store: 'Tres etiquetas', tagId: 'vac' }),
    ex({ id: 'cinco', amount: 50, store: 'Cinco etiquetas', tagId: 'jen' }),
    ex({ id: 'sin', amount: 4, store: 'Sin etiqueta' }),
  ]
  data.shares = new Map([
    ['hiperber', [{ tagId: 'jen', amount: 8.13 }, { tagId: 'alv', amount: 5.42 }]],
    ['tres', [{ tagId: 'vac', amount: 10 }, { tagId: 'cas', amount: 10 }, { tagId: 'col', amount: 10 }]],
    ['cinco', [{ tagId: 'jen', amount: 10 }, { tagId: 'alv', amount: 10 }, { tagId: 'vac', amount: 10 }, { tagId: 'cas', amount: 10 }, { tagId: 'col', amount: 10 }]],
  ])
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const rowOf = (store: string) => screen.getByText(new RegExp(store)).closest('.movement-row') as HTMLElement
const dotsOf = (row: HTMLElement) => [...row.querySelectorAll('.movement-row-dot')] as HTMLElement[]
async function openList(filter?: Parameters<typeof ExpensesTab>[0]['filter']) {
  render(
    <MemoryRouter>
      <ExpensesTab filter={filter} onClearFilter={() => undefined} myMemberId="m1" />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByText(/Hiperber/)).toBeTruthy())
}

describe('COR-02 · un punto de color por etiqueta en cada fila', () => {
  it('una etiqueta: el punto de siempre, sin contenedor nuevo', async () => {
    await openList()
    const dots = dotsOf(rowOf('Mercadona'))
    expect(dots).toHaveLength(1)
    expect(dots[0].style.background).toBeTruthy()
    expect(rowOf('Mercadona').querySelector('.movement-row-dots')).toBeNull()
  })

  it('sin etiqueta: el punto transparente de siempre', async () => {
    await openList()
    const dots = dotsOf(rowOf('Sin etiqueta'))
    expect(dots).toHaveLength(1)
    expect(dots[0].style.background).toBe('transparent')
  })

  it('dos etiquetas: dos puntos en vertical, cada uno con el color de SU etiqueta (Jennifer y Cumpleaños Álvaro)', async () => {
    await openList()
    const row = rowOf('Hiperber')
    expect(row.querySelector('.movement-row-dots')).toBeTruthy()
    const dots = dotsOf(row)
    expect(dots.map((d) => d.style.background)).toEqual(['rgb(240, 101, 149)', 'rgb(77, 171, 247)'])
    // sin solape con dos puntos (caben enteros)
    expect(dots[1].style.marginTop).toBe('0px')
  })

  it('tres etiquetas: tres puntos en vertical; cinco: cinco, solapados un poco para no agrandar la fila', async () => {
    await openList()
    expect(dotsOf(rowOf('Tres etiquetas'))).toHaveLength(3)
    const five = dotsOf(rowOf('Cinco etiquetas'))
    expect(five).toHaveLength(5)
    expect(five.map((d) => d.style.background)).toHaveLength(5)
    expect(parseInt(five[1].style.marginTop, 10)).toBeLessThan(0) // solape
    expect(parseInt(five[0].style.marginTop || '0', 10)).toBe(0)
  })

  it('no se añade nada más a la fila: ni contadores, ni distintivos, ni líneas de importe extra fuera de filtro', async () => {
    await openList()
    const row = rowOf('Hiperber')
    expect(row.querySelector('[data-testid="movement-row-imputed"]')).toBeNull()
    expect(row.textContent).toContain('13.55 €')
    expect(row.querySelectorAll('.movement-row-line').length).toBeLessThanOrEqual(2) // la línea de categoría/importe y la de fecha/etiquetas (como hasta ahora)
  })
})

describe('COR-03 · importe imputado al llegar desde una estadística filtrada por etiqueta', () => {
  const base = { label: 'Etiqueta — Octubre 2026', from: '2026-09-30', to: '2026-10-30' }

  it('lista general (sin filtro): importes completos y cabecera de siempre; el gasto global no cambia', async () => {
    await openList()
    expect(rowOf('Hiperber').textContent).toContain('13.55 €')
    expect(screen.getByText(/107\.55 € gastados/)).toBeTruthy() // 13,55 + 10 + 30 + 50 + 4
    expect(screen.queryByTestId('movement-row-imputed')).toBeNull()
  })

  it('filtro Jennifer: el movimiento de 13,55 € sigue con su importe y añade «Correspondiente a Jennifer: 8,13 €»; la cabecera suma lo imputado', async () => {
    await openList({ ...base, tagId: 'jen' })
    const row = rowOf('Hiperber')
    expect(row.textContent).toContain('13.55 €')
    expect(row.querySelector('[data-testid="movement-row-imputed"]')?.textContent).toBe('Correspondiente a Jennifer: 8.13 €')
    // Jennifer: Hiperber 8,13 + Mercadona 10 (etiqueta única, sin línea extra) + Cinco etiquetas 10 = 28,13
    expect(rowOf('Mercadona').querySelector('[data-testid="movement-row-imputed"]')).toBeNull()
    expect(screen.getByText('28.13 € imputados a Jennifer')).toBeTruthy()
    expect(screen.getByText(/Importe completo de estos movimientos: 73\.55 €/)).toBeTruthy()
  })

  it('filtro Cumpleaños Álvaro 2026: 5,42 € imputados, el movimiento sigue siendo UNO y de 13,55 €', async () => {
    await openList({ ...base, tagId: 'alv' })
    const row = rowOf('Hiperber')
    expect(row.querySelector('[data-testid="movement-row-imputed"]')?.textContent).toBe('Correspondiente a Cumpleaños Álvaro 2026: 5.42 €')
    expect(row.textContent).toContain('13.55 €')
    expect(document.querySelectorAll('.movement-row[data-help-id="finance.movement-row"]').length).toBe(2) // Hiperber + Cinco etiquetas: sin duplicar
    expect(screen.getByText('15.42 € imputados a Cumpleaños Álvaro 2026')).toBeTruthy()
  })

  it('el total filtrado coincide con la estadística (suma de lo imputado de cada etiqueta = gasto global, sin duplicar)', async () => {
    const { totalsByTag } = await import('@/domain/tagShares')
    const totals = totalsByTag(data.expenses as Expense[], data.shares)
    expect(totals.get('jen')?.total).toBe(28.13)
    expect(totals.get('alv')?.total).toBe(15.42)
    const all = [...totals.values()].reduce((s, t) => s + Math.round(t.total * 100), 0)
    expect(all).toBe(10755) // = gasto global 107,55 €
  })

  it('un filtro con importes imputados (clasificación repartida) usa los mismos textos', async () => {
    await openList({ ...base, expenseIds: ['hiperber'], imputed: { label: 'Ropa y calzado', byExpense: { hiperber: 6.1 } } })
    expect(rowOf('Hiperber').querySelector('[data-testid="movement-row-imputed"]')?.textContent).toBe('Correspondiente a Ropa y calzado: 6.10 €')
    expect(screen.getByText('6.10 € imputados a Ropa y calzado')).toBeTruthy()
    expect(screen.getByText(/Importe completo de estos movimientos: 13\.55 €/)).toBeTruthy()
  })
})
