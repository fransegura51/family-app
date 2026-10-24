// @vitest-environment jsdom
// «Añadir línea» al revisar un ticket, de verdad, en la pantalla real de Tickets (ReceiptsTab con el formulario ReceiptForm): se puede añadir lo que la
// lectura se haya dejado, corregir, quitar, comprobar importes y guardar el ticket completo de una vez. Datos simulados.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const calls = {
  uploadReceipt: vi.fn(async (..._a: unknown[]) => 'receipt-1'),
  recordProductPurchase: vi.fn(async (..._a: unknown[]) => ({ productId: `prod-${Math.random()}` })),
  deleteProductPricesByReceipt: vi.fn(async (..._a: unknown[]) => undefined),
  analyze: vi.fn(),
}
vi.mock('@/data/receipts', async (orig) => ({
  ...(await orig<typeof import('@/data/receipts')>()),
  uploadReceipt: (...a: unknown[]) => calls.uploadReceipt(...a),
  listReceipts: async () => [],
  currentProfileId: async () => null,
  listManualPurchasesWithoutTicket: async () => [],
}))
vi.mock('@/data/products', async (orig) => ({
  ...(await orig<typeof import('@/data/products')>()),
  recordProductPurchase: (...a: unknown[]) => calls.recordProductPurchase(...a),
  deleteProductPricesByReceipt: (...a: unknown[]) => calls.deleteProductPricesByReceipt(...a),
  listProducts: async () => [],
  listAllProductPrices: async () => [],
}))
vi.mock('@/services/receiptPhoto', async (orig) => ({ ...(await orig<typeof import('@/services/receiptPhoto')>()), analyzeReceiptPhoto: (...a: unknown[]) => calls.analyze(...a) }))
vi.mock('@/services/voice', async (orig) => ({ ...(await orig<typeof import('@/services/voice')>()), isSpeechSupported: () => false, isDictationSupported: () => false, primeSpeech: () => undefined }))

const { ReceiptsTab } = await import('@/ui/FinanceScreen')

beforeEach(() => {
  Object.values(calls).forEach((m) => m.mockClear())
  calls.analyze.mockReset()
})
afterEach(cleanup)

const photo = () => new File(['x'], 'ticket.jpg', { type: 'image/jpeg' })

async function openForm() {
  render(
    <MemoryRouter>
      <ReceiptsTab />
    </MemoryRouter>,
  )
  await screen.findByText('Subir ticket')
}

function chooseFile() {
  const input = document.querySelector('input[type=file]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [photo()] } })
}

const lineInputs = () => ({
  names: screen.queryAllByPlaceholderText('Producto') as HTMLInputElement[],
  qtys: screen.queryAllByPlaceholderText(/^(Cant\.|Peso)$/) as HTMLInputElement[],
  prices: screen.queryAllByPlaceholderText(/^Precio\/(ud|kg)$/) as HTMLInputElement[],
})

describe('añadir productos a mano al subir un ticket', () => {
  it('con una foto elegida y SIN leerla con la IA ya se puede añadir una línea (antes solo salía tras «Leer ticket»)', async () => {
    await openForm()
    expect(screen.queryByRole('button', { name: /Añadir productos a mano/ })).toBeNull() // sin foto todavía, nada que revisar
    chooseFile()
    fireEvent.click(await screen.findByRole('button', { name: '+ Añadir productos a mano (opcional)' }))
    expect(lineInputs().names).toHaveLength(1)
    expect(screen.getByRole('button', { name: '+ Añadir línea' })).toBeTruthy()
    expect(screen.getByText(/Productos del ticket — añade los que quieras antes de guardar/)).toBeTruthy()
  })

  it('si la lectura automática falla, se puede seguir a mano', async () => {
    calls.analyze.mockRejectedValue(new Error('IA no disponible'))
    await openForm()
    chooseFile()
    fireEvent.click(await screen.findByRole('button', { name: /Leer ticket/ }))
    await screen.findByText(/IA no disponible/)
    expect(screen.getByRole('button', { name: '+ Añadir productos a mano (opcional)' })).toBeTruthy()
  })

  it('si la lectura no reconoce ningún producto, lo dice y deja añadirlos', async () => {
    calls.analyze.mockResolvedValue({ store: 'Mercadona', date: '2026-10-20', total: 9.5, items: [] })
    await openForm()
    chooseFile()
    fireEvent.click(await screen.findByRole('button', { name: /Leer ticket/ }))
    expect(await screen.findByText(/No se ha reconocido ningún producto: añádelos con «\+ Añadir línea»/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir línea' }))
    expect(lineInputs().names).toHaveLength(1)
  })

  it('si la lectura se deja un producto, se añade a mano junto a los leídos', async () => {
    calls.analyze.mockResolvedValue({ store: 'Mercadona', date: '2026-10-20', total: 4.4, items: [{ name: 'LECHE ENTERA', quantity: 2, unit: 'ud', unitPrice: 0.85, lineTotal: 1.7 }] })
    await openForm()
    chooseFile()
    fireEvent.click(await screen.findByRole('button', { name: /Leer ticket/ }))
    await waitFor(() => expect(lineInputs().names).toHaveLength(1))
    expect(lineInputs().names[0].value).toBe('LECHE ENTERA')
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir línea' }))
    expect(lineInputs().names).toHaveLength(2)
  })

  it('corregir, añadir y quitar líneas; el resumen avisa y luego cuadra; se guarda todo con UN solo «Guardar ticket»', async () => {
    await openForm()
    chooseFile()
    fireEvent.click(await screen.findByRole('button', { name: '+ Añadir productos a mano (opcional)' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir línea' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir línea' }))
    expect(lineInputs().names).toHaveLength(3)

    const fill = (i: number, name: string, qty: string, price: string) => {
      fireEvent.change(lineInputs().names[i], { target: { value: name } })
      fireEvent.change(lineInputs().qtys[i], { target: { value: qty } })
      fireEvent.change(lineInputs().prices[i], { target: { value: price } })
    }
    fill(0, 'Leche entera', '6', '0.85') // 5,10
    fill(1, 'Arroz redondo', '2', '1.60') // 3,20
    fill(2, 'Linea equivocada', '1', '99') // se quitará

    fireEvent.change(screen.getByLabelText(/Importe total/), { target: { value: '8.30' } })
    const summary = () => screen.getByTestId('ticket-lines-summary').textContent ?? ''
    expect(summary()).toMatch(/pero el ticket pone 8,30 €: sobran 99,00 €|sobran/) // con la línea equivocada no cuadra

    // quitar la línea equivocada (✕ de la tercera tarjeta)
    const quitar = screen.getAllByRole('button', { name: '✕' })
    fireEvent.click(quitar[quitar.length - 1])
    expect(lineInputs().names).toHaveLength(2)
    expect(summary()).toMatch(/cuadra con el total del ticket \(8,30 €\)/)

    // corregir un precio mal puesto: ahora faltan 0,40 €
    fireEvent.change(lineInputs().prices[0], { target: { value: '0.78' } }) // 4,68 + 3,20 = 7,88
    expect(summary()).toMatch(/faltan 0,42 €/)
    expect(summary()).toMatch(/Puedes guardar igualmente/)
    fireEvent.change(lineInputs().prices[0], { target: { value: '0.85' } })
    expect(summary()).toMatch(/cuadra/)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar ticket' }))
    await waitFor(() => expect(calls.recordProductPurchase).toHaveBeenCalledTimes(2))
    expect(calls.uploadReceipt).toHaveBeenCalledTimes(1) // el ticket se crea UNA vez
    expect(calls.uploadReceipt.mock.calls[0][0]).toMatchObject({ totalAmount: 8.3 })
    const saved = calls.recordProductPurchase.mock.calls.map((c) => c[0] as { name: string; price: number; quantity: string; unit: string; receiptId: string })
    expect(saved.map((s) => s.name).sort()).toEqual(['Arroz redondo', 'Leche entera'])
    expect(saved.find((s) => s.name === 'Leche entera')).toMatchObject({ price: 0.85, quantity: '6', unit: 'ud', receiptId: 'receipt-1' })
    expect(saved.every((s) => s.receiptId === 'receipt-1')).toBe(true)
  })

  it('una línea sin precio válido no se guarda y el resumen lo avisa; la línea con ✕ se puede quitar', async () => {
    await openForm()
    chooseFile()
    fireEvent.click(await screen.findByRole('button', { name: '+ Añadir productos a mano (opcional)' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir línea' }))
    fireEvent.change(lineInputs().names[0], { target: { value: 'Pan' } })
    fireEvent.change(lineInputs().prices[0], { target: { value: '1.20' } })
    fireEvent.change(lineInputs().names[1], { target: { value: 'Sin precio' } })
    expect(screen.getByTestId('ticket-lines-summary').textContent).toMatch(/1 línea sin precio válido no se guardará/)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ticket' }))
    await waitFor(() => expect(calls.recordProductPurchase).toHaveBeenCalledTimes(1))
    expect((calls.recordProductPurchase.mock.calls[0][0] as { name: string }).name).toBe('Pan')
  })

  it('«Sin ticket»: el mismo editor (no hay un formulario aparte) con su botón «+ Añadir productos (opcional)»', async () => {
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: /Sin ticket/ }))
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir productos (opcional)' }))
    expect(lineInputs().names).toHaveLength(1)
    expect(within(document.body).getByRole('button', { name: '+ Añadir línea' })).toBeTruthy()
  })
})
