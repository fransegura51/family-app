// @vitest-environment jsdom
// COMP-06 — compras con productos «Pendiente»: contador, vista de solo esas, línea resaltada y «Resolver» que abre el editor de ESA compra. Datos simulados.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
        if (prop === 'rpc') return () => empty()
        return () => empty()
      },
    },
  ),
}))

const receipt = (id: string, date: string) => ({ id, familyId: 'f', storagePath: 'p.jpg', store: 'Amazon', receiptDate: date, totalAmount: 20, expenseId: null, notes: null, category: 'Compras y familia', purchasedByMemberId: null, isManual: false, discountTotal: 0 })
vi.mock('@/data/receipts', async (orig) => ({
  ...(await orig<typeof import('@/data/receipts')>()),
  listReceipts: async () => [receipt('r1', '2025-03-05'), receipt('r2', '2025-03-06')],
  listPendingLineCounts: async () => new Map([['r1', 2]]),
  currentProfileId: async () => null,
  listManualPurchasesWithoutTicket: async () => [],
}))
vi.mock('@/data/products', async (orig) => ({
  ...(await orig<typeof import('@/data/products')>()),
  listProducts: async () => [],
  listAllProductPrices: async () => [],
  listProductPricesByReceipt: async () => [
    { id: 'l1', productId: 'p1', name: 'Pendiente', price: 9.99, quantity: '1', unit: null, pack: null },
    { id: 'l2', productId: 'p2', name: 'Cable Ethernet', price: 8, quantity: '1', unit: null, pack: null },
  ],
}))

const { ReceiptsTab, DiscountSavingsCard } = await import('@/ui/FinanceScreen')
afterEach(cleanup)

describe('COMP-06 · compras con productos por identificar', () => {
  it('contador, vista de solo las pendientes (de cualquier fecha), línea resaltada y «Resolver» abre el editor de esa compra', async () => {
    render(
      <MemoryRouter>
        <ReceiptsTab />
      </MemoryRouter>,
    )
    const banner = await screen.findByTestId('pending-purchases-banner')
    expect(banner.textContent).toContain('1 compra con productos por identificar')
    fireEvent.click(screen.getByTestId('toggle-pending-only'))
    // la carpeta de la tienda se abre sola y solo sale la compra con líneas pendientes
    const tag = await screen.findByTestId('receipt-pending-lines')
    expect(tag.textContent).toContain('2 productos por identificar')
    expect(screen.getAllByTestId('receipt-pending-lines')).toHaveLength(1)
    // desplegar la compra: la línea «Pendiente» tiene su atajo y la real no
    fireEvent.click(tag.closest('button') as HTMLElement)
    const resolve = await screen.findByTestId('resolve-pending-line')
    expect(screen.getAllByTestId('resolve-pending-line')).toHaveLength(1)
    fireEvent.click(resolve)
    await waitFor(() => expect(screen.queryByTestId('resolve-pending-line')).toBeNull()) // la fila pasa a ser el editor de ESA compra
    // volver a ver todas
    fireEvent.click(screen.getByTestId('toggle-pending-only'))
    expect(screen.getByTestId('toggle-pending-only').textContent).toBe('Ver solo estas compras')
  })
})

// COMP-07 — «Descuentos y ahorro»: casos reales Amazon 05/10/2026 (2,40 € · pagado 48,52 €) y BEWISHOME 22/10/2026 (9,56 € · pagado 86,02 €).
describe('COMP-07 · Descuentos y ahorro', () => {
  const r = (id: string, receiptDate: string, store: string, totalAmount: number, discountTotal: number) => ({ id, familyId: 'f', storagePath: null, store, receiptDate, totalAmount, expenseId: null, notes: null, category: 'Compras y familia', purchasedByMemberId: null, discountTotal })
  it('total del periodo, evolución mensual y cada compra con original − descuento = pagado y enlace directo', async () => {
    const onOpen = vi.fn()
    render(<DiscountSavingsCard receipts={[r('amz', '2026-10-05', 'Amazon', 48.52, 2.4), r('bew', '2026-10-22', 'BEWISHOME', 86.02, 9.56)] as never} from="2026-10-01" to="2026-10-31" onOpenReceipt={onOpen} />)
    expect(screen.getByTestId('discount-total').textContent).toContain('11,96 €')
    expect(screen.getByTestId('discount-total').textContent).toContain('2 compras')
    const list = screen.getByTestId('discount-purchases').textContent ?? ''
    expect(list).toContain('original 95,58 € − descuento 9,56 € = pagado 86,02 €')
    expect(list).toContain('original 50,92 € − descuento 2,40 € = pagado 48,52 €')
    expect(screen.getByTestId('discount-months').textContent).toContain('11,96 €')
    fireEvent.click(screen.getAllByText('Ver compra →')[0])
    expect(onOpen).toHaveBeenCalledWith('bew')
  })
  it('sin ningún descuento registrado la sección no aparece', () => {
    const { container } = render(<DiscountSavingsCard receipts={[r('x', '2026-10-05', 'Lidl', 10, 0)] as never} from="2026-10-01" to="2026-10-31" />)
    expect(container.textContent).toBe('')
  })
})
