// @vitest-environment jsdom
// Formato del envase al registrar una compra (COMP-2), en su componente real: se pregunta solo lo que sirve para comparar, lo que se sabe se aplica solo y nada bloquea.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PackFormat } from '@/domain/packFormat'
import type { Product, ProductPrice } from '@/domain/types'

const empty = (): unknown => ({
  then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
  eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty,
})
vi.mock('@/data/supabaseClient', () => ({
  supabase: new Proxy({}, { get: (_t, prop) => (prop === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : () => empty()) }),
}))

const { PackFormatsPanel } = await import('@/ui/PackFormatsPanel')

const prod = (id: string, displayName: string): Product => ({ id, displayName, normalizedName: displayName.toLowerCase() }) as unknown as Product
const price = (o: Partial<ProductPrice> & Pick<ProductPrice, 'id' | 'productId'>): ProductPrice => ({ price: 1, store: 'Mercadona', quantity: '1', unit: 'ud', recordedDate: '2026-10-01', receiptId: null, pack: null, ...o })

const products = [prod('cerveza', 'Cerveza Estrella'), prod('leche', 'Leche entera'), prod('agua', 'Agua mineral'), prod('pepino', 'Pepino')]
const prices = [
  price({ id: 'p-lidl', productId: 'cerveza', store: 'Lidl', price: 4.5, recordedDate: '2026-09-10' }), // sin formato, otra tienda
  price({ id: 'p-merc', productId: 'agua', store: 'Mercadona', price: 0.6, pack: { count: 1, amount: 1.5, unit: 'l', source: 'manual' } }),
]
const productIdFor = (name: string) => products.find((p) => p.displayName.toLowerCase() === name.toLowerCase())?.id ?? null

function setup(lines: { name: string; unit?: string; unitPrice: string; pack?: PackFormat | null }[], extra: Partial<{ onPack: (i: number, p: PackFormat | null | undefined) => void; onFixPast: (id: string, p: PackFormat) => void }> = {}) {
  const onPack = extra.onPack ?? vi.fn()
  render(
    <PackFormatsPanel
      lines={lines.map((l) => ({ quantity: '1', unit: 'ud', ...l }))}
      store="Mercadona"
      products={products}
      prices={prices}
      productIdFor={productIdFor}
      onPack={onPack}
      onFixPast={extra.onFixPast}
    />,
  )
  return { onPack }
}
afterEach(cleanup)

describe('Formato del envase en la revisión del ticket', () => {
  it('está plegado por defecto, con la explicación breve al abrirlo', () => {
    setup([{ name: 'Cerveza Estrella', unitPrice: '5.00' }])
    expect(screen.queryByText(/necesitamos saber cuánto contiene cada envase/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Comparar precios entre tiendas · 1 producto por completar/ }))
    expect(screen.getByText(/Para comparar bien los precios entre tiendas, necesitamos saber cuánto contiene cada envase\. Si lo completas ahora, PEPA lo recordará para futuras compras\./)).toBeTruthy()
  })

  it('pregunta por un producto que ya se compró en otra tienda y enseña esa compra anterior', () => {
    setup([{ name: 'Cerveza Estrella', unitPrice: '5.00' }])
    fireEvent.click(screen.getByRole('button', { name: /Comparar precios entre tiendas/ }))
    expect(screen.getByText(/Antes en Lidl \(10\/09\/2026\): 4,50 € · sin formato/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Indicar cuánto contiene' })).toBeTruthy()
  })

  it('indicar 6 × 330 ml enseña 1,98 l y 2,53 €/l antes de guardar, y entrega el formato a la línea', () => {
    const { onPack } = setup([{ name: 'Cerveza Estrella', unitPrice: '5.00' }])
    fireEvent.click(screen.getByRole('button', { name: /Comparar precios entre tiendas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Indicar cuánto contiene' }))
    fireEvent.change(screen.getByLabelText('Número de envases o unidades'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Cantidad de cada envase'), { target: { value: '330' } })
    fireEvent.change(screen.getByLabelText('Unidad del envase'), { target: { value: 'ml' } })
    expect(screen.getByText(/6 × 330 ml = 1,98 l · 2,53 €\/l/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar formato' }))
    expect(onPack).toHaveBeenCalledWith(0, { count: 6, amount: 330, unit: 'ml', source: 'manual' })
  })

  it('«Ahora no» deja la línea sin formato (null) y no bloquea nada', () => {
    const { onPack } = setup([{ name: 'Cerveza Estrella', unitPrice: '5.00' }])
    fireEvent.click(screen.getByRole('button', { name: /Comparar precios entre tiendas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onPack).toHaveBeenCalledWith(0, null)
  })

  it('un producto que solo se compró aquí no se pregunta: queda en «Completar otros productos (opcional)»', () => {
    setup([{ name: 'Leche entera', unitPrice: '1.10' }])
    fireEvent.click(screen.getByRole('button', { name: /Comparar precios entre tiendas/ }))
    expect(screen.getByText(/Nada que preguntar ahora/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Completar otros productos \(opcional, 1\)/ }))
    expect(screen.getByRole('button', { name: 'Indicar cuánto contiene' })).toBeTruthy()
  })

  it('lo que dice el nombre se reconoce solo y se cuenta, sin preguntar', () => {
    setup([{ name: 'Agua mineral 1,5 L', unitPrice: '0.60' }, { name: 'Cerveza Estrella 6x330 ml', unitPrice: '5.00' }])
    // sin productos conocidos con esos nombres: no hay historial, pero el nombre ya lo dice
    fireEvent.click(screen.getByRole('button', { name: /Comparar precios entre tiendas/ }))
    expect(screen.getByText(/2 formatos reconocidos solos/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Indicar cuánto contiene' })).toBeNull()
  })

  it('vendido por kg: no sale ni se pregunta', () => {
    setup([{ name: 'Pepino', unit: 'kg', unitPrice: '1.70' }])
    expect(screen.queryByRole('button', { name: /Comparar precios entre tiendas/ })).toBeNull()
  })

  it('si la compra de la otra tienda no tiene formato se puede indicar ahí mismo, y no se toca su precio', async () => {
    const onFixPast = vi.fn()
    setup([{ name: 'Cerveza Estrella', unitPrice: '5.00' }], { onFixPast })
    fireEvent.click(screen.getByRole('button', { name: /Comparar precios entre tiendas/ }))
    fireEvent.click(screen.getByRole('button', { name: /Indicar el formato de la compra de Lidl/ }))
    expect(screen.getByText(/¿Cuánto contenía lo que compraste en Lidl\?/)).toBeTruthy()
    const editors = screen.getAllByLabelText('Cantidad de cada envase')
    fireEvent.change(editors[editors.length - 1], { target: { value: '330' } })
    const units = screen.getAllByLabelText('Unidad del envase')
    fireEvent.change(units[units.length - 1], { target: { value: 'ml' } })
    const saves = screen.getAllByRole('button', { name: 'Guardar formato' })
    fireEvent.click(saves[saves.length - 1])
    expect(onFixPast).toHaveBeenCalledWith('p-lidl', { count: 1, amount: 330, unit: 'ml', source: 'manual' })
  })
})
