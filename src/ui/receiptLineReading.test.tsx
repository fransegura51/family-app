// @vitest-environment jsdom
// «Qué ha entendido PEPA» en Productos leídos: enseña producto, categoría, formato y lo que falta; permite confirmar o corregir el producto; y está conectado al guardado.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLine } from '@/domain/catalog/lineReading'
import { ReceiptLineReading } from '@/ui/ReceiptLineReading'

afterEach(cleanup)

const show = (name: string, onChoose = vi.fn(), extra: Parameters<typeof readLine>[0] extends infer T ? Partial<T> : never = {}) => {
  render(<ReceiptLineReading reading={readLine({ name, ...extra })} classLabel="Lácteos y huevos" onChoose={onChoose} />)
  return onChoose
}

describe('ReceiptLineReading', () => {
  it('enseña producto, categoría y formato pendiente sin inventar la capacidad', () => {
    show('LECHE SEMI P-6')
    expect(screen.getByText('Leche semidesnatada')).toBeTruthy()
    expect(screen.getByText(/Lácteos y huevos · 6 envases · capacidad pendiente/)).toBeTruthy()
    expect(screen.getByText(/Falta para comparar: indicar el formato del envase/)).toBeTruthy()
    expect(screen.getByText(/Lo entiendo/)).toBeTruthy()
  })
  it('lo ya identificado con formato sale «Listo para comparar»', () => {
    show('PATATA 5 KG')
    expect(screen.getByText('Listo para comparar')).toBeTruthy()
    expect(screen.getByText(/5 kg/)).toBeTruthy()
  })
  it('una propuesta probable pide confirmación y se confirma con un toque', () => {
    const onChoose = show('LECHE INF 2')
    expect(screen.getByText(/Confirma/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Es correcto' }))
    expect(onChoose).toHaveBeenCalledWith('inf.leche.formula')
  })
  it('lo que no reconoce lo dice y deja elegir el producto sin salir de la ficha', () => {
    const onChoose = show('XILOFON AZUL')
    expect(screen.getByText(/No lo reconozco/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir producto' }))
    fireEvent.change(screen.getByLabelText('Buscar el producto'), { target: { value: 'merluza' } })
    fireEvent.click(screen.getByRole('button', { name: /^Merluza/ }))
    expect(onChoose).toHaveBeenCalledWith('pes.merluza')
  })
  it('se puede cambiar el producto aunque esté seguro', () => {
    show('PATATA 5 KG')
    expect(screen.getByRole('button', { name: 'Cambiar producto' })).toBeTruthy()
  })
  it('sin nombre no pinta nada', () => {
    const { container } = render(<ReceiptLineReading reading={readLine({ name: '' })} classLabel="" onChoose={() => undefined} />)
    expect(container.textContent).toBe('')
  })
})

describe('conexión con la pantalla y el guardado', () => {
  const src = import.meta.glob('/src/ui/FinanceScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const text = Object.values(src)[0]
  it('cada línea de «Productos leídos» enseña la interpretación y usa el mismo normalizador', () => {
    expect(text).toContain('<ReceiptLineReading')
    expect(text).toContain('readLine({')
  })
  it('el producto confirmado o corregido se guarda con la compra y se reinicia al cambiar el nombre', () => {
    expect(text).toContain('setProductCatalogKey(productId, line.catalogProductKey)')
    expect(text).toMatch(/updateLine\(i, \{ name: e\.target\.value, classOverride: undefined, catalogProductKey: undefined \}\)/)
  })
  it('conserva el nombre original (se sigue guardando line.name) y no toca precios ni cantidades', () => {
    expect(text).toContain('name: line.name.trim(),')
    expect(text).toContain('price: Number(line.unitPrice),')
  })
  it('el componente no escribe nada por su cuenta', () => {
    const c = import.meta.glob('/src/ui/ReceiptLineReading.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    expect(Object.values(c)[0]).not.toMatch(/supabase|@\/data|\.insert\(|\.update\(|\.rpc\(/)
  })
})
