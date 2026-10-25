// @vitest-environment jsdom
// «Cuánto he gastado» (Compras registradas): el resumen principal se queda compacto y el desglose va plegado detrás de «Ver desglose».
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Receipt } from '@/domain/types'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : () => empty()) }) }))

const { ReceiptSpendSummary } = await import('@/ui/FinanceScreen')

afterEach(cleanup)
const today = new Date().toISOString().slice(0, 10)
const r = (o: Partial<Receipt> & Pick<Receipt, 'id'> & { hasTicket?: boolean }): Receipt & { hasTicket?: boolean } => ({ familyId: 'f', storagePath: 'x.jpg', store: 'Mercadona', receiptDate: today, totalAmount: 10, expenseId: `e-${o.id}`, notes: null, category: null, purchasedByMemberId: null, isManual: false, paymentMethod: null, hasTicket: true, ...o })

function renderSummary(receipts: (Receipt & { hasTicket?: boolean })[], extra: Record<string, unknown> = {}) {
  return render(
    <ReceiptSpendSummary
      receipts={receipts}
      knownStores={['Mercadona']}
      storeNames={['Mercadona']}
      preset="año"
      onPresetChange={vi.fn()}
      customFrom={today}
      onCustomFromChange={vi.fn()}
      customTo={today}
      onCustomToChange={vi.fn()}
      {...extra}
    />,
  )
}

const receipts = [
  r({ id: 't1', totalAmount: 48.75, paymentMethod: 'tarjeta' }), // ticket con foto, tarjeta
  r({ id: 't2', totalAmount: 20, storagePath: null }), // ticket cuya foto se borró, sin forma de pago
  r({ id: 'm1', totalAmount: 13.5, isManual: true, storagePath: null, paymentMethod: 'efectivo', store: 'Mercado Puesto Panadería' }), // el caso real: efectivo desde cartera
  r({ id: 'mx', totalAmount: 60, isManual: true, storagePath: null, paymentMethod: 'mixto' }), // 20 efectivo + 40 tarjeta
  r({ id: 'bank:z', totalAmount: 30, storagePath: null, hasTicket: false, expenseId: 'ez' }), // solo el cargo del banco
]
const payments = [
  { id: 'p1', receiptId: 'mx', method: 'efectivo', amount: 20, walletId: 'w1', bankTransactionId: null },
  { id: 'p2', receiptId: 'mx', method: 'tarjeta', amount: 40, walletId: null, bankTransactionId: null },
]

describe('Cuánto he gastado: resumen compacto + desglose plegado', () => {
  it('el resumen principal (total y número de compras) se ve sin abrir nada y habla de «compras»', () => {
    renderSummary(receipts, { payments })
    expect(screen.getByText(/172\.25 € · 5 compras/)).toBeTruthy()
    expect(screen.queryByText(/Por justificante/)).toBeNull() // plegado por defecto
    expect(screen.queryByText(/Por forma de pago/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Ver desglose' })).toBeTruthy()
    // los filtros de siempre siguen ahí
    expect(screen.getByText(/Tienda: Todas las tiendas/)).toBeTruthy()
  })

  it('«Ver desglose» enseña, en líneas compactas, con/sin ticket y banco/efectivo con y sin cartera', () => {
    renderSummary(receipts, { payments, cashLinkedExpenseIds: new Set(['e-m1']), expenseSource: (id: string) => (id === 'ez' ? 'banco' : null) })
    fireEvent.click(screen.getByRole('button', { name: 'Ver desglose' }))
    const proof = screen.getByText(/Por justificante:/).parentElement as HTMLElement
    expect(proof.textContent).toContain('con ticket 2 · 68.75 €')
    expect(proof.textContent).toContain('sin ticket 3 · 103.50 €')
    const pay = screen.getByText(/Por forma de pago:/).parentElement as HTMLElement
    // banco = 48,75 (tarjeta) + 40 (parte de tarjeta del mixto) + 30 (cargo solo del banco)
    expect(pay.textContent).toContain('banco 118.75 €')
    // efectivo con cartera = 13,50 (compra manual) + 20 (parte en efectivo del mixto)
    expect(pay.textContent).toContain('efectivo con cartera 33.50 €')
    expect(pay.textContent).toContain('sin cartera 0.00 €')
    // ticket suelto sin forma de pago ni banco
    expect(pay.textContent).toContain('otros / sin indicar 20.00 €')
    expect(screen.getByText(/dos formas de ver el mismo total \(172\.25 €\): no se suman entre sí/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ocultar desglose' })).toBeTruthy()
  })

  it('se vuelve a plegar y el total principal no cambia al abrir o cerrar', () => {
    renderSummary(receipts, { payments })
    fireEvent.click(screen.getByRole('button', { name: 'Ver desglose' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar desglose' }))
    expect(screen.queryByText(/Por justificante/)).toBeNull()
    expect(screen.getByText(/172\.25 € · 5 compras/)).toBeTruthy()
  })

  it('una sola compra dice «1 compra» (ya no «ticket»)', () => {
    renderSummary([r({ id: 'a', totalAmount: 5 })])
    expect(screen.getByText(/5\.00 € · 1 compra/)).toBeTruthy()
    expect(screen.queryByText(/ticket\b/i)).toBeNull()
  })
})
