import { describe, expect, it } from 'vitest'
import { computeEventConclusions } from '@/domain/events'

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

describe('computeEventConclusions', () => {
  it('warns about pending RSVPs when the deadline is within 7 days', () => {
    const conclusions = computeEventConclusions({
      rsvpDeadline: daysFromNow(3),
      guests: [{ rsvpStatus: 'pendiente' }, { rsvpStatus: 'confirmado' }],
      tasks: [],
      payments: [],
      plannedBudget: 0,
      spentBudget: null,
    })
    expect(conclusions.find((c) => c.id === 'rsvp-deadline')).toBeTruthy()
  })

  it('does not warn about RSVPs when the deadline is far away', () => {
    const conclusions = computeEventConclusions({
      rsvpDeadline: daysFromNow(30),
      guests: [{ rsvpStatus: 'pendiente' }],
      tasks: [],
      payments: [],
      plannedBudget: 0,
      spentBudget: null,
    })
    expect(conclusions.find((c) => c.id === 'rsvp-deadline')).toBeUndefined()
  })

  it('flags a deadline that has already passed with pending guests', () => {
    const conclusions = computeEventConclusions({
      rsvpDeadline: daysFromNow(-2),
      guests: [{ rsvpStatus: 'pendiente' }],
      tasks: [],
      payments: [],
      plannedBudget: 0,
      spentBudget: null,
    })
    expect(conclusions.find((c) => c.id === 'rsvp-deadline-passed')).toBeTruthy()
  })

  it('flags overdue tasks', () => {
    const conclusions = computeEventConclusions({
      rsvpDeadline: null,
      guests: [],
      tasks: [
        { done: false, dueDate: daysFromNow(-1) },
        { done: false, dueDate: daysFromNow(5) },
        { done: true, dueDate: daysFromNow(-3) },
      ],
      payments: [],
      plannedBudget: 0,
      spentBudget: null,
    })
    const found = conclusions.find((c) => c.id === 'overdue-tasks')
    expect(found?.text).toContain('1 tarea')
  })

  it('flags a payment due soon with a remaining balance', () => {
    const conclusions = computeEventConclusions({
      rsvpDeadline: null,
      guests: [],
      tasks: [],
      payments: [{ concept: 'Fianza local', totalAmount: 200, depositPaid: 50, dueDate: daysFromNow(2), status: 'parcial' }],
      plannedBudget: 0,
      spentBudget: null,
    })
    const found = conclusions.find((c) => c.id.startsWith('payment-'))
    expect(found?.text).toContain('Fianza local')
    expect(found?.text).toContain('150.00')
  })

  it('does not flag an already-paid payment', () => {
    const conclusions = computeEventConclusions({
      rsvpDeadline: null,
      guests: [],
      tasks: [],
      payments: [{ concept: 'Catering', totalAmount: 200, depositPaid: 200, dueDate: daysFromNow(1), status: 'pagado' }],
      plannedBudget: 0,
      spentBudget: null,
    })
    expect(conclusions.find((c) => c.id.startsWith('payment-'))).toBeUndefined()
  })

  it('warns when spending is over the planned budget', () => {
    const conclusions = computeEventConclusions({
      rsvpDeadline: null,
      guests: [],
      tasks: [],
      payments: [],
      plannedBudget: 100,
      spentBudget: 150,
    })
    expect(conclusions.find((c) => c.id === 'budget-over')).toBeTruthy()
  })

  it('does not warn when spending is within budget', () => {
    const conclusions = computeEventConclusions({
      rsvpDeadline: null,
      guests: [],
      tasks: [],
      payments: [],
      plannedBudget: 100,
      spentBudget: 80,
    })
    expect(conclusions.find((c) => c.id === 'budget-over')).toBeUndefined()
  })

  it('returns no conclusions when everything is on track', () => {
    const conclusions = computeEventConclusions({
      rsvpDeadline: null,
      guests: [{ rsvpStatus: 'confirmado' }],
      tasks: [{ done: true, dueDate: daysFromNow(-5) }],
      payments: [{ concept: 'Todo pagado', totalAmount: 100, depositPaid: 100, dueDate: daysFromNow(1), status: 'pagado' }],
      plannedBudget: 100,
      spentBudget: 50,
    })
    expect(conclusions).toHaveLength(0)
  })
})
