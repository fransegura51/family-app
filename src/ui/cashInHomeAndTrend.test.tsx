// @vitest-environment jsdom
// Carteras de efectivo en «Mis cuentas» (inicio de Economía) y en «Tendencia del saldo», con las pantallas reales y datos simulados.
// Caso real: cartera de Jennifer (100 € → 86,50 € tras la compra de 13,50 € del 22/10) junto a dos cuentas bancarias.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CashMovement, CashWallet } from '@/domain/cashWallet'

const empty = (): unknown => ({
  then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
  eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty,
})
vi.mock('@/data/supabaseClient', () => ({
  supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : () => empty()) }),
}))

let wallets: CashWallet[] = []
let movements: CashMovement[] = []
let accounts: unknown[] = []
let transactions: unknown[] = []
vi.mock('@/data/bank', async (orig) => ({
  ...(await orig<typeof import('@/data/bank')>()),
  listBankAccounts: async () => accounts,
  listBankTransactions: async () => transactions,
  listBankConnections: async () => [],
}))
vi.mock('@/data/family', async (orig) => ({
  ...(await orig<typeof import('@/data/family')>()),
  getFinanceMonthStartDay: async () => 1,
  listFamilyMembers: async () => [
    { id: 'jenni', name: 'Jennifer', color: '#f06595', linkedProfileId: 'p1' },
    { id: 'paco', name: 'Paco', color: '#4dabf7', linkedProfileId: 'p2' },
  ],
}))
vi.mock('@/data/cash', async (orig) => ({
  ...(await orig<typeof import('@/data/cash')>()),
  listWalletsSafe: async () => wallets,
  listAllMovementsSafe: async () => movements,
}))

const { AccountBalanceCards, BalanceTrendCard } = await import('@/ui/FinanceScreen')

const wallet = (o: Partial<CashWallet> & Pick<CashWallet, 'id' | 'name'>): CashWallet => ({ ownerMemberId: null, openingBalance: 0, archivedAt: null, balance: 0, createdAt: '2026-10-20T08:00:00Z', ...o })
const bank = (o: Record<string, unknown>) => ({ id: 'b', connectionId: 'c', accountUid: 'u', iban: 'ES0000', name: 'Cuenta', currency: 'EUR', balance: 1000, balanceCurrency: 'EUR', balanceUpdatedAt: null, ownerMemberId: null, balanceVisible: true, ...o })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T10:00:00'))
  wallets = [wallet({ id: 'wj', name: 'Cartera de Jennifer', ownerMemberId: 'jenni', openingBalance: 100, balance: 86.5 }), wallet({ id: 'wf', name: 'Cartera familiar', openingBalance: 20, balance: 20 })]
  movements = [{ id: 'm1', walletId: 'wj', kind: 'payment', amount: -13.5, occurredOn: '2026-10-22', note: null, transferId: null, expenseId: 'compra' }]
  accounts = [bank({ id: 'b1', ownerMemberId: 'paco', balance: 900 }), bank({ id: 'b2', ownerMemberId: null, balance: 3000 })]
  transactions = []
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Mis cuentas: carteras de efectivo junto a las cuentas bancarias', () => {
  it('cada cartera sale como tarjeta con nombre, titular o «Familiar», saldo e icono, junto a las tarjetas de banco y «Añadir cuenta»', async () => {
    render(<MemoryRouter><AccountBalanceCards onAddAccount={vi.fn()} onSelectAccount={vi.fn()} onSelectWallet={vi.fn()} onViewAll={vi.fn()} /></MemoryRouter>)
    const jen = await screen.findByRole('button', { name: /Cartera de Jennifer/ })
    expect(jen.textContent).toContain('💶')
    expect(jen.textContent).toContain('Personal · Jennifer')
    expect(jen.textContent).toContain('86,50')
    expect(jen.className).toContain('account-card')
    const fam = screen.getByRole('button', { name: /Cartera familiar/ })
    expect(fam.textContent).toContain('Familiar')
    expect(fam.textContent).toContain('20,00')
    // las tarjetas de banco y el alta de cuenta siguen
    expect(screen.getByText('Cuenta de «Paco»')).toBeTruthy()
    expect(screen.getByText('Cuenta común')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Añadir cuenta/ })).toBeTruthy()
  })

  it('tocar una cartera abre Movimientos con ELLA (no se confunde con una cuenta bancaria); tocar una cuenta sigue llevando a Banco', async () => {
    const onSelectWallet = vi.fn()
    const onSelectAccount = vi.fn()
    render(<MemoryRouter><AccountBalanceCards onAddAccount={vi.fn()} onSelectAccount={onSelectAccount} onSelectWallet={onSelectWallet} onViewAll={vi.fn()} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /Cartera de Jennifer/ }))
    expect(onSelectWallet).toHaveBeenCalledWith('wj')
    expect(onSelectAccount).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Cuenta de «Paco»'))
    expect(onSelectAccount).toHaveBeenCalledWith('b1')
  })

  it('las carteras archivadas no salen; sin carteras la pantalla queda como antes', async () => {
    wallets = [wallet({ id: 'wa', name: 'Archivada', archivedAt: '2026-10-01T00:00:00Z' })]
    render(<MemoryRouter><AccountBalanceCards onAddAccount={vi.fn()} onSelectAccount={vi.fn()} onSelectWallet={vi.fn()} onViewAll={vi.fn()} /></MemoryRouter>)
    await screen.findByText('Cuenta de «Paco»')
    expect(screen.queryByText(/Archivada/)).toBeNull()
  })
})

describe('Tendencia del saldo con efectivo', () => {
  const chips = () => within(document.querySelector('.filter-row') as HTMLElement)

  it('«Todas» suma bancos + efectivo (900 + 3000 + 86,50 + 20) y cada cartera es un selector propio', async () => {
    render(<MemoryRouter><BalanceTrendCard /></MemoryRouter>)
    expect(await screen.findByText('4006.50 €')).toBeTruthy()
    expect(screen.getByText(/Bancos 3900.00 € \+ efectivo 106.50 €/)).toBeTruthy()
    expect(chips().getByRole('button', { name: /Cartera de Jennifer/ })).toBeTruthy()
    expect(chips().getByRole('button', { name: /Cartera familiar/ })).toBeTruthy()
    // las series de las cuentas bancarias se mantienen
    expect(chips().getByRole('button', { name: /Paco/ })).toBeTruthy()
    const labels = [...(document.querySelector('.filter-row') as HTMLElement).querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(labels.filter((t) => t?.includes('Común'))).toHaveLength(1)
  })

  it('cada cartera se consulta individualmente con su saldo y su leyenda', async () => {
    render(<MemoryRouter><BalanceTrendCard /></MemoryRouter>)
    await screen.findByText('Tendencia del saldo')
    fireEvent.click(await chips().findByRole('button', { name: /Cartera de Jennifer/ }))
    expect(await screen.findByText('86.50 €')).toBeTruthy()
    // el saldo de las cuentas del banco no se mezcla
    expect(screen.queryByText(/Bancos/)).toBeNull()
  })

  it('una cartera no tiene saldo antes de crearse: se avisa y no se inventa', async () => {
    wallets = [wallet({ id: 'wj', name: 'Cartera de Jennifer', ownerMemberId: 'jenni', openingBalance: 100, balance: 86.5, createdAt: '2026-10-24T20:00:00Z' })]
    render(<MemoryRouter><BalanceTrendCard /></MemoryRouter>)
    expect(await screen.findByText(/se dibuja desde el 24\/10\/2026/)).toBeTruthy()
  })

  it('solo con efectivo (sin banco enlazado) la tendencia también aparece', async () => {
    accounts = []
    render(<MemoryRouter><BalanceTrendCard /></MemoryRouter>)
    expect(await screen.findByText('Tendencia del saldo')).toBeTruthy()
    expect(await screen.findByText('106.50 €')).toBeTruthy()
  })

  it('sin bancos ni carteras no hay tarjeta', async () => {
    accounts = []
    wallets = []
    const { container } = render(<MemoryRouter><BalanceTrendCard /></MemoryRouter>)
    await waitFor(() => expect(container.textContent).toBe(''))
  })

  it('una retirada del banco a la cartera no cambia el total (el banco baja y el efectivo sube lo mismo)', async () => {
    // Banco: 900 hoy tras retirar 100 el 22/10; cartera: 0 + 100 el 22/10 → total 1000 antes y después.
    accounts = [bank({ id: 'b1', ownerMemberId: 'paco', balance: 900 })]
    transactions = [{ id: 't1', accountId: 'b1', entryReference: 'r', transactionDate: '2026-10-22', amount: 100, currency: 'EUR', creditDebit: 'DBIT', description: 'REINTEGRO CAJERO', matchedExpenseId: 'e' }]
    wallets = [wallet({ id: 'wj', name: 'Cartera de Jennifer', ownerMemberId: 'jenni', openingBalance: 0, balance: 100, createdAt: '2026-10-20T08:00:00Z' })]
    movements = [{ id: 'm1', walletId: 'wj', kind: 'transfer_in', amount: 100, occurredOn: '2026-10-22', note: null, transferId: null, expenseId: 'e' }]
    render(<MemoryRouter><BalanceTrendCard /></MemoryRouter>)
    expect(await screen.findByText('1000.00 €')).toBeTruthy()
  })
})
