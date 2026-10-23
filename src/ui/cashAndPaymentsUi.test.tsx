// @vitest-environment jsdom
// Pantallas de efectivo, pagos mixtos, devoluciones y duplicados (datos de mentira; el servidor real se probó aparte, ver PEPA_CONTROL_REQUISITOS.md).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CashWallet } from '@/domain/cashWallet'
import { shortfallNotice } from '@/domain/cashWallet'
import type { PaymentLeg } from '@/domain/purchasePayments'
import { refundSummary } from '@/domain/purchaseRefunds'
import type { Expense } from '@/domain/types'

const calls = {
  registerPurchaseRefund: vi.fn(async (..._a: unknown[]) => undefined),
  linkPurchaseToBank: vi.fn(async (..._a: unknown[]) => undefined),
  dismissDuplicate: vi.fn(async (..._a: unknown[]) => undefined),
  deleteExpense: vi.fn(async (..._a: unknown[]) => undefined),
  createWallet: vi.fn(async (..._a: unknown[]) => undefined),
  transferCash: vi.fn(async (..._a: unknown[]) => undefined),
  linkBank: vi.fn(async (..._a: unknown[]) => undefined),
}
let walletRows: CashWallet[] = []

vi.mock('@/data/cash', () => ({
  addMovement: vi.fn(async () => undefined),
  archiveWallet: vi.fn(async () => undefined),
  cashErrorText: (_e: unknown, fallback: string) => fallback,
  createWallet: (...a: unknown[]) => calls.createWallet(...a),
  deleteMovement: vi.fn(async () => undefined),
  dismissDuplicate: (...a: unknown[]) => calls.dismissDuplicate(...a),
  linkBankExpenseToWallet: (...a: unknown[]) => calls.linkBank(...a),
  linkPurchaseToBank: (...a: unknown[]) => calls.linkPurchaseToBank(...a),
  listDuplicateDecisions: async () => [],
  listMovements: async () => [],
  listWallets: async () => walletRows,
  registerPurchaseRefund: (...a: unknown[]) => calls.registerPurchaseRefund(...a),
  transferCash: (...a: unknown[]) => calls.transferCash(...a),
  unlinkBankMovement: vi.fn(async () => undefined),
}))
vi.mock('@/data/finance', () => ({ deleteExpense: (...a: unknown[]) => calls.deleteExpense(...a) }))

const { PaymentSection, ShortfallDialog, RefundPanel, CashWalletsSection, PurchaseDuplicatesPanel } = await import('@/ui/CashAndPaymentsUi')

const wallet = (o: Partial<CashWallet> = {}): CashWallet => ({ id: 'w1', name: 'Cartera familiar', ownerMemberId: null, openingBalance: 0, archivedAt: null, balance: 0, ...o })
const expense = (o: Partial<Expense>): Expense => ({ id: 'x', familyId: 'f', expenseDate: '2026-10-20', amount: 8, category: null, store: 'Panadería', kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'manual', isFixedOverride: null, ownerMemberId: null, shared: false, sharedFromExpenseId: null, productClassification: null, ...o } as Expense)

beforeEach(() => {
  Object.values(calls).forEach((m) => m.mockClear())
  walletRows = []
})
afterEach(cleanup)

function PaymentHarness({ total = 60, wallets = [] as CashWallet[] }) {
  const [method, setMethod] = useState('efectivo')
  const [walletId, setWalletId] = useState('')
  const [legs, setLegs] = useState<PaymentLeg[] | null>(null)
  return (
    <div>
      <PaymentSection total={total} method={method} onMethod={setMethod} walletId={walletId} onWallet={setWalletId} legs={legs} onLegs={setLegs} wallets={wallets} />
      <output data-testid="state">{JSON.stringify({ method, walletId, legs })}</output>
    </div>
  )
}
const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}')

describe('forma de pago', () => {
  it('«Panadería — 8 € — Efectivo» sin cartera: solo hay que elegir efectivo, sin selector de cartera', () => {
    render(<PaymentHarness total={8} />)
    expect(screen.queryByLabelText('Cartera de efectivo')).toBeNull()
    expect(state().method).toBe('efectivo')
  })
  it('con carteras, el efectivo ofrece «Sin cartera» y las carteras con su saldo', () => {
    render(<PaymentHarness wallets={[wallet({ balance: 25 }), wallet({ id: 'w2', name: 'Mi cartera', ownerMemberId: 'm1', balance: -5 })]} />)
    const select = screen.getByLabelText('Cartera de efectivo') as HTMLSelectElement
    expect([...select.options].map((o) => o.text)).toEqual(['Sin cartera', 'Cartera familiar (25,00 €)', 'Mi cartera (-5,00 € por regularizar)'])
    fireEvent.change(select, { target: { value: 'w2' } })
    expect(state().walletId).toBe('w2')
  })
  it('pagar con varios medios reparte el total y avisa de lo que falta o cuadra', () => {
    render(<PaymentHarness total={60} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Pagar con varios medios' }))
    expect(state().legs.map((l: PaymentLeg) => [l.method, l.amount])).toEqual([['efectivo', '30'], ['tarjeta', '30']])
    expect(screen.getByText(/Cuadra con el total/)).toBeTruthy()
    fireEvent.change(screen.getAllByLabelText('Importe del pago')[0], { target: { value: '20' } })
    expect(screen.getByText(/Faltan 10,00 € por repartir/)).toBeTruthy()
    expect(screen.getByText(/el gasto sigue siendo uno solo \(60,00 €\)/)).toBeTruthy()
  })
  it('se puede volver a un solo medio', () => {
    render(<PaymentHarness total={60} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Pagar con varios medios' }))
    fireEvent.click(screen.getByRole('button', { name: 'Un solo medio' }))
    expect(state().legs).toBeNull()
  })
  it('un pago que no es efectivo pierde la cartera', () => {
    render(<PaymentHarness total={60} wallets={[wallet()]} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Pagar con varios medios' }))
    fireEvent.change(screen.getAllByLabelText('Cartera de efectivo')[0], { target: { value: 'w1' } })
    fireEvent.change(screen.getAllByLabelText('Medio de pago')[0], { target: { value: 'tarjeta' } })
    expect(state().legs[0].walletId).toBe('')
  })
})

describe('aviso de saldo insuficiente', () => {
  const notice = shortfallNotice(0, 25)!
  it('muestra el texto del encargo y permite registrar igualmente, sin bloquear', () => {
    const onChoose = vi.fn()
    render(<ShortfallDialog notice={notice} walletName="Mi cartera" onChoose={onChoose} onAddCash={vi.fn()} />)
    expect(screen.getByText('Tu cartera tiene 0,00 € y estás registrando un gasto de 25,00 €. ¿Quieres continuar?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar igualmente' }))
    expect(onChoose).toHaveBeenCalledWith('continue')
  })
  it('cancelar', () => {
    const onChoose = vi.fn()
    render(<ShortfallDialog notice={notice} walletName="x" onChoose={onChoose} onAddCash={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onChoose).toHaveBeenCalledWith('cancel')
  })
  it('añadir efectivo propone lo que falta y continúa con ese importe', () => {
    const onAdd = vi.fn()
    render(<ShortfallDialog notice={notice} walletName="x" onChoose={vi.fn()} onAddCash={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: 'Añadir efectivo' }))
    expect((screen.getByLabelText(/¿Cuánto efectivo añades/) as HTMLInputElement).value).toBe('25')
    fireEvent.click(screen.getByRole('button', { name: 'Añadir y continuar' }))
    expect(onAdd).toHaveBeenCalledWith(25)
  })
})

describe('devolución de una compra', () => {
  it('propone lo que queda, registra la devolución y explica que no cuenta como ingreso', async () => {
    const onDone = vi.fn()
    render(<RefundPanel receiptId="r1" summary={refundSummary(60, [{ amount: 15 }])} purchaseStore="Ferretería" wallets={[]} onDone={onDone} onCancel={vi.fn()} />)
    expect((screen.getByLabelText(/Importe devuelto/) as HTMLInputElement).value).toBe('45')
    expect(screen.getByText(/No cuenta como ingreso/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar devolución' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls.registerPurchaseRefund).toHaveBeenCalledWith(expect.objectContaining({ receiptId: 'r1', amount: 45, destination: 'tarjeta', walletId: null }))
  })
  it('no deja devolver más de lo que queda', async () => {
    render(<RefundPanel receiptId="r1" summary={refundSummary(60, [{ amount: 15 }])} purchaseStore={null} wallets={[]} onDone={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Importe devuelto/), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar devolución' }))
    expect(await screen.findByText(/Solo quedan 45,00 € por devolver/)).toBeTruthy()
    expect(calls.registerPurchaseRefund).not.toHaveBeenCalled()
  })
  it('una devolución en efectivo puede entrar en una cartera', async () => {
    render(<RefundPanel receiptId="r1" summary={refundSummary(20, [])} purchaseStore={null} wallets={[wallet()]} onDone={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/¿Cómo te lo han devuelto/), { target: { value: 'efectivo' } })
    fireEvent.change(screen.getByLabelText('Cartera donde entra'), { target: { value: 'w1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar devolución' }))
    await waitFor(() => expect(calls.registerPurchaseRefund).toHaveBeenCalledWith(expect.objectContaining({ destination: 'efectivo', walletId: 'w1' })))
  })
})

describe('carteras (opcionales)', () => {
  it('está plegado y avisa de que el efectivo se puede apuntar sin cartera', async () => {
    render(<CashWalletsSection members={[]} myMemberId={null} bankExpenses={[]} />)
    expect(screen.queryByText(/sin tener ninguna cartera/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Efectivo \(opcional\)/ }))
    expect(await screen.findByText(/sin tener ninguna cartera/)).toBeTruthy()
    expect(await screen.findByText('Todavía no hay carteras.')).toBeTruthy()
  })
  it('un saldo negativo se muestra «por regularizar»', async () => {
    walletRows = [wallet({ balance: -75 })]
    render(<CashWalletsSection members={[]} myMemberId={null} bankExpenses={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Efectivo \(opcional\)/ }))
    expect(await screen.findByText(/por regularizar/)).toBeTruthy()
  })
  it('crear una cartera familiar con saldo inicial', async () => {
    render(<CashWalletsSection members={[]} myMemberId={null} bankExpenses={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Efectivo \(opcional\)/ }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Añadir cartera' }))
    fireEvent.change(screen.getByLabelText(/Saldo inicial/), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cartera' }))
    await waitFor(() => expect(calls.createWallet).toHaveBeenCalledWith({ name: 'Cartera familiar', ownerMemberId: null, openingBalance: 30 }))
  })
  it('un traspaso entre carteras avisa de que no es ingreso ni gasto', async () => {
    walletRows = [wallet({ balance: 25 }), wallet({ id: 'w2', name: 'Caja', balance: 0 })]
    render(<CashWalletsSection members={[]} myMemberId={null} bankExpenses={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Efectivo \(opcional\)/ }))
    fireEvent.click(await screen.findByText('Cartera familiar'))
    fireEvent.click(await screen.findByRole('button', { name: '⇄ Traspaso' }))
    expect(screen.getByText(/no es ingreso ni gasto/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Importe/), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Cartera de destino'), { target: { value: 'w2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(calls.transferCash).toHaveBeenCalledWith(expect.objectContaining({ from: 'w1', to: 'w2', amount: 10 })))
  })
  it('la retirada del banco solo ofrece movimientos del banco aún sin vincular', async () => {
    walletRows = [wallet()]
    const bank = [expense({ id: 'b1', source: 'banco', amount: 100, store: 'CAJERO' }), expense({ id: 'm1', source: 'manual', amount: 8 })]
    render(<CashWalletsSection members={[]} myMemberId={null} bankExpenses={bank} />)
    fireEvent.click(screen.getByRole('button', { name: /Efectivo \(opcional\)/ }))
    fireEvent.click(await screen.findByText('Cartera familiar'))
    fireEvent.click(await screen.findByRole('button', { name: '🏦 Retirada del banco' }))
    const options = [...(screen.getByLabelText('Movimiento del banco') as HTMLSelectElement).options].map((o) => o.value)
    expect(options).toEqual(['', 'b1'])
    expect(screen.getByText(/deja de contar como gasto o ingreso/)).toBeTruthy()
  })
  it('la cartera personal de otra persona se puede ver pero no tocar', async () => {
    walletRows = [wallet({ id: 'w9', name: 'Cartera de Ana', ownerMemberId: 'ana', balance: 5 })]
    render(<CashWalletsSection members={[]} myMemberId="yo" bankExpenses={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Efectivo \(opcional\)/ }))
    fireEvent.click(await screen.findByText('Cartera de Ana'))
    expect(await screen.findByText(/solo puedes verla/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '＋ Entrada' })).toBeNull()
  })
})

describe('duplicados y pagos por vincular', () => {
  it('sin sugerencias no se muestra nada', () => {
    const { container } = render(<PurchaseDuplicatesPanel expenses={[expense({ id: 'a' })]} purchaseExpenseIds={new Set()} cashLinkedExpenseIds={new Set()} onChanged={vi.fn()} />)
    expect(container.textContent).toBe('')
  })
  it('compra con tarjeta y su cargo bancario: se ofrece vincular y se hace solo al aceptar', async () => {
    const onChanged = vi.fn()
    render(
      <PurchaseDuplicatesPanel
        expenses={[expense({ id: 'a', paymentMethod: 'tarjeta' }), expense({ id: 'b', source: 'banco', store: 'PANADERIA', expenseDate: '2026-10-21' })]}
        purchaseExpenseIds={new Set(['a'])}
        cashLinkedExpenseIds={new Set()}
        onChanged={onChanged}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: /posible duplicado o pago por vincular/ }))
    expect(screen.getByText(/Nada se une ni se borra solo/)).toBeTruthy()
    expect(calls.linkPurchaseToBank).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, vincular (un solo gasto)' }))
    await waitFor(() => expect(calls.linkPurchaseToBank).toHaveBeenCalledWith('a', 'b'))
    expect(onChanged).toHaveBeenCalled()
  })
  it('en efectivo no se ofrece unir con el banco', async () => {
    const { container } = render(
      <PurchaseDuplicatesPanel
        expenses={[expense({ id: 'a', paymentMethod: 'efectivo' }), expense({ id: 'b', source: 'banco' })]}
        purchaseExpenseIds={new Set(['a'])}
        cashLinkedExpenseIds={new Set()}
        onChanged={vi.fn()}
      />,
    )
    await waitFor(() => expect(container.textContent).toBe(''))
  })
  it('«No, son distintas» se recuerda; quitar el que sobra pide confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<PurchaseDuplicatesPanel expenses={[expense({ id: 'a' }), expense({ id: 'b' })]} purchaseExpenseIds={new Set(['a'])} cashLinkedExpenseIds={new Set()} onChanged={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /posible duplicado/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, quitar el que sobra' }))
    expect(calls.deleteExpense).not.toHaveBeenCalled() // el primer confirm dijo que no
    fireEvent.click(screen.getByRole('button', { name: 'Sí, quitar el que sobra' }))
    await waitFor(() => expect(calls.deleteExpense).toHaveBeenCalledWith('b'))
    fireEvent.click(screen.getByRole('button', { name: 'No, son distintas' }))
    await waitFor(() => expect(calls.dismissDuplicate).toHaveBeenCalledWith('a', 'b'))
  })
})
