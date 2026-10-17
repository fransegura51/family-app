// Unir un ticket al gasto que ya existe de esa compra (bug real 17/10/2026: Hiperber 20,65 € salía dos veces).
import { describe, expect, it } from 'vitest'
import { pickTicketExpenseMatch, sourceAfterTicketMatch, TICKET_MATCH_SOURCES } from '@/domain/ticketExpenseMatch'
import receiptsSrc from '@/data/receipts.ts?raw'

const none = new Set<string>()
const c = (id: string, source: string, amount: number, date: string) => ({ id, source, amount, expense_date: date })

describe('pickTicketExpenseMatch', () => {
  it('el caso real: un apunte a mano que el banco ya unió («ticket_banco», sin ticket) recibe el ticket en vez de crear otro gasto', () => {
    const match = pickTicketExpenseMatch([c('A', 'ticket_banco', 20.65, '2026-10-17')], { amount: 20.65, receiptDate: '2026-10-17' }, none)
    expect(match?.id).toBe('A')
  })

  it('también se une a un gasto solo del banco y a uno apuntado a mano sin banco', () => {
    expect(pickTicketExpenseMatch([c('B', 'banco', 20.65, '2026-10-19')], { amount: 20.65, receiptDate: '2026-10-17' }, none)?.id).toBe('B')
    expect(pickTicketExpenseMatch([c('M', 'manual', 20.65, '2026-10-16')], { amount: 20.65, receiptDate: '2026-10-17' }, none)?.id).toBe('M')
  })

  it('no se une a un gasto que ya tiene su propio ticket (no se le roba a otra compra del mismo importe)', () => {
    expect(pickTicketExpenseMatch([c('A', 'ticket_banco', 20.65, '2026-10-17')], { amount: 20.65, receiptDate: '2026-10-17' }, new Set(['A']))).toBeNull()
  })

  it('exige el mismo importe exacto y no más de 7 días de diferencia', () => {
    expect(pickTicketExpenseMatch([c('A', 'banco', 20.66, '2026-10-17')], { amount: 20.65, receiptDate: '2026-10-17' }, none)).toBeNull()
    expect(pickTicketExpenseMatch([c('A', 'banco', 20.65, '2026-10-25')], { amount: 20.65, receiptDate: '2026-10-17' }, none)).toBeNull()
    expect(pickTicketExpenseMatch([c('A', 'banco', 20.65, '2026-10-24')], { amount: 20.65, receiptDate: '2026-10-17' }, none)?.id).toBe('A')
  })

  it('con varios candidatos del mismo importe elige el de fecha más cercana', () => {
    const match = pickTicketExpenseMatch([c('lejos', 'banco', 20.65, '2026-10-21'), c('cerca', 'banco', 20.65, '2026-10-18')], { amount: 20.65, receiptDate: '2026-10-17' }, none)
    expect(match?.id).toBe('cerca')
  })

  it('ignora los gastos de un origen que no es de esta lista (por ejemplo un ticket ya creado)', () => {
    expect(TICKET_MATCH_SOURCES).toEqual(['banco', 'ticket_banco', 'manual'])
    expect(pickTicketExpenseMatch([c('T', 'ticket', 20.65, '2026-10-17')], { amount: 20.65, receiptDate: '2026-10-17' }, none)).toBeNull()
  })

  it('no hay problemas de zona horaria al cruzar el cambio de hora (25/10/2026)', () => {
    expect(pickTicketExpenseMatch([c('A', 'banco', 5, '2026-10-25')], { amount: 5, receiptDate: '2026-10-18' }, none)?.id).toBe('A')
    expect(pickTicketExpenseMatch([c('A', 'banco', 5, '2026-10-26')], { amount: 5, receiptDate: '2026-10-18' }, none)).toBeNull()
  })
})

describe('sourceAfterTicketMatch', () => {
  it('con banco enlazado sigue siendo «ticket_banco»; uno a mano sin banco pasa a «ticket»', () => {
    expect(sourceAfterTicketMatch('banco')).toBe('ticket_banco')
    expect(sourceAfterTicketMatch('ticket_banco')).toBe('ticket_banco')
    expect(sourceAfterTicketMatch('manual')).toBe('ticket')
  })
})

describe('uploadReceipt usa la unión', () => {
  it('pide los gastos candidatos con esos orígenes y excluye los que ya tienen ticket', () => {
    expect(receiptsSrc).toContain(".in('source', [...TICKET_MATCH_SOURCES])")
    expect(receiptsSrc).toContain('pickTicketExpenseMatch(')
    expect(receiptsSrc).toContain(".from('receipts').select('expense_id').in('expense_id', candidateIds)")
    expect(receiptsSrc).toContain('source: sourceAfterTicketMatch(match.source)')
  })
})
