import { describe, expect, it } from 'vitest'
import { isSavableLine, lineAmount, summarizeTicketLines, summaryMessage, type SummaryLine } from './ticketLinesSummary'

const L = (name: string, quantity: string, unitPrice: string): SummaryLine => ({ name, quantity, unitPrice })

describe('importe de una línea', () => {
  it('cantidad × precio, con coma decimal y redondeo a céntimos', () => {
    expect(lineAmount(L('Leche', '6', '0,85'))).toBe(5.1)
    expect(lineAmount(L('Pepino', '1,554', '1,70'))).toBe(2.64)
  })
  it('sin cantidad vale 1; sin precio, precio negativo o cantidad no válida → null', () => {
    expect(lineAmount(L('x', '', '2'))).toBe(2)
    expect(lineAmount(L('x', '1', ''))).toBeNull()
    expect(lineAmount(L('x', '1', '-3'))).toBeNull()
    expect(lineAmount(L('x', '0', '3'))).toBeNull()
    expect(lineAmount(L('x', 'abc', '3'))).toBeNull()
  })
})

describe('comprobación de importes antes de guardar', () => {
  const lines = [L('Leche', '6', '0,85'), L('Arroz', '2', '1,60'), L('Pan', '1', '1,20')] // 5,10 + 3,20 + 1,20 = 9,50

  it('si las líneas suman el total del ticket, cuadra', () => {
    const s = summarizeTicketLines(lines, '9,50', 0)
    expect(s).toMatchObject({ counted: 3, ignored: 0, linesTotal: 9.5, expectedTotal: 9.5, difference: 0, matches: true })
    expect(summaryMessage(s)).toMatchObject({ tone: 'ok' })
    expect(summaryMessage(s)?.text).toMatch(/cuadra con el total del ticket/)
  })

  it('una diferencia de 1-2 céntimos (redondeo) se tolera', () => {
    expect(summarizeTicketLines(lines, '9,51', 0).matches).toBe(true)
    expect(summarizeTicketLines(lines, '9,53', 0).matches).toBe(false)
  })

  it('falta una línea (el total es mayor que la suma): avisa de cuánto falta y deja guardar', () => {
    const s = summarizeTicketLines(lines, '12,70', 0)
    expect(s).toMatchObject({ difference: 3.2, matches: false })
    const m = summaryMessage(s)
    expect(m?.tone).toBe('warn')
    expect(m?.text).toMatch(/faltan 3,20 €/)
    expect(m?.text).toMatch(/Puedes guardar igualmente/)
  })

  it('sobra importe: «sobran»', () => {
    expect(summaryMessage(summarizeTicketLines(lines, '8,00', 0))?.text).toMatch(/sobran 1,50 €/)
  })

  it('los descuentos del ticket se restan de la suma (el total impreso ya los lleva aplicados)', () => {
    const s = summarizeTicketLines(lines, '8,50', 1)
    expect(s).toMatchObject({ discount: 1, expectedTotal: 8.5, matches: true })
    // COMP-01: con descuentos que cuadran, confirmación discreta con la cuenta completa (sin pedir explicación)
    expect(summaryMessage(s)).toMatchObject({ tone: 'ok' })
    expect(summaryMessage(s)?.text).toMatch(/Compra cuadrada: 9,50 € − 1,00 € = 8,50 €/)
  })

  it('sin total escrito, pide escribirlo y no da error', () => {
    const s = summarizeTicketLines(lines, '', 0)
    expect(s.matches).toBeNull()
    expect(summaryMessage(s)?.text).toMatch(/Escribe el importe total del ticket/)
  })

  it('líneas sin nombre se ignoran sin avisar; con nombre y sin precio válido se avisan y no se cuentan', () => {
    const s = summarizeTicketLines([...lines, L('', '1', '5'), L('Cosa rara', '1', ''), L('Descuento', '1', '-2')], '9,50', 0)
    expect(s).toMatchObject({ counted: 3, ignored: 2, linesTotal: 9.5, matches: true })
    expect(summaryMessage(s)?.text).toMatch(/2 líneas sin precio válido no se guardarán/)
  })

  it('sin ninguna línea no hay nada que comprobar', () => {
    expect(summaryMessage(summarizeTicketLines([], '9,50', 0))).toBeNull()
    expect(summarizeTicketLines([], '9,50', 0).matches).toBeNull()
    expect(summaryMessage(summarizeTicketLines([L('', '1', '3')], '9,50', 0))).toBeNull()
  })

  it('una sola línea usa el singular', () => {
    expect(summaryMessage(summarizeTicketLines([L('Pan', '1', '1,20')], '1,20', 0))?.text).toMatch(/1 producto suma 1,20 €/)
  })
})

describe('qué líneas se guardan en el historial (la misma regla que el aviso de importes)', () => {
  it('nombre + precio válido (con cantidad vacía = 1): sí', () => {
    expect(isSavableLine(L('Pan', '1', '1,20'))).toBe(true)
    expect(isSavableLine(L('Pan', '', '1.20'))).toBe(true)
  })
  it('un precio VACÍO no es 0 €: la línea no se guarda (antes se guardaba a 0,00 € y falseaba el historial)', () => {
    expect(isSavableLine(L('Pan', '1', ''))).toBe(false)
    expect(isSavableLine(L('Pan', '1', '   '))).toBe(false)
  })
  it('un precio 0 escrito sí es un precio (producto gratis o regalo); un abono (negativo) no', () => {
    expect(isSavableLine(L('Muestra', '1', '0'))).toBe(true)
    expect(isSavableLine(L('Descuento', '1', '-2,50'))).toBe(false)
  })
  it('sin nombre, o con cantidad no válida, no se guarda', () => {
    expect(isSavableLine(L('', '1', '3'))).toBe(false)
    expect(isSavableLine(L('Pan', 'abc', '3'))).toBe(false)
    expect(isSavableLine(L('Pan', '0', '3'))).toBe(false)
  })
  it('el resumen cuenta exactamente las que se guardarán', () => {
    const lines = [L('Pan', '1', '1,20'), L('Sin precio', '1', ''), L('Descuento', '1', '-1'), L('', '1', '5')]
    expect(summarizeTicketLines(lines, '', 0).counted).toBe(lines.filter(isSavableLine).length)
  })
})
