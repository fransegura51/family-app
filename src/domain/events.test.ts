import { describe, expect, it } from 'vitest'
import { buildInvitationMessage, computeEventConclusions, generateEventPlan, INVITATION_TEMPLATES, sortInvitationTemplatesForEvent } from '@/domain/events'
import type { FamilyEvent } from '@/domain/types'

function makeEvent(overrides: Partial<FamilyEvent>): FamilyEvent {
  return {
    id: 'e1',
    familyId: 'f1',
    type: 'cumpleanos',
    subtype: null,
    title: 'Evento',
    dateStatus: 'confirmada',
    eventDate: null,
    eventTime: null,
    venueLabel: null,
    venueType: null,
    ceremonyLocationLabel: null,
    ceremonyLocationLatitude: null,
    ceremonyLocationLongitude: null,
    ceremonyTime: null,
    celebrationLocationLabel: null,
    celebrationLocationLatitude: null,
    celebrationLocationLongitude: null,
    theme: null,
    details: {},
    enabledModules: [],
    status: 'planificacion',
    tagId: null,
    calendarEventId: null,
    rsvpDeadline: null,
    rsvpDeadlineCalendarEventId: null,
    openRsvpToken: null,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

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

describe('sortInvitationTemplatesForEvent', () => {
  it('never drops a template — only reorders the same 96', () => {
    const event = makeEvent({ type: 'cumpleanos', details: { ageTurning: 5 } })
    const sorted = sortInvitationTemplatesForEvent(INVITATION_TEMPLATES, event)
    expect(sorted).toHaveLength(INVITATION_TEMPLATES.length)
    expect(new Set(sorted.map((t) => t.key))).toEqual(new Set(INVITATION_TEMPLATES.map((t) => t.key)))
  })

  it('puts kid-birthday themes before adult-birthday themes for a young child', () => {
    const event = makeEvent({ type: 'cumpleanos', details: { ageTurning: 5 } })
    const sorted = sortInvitationTemplatesForEvent(INVITATION_TEMPLATES, event)
    const dinosauriosIdx = sorted.findIndex((t) => t.key === 'dinosaurios')
    const nocheviejaIdx = sorted.findIndex((t) => t.key === 'nochevieja')
    expect(dinosauriosIdx).toBeGreaterThanOrEqual(0)
    expect(dinosauriosIdx).toBeLessThan(nocheviejaIdx)
  })

  it('puts adult-birthday themes before kid-birthday themes for an adult', () => {
    const event = makeEvent({ type: 'cumpleanos', details: { ageTurning: 40 } })
    const sorted = sortInvitationTemplatesForEvent(INVITATION_TEMPLATES, event)
    const eleganteIdx = sorted.findIndex((t) => t.key === 'cumpleanos_elegante')
    const dinosauriosIdx = sorted.findIndex((t) => t.key === 'dinosaurios')
    expect(eleganteIdx).toBeLessThan(dinosauriosIdx)
  })

  it('does not let a non-birthday theme (Dorado, Nochevieja) outrank an actual birthday theme for an adult', () => {
    // Bug real: "elegante" (cena romántica) y "nochevieja" llevaban la
    // etiqueta cumple_adulto por error, así que un tema que no es de
    // cumpleaños salía como plantilla por defecto de un "Cumpleaños
    // Alvaro" de adulto — visto al revisar en vivo.
    const event = makeEvent({ type: 'cumpleanos', details: { ageTurning: 40 } })
    const sorted = sortInvitationTemplatesForEvent(INVITATION_TEMPLATES, event)
    const cumpleanosElegante = sorted.findIndex((t) => t.key === 'cumpleanos_elegante')
    const elegante = sorted.findIndex((t) => t.key === 'elegante')
    const nochevieja = sorted.findIndex((t) => t.key === 'nochevieja')
    expect(cumpleanosElegante).toBeLessThan(elegante)
    expect(cumpleanosElegante).toBeLessThan(nochevieja)
  })

  it('puts wedding themes first, then romantic ones, for a boda', () => {
    const event = makeEvent({ type: 'boda', title: 'Boda de Ana y Luis' })
    const sorted = sortInvitationTemplatesForEvent(INVITATION_TEMPLATES, event)
    const bodaIdx = sorted.findIndex((t) => t.key === 'boda')
    const corazonesIdx = sorted.findIndex((t) => t.key === 'corazones')
    const dinosauriosIdx = sorted.findIndex((t) => t.key === 'dinosaurios')
    expect(bodaIdx).toBeLessThan(2)
    expect(corazonesIdx).toBeLessThan(dinosauriosIdx)
  })

  it('picks up a seasonal keyword from the title for a personalizado event', () => {
    const event = makeEvent({ type: 'personalizado', title: 'Fiesta de Halloween de Eric' })
    const sorted = sortInvitationTemplatesForEvent(INVITATION_TEMPLATES, event)
    const halloweenIdx = sorted.findIndex((t) => t.key === 'halloween_calabaza')
    const bodaIdx = sorted.findIndex((t) => t.key === 'boda')
    expect(halloweenIdx).toBeLessThan(bodaIdx)
  })
})

describe('generateEventPlan', () => {
  it('proposes budget, menu, decoration and activities for a birthday', () => {
    const plan = generateEventPlan({ type: 'cumpleanos', enabledModules: ['invitados', 'tareas'] })
    expect(plan.budgetItems.length).toBeGreaterThan(0)
    expect(plan.menuItems.length).toBeGreaterThan(0)
    expect(plan.decorationItems.length).toBeGreaterThan(0)
    expect(plan.activities.length).toBeGreaterThan(0)
  })

  it('only lists modules that are not already enabled', () => {
    const plan = generateEventPlan({ type: 'cumpleanos', enabledModules: ['invitados', 'invitaciones', 'tareas', 'presupuesto', 'menu_compra', 'decoracion', 'actividades', 'plan_dia'] })
    expect(plan.missingModules).toHaveLength(0)
  })

  it('lists a recommended module that is missing', () => {
    const plan = generateEventPlan({ type: 'cumpleanos', enabledModules: [] })
    expect(plan.missingModules).toContain('presupuesto')
  })

  it('does not propose decoration or activities for a wedding', () => {
    const plan = generateEventPlan({ type: 'boda', enabledModules: [] })
    expect(plan.decorationItems).toHaveLength(0)
    expect(plan.activities).toHaveLength(0)
    expect(plan.budgetItems.length).toBeGreaterThan(0)
  })
})

describe('buildInvitationMessage', () => {
  it('mentions the title and venue for a simple birthday', () => {
    const event = makeEvent({ type: 'cumpleanos', title: 'Cumpleaños Alvaro', venueLabel: 'Casa de la abuela', eventDate: '2026-10-18' })
    const text = buildInvitationMessage(event)
    expect(text).toContain('Cumpleaños Alvaro')
    expect(text).toContain('Casa de la abuela')
    expect(text.split('\n')).toHaveLength(2)
  })

  it('shows a placeholder instead of a raw date when the date is still pending', () => {
    const event = makeEvent({ type: 'cumpleanos', dateStatus: 'pendiente', eventDate: null })
    expect(buildInvitationMessage(event)).toContain('anunciaremos pronto')
  })

  it('mentions both locations when a dual-location event has both filled in', () => {
    const event = makeEvent({
      type: 'comunion',
      title: 'Comunión de Eric',
      eventDate: '2026-05-10',
      ceremonyLocationLabel: 'Parroquia San Juan',
      celebrationLocationLabel: 'Restaurante El Roble',
    })
    const text = buildInvitationMessage(event)
    expect(text).toContain('Parroquia San Juan')
    expect(text).toContain('Restaurante El Roble')
  })

  it('only mentions the ceremony when the celebration venue is not set yet', () => {
    const event = makeEvent({
      type: 'comunion',
      title: 'Comunión de Eric',
      eventDate: '2026-05-10',
      ceremonyLocationLabel: 'Parroquia San Juan',
      celebrationLocationLabel: null,
    })
    const text = buildInvitationMessage(event)
    expect(text).toContain('Parroquia San Juan')
    expect(text).not.toContain('🎉')
  })

  it('only mentions the celebration when the ceremony is not set yet', () => {
    const event = makeEvent({
      type: 'boda',
      title: 'Boda de Ana y Luis',
      eventDate: '2026-06-20',
      ceremonyLocationLabel: null,
      celebrationLocationLabel: 'Finca Los Almendros',
    })
    const text = buildInvitationMessage(event)
    expect(text).toContain('Finca Los Almendros')
    expect(text).not.toContain('💍')
  })

  it('never invents a location the event does not have', () => {
    const event = makeEvent({ type: 'bautizo', title: 'Bautizo de Vera', eventDate: '2026-03-01', ceremonyLocationLabel: null, celebrationLocationLabel: null })
    const text = buildInvitationMessage(event)
    expect(text).not.toContain('null')
    expect(text).not.toContain('undefined')
  })
})
