import { describe, expect, it } from 'vitest'
import {
  RECEIPT_PHOTO_PROMPT,
  checkReceiptTotal,
  parseReceiptPhotoOutput,
  reconcileReceiptItem,
  type ReceiptPhotoItem,
} from '../../supabase/functions/_shared/ai/purposes/receiptPhoto.ts'

// PESO-3 — Mercadona 03/10/2026: «1 RESERVA LONCHAS 25,00 6,35» (25,00 €/kg, sin línea de kg) se guardaba como 25,00 € × 1 ud.
const item = (name: string, quantity: number, unit: 'ud' | 'kg', unitPrice: number, lineTotal: number): ReceiptPhotoItem => ({ name, quantity, unit, unitPrice, lineTotal })

describe('reconcileReceiptItem — líneas vendidas por peso', () => {
  it('precio por kg sin kilos impresos: calcula el peso del importe y conserva el importe', () => {
    const r = reconcileReceiptItem(item('RESERVA LONCHAS', 1, 'ud', 25, 6.35))
    expect(r).toMatchObject({ quantity: 0.254, unit: 'kg', unitPrice: 25, lineTotal: 6.35, review: 'peso_calculado' })
    expect(r.quantity * r.unitPrice).toBeCloseTo(6.35, 2)
    expect(reconcileReceiptItem(item('RESERVA LONCHAS', 1, 'ud', 25, 6.2))).toMatchObject({ quantity: 0.248, unit: 'kg', review: 'peso_calculado' })
  })

  it('nunca toma el precio por kilo como importe de una unidad', () => {
    const r = reconcileReceiptItem(item('JAMON', 1, 'ud', 18.9, 4.2))
    expect(r.unit).toBe('kg')
    expect(r.quantity * r.unitPrice).toBeCloseTo(4.2, 1)
  })

  it('respeta la línea de peso impresa (PEPINO 1,910 kg × 1,70 = 3,25; MANZANA 0,694 × 2,00 = 1,39)', () => {
    expect(reconcileReceiptItem(item('PEPINO', 1.91, 'kg', 1.7, 3.25))).toEqual(item('PEPINO', 1.91, 'kg', 1.7, 3.25))
    expect(reconcileReceiptItem(item('MANZ. ROJA DULCE', 0.694, 'kg', 2, 1.39))).toEqual(item('MANZ. ROJA DULCE', 0.694, 'kg', 2, 1.39))
  })

  it('respeta unidades: simples, varias con precio unitario y columnas CANT/PVP/TOTAL', () => {
    for (const it of [item('PICOS', 1, 'ud', 1, 1), item('HELADO CAPUCCINO', 2, 'ud', 3.25, 6.5), item('PECHUGA PAVO', 4, 'ud', 2.5, 10), item('CERVEZA', 3, 'ud', 1.1, 3.3)]) {
      expect(reconcileReceiptItem(it)).toEqual(it)
    }
  })

  it('es ambiguo → conserva el importe impreso y marca para revisar, sin inventar cantidades', () => {
    // varias unidades que no cuadran
    expect(reconcileReceiptItem(item('QUESO', 2, 'ud', 4.95, 7))).toMatchObject({ quantity: 1, unit: 'ud', unitPrice: 7, lineTotal: 7, review: 'importe_no_cuadra' })
    // kg impreso que no cuadra
    expect(reconcileReceiptItem(item('PEPINO', 1.91, 'kg', 1.7, 9.99))).toMatchObject({ quantity: 1, unit: 'ud', lineTotal: 9.99, review: 'importe_no_cuadra' })
    // 1 ud con precio menor que el importe
    expect(reconcileReceiptItem(item('RARO', 1, 'ud', 2, 5))).toMatchObject({ quantity: 1, unit: 'ud', unitPrice: 5, review: 'importe_no_cuadra' })
  })

  it('no toca descuentos ni líneas a 0 (PARKING)', () => {
    expect(reconcileReceiptItem(item('Descuento X', 1, 'ud', -0.5, -0.5))).toEqual(item('Descuento X', 1, 'ud', -0.5, -0.5))
    expect(reconcileReceiptItem(item('PARKING', 1, 'ud', 0, 0))).toEqual(item('PARKING', 1, 'ud', 0, 0))
  })

  it('parseReceiptPhotoOutput lo aplica a lo que devuelve el modelo', () => {
    const raw = JSON.stringify({ store: 'Mercadona', date: '2026-10-03', total: 6.35, items: [{ name: 'RESERVA LONCHAS', quantity: 1, unit: 'ud', unitPrice: 25, lineTotal: 6.35 }] })
    const out = parseReceiptPhotoOutput(raw)
    expect(out.items[0]).toMatchObject({ quantity: 0.254, unit: 'kg', review: 'peso_calculado' })
  })

  it('el prompt explica el formato Cnt/P. Unit/Importe con precio por kilo', () => {
    expect(RECEIPT_PHOTO_PROMPT).toContain('P. Unit')
    expect(RECEIPT_PHOTO_PROMPT).toContain('precio por KILO')
  })
})

describe('ticket real de Mercadona 03/10/2026 completo', () => {
  // Tal como llegaba del modelo (el fallo: las dos RESERVA LONCHAS con precio 25,00 por kilo como si fuese de 1 ud).
  const raw: ReceiptPhotoItem[] = [
    item('HELADO CAPUCCINO', 2, 'ud', 3.25, 6.5), item('MINIBOMBON NOCCIOLA', 1, 'ud', 3.15, 3.15), item('MINI HELADOS', 1, 'ud', 1.8, 1.8),
    item('PICOS CAMPERO', 1, 'ud', 1, 1), item('REGAÑA', 1, 'ud', 1.05, 1.05), item('PAN DE PUEBLO', 1, 'ud', 1.6, 1.6),
    item('RESERVA LONCHAS', 1, 'ud', 25, 6.35), item('TABLA QUESO NACIONAL', 2, 'ud', 4.95, 9.9), item('TRENZA DE HOJALDRE', 1, 'ud', 6.5, 6.5),
    item('100% INTEGRAL', 2, 'ud', 0.95, 1.9), item('ATUN CLARO NATURAL', 1, 'ud', 4.2, 4.2), item('SALAMI PACK-4', 1, 'ud', 1.75, 1.75),
    item('RESERVA LONCHAS', 1, 'ud', 25, 6.2), item('PAT. CLASSICAS', 1, 'ud', 1.8, 1.8), item('QUESO GOUDA LONCHAS', 2, 'ud', 1.95, 3.9),
    item('PECHUGA PAVO RED SAL', 4, 'ud', 2.5, 10), item('LOMO ADOBADO', 1, 'ud', 3.53, 3.53), item('MAGD. PEPITAS CHOCO', 1, 'ud', 3.1, 3.1),
    item('RON VIEJO', 1, 'ud', 8.5, 8.5), item('RECAMBIO LIQUIDO INS', 3, 'ud', 1.9, 5.7), item('FILETE CABEZA LOMO', 1, 'ud', 4.18, 4.18),
    item('ACEITE GIRASOL', 2, 'ud', 1.85, 3.7), item('LOMO TACO', 1, 'ud', 8.42, 8.42), item('LONGANIZA CLASICA EX', 1, 'ud', 2.8, 2.8),
    item('CINTAS DE BACON', 1, 'ud', 1.95, 1.95), item('CHORIZO', 1, 'ud', 3.05, 3.05), item('PATATA 3 KG', 1, 'ud', 4.65, 4.65),
    item('DESATASCADOR TURBO', 1, 'ud', 1.7, 1.7), item('PEPINILLO PEQUEÑO', 1, 'ud', 1.45, 1.45), item('A.RELLENAS ANCHOA P3', 1, 'ud', 2.58, 2.58),
    item('CEBOLLA TIERNA', 1, 'ud', 1.7, 1.7), item('PEPINO', 1.91, 'kg', 1.7, 3.25), item('MANZ. ROJA DULCE', 0.694, 'kg', 2, 1.39), item('PARKING', 1, 'ud', 0, 0),
  ]

  it('la suma de los importes y la de cantidad × precio coinciden con el total real, 129,25 €', () => {
    const fixed = raw.map(reconcileReceiptItem)
    expect(checkReceiptTotal(fixed, 129.25)).toMatchObject({ linesSum: 129.25, difference: 0, matches: true })
    const sumQtyPrice = fixed.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
    expect(Math.abs(sumQtyPrice - 129.25)).toBeLessThan(0.05)
    // Sin la corrección, la suma de cantidad × precio era 166,70 € (37,45 € de más)
    expect(raw.reduce((s, it) => s + it.quantity * it.unitPrice, 0)).toBeCloseTo(166.7, 1)
    expect(fixed.filter((f) => f.review).map((f) => f.name)).toEqual(['RESERVA LONCHAS', 'RESERVA LONCHAS'])
  })
})

describe('checkReceiptTotal — con descuentos', () => {
  it('los descuentos (negativos) restan; si no cuadra lo dice', () => {
    const items = [item('A', 1, 'ud', 10, 10), item('Descuento A', 1, 'ud', -2, -2)]
    expect(checkReceiptTotal(items, 8)).toMatchObject({ linesSum: 8, matches: true })
    expect(checkReceiptTotal(items, 10)).toMatchObject({ difference: -2, matches: false })
    expect(checkReceiptTotal(items, null)).toBeNull()
  })
})
