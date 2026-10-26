// @vitest-environment jsdom
// Carteras de efectivo dentro de Economía → Movimientos (pantalla real ExpensesTab / BankTab, datos simulados). Banco y Movimientos siguen separados:
// las tarjetas de efectivo y sus herramientas viven en Movimientos y el bloque «Efectivo (opcional)» ya no existe en Banco.
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CashMovement, CashWallet } from '@/domain/cashWallet'
import type { Expense } from '@/domain/types'

const empty = (): unknown => ({
  then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
  eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty,
})
vi.mock('@/data/supabaseClient', () => ({
  supabase: new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'auth') return { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) }
        if (prop === 'channel') return () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) })
        if (prop === 'removeChannel') return () => undefined
        return () => empty()
      },
    },
  ),
}))

const iso = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ex = (o: Partial<Expense> & Pick<Expense, 'id'>): Expense =>
  ({ familyId: 'f', expenseDate: iso(0), amount: 1, category: 'Alimentación', store: null, kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'manual', isFixedOverride: null, ownerMemberId: null, shared: false, sharedFromExpenseId: null, productClassification: null, paymentMethod: null, ...o }) as Expense
const wallet = (o: Partial<CashWallet> & Pick<CashWallet, 'id' | 'name'>): CashWallet => ({ ownerMemberId: null, openingBalance: 0, archivedAt: null, balance: 0, ...o })
const mv = (o: Partial<CashMovement> & Pick<CashMovement, 'id' | 'walletId'>): CashMovement => ({ kind: 'in', amount: 10, occurredOn: iso(0), note: null, transferId: null, expenseId: null, ...o })

// Caso real de la validación: compra de 13,50 € en Mercado Puesto Panadería pagada desde la cartera de Jennifer (100 → 86,50).
let expenses: Expense[] = []
let wallets: CashWallet[] = []
let movements: CashMovement[] = []
const calls = {
  deleteExpense: vi.fn(async (..._a: unknown[]) => undefined),
  deleteMovement: vi.fn(async (..._a: unknown[]) => undefined),
  unlinkBank: vi.fn(async (..._a: unknown[]) => undefined),
  createWallet: vi.fn(async (..._a: unknown[]) => undefined),
  addMovement: vi.fn(async (..._a: unknown[]) => undefined),
  transferCash: vi.fn(async (..._a: unknown[]) => undefined),
  linkBank: vi.fn(async (..._a: unknown[]) => undefined),
  getWallets: vi.fn(async () => wallets),
}
const categories = [
  { id: 'c1', name: 'Alimentación', icon: '🍎', budgetGroup: 'generales', color: null, catalogKey: null },
  { id: 'c2', name: 'Sueldo', icon: '💶', budgetGroup: 'ingresos', color: null, catalogKey: null },
  { id: 'c3', name: 'Movimientos internos', icon: '🔁', budgetGroup: 'generales', color: null, catalogKey: 'g.movimientos_internos' },
]

vi.mock('@/data/finance', async (orig) => ({
  ...(await orig<typeof import('@/data/finance')>()),
  listExpenses: async () => expenses,
  listBudgetCategories: async () => categories,
  listTags: async () => [],
  deleteExpense: (...a: unknown[]) => calls.deleteExpense(...a),
  createBudgetCategoriesBulk: async () => undefined,
}))
vi.mock('@/data/bank', async (orig) => ({
  ...(await orig<typeof import('@/data/bank')>()),
  listBankAccounts: async () => [],
  listBankConnections: async () => [],
  listBankTransactions: async () => [],
}))
vi.mock('@/data/family', async (orig) => ({
  ...(await orig<typeof import('@/data/family')>()),
  getFinanceMonthStartDay: async () => 1,
  getAccountsMode: async () => 'compartido',
  listFamilyMembers: async () => [{ id: 'jenni', name: 'Jennifer', color: '#f06595', linkedProfileId: 'p1' }],
}))
vi.mock('@/data/cash', async (orig) => ({
  ...(await orig<typeof import('@/data/cash')>()),
  listWalletsSafe: () => calls.getWallets(),
  listAllMovementsSafe: async () => movements,
  deleteMovement: (...a: unknown[]) => calls.deleteMovement(...a),
  unlinkBankMovement: (...a: unknown[]) => calls.unlinkBank(...a),
  createWallet: (...a: unknown[]) => calls.createWallet(...a),
  addMovement: (...a: unknown[]) => calls.addMovement(...a),
  transferCash: (...a: unknown[]) => calls.transferCash(...a),
  linkBankExpenseToWallet: (...a: unknown[]) => calls.linkBank(...a),
}))
vi.mock('@/services/voice', async (orig) => ({ ...(await orig<typeof import('@/services/voice')>()), isSpeechSupported: () => false, isDictationSupported: () => false, primeSpeech: () => undefined }))

const { ExpensesTab, BankTab, AccountBalanceCards } = await import('@/ui/FinanceScreen')

beforeEach(() => {
  Object.values(calls).forEach((m) => m.mockClear())
  calls.getWallets.mockImplementation(async () => wallets)
  wallets = [wallet({ id: 'jenni-w', name: 'Cartera de Jennifer', ownerMemberId: 'jenni', openingBalance: 100, balance: 86.5 }), wallet({ id: 'fam-w', name: 'Cartera familiar', balance: 20 })]
  movements = [
    mv({ id: 'm0', walletId: 'jenni-w', kind: 'in', amount: 100, note: 'saldo inicial' }),
    mv({ id: 'm1', walletId: 'jenni-w', kind: 'payment', amount: -13.5, expenseId: 'panaderia' }),
    mv({ id: 'm2', walletId: 'jenni-w', kind: 'transfer_in', amount: 50, expenseId: 'cajero' }),
    mv({ id: 'm3', walletId: 'fam-w', kind: 'payment', amount: -4, expenseId: 'kiosco' }),
  ]
  expenses = [
    ex({ id: 'panaderia', amount: 13.5, store: 'Mercado Puesto Panadería', paymentMethod: 'efectivo' }),
    ex({ id: 'kiosco', amount: 4, store: 'Kiosco', paymentMethod: 'efectivo' }),
    ex({ id: 'cajero', amount: 50, store: 'CAJERO', source: 'banco', category: 'Movimientos internos' }),
    ex({ id: 'efectivo-libre', amount: 8, store: 'Frutería suelta', paymentMethod: 'efectivo' }),
    ex({ id: 'tarjeta', amount: 20, store: 'Supermercado tarjeta', paymentMethod: 'tarjeta' }),
  ]
})
afterEach(cleanup)

// Igual que la pantalla real: las tarjetas de «Mis cuentas» (con las carteras) van arriba y Movimientos debajo; tocar una cartera la elige en Movimientos.
function Harness() {
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)
  return (
    <>
      <AccountBalanceCards myMemberId="jenni" onAddAccount={() => undefined} onSelectAccount={() => undefined} onSelectWallet={(id) => setFocus((p) => ({ id, n: (p?.n ?? 0) + 1 }))} onViewAll={() => undefined} />
      <ExpensesTab myMemberId="jenni" focusWallet={focus} />
    </>
  )
}
function renderMovements() {
  return render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  )
}
const storesShown = () => ['Mercado Puesto Panadería', 'Kiosco', 'CAJERO', 'Frutería suelta', 'Supermercado tarjeta'].filter((s) => screen.queryByText(new RegExp(s)))

describe('Movimientos: carteras en «Mis cuentas» (sin bloque «Efectivo» repetido)', () => {
  it('cada cartera sale UNA sola vez: no hay un segundo bloque «Efectivo» en Movimientos', async () => {
    renderMovements()
    await screen.findByRole('button', { name: /Cartera de Jennifer/ })
    expect(screen.getAllByRole('button', { name: /Cartera de Jennifer/ })).toHaveLength(1)
    expect(screen.queryByText('💶 Efectivo')).toBeNull()
    expect(screen.queryByText(/Controlar el efectivo es opcional/)).toBeNull()
  })

  it('muestra una tarjeta por cartera con nombre, titular o familiar, saldo e icono de efectivo', async () => {
    renderMovements()
    const card = await screen.findByRole('button', { name: /Cartera de Jennifer/ })
    expect(card.textContent).toContain('💶')
    expect(card.textContent).toContain('Personal · Jennifer')
    expect(card.textContent).toContain('86,50')
    const family = screen.getByRole('button', { name: /Cartera familiar/ })
    expect(family.textContent).toContain('Familiar')
    expect(family.textContent).toContain('20,00')
    expect(card.className).toContain('account-card') // mismo formato que las tarjetas de las cuentas bancarias
  })

  it('sin filtro se ven TODOS los movimientos, también el efectivo sin cartera', async () => {
    renderMovements()
    await screen.findByRole('button', { name: /Cartera de Jennifer/ })
    await waitFor(() => expect(storesShown()).toHaveLength(5))
    expect(screen.queryByText(/Ver todos los movimientos/)).toBeNull()
  })

  it('tocar una cartera la filtra: sus compras, la retirada del banco y sus entradas; no las de otra cartera ni el resto', async () => {
    renderMovements()
    fireEvent.click(await screen.findByRole('button', { name: /Cartera de Jennifer/ }))
    await waitFor(() => expect(screen.getByText('Cartera: Cartera de Jennifer')).toBeTruthy()) // el saldo ya está en la tarjeta: no se repite en el recuadro
    expect(screen.queryByText(/Cartera: Cartera de Jennifer ·/)).toBeNull()
    expect(storesShown().sort()).toEqual(['CAJERO', 'Mercado Puesto Panadería'].sort())
    // su entrada de saldo inicial sale en el mismo listado, sin ser gasto ni ingreso
    expect(screen.getByText(/Entrada de efectivo/)).toBeTruthy()
    expect(screen.getByText('saldo inicial')).toBeTruthy()
  })

  it('con una cartera elegida salen las cinco herramientas sobre ESA cartera', async () => {
    renderMovements()
    fireEvent.click(await screen.findByRole('button', { name: /Cartera de Jennifer/ }))
    const ops = await screen.findByRole('group', { name: 'Operaciones de la cartera' })
    expect(screen.getByRole('heading', { name: 'Operaciones de efectivo' })).toBeTruthy() // el título ya no repite el nombre de la cartera
    expect(within(ops).getAllByRole('button').map((b) => b.textContent)).toEqual(['＋ Entrada', '− Salida', '⚖️ Ajustar saldo', '⇄ Traspaso', '↔ Banco y efectivo'])
    fireEvent.click(within(ops).getByRole('button', { name: '＋ Entrada' }))
    fireEvent.change(screen.getByLabelText(/Importe/), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(calls.addMovement).toHaveBeenCalledWith(expect.objectContaining({ walletId: 'jenni-w', kind: 'in', delta: 5 })))
  })

  it('cambiar de cartera y volver a todos los movimientos', async () => {
    renderMovements()
    fireEvent.click(await screen.findByRole('button', { name: /Cartera de Jennifer/ }))
    await screen.findByText(/Ver todos los movimientos/)
    fireEvent.click(screen.getByRole('button', { name: /Cartera familiar/ }))
    await waitFor(() => expect(storesShown()).toEqual(['Kiosco']))
    expect(screen.getByText('Cartera: Cartera familiar')).toBeTruthy()
    fireEvent.click(screen.getByText(/Ver todos los movimientos/))
    await waitFor(() => expect(storesShown()).toHaveLength(5))
    expect(screen.queryByRole('group', { name: 'Operaciones de la cartera' })).toBeNull()
  })

  it('«Efectivo sin cartera» enseña los gastos en efectivo que no están en ninguna cartera', async () => {
    renderMovements()
    fireEvent.click(await screen.findByRole('button', { name: /Ver el efectivo sin cartera/ }))
    await waitFor(() => expect(storesShown()).toEqual(['Frutería suelta']))
    expect(screen.getByText('Efectivo sin cartera', { selector: 'strong' })).toBeTruthy()
  })

  it('el filtro por cartera no crea ni borra nada', async () => {
    renderMovements()
    fireEvent.click(await screen.findByRole('button', { name: /Cartera de Jennifer/ }))
    await screen.findByText(/Ver todos los movimientos/)
    fireEvent.click(screen.getByText(/Ver todos los movimientos/))
    await waitFor(() => expect(storesShown()).toHaveLength(5))
    for (const m of [calls.deleteExpense, calls.deleteMovement, calls.createWallet, calls.addMovement, calls.transferCash, calls.linkBank, calls.unlinkBank]) expect(m).not.toHaveBeenCalled()
  })

  it('una retirada del banco se puede deshacer desde su fila; una compra no ofrece «Deshacer»', async () => {
    renderMovements()
    fireEvent.click(await screen.findByRole('button', { name: /Cartera de Jennifer/ }))
    await screen.findByText(/CAJERO/)
    const undo = screen.getAllByRole('button', { name: 'Deshacer' })
    expect(undo).toHaveLength(1)
    fireEvent.click(undo[0])
    await waitFor(() => expect(calls.unlinkBank).toHaveBeenCalledWith('m2'))
  })

  it('«+ Añadir cuenta o cartera» ofrece las dos opciones y la de cartera usa el formulario de siempre', async () => {
    renderMovements()
    fireEvent.click(await screen.findByRole('button', { name: /Añadir cuenta o cartera/ }))
    expect(screen.getByRole('button', { name: /Añadir cuenta bancaria/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Añadir cartera de efectivo/ }))
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Caja del mercado' } })
    fireEvent.change(screen.getByLabelText(/Saldo inicial/), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cartera' }))
    await waitFor(() => expect(calls.createWallet).toHaveBeenCalledWith(expect.objectContaining({ name: 'Caja del mercado', openingBalance: 30 })))
  })

  it('«Añadir cuenta bancaria» sigue llevando a conectar el banco', async () => {
    const onAdd = vi.fn()
    render(
      <MemoryRouter>
        <AccountBalanceCards onAddAccount={onAdd} onSelectAccount={() => undefined} onViewAll={() => undefined} />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /Añadir cuenta o cartera/ }))
    fireEvent.click(screen.getByRole('button', { name: /Añadir cuenta bancaria/ }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('sin carteras: los gastos en efectivo siguen visibles y no se pinta ningún bloque de efectivo', async () => {
    wallets = []
    movements = []
    renderMovements()
    await waitFor(() => expect(storesShown()).toHaveLength(5))
    expect(screen.queryByText(/Controlar el efectivo es opcional/)).toBeNull()
  })

  it('llegar desde «Mis cuentas» con una cartera ya elegida: Movimientos sale filtrado por ella, con sus herramientas', async () => {
    render(
      <MemoryRouter>
        <ExpensesTab myMemberId="jenni" focusWallet={{ id: 'jenni-w', n: 1 }} />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/Cartera: Cartera de Jennifer/)).toBeTruthy())
    expect(storesShown().sort()).toEqual(['CAJERO', 'Mercado Puesto Panadería'].sort())
    expect(await screen.findByRole('group', { name: 'Operaciones de la cartera' })).toBeTruthy()
  })

  it('la cartera de otra persona se puede mirar pero no tiene herramientas', async () => {
    wallets = [wallet({ id: 'ana-w', name: 'Cartera de Ana', ownerMemberId: 'ana', balance: 9 })]
    movements = []
    renderMovements()
    fireEvent.click(await screen.findByRole('button', { name: /Cartera de Ana/ }))
    expect(await screen.findByText(/solo puedes verla/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '＋ Entrada' })).toBeNull()
  })
})

describe('Banco: sigue siendo solo de cuentas bancarias', () => {
  it('ya no tiene el bloque desplegable «Efectivo (opcional)» ni tarjetas de cartera', async () => {
    render(
      <MemoryRouter>
        <BankTab />
      </MemoryRouter>,
    )
    await screen.findByText(/Todavía no hay ningún banco enlazado/)
    expect(screen.queryByText(/Efectivo \(opcional\)/)).toBeNull()
    expect(screen.queryByText(/Añadir cartera/)).toBeNull()
    expect(calls.getWallets).not.toHaveBeenCalled() // Banco ni siquiera pide las carteras
  })
})
