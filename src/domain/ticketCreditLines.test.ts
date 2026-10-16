// Líneas de ticket con precio negativo (abono, descuento): no se guardan en el historial de precios (bug real, 16/10/2026).
import { describe, expect, it } from 'vitest'
import { isCreditLine, partitionCreditLines } from '@/domain/ticketCreditLines'
import screen from '@/ui/FinanceScreen.tsx?raw'
import products from '@/data/products.ts?raw'
import help from '@/ui/AyudaScreen.tsx?raw'

describe('isCreditLine', () => {
  it('un importe negativo (abono, descuento) es una línea de abono; cero y positivos no', () => {
    expect(isCreditLine(-6.75)).toBe(true)
    expect(isCreditLine(-0.01)).toBe(true)
    expect(isCreditLine(0)).toBe(false)
    expect(isCreditLine(1042.55)).toBe(false)
  })

  it('un valor que no es un número no cuenta como abono (eso lo valida el formulario)', () => {
    expect(isCreditLine(Number.NaN)).toBe(false)
    expect(isCreditLine(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('partitionCreditLines', () => {
  it('el ticket del caso real: dos compras se guardan y «Abono de portes» (−6,75) se aparta', () => {
    const lines = [
      { name: 'PcCom Ready AMD Ryzen', unitPrice: 1042.55 },
      { name: 'Canon Digital 110389', unitPrice: 6.45 },
      { name: 'Abono de portes', unitPrice: -6.75 },
    ]
    const { kept, credits } = partitionCreditLines(lines)
    expect(kept.map((l) => l.name)).toEqual(['PcCom Ready AMD Ryzen', 'Canon Digital 110389'])
    expect(credits.map((l) => l.name)).toEqual(['Abono de portes'])
  })

  it('conserva el orden y no pierde ninguna línea; sin abonos devuelve todo igual', () => {
    const lines = [
      { name: 'a', unitPrice: 1 },
      { name: 'b', unitPrice: 0 },
    ]
    const { kept, credits } = partitionCreditLines(lines)
    expect(kept).toEqual(lines)
    expect(credits).toEqual([])
  })

  it('es idempotente: volver a separar lo ya separado no cambia nada', () => {
    const once = partitionCreditLines([
      { name: 'a', unitPrice: 2 },
      { name: 'b', unitPrice: -1 },
    ])
    expect(partitionCreditLines(once.kept).credits).toEqual([])
  })
})

describe('la pantalla de tickets no deja que un abono rompa el guardado', () => {
  it('al leer la foto aparta los abonos y los avisa como líneas omitidas', () => {
    expect(screen).toContain('partitionCreditLines(productLines)')
    expect(screen).toContain('...credits.map((c) => c.name.trim())')
  })

  it('al guardar ignora cualquier línea con precio negativo (también las escritas o editadas a mano)', () => {
    expect(screen).toContain('!isCreditLine(Number(line.unitPrice))')
  })

  it('avisa en la revisión de las líneas negativas y la ayuda lo explica', () => {
    expect(screen).toContain('Hay líneas con importe negativo (un abono, un descuento)')
    expect(help).toContain('importe NEGATIVO')
  })

  it('la base de datos sigue exigiendo precio ≥ 0 (no se ha tocado) y la compra de un producto sigue siendo el único camino que crea precios', () => {
    expect(products).toContain('export async function recordProductPurchase')
    expect(products).toContain("from('product_prices').insert")
  })

  it('si el ticket ya se subió y falla el guardado de líneas, reintentar no lo sube otra vez', () => {
    expect(screen).toContain('uploadedReceiptId.current = receiptId')
    expect(screen).toContain('let receiptId = uploadedReceiptId.current')
  })

  it('«Subir ticket» tiene Cancelar cuando ya hay foto o líneas leídas: deja el formulario como nuevo, sin guardar nada', () => {
    expect(screen).toContain('function resetAddForm()')
    expect(screen).toContain("{mode === 'add' && (file || lines.length > 0) && (")
    expect(screen).toContain('onClick={resetAddForm}')
  })
})
