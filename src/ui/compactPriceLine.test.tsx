// @vitest-environment jsdom
// Comparación visible en el listado y vista general de diferencias (COMP-2): compacta, con fechas y sin vender ofertas actuales.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CompactComparison } from '@/domain/priceComparison'

const empty = (): unknown => ({
  then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
  eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty,
})
vi.mock('@/data/supabaseClient', () => ({
  supabase: new Proxy({}, { get: (_t, prop) => (prop === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : () => empty()) }),
}))

const { CompactPriceLine } = await import('@/ui/PriceComparisonPanels')
afterEach(cleanup)

const pepino: CompactComparison = { basis: 'kg', last: { store: 'Mercado', value: 2, date: '2026-10-22' }, best: { store: 'Mercadona', value: 1.7, date: '2026-10-03' }, pctLess: 15, lastIsCheapest: false, stores: 2 }
const agua: CompactComparison = { basis: 'l', last: { store: 'Lidl', value: 0.3, date: '2026-10-20' }, best: null, pctLess: null, lastIsCheapest: true, stores: 2 }

describe('línea compacta bajo el producto', () => {
  it('el ejemplo del encargo: última compra y dónde se pagó menos, con fechas', () => {
    render(<CompactPriceLine cmp={pepino} />)
    expect(screen.getByText(/Mercado · última compra \(22\/10\)/)).toBeTruthy()
    expect(screen.getByText(/Mercadona: 1,70 €\/kg — 15 % menos \(03\/10\)/)).toBeTruthy()
  })
  it('si lo último ya fue lo más barato lo dice sin inventar otra tienda', () => {
    render(<CompactPriceLine cmp={agua} />)
    expect(screen.getByText(/Lo más barato que habéis pagado/)).toBeTruthy()
    expect(screen.queryByText(/% menos/)).toBeNull()
  })
})
