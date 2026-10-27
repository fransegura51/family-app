// @vitest-environment jsdom
// Formato del envase al registrar una compra (COMP-2/COMP-3): acceso discreto en cada línea, apartado plegado, completar TODOS los artículos, fotografiar el envase y
// «Ahora no». Nada bloquea el guardado.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PackFormat } from '@/domain/packFormat'
import type { PackPhotoReading } from '@/domain/packPhoto'
import type { Product, ProductPrice } from '@/domain/types'

const empty = (): unknown => ({
  then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
  eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty,
})
vi.mock('@/data/supabaseClient', () => ({
  supabase: new Proxy({}, { get: (_t, prop) => (prop === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : () => empty()) }),
}))

const { PackFormatsPanel, LineFormatControl, PackEditor, PACK_EXPLANATION } = await import('@/ui/PackFormatsPanel')

const prod = (id: string, displayName: string): Product => ({ id, displayName, normalizedName: displayName.toLowerCase() }) as unknown as Product
const price = (o: Partial<ProductPrice> & Pick<ProductPrice, 'id' | 'productId'>): ProductPrice => ({ price: 1, store: 'Mercadona', quantity: '1', unit: 'ud', recordedDate: '2026-10-01', receiptId: null, pack: null, ...o })

const products = [prod('cerveza', 'Cerveza Estrella'), prod('leche', 'Leche entera'), prod('agua', 'Agua mineral'), prod('pepino', 'Pepino')]
const prices = [
  price({ id: 'p-lidl', productId: 'cerveza', store: 'Lidl', price: 4.5, recordedDate: '2026-09-10' }), // sin formato, otra tienda
  price({ id: 'p-merc', productId: 'agua', store: 'Mercadona', price: 0.6, pack: { count: 1, amount: 1.5, unit: 'l', source: 'manual' } }),
]
const productIdFor = (name: string) => products.find((p) => p.displayName.toLowerCase() === name.toLowerCase())?.id ?? null

function setup(lines: { name: string; unit?: string; unitPrice: string; pack?: PackFormat | null }[], extra: Partial<{ onPack: (i: number, p: PackFormat | null | undefined) => void; onFixPast: (id: string, p: PackFormat) => void; analyze: (f: File[]) => Promise<PackPhotoReading>; onReading: (i: number, r: PackPhotoReading) => void }> = {}) {
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
      analyze={extra.analyze}
      onReading={extra.onReading}
    />,
  )
  return { onPack }
}
afterEach(cleanup)

const open = () => fireEvent.click(screen.getByRole('button', { name: /Formatos del envase/ }))

describe('apartado «Formatos del envase»', () => {
  it('está plegado por defecto y al abrirlo da la explicación y deja claro que es opcional', () => {
    setup([{ name: 'Cerveza Estrella', unitPrice: '5.00' }])
    expect(screen.queryByText(new RegExp(PACK_EXPLANATION.slice(0, 30)))).toBeNull()
    expect(screen.getByRole('button', { name: /Formatos del envase · 1 sin indicar/ })).toBeTruthy()
    open()
    expect(screen.getByText(/Estos datos nos ayudan a comparar correctamente los precios entre tiendas, incluso cuando compras formatos diferentes\./)).toBeTruthy()
    expect(screen.getByText(/Es opcional/)).toBeTruthy()
  })

  it('pregunta primero por lo que ya se compró en otra tienda y enseña esa compra anterior', () => {
    setup([{ name: 'Cerveza Estrella', unitPrice: '5.00' }])
    open()
    expect(screen.getByText(/Útiles para comparar/)).toBeTruthy()
    expect(screen.getByText(/Antes en Lidl \(10\/09\/2026\): 4,50 € · sin formato/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Indicar cuánto contiene' })).toBeTruthy()
  })

  it('indicar 6 × 330 ml enseña 1,98 l y 2,53 €/l antes de guardar, y entrega el formato a la línea', () => {
    const { onPack } = setup([{ name: 'Cerveza Estrella', unitPrice: '5.00' }])
    open()
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
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onPack).toHaveBeenCalledWith(0, null)
  })

  it('lo que dice el nombre se reconoce solo y se cuenta, sin preguntar', () => {
    setup([{ name: 'Agua mineral 1,5 L', unitPrice: '0.60' }, { name: 'Cerveza Estrella 6x330 ml', unitPrice: '5.00' }])
    open()
    expect(screen.getByText(/2 formatos reconocidos solos/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Indicar cuánto contiene' })).toBeNull()
  })

  it('vendido por kg: no sale ni se pregunta', () => {
    setup([{ name: 'Pepino', unit: 'kg', unitPrice: '1.70' }])
    expect(screen.queryByRole('button', { name: /Formatos del envase/ })).toBeNull()
  })

  it('si la compra de la otra tienda no tiene formato se puede indicar ahí mismo, sin tocar su precio', () => {
    const onFixPast = vi.fn()
    setup([{ name: 'Cerveza Estrella', unitPrice: '5.00' }], { onFixPast })
    open()
    fireEvent.click(screen.getByRole('button', { name: /Indicar el formato de la compra de Lidl/ }))
    expect(screen.getByText(/¿Cuánto contenía lo que compraste en Lidl\?/)).toBeTruthy()
    const amounts = screen.getAllByLabelText('Cantidad de cada envase')
    fireEvent.change(amounts[amounts.length - 1], { target: { value: '330' } })
    const units = screen.getAllByLabelText('Unidad del envase')
    fireEvent.change(units[units.length - 1], { target: { value: 'ml' } })
    const saves = screen.getAllByRole('button', { name: 'Guardar formato' })
    fireEvent.click(saves[saves.length - 1])
    expect(onFixPast).toHaveBeenCalledWith('p-lidl', { count: 1, amount: 330, unit: 'ml', source: 'manual' })
    expect(screen.queryByLabelText('Fotos del envase')).toBeNull() // el formato de una compra antigua no se lee de una foto de hoy
  })
})

describe('«Completar formatos de todos los artículos»', () => {
  const lines = [
    { name: 'Cerveza Estrella', unitPrice: '5.00' },
    { name: 'Leche entera', unitPrice: '1.10' },
    { name: 'Agua mineral 1,5 L', unitPrice: '0.60' },
  ]
  it('lista TODOS los artículos del ticket, también los que PEPA no considera prioritarios, sin abrir una ficha', () => {
    setup(lines)
    open()
    expect(screen.queryByText('Leche entera')).toBeNull() // no desplegado por defecto
    fireEvent.click(screen.getByRole('button', { name: /Completar formatos de todos los artículos/ }))
    expect(screen.getByText('Leche entera')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Indicar formato' }).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/✓ 1,5 l · cambiar/)).toBeTruthy() // el que el nombre ya dice sale hecho
  })
  it('se puede completar uno, varios o ninguno; el resto se guarda igual', () => {
    const { onPack } = setup(lines)
    open()
    fireEvent.click(screen.getByRole('button', { name: /Completar formatos de todos los artículos/ }))
    const leche = screen.getByText('Leche entera').closest('[data-help-id="shopping.pack-all-row"]') as HTMLElement
    fireEvent.click(leche.querySelector('button.link-button') as HTMLElement)
    fireEvent.change(screen.getByLabelText('Cantidad de cada envase'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Unidad del envase'), { target: { value: 'l' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar formato' }))
    expect(onPack).toHaveBeenCalledTimes(1)
    expect(onPack).toHaveBeenCalledWith(1, { count: 1, amount: 1, unit: 'l', source: 'manual' })
    expect(screen.getByText(/Los que no completes se guardan igual, sin formato/)).toBeTruthy()
  })
})

describe('acceso discreto en cada línea del ticket', () => {
  const noHistory: [] = []
  it('sin formato conocido ofrece «Formato del envase»; con uno reconocido lo enseña con ✓', () => {
    const { unmount } = render(<LineFormatControl line={{ name: 'Leche entera', unit: 'ud', unitPrice: '1.10', quantity: '1' }} history={noHistory} onPack={() => undefined} />)
    expect(screen.getByRole('button', { name: /📏 Formato del envase/ })).toBeTruthy()
    unmount()
    render(<LineFormatControl line={{ name: 'Leche entera 1 L', unit: 'ud', unitPrice: '1.10', quantity: '1' }} history={noHistory} onPack={() => undefined} />)
    expect(screen.getByRole('button', { name: /📏 1 l ✓/ })).toBeTruthy()
  })
  it('un producto por kg no lo ofrece', () => {
    render(<LineFormatControl line={{ name: 'Pepino', unit: 'kg', unitPrice: '1.70', quantity: '1' }} history={noHistory} onPack={() => undefined} />)
    expect(screen.queryByRole('button', { name: /Formato del envase/ })).toBeNull()
  })
  it('con una compra anterior propone el mismo formato y pide confirmarlo', () => {
    const onPack = vi.fn()
    render(<LineFormatControl line={{ name: 'Cerveza Estrella', unit: 'ud', unitPrice: '5.00', quantity: '1' }} history={[{ price: 4.95, pack: { count: 6, amount: 330, unit: 'ml', source: 'manual' }, recordedDate: '2026-09-01' }]} onPack={onPack} />)
    fireEvent.click(screen.getByRole('button', { name: /Formato del envase/ }))
    expect(screen.getByText(/La última vez indicaste 6 × 330 ml = 1,98 l\. ¿Es el mismo\?/)).toBeTruthy()
    expect((screen.getByLabelText('Cantidad de cada envase') as HTMLInputElement).value).toBe('330')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar formato' }))
    expect(onPack).toHaveBeenCalledWith({ count: 6, amount: 330, unit: 'ml', source: 'manual' })
  })
  it('«Ahora no» y «Quitar lo indicado» funcionan, y la compra se guarda igual', () => {
    const onPack = vi.fn()
    render(<LineFormatControl line={{ name: 'Leche entera', unit: 'ud', unitPrice: '1.10', quantity: '1', pack: { count: 1, amount: 1, unit: 'l', source: 'manual' } }} history={noHistory} onPack={onPack} />)
    fireEvent.click(screen.getByRole('button', { name: /📏 1 l/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar lo indicado' }))
    expect(onPack).toHaveBeenCalledWith(undefined)
  })
})

describe('etiquetas del formulario y selector de fotos compartido', () => {
  it('los tres controles llevan etiqueta visible', () => {
    render(<PackEditor price={4.95} onSave={() => undefined} />)
    expect(screen.getByText('N.º de envases')).toBeTruthy()
    expect(screen.getByText('Cantidad por envase')).toBeTruthy()
    expect(screen.getByText('Unidad de medida')).toBeTruthy()
  })
  it('«Fotografiar envase» abre el mismo selector que los tickets: cámara, galería y archivos', () => {
    render(<PackEditor price={4.95} onSave={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Fotografiar envase/ }))
    expect(screen.getByRole('button', { name: /Hacer foto/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Elegir de la galería/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Elegir archivo/ })).toBeTruthy()
  })
  it('con una foto espera a «Leer envase» (por si se añade la etiqueta); la cámara usa capture', () => {
    const analyze = vi.fn(async () => ({ name: null, brand: null, count: null, amount: null, unit: null, presentation: null, ean: null, confidence: 'baja' as const, notes: null }))
    render(<PackEditor price={4.95} analyze={analyze} onSave={() => undefined} />)
    expect(screen.getByLabelText('Hacer foto del envase').getAttribute('capture')).toBe('environment')
    fireEvent.change(screen.getByLabelText('Hacer foto del envase'), { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
    expect(analyze).not.toHaveBeenCalled()
    expect(screen.getByText(/1 foto lista/)).toBeTruthy()
  })
})

describe('Fotografiar envase', () => {
  const reading = (o: Partial<PackPhotoReading> = {}): PackPhotoReading => ({ name: 'Cerveza Lager', brand: 'Estrella', count: 6, amount: 330, unit: 'ml', presentation: null, ean: '8410000000009', confidence: 'alta', notes: null, ...o })
  const choose = (analyze: (f: File[]) => Promise<PackPhotoReading>, onReading?: (r: PackPhotoReading) => void) => {
    render(<PackEditor price={4.95} analyze={analyze} onReading={onReading} onSave={() => undefined} />)
    const input = screen.getByLabelText('Fotos del envase') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'frontal.jpg', { type: 'image/jpeg' }), new File(['y'], 'etiqueta.jpg', { type: 'image/jpeg' })] } })
  }
  it('con una lectura fiable rellena el formato, pero no guarda nada hasta pulsar «Guardar formato»', async () => {
    const onSave = vi.fn()
    const analyze = vi.fn(async () => reading())
    render(<PackEditor price={4.95} analyze={analyze} onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('Fotos del envase'), { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Leer envase' })) // con una sola foto se espera por si se añade otra
    expect(await screen.findByText(/Detectado en «Cerveza Lager»: 6 × 330 ml\. Comprueba y pulsa «Guardar formato»/)).toBeTruthy()
    expect((screen.getByLabelText('Cantidad de cada envase') as HTMLInputElement).value).toBe('330')
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar formato' }))
    expect(onSave).toHaveBeenCalledWith({ count: 6, amount: 330, unit: 'ml', source: 'manual' })
  })
  it('se pueden mandar varias fotos (frontal y etiqueta) en una sola lectura', async () => {
    const analyze = vi.fn(async (_f: File[]) => reading())
    choose(analyze)
    await waitFor(() => expect(analyze).toHaveBeenCalled())
    expect(analyze.mock.calls[0][0]).toHaveLength(2)
  })
  it('una lectura dudosa no rellena nada y lo dice; se puede escribir a mano', async () => {
    choose(async () => reading({ confidence: 'baja', notes: 'imagen borrosa' }))
    expect(await screen.findByText(/No se ha podido leer con seguridad \(imagen borrosa\)/)).toBeTruthy()
    expect((screen.getByLabelText('Cantidad de cada envase') as HTMLInputElement).value).toBe('')
  })
  it('si el servicio falla o no está disponible, avisa sin romper nada', async () => {
    choose(async () => {
      throw new Error('Leer envases con una foto todavía no está disponible. Escribe el formato a mano.')
    })
    expect(await screen.findByText(/todavía no está disponible/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guardar formato' })).toBeTruthy()
  })
  it('el código de barras y el nombre leídos se entregan solo como ayuda', async () => {
    const onReading = vi.fn()
    choose(async () => reading(), onReading)
    await waitFor(() => expect(onReading).toHaveBeenCalledWith(expect.objectContaining({ ean: '8410000000009', brand: 'Estrella' })))
  })
  it('avisa de que las fotos no se guardan', () => {
    render(<PackEditor price={1} onSave={() => undefined} />)
    expect(screen.getByText(/hasta 3 fotos \(frontal y etiqueta\); no se guardan/)).toBeTruthy()
  })
})
