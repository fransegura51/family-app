import { describe, expect, it } from 'vitest'
import {
  autoArrangeLayers,
  buildInvitationMessage,
  buildInvitationTemplateLayers,
  buildMapsUrl,
  computeAllEventAlerts,
  computeEventConclusions,
  computeEventHealth,
  computeEventStatusSummary,
  computeGuestBreakdownStatus,
  computeGuestSeatingStatus,
  computeTableOccupancy,
  countPaymentAlerts,
  eventAlertsToAttentionItems,
  eventLocationMapLines,
  generateEventPlan,
  INVITATION_TEMPLATES,
  isOverdueTask,
  pickNextMilestone,
  sortInvitationTemplatesForEvent,
  type EventAlertInput,
} from '@/domain/events'
import type { InvitationTemplateMeta, SafeZone } from '@/domain/events'
import type { EventGuest, EventTask, FamilyEvent, InvitationLayer } from '@/domain/types'

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
    venueLatitude: null,
    venueLongitude: null,
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

let taskCounter = 0
function makeTask(overrides: Partial<EventTask>): EventTask {
  taskCounter += 1
  return {
    id: `t${taskCounter}`,
    eventId: 'e1',
    familyId: 'f1',
    title: 'Tarea',
    done: false,
    dueDate: null,
    source: 'manual',
    sortOrder: taskCounter,
    createdAt: '2026-01-01T00:00:00Z',
    assignedMemberId: null,
    calendarEventId: null,
    ...overrides,
  }
}

let guestCounter = 0
function makeGuest(overrides: Partial<EventGuest>): EventGuest {
  guestCounter += 1
  return {
    id: `g${guestCounter}`,
    eventId: 'e1',
    familyId: 'f1',
    displayName: 'Invitado',
    adultsCount: 1,
    childrenCount: 0,
    notes: null,
    inviteScope: null,
    rsvpStatus: 'pendiente',
    rsvpAdultsCount: null,
    rsvpChildrenCount: null,
    rsvpNote: null,
    rsvpTokenActive: true,
    rsvpRespondedAt: null,
    tableId: null,
    sortOrder: guestCounter,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
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

describe('buildInvitationTemplateLayers', () => {
  function makeTemplate(textArea?: InvitationTemplateMeta['textArea']): InvitationTemplateMeta {
    return { key: 't1', label: 'Test', gradient: 'linear-gradient(0deg, #000, #fff)', text: '#fff', artKey: 'confeti', textArea }
  }

  it('positions the three default layers inside the template textArea, not at the old fixed spots', () => {
    // Petición real: "me refiero a esa parte de cada tarjeta (círculo
    // azul) no las tarjetas enteras... habrá que ajustarlo tarjeta por
    // tarjeta" — antes las tres capas usaban siempre 0.22/0.42/0.65
    // sin importar el tema; ahora deben caer dentro del hueco real.
    const event = makeEvent({ title: 'Cumpleaños de Alvaro' })
    const template = makeTemplate({ x: 0.3, y: 0.1, width: 0.4, height: 0.3 })
    const layers = buildInvitationTemplateLayers(event, template)
    expect(layers).toHaveLength(3)
    for (const layer of layers) {
      expect(layer.x).toBeGreaterThanOrEqual(0.3)
      expect(layer.x).toBeLessThanOrEqual(0.7)
      expect(layer.y).toBeGreaterThanOrEqual(0.1)
      expect(layer.y).toBeLessThanOrEqual(0.4)
    }
  })

  it('uses a smaller font size for a compact textArea so the text does not overflow it', () => {
    const event = makeEvent({ title: 'Cumpleaños de Alvaro' })
    const compact = buildInvitationTemplateLayers(event, makeTemplate({ x: 0.3, y: 0.1, width: 0.3, height: 0.3 }))
    const roomy = buildInvitationTemplateLayers(event, makeTemplate({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }))
    expect(compact[0].fontSize).toBeLessThan(roomy[0].fontSize!)
  })

  it('falls back to a generic centered box when the template has no textArea', () => {
    const event = makeEvent({ title: 'Cumpleaños de Alvaro' })
    const layers = buildInvitationTemplateLayers(event, makeTemplate(undefined))
    expect(layers).toHaveLength(3)
    for (const layer of layers) {
      expect(layer.x).toBeGreaterThan(0)
      expect(layer.x).toBeLessThan(1)
    }
  })
})

// INV-EDITOR-2 — "Pepa, hazla bonita" debe recolocar SIEMPRE dentro de la zona segura real de la
// plantilla (template.textArea), nunca con coordenadas genéricas del lienzo entero — antes ignoraba
// textArea del todo y podía mandar texto/icono encima de la decoración (caso real reportado: una
// plantilla floral tipo "Bodas de plata").
describe('autoArrangeLayers', () => {
  let seq = 0
  function layer(type: InvitationLayer['type'], overrides: Partial<InvitationLayer> = {}): InvitationLayer {
    seq++
    return { id: `l${seq}`, type, x: 0.9, y: 0.9, rotation: 45, scale: 1, zIndex: seq, ...overrides }
  }

  function expectInsideZone(l: InvitationLayer, zone: SafeZone) {
    expect(l.x).toBeGreaterThanOrEqual(zone.x - 0.001)
    expect(l.x).toBeLessThanOrEqual(zone.x + zone.width + 0.001)
    expect(l.y).toBeGreaterThanOrEqual(zone.y - 0.001)
    expect(l.y).toBeLessThanOrEqual(zone.y + zone.height + 0.001)
  }

  it('emoji + título + mensaje: los tres quedan dentro de una zona amplia, en orden vertical icono→título→mensaje', () => {
    const zone: SafeZone = { x: 0.1, y: 0.1, width: 0.8, height: 0.7 }
    const layers = [layer('emoji'), layer('text', { text: 'Título' }), layer('event_data', { text: 'Mensaje' })]
    const [emoji, text, eventData] = autoArrangeLayers(layers, zone)
    for (const l of [emoji, text, eventData]) expectInsideZone(l, zone)
    expect(emoji.y).toBeLessThan(text.y)
    expect(text.y).toBeLessThan(eventData.y)
  })

  it('CASO REAL — plantilla floral tipo "Bodas de plata" (zona estrecha y descentrada): nada queda fuera de su zona limpia', () => {
    // Geometría real de una plantilla floral del catálogo (domain/events.ts, INVITATION_TEMPLATES 'floral').
    const zone: SafeZone = { x: 0.2542, y: 0.204, width: 0.5693, height: 0.6253 }
    const layers = [layer('emoji'), layer('text', { text: 'Bodas de plata' }), layer('event_data', { text: 'Os esperamos...' })]
    const arranged = autoArrangeLayers(layers, zone)
    for (const l of arranged) expectInsideZone(l, zone)
  })

  it('plantilla con textArea alta (mucho height, poco width): el icono queda arriba y el mensaje abajo, ambos dentro', () => {
    const zone: SafeZone = { x: 0.35, y: 0.05, width: 0.3, height: 0.85 }
    const layers = [layer('emoji'), layer('text'), layer('event_data')]
    const [emoji, , eventData] = autoArrangeLayers(layers, zone)
    expectInsideZone(emoji, zone)
    expectInsideZone(eventData, zone)
    expect(emoji.y).toBeLessThan(eventData.y)
  })

  it('plantilla con textArea baja (poco height): sigue sin salirse, aunque quede todo apretado', () => {
    const zone: SafeZone = { x: 0.1, y: 0.4, width: 0.8, height: 0.15 }
    const layers = [layer('emoji'), layer('text'), layer('event_data')]
    for (const l of autoArrangeLayers(layers, zone)) expectInsideZone(l, zone)
  })

  it('plantilla con zona estrecha (poco width): el texto se mantiene centrado en esa franja', () => {
    const zone: SafeZone = { x: 0.4, y: 0.1, width: 0.2, height: 0.7 }
    const layers = [layer('text')]
    const [text] = autoArrangeLayers(layers, zone)
    expectInsideZone(text, zone)
    expect(text.x).toBeCloseTo(zone.x + zone.width / 2)
  })

  it('sin textArea (undefined): cae a DEFAULT_TEXT_AREA, nunca revienta ni usa coordenadas fuera de 0..1', () => {
    const layers = [layer('emoji'), layer('text'), layer('event_data')]
    for (const l of autoArrangeLayers(layers)) {
      expect(l.x).toBeGreaterThanOrEqual(0)
      expect(l.x).toBeLessThanOrEqual(1)
      expect(l.y).toBeGreaterThanOrEqual(0)
      expect(l.y).toBeLessThanOrEqual(1)
    }
  })

  it('varias capas de texto (más de 2): todas quedan dentro de la zona, repartidas sin solaparse', () => {
    const zone: SafeZone = { x: 0.1, y: 0.1, width: 0.8, height: 0.7 }
    const layers = [layer('text'), layer('text'), layer('event_data'), layer('text')]
    const arranged = autoArrangeLayers(layers, zone)
    for (const l of arranged) expectInsideZone(l, zone)
    const ys = arranged.map((l) => l.y)
    expect(new Set(ys).size).toBe(ys.length) // ninguna coincide exactamente con otra (no solapamiento vertical)
  })

  it('decoraciones (formas): se mantienen fuera de la zona de texto cuando cae dentro de ella', () => {
    // Zona grande que llega a tragarse una de las 4 esquinas de siempre (0.15, 0.12) — debe apartarse.
    const zone: SafeZone = { x: 0.05, y: 0.05, width: 0.7, height: 0.7 }
    const layers = [layer('shape', { shapeKey: 'estrella' }), layer('shape', { shapeKey: 'confeti' })]
    for (const l of autoArrangeLayers(layers, zone)) {
      expect(l.x >= zone.x && l.x <= zone.x + zone.width && l.y >= zone.y && l.y <= zone.y + zone.height).toBe(false)
    }
  })

  it('repetición determinista: aplicar el algoritmo dos veces con la misma entrada da el mismo resultado', () => {
    const zone: SafeZone = { x: 0.2, y: 0.15, width: 0.6, height: 0.6 }
    const layers = [layer('emoji'), layer('text'), layer('event_data'), layer('shape', { shapeKey: 'anillo' })]
    const once = autoArrangeLayers(layers, zone)
    const twice = autoArrangeLayers(layers, zone)
    expect(once).toEqual(twice)
  })

  it('la foto sigue centrada en el lienzo (no confinada a la zona de texto, suele ser más grande)', () => {
    const zone: SafeZone = { x: 0.3, y: 0.3, width: 0.2, height: 0.2 }
    const [photo] = autoArrangeLayers([layer('photo', { photoPath: 'p.jpg' })], zone)
    expect(photo.x).toBe(0.5)
    expect(photo.y).toBe(0.4)
  })
})

describe('eventLocationMapLines', () => {
  it('builds an openable Google Maps link for a single-venue event', () => {
    const event = makeEvent({ type: 'cumpleanos', venueLabel: 'Restaurante La Terraza, Madrid' })
    const lines = eventLocationMapLines(event, { inviteScope: null })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('https://www.google.com/maps/search/?api=1&query=')
    expect(lines[0]).toContain(encodeURIComponent('Restaurante La Terraza, Madrid'))
  })

  it('links both locations for a dual-location event when both are set', () => {
    const event = makeEvent({ type: 'boda', ceremonyLocationLabel: 'Iglesia de la Concepción', celebrationLocationLabel: 'Finca Los Almendros' })
    const lines = eventLocationMapLines(event, { inviteScope: null })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain(encodeURIComponent('Iglesia de la Concepción'))
    expect(lines[1]).toContain(encodeURIComponent('Finca Los Almendros'))
  })

  it('respects a guest scoped to only the ceremony', () => {
    const event = makeEvent({ type: 'boda', ceremonyLocationLabel: 'Iglesia de la Concepción', celebrationLocationLabel: 'Finca Los Almendros' })
    const lines = eventLocationMapLines(event, { inviteScope: 'solo_ceremonia' })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('ceremonia')
  })

  it('returns nothing when no location is set yet', () => {
    const event = makeEvent({ type: 'cumpleanos', venueLabel: null })
    expect(eventLocationMapLines(event, { inviteScope: null })).toHaveLength(0)
  })

  it('uses real coordinates instead of searching the label text when they are set', () => {
    // Petición real: "¿Y qué va a buscar si pongo en mi casa?" — un
    // texto informal como "en mi casa" no es buscable; con
    // coordenadas elegidas en el buscador, el enlace va directo a
    // ellas y no depende del texto de "Lugar".
    const event = makeEvent({ type: 'cumpleanos', venueLabel: 'en mi casa', venueLatitude: 40.4168, venueLongitude: -3.7038 })
    const lines = eventLocationMapLines(event, { inviteScope: null })
    expect(lines[0]).toContain('https://www.google.com/maps?q=40.4168,-3.7038')
    expect(lines[0]).not.toContain('en+mi+casa')
    expect(lines[0]).not.toContain(encodeURIComponent('en mi casa'))
  })

  it('falls back to searching the label text when no coordinates were picked', () => {
    const event = makeEvent({ type: 'cumpleanos', venueLabel: 'en mi casa', venueLatitude: null, venueLongitude: null })
    const lines = eventLocationMapLines(event, { inviteScope: null })
    expect(lines[0]).toContain('https://www.google.com/maps/search/?api=1&query=')
  })
})

describe('buildMapsUrl', () => {
  it('url-encodes the address so it survives being pasted into a share text', () => {
    const url = buildMapsUrl('Calle Mayor 5, 2ºB, Madrid')
    expect(url).not.toContain(' ')
    expect(url).not.toContain('º')
  })

  it('prefers real coordinates over the label text when both are given', () => {
    const url = buildMapsUrl('en mi casa', { latitude: 40.4168, longitude: -3.7038 })
    expect(url).toBe('https://www.google.com/maps?q=40.4168,-3.7038')
  })
})

// Fase 3 — avisos fuera del evento: computeAllEventAlerts reutiliza
// computeEventConclusions (no crea una segunda lógica de qué es una
// alerta) y agrupa por evento.
function makeAlertInput(overrides: Partial<EventAlertInput>): EventAlertInput {
  return {
    eventId: 'e1',
    eventTitle: 'Evento',
    eventIcon: '🎉',
    rsvpDeadline: null,
    guests: [],
    tasks: [],
    payments: [],
    plannedBudget: 0,
    spentBudget: null,
    ...overrides,
  }
}

describe('computeAllEventAlerts', () => {
  it('un evento sin incidencias no produce ningún aviso', () => {
    const alerts = computeAllEventAlerts([makeAlertInput({ eventId: 'e1' })])
    expect(alerts).toEqual([])
  })

  it('un evento con varias incidencias produce UN solo aviso agrupado, no uno por incidencia', () => {
    const alerts = computeAllEventAlerts([
      makeAlertInput({
        eventId: 'e1',
        eventTitle: 'Bodas de plata',
        tasks: [makeTask({ done: false, dueDate: daysFromNow(-1) }), makeTask({ done: false, dueDate: daysFromNow(-2) })],
        payments: [{ concept: 'Fianza', totalAmount: 200, depositPaid: 0, dueDate: daysFromNow(1), status: 'pendiente' }],
      }),
    ])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].eventId).toBe('e1')
    expect(alerts[0].conclusions.length).toBeGreaterThan(1)
  })

  it('varios eventos simultáneos: uno por evento con incidencias, ninguno para los que no tienen', () => {
    const alerts = computeAllEventAlerts([
      makeAlertInput({ eventId: 'e1', eventTitle: 'Sin problemas' }),
      makeAlertInput({ eventId: 'e2', eventTitle: 'Con tarea atrasada', tasks: [makeTask({ done: false, dueDate: daysFromNow(-3) })] }),
      makeAlertInput({ eventId: 'e3', eventTitle: 'Otra con tarea atrasada', tasks: [makeTask({ done: false, dueDate: daysFromNow(-1) })] }),
    ])
    expect(alerts.map((a) => a.eventId).sort()).toEqual(['e2', 'e3'])
  })

  it('una incidencia resuelta desaparece al recalcular sobre el estado actual (no queda nada persistido)', () => {
    const withOverdueTask = makeAlertInput({ eventId: 'e1', tasks: [makeTask({ id: 't1', done: false, dueDate: daysFromNow(-1) })] })
    expect(computeAllEventAlerts([withOverdueTask])).toHaveLength(1)

    // La misma tarea, ahora marcada como hecha — la condición ya no se cumple.
    const resolved = makeAlertInput({ eventId: 'e1', tasks: [makeTask({ id: 't1', done: true, dueDate: daysFromNow(-1) })] })
    expect(computeAllEventAlerts([resolved])).toEqual([])
  })

  it('elige el módulo de destino según la incidencia más urgente (tareas antes que presupuesto)', () => {
    const alerts = computeAllEventAlerts([
      makeAlertInput({
        eventId: 'e1',
        tasks: [makeTask({ done: false, dueDate: daysFromNow(-1) })],
        plannedBudget: 100,
        spentBudget: 200,
      }),
    ])
    expect(alerts[0].primaryModule).toBe('tareas')
  })
})

// Fase 7 — barra dinámica de "Estado del evento": el color (level)
// nunca depende solo de la media interna (progress); una incidencia
// real puede fijarlo directamente. No hay ningún examen en el que
// "progress" se enseñe como cifra al usuario — eso lo comprueba un
// test aparte sobre el propio código de la UI, más abajo.
function makeHealthInput(overrides: Partial<Parameters<typeof computeEventHealth>[0]>): Parameters<typeof computeEventHealth>[0] {
  return {
    hasTasksModule: false,
    tasksTotal: 0,
    tasksDone: 0,
    tasksOverdue: 0,
    hasGuestsModule: false,
    guestsTotalPeople: 0,
    guestsConfirmedPeople: 0,
    guestsPendingCount: 0,
    hasBudgetModule: false,
    budgetPlanned: 0,
    budgetSpent: null,
    hasPaymentsModule: false,
    paymentsOverdueCount: 0,
    paymentsDueSoonCount: 0,
    locationApplicable: false,
    hasExactLocation: false,
    hasMenuModule: false,
    menuItemsTotal: 0,
    menuItemsTransferred: 0,
    nextMilestone: null,
    ...overrides,
  }
}

describe('countPaymentAlerts', () => {
  it('cuenta vencidos y "vence pronto" con la misma definición que computeEventConclusions', () => {
    const result = countPaymentAlerts([
      { totalAmount: 200, depositPaid: 0, dueDate: daysFromNow(-1), status: 'pendiente' },
      { totalAmount: 200, depositPaid: 0, dueDate: daysFromNow(3), status: 'pendiente' },
      { totalAmount: 200, depositPaid: 200, dueDate: daysFromNow(-1), status: 'pagado' },
      { totalAmount: 200, depositPaid: 200, dueDate: daysFromNow(1), status: 'parcial' },
    ])
    expect(result).toEqual({ overdue: 1, dueSoon: 1 })
  })
})

describe('pickNextMilestone', () => {
  it('null cuando no hay nada pendiente con fecha futura', () => {
    expect(pickNextMilestone([], [])).toBeNull()
  })
})

describe('computeEventHealth', () => {
  it('sin tareas ni ningún módulo con datos: no rompe, nivel neutro sin incidencias', () => {
    const health = computeEventHealth(makeHealthInput({}))
    expect(health.level).toBe('progress')
    expect(health.progress).toBe(0)
  })

  it('tareas completadas al 100% y sin invitados/presupuesto: evento al día, verde', () => {
    const health = computeEventHealth(makeHealthInput({ hasTasksModule: true, tasksTotal: 4, tasksDone: 4 }))
    expect(health.level).toBe('good')
  })

  it('una tarea atrasada degrada a rojo aunque el resto esté completo', () => {
    const health = computeEventHealth(
      makeHealthInput({ hasTasksModule: true, tasksTotal: 4, tasksDone: 4, tasksOverdue: 1, hasGuestsModule: true, guestsTotalPeople: 10, guestsConfirmedPeople: 10 }),
    )
    expect(health.level).toBe('danger')
    expect(health.message).toContain('1 tarea atrasada')
  })

  it('módulos desactivados no penalizan: sin mesas/menú no cuentan aunque no tengan datos', () => {
    // Ningún dato de menú (hasMenuModule=false) — no debe arrastrar el progreso hacia 0.
    const conMenu = computeEventHealth(makeHealthInput({ hasTasksModule: true, tasksTotal: 2, tasksDone: 2, hasMenuModule: true, menuItemsTotal: 2, menuItemsTransferred: 0 }))
    const sinMenu = computeEventHealth(makeHealthInput({ hasTasksModule: true, tasksTotal: 2, tasksDone: 2, hasMenuModule: false }))
    expect(sinMenu.progress).toBe(100)
    expect(conMenu.progress).toBeLessThan(sinMenu.progress)
  })

  it('RSVP inactivo: invitados pendientes no degradan el color', () => {
    const health = computeEventHealth(makeHealthInput({ hasGuestsModule: false, guestsPendingCount: 5, hasTasksModule: true, tasksTotal: 2, tasksDone: 2 }))
    expect(health.level).not.toBe('warning')
  })

  it('RSVP activo: invitados pendientes sí degradan a naranja', () => {
    const health = computeEventHealth(makeHealthInput({ hasGuestsModule: true, guestsTotalPeople: 10, guestsConfirmedPeople: 10, guestsPendingCount: 3 }))
    expect(health.level).toBe('warning')
    expect(health.message).toContain('3 invitados pendientes')
  })

  it('presupuesto desactivado: gasto sobre lo planeado no aplica si el módulo no está activo', () => {
    const health = computeEventHealth(makeHealthInput({ hasBudgetModule: false, budgetPlanned: 100, budgetSpent: 500 }))
    expect(health.level).not.toBe('warning')
  })

  it('presupuesto activo y superado: naranja', () => {
    const health = computeEventHealth(makeHealthInput({ hasBudgetModule: true, budgetPlanned: 100, budgetSpent: 150 }))
    expect(health.level).toBe('warning')
  })

  it('pago vencido: rojo, con prioridad sobre presupuesto superado', () => {
    const health = computeEventHealth(makeHealthInput({ hasPaymentsModule: true, paymentsOverdueCount: 1, hasBudgetModule: true, budgetPlanned: 100, budgetSpent: 150 }))
    expect(health.level).toBe('danger')
  })

  it('sin ubicación exacta cuando el evento ya tiene lugar en texto: reduce el progreso, pero no es una incidencia (no baja de "progress")', () => {
    const health = computeEventHealth(makeHealthInput({ locationApplicable: true, hasExactLocation: false }))
    expect(health.progress).toBe(0)
    expect(['progress', 'good']).toContain(health.level)
  })

  it('nunca enseña "progress" como porcentaje en label/message', () => {
    const health = computeEventHealth(makeHealthInput({ hasTasksModule: true, tasksTotal: 3, tasksDone: 1 }))
    expect(health.label).not.toMatch(/\d/)
    expect(health.message).not.toContain('%')
    expect(health.label).not.toContain('%')
  })
})

describe('eventAlertsToAttentionItems', () => {
  it('construye el enlace de deep-link con el evento y el módulo destino', () => {
    const alerts = computeAllEventAlerts([
      makeAlertInput({ eventId: 'abc-123', eventTitle: 'Bodas de plata', eventIcon: '💍', tasks: [makeTask({ done: false, dueDate: daysFromNow(-1) })] }),
    ])
    const items = eventAlertsToAttentionItems(alerts)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Bodas de plata')
    expect(items[0].icon).toBe('💍')
    expect(items[0].to).toBe('/eventos?event=abc-123&modulo=tareas')
    expect(items[0].lines.length).toBeGreaterThan(0)
  })

  it('sin módulo de destino determinable, el enlace apunta solo al evento', () => {
    // No debería ocurrir en la práctica (toda conclusión hoy mapea a un
    // módulo), pero el mapeo no debe romperse si algún día no lo hace.
    const items = eventAlertsToAttentionItems([{ eventId: 'x', eventTitle: 'X', eventIcon: '🎉', conclusions: [{ id: 'desconocido', icon: '❓', text: 'algo' }], primaryModule: null }])
    expect(items[0].to).toBe('/eventos?event=x')
  })
})

describe('isOverdueTask', () => {
  it('is overdue only when not done and the due date has passed', () => {
    expect(isOverdueTask(makeTask({ done: false, dueDate: daysFromNow(-1) }))).toBe(true)
    expect(isOverdueTask(makeTask({ done: true, dueDate: daysFromNow(-1) }))).toBe(false)
    expect(isOverdueTask(makeTask({ done: false, dueDate: daysFromNow(1) }))).toBe(false)
    expect(isOverdueTask(makeTask({ done: false, dueDate: null }))).toBe(false)
  })
})

// Fase 2 — auditoría: el porcentaje "Preparación del evento" (media de
// %tareas y %invitados) daba "50 %" con el caso real de "Bodas de
// plata" (0 de 6 tareas hechas, 2 ya vencidas, 16 de 16 invitados
// confirmados) — un número que escondía justo el problema. Estos tests
// fijan el caso real como regresión permanente.
describe('computeEventStatusSummary', () => {
  it('caso real "Bodas de plata": 0/6 tareas + 16/16 invitados nunca produce un porcentaje de preparación', () => {
    const tasks = [
      makeTask({ title: 'Reservar ceremonia', done: false, dueDate: daysFromNow(-30) }),
      makeTask({ title: 'Reservar celebración', done: false, dueDate: daysFromNow(-30) }),
      makeTask({ title: 'Enviar invitaciones', done: false, dueDate: daysFromNow(10) }),
      makeTask({ title: 'Confirmar menú', done: false, dueDate: null }),
      makeTask({ title: 'Elegir flores', done: false, dueDate: null }),
      makeTask({ title: 'Recoger anillos', done: false, dueDate: null }),
    ]
    const guests = [
      makeGuest({ displayName: 'Familia David', adultsCount: 4, childrenCount: 1, rsvpStatus: 'confirmado', rsvpAdultsCount: 4, rsvpChildrenCount: 1 }),
      makeGuest({ displayName: 'Familia Ramon', adultsCount: 8, childrenCount: 1, rsvpStatus: 'confirmado', rsvpAdultsCount: 8, rsvpChildrenCount: 1 }),
      makeGuest({ displayName: 'Suegros', adultsCount: 2, childrenCount: 0, rsvpStatus: 'confirmado', rsvpAdultsCount: 2, rsvpChildrenCount: 0 }),
    ]
    const summary = computeEventStatusSummary({ tasks, guests, payments: [], plannedBudget: 5750, spentBudget: 0 })

    expect(summary.tasksDone).toBe(0)
    expect(summary.tasksTotal).toBe(6)
    expect(summary.tasksOverdue).toBe(2)
    expect(summary.guestsConfirmedPeople).toBe(16)
    expect(summary.guestsTotalPeople).toBe(16)
    expect(summary.budgetPlanned).toBe(5750)
    expect(summary.budgetSpent).toBe(0)
    // Nunca debe existir ningún campo de porcentaje/preparación agregado.
    expect(Object.keys(summary).some((k) => /pct|percent|porcentaje|readiness|preparaci/i.test(k))).toBe(false)
  })

  it('cuenta invitados pendientes/no seguros como pendientes de responder, y confirmados no cuenta ahí', () => {
    const guests = [
      makeGuest({ rsvpStatus: 'pendiente' }),
      makeGuest({ rsvpStatus: 'no_seguro' }),
      makeGuest({ rsvpStatus: 'confirmado', rsvpAdultsCount: 1, rsvpChildrenCount: 0 }),
      makeGuest({ rsvpStatus: 'no_asiste' }),
    ]
    const summary = computeEventStatusSummary({ tasks: [], guests, payments: [], plannedBudget: 0, spentBudget: null })
    expect(summary.guestsPendingCount).toBe(2)
  })

  it('próximo hito: elige la tarea o el pago no vencido más próximo, nunca uno ya atrasado', () => {
    const tasks = [makeTask({ title: 'Atrasada', done: false, dueDate: daysFromNow(-5) }), makeTask({ title: 'Próxima', done: false, dueDate: daysFromNow(3) })]
    const summary = computeEventStatusSummary({ tasks, guests: [], payments: [], plannedBudget: 0, spentBudget: null })
    expect(summary.nextMilestone).toEqual({ kind: 'tarea', label: 'Próxima', dueDate: daysFromNow(3), daysUntil: 3 })
  })

  it('próximo hito: compara tareas y pagos, y gana el que esté más cerca', () => {
    const tasks = [makeTask({ title: 'Tarea lejana', done: false, dueDate: daysFromNow(10) })]
    const summary = computeEventStatusSummary({
      tasks,
      guests: [],
      payments: [{ concept: 'Fianza', totalAmount: 200, depositPaid: 0, dueDate: daysFromNow(2), status: 'pendiente' }],
      plannedBudget: 0,
      spentBudget: null,
    })
    expect(summary.nextMilestone).toEqual({ kind: 'pago', label: 'Fianza', dueDate: daysFromNow(2), daysUntil: 2 })
  })

  it('próximo hito: null cuando no hay ninguna tarea ni pago pendiente con fecha futura', () => {
    const summary = computeEventStatusSummary({
      tasks: [makeTask({ done: false, dueDate: null }), makeTask({ done: true, dueDate: daysFromNow(5) })],
      guests: [],
      payments: [{ concept: 'Pagado', totalAmount: 100, depositPaid: 100, dueDate: daysFromNow(1), status: 'pagado' }],
      plannedBudget: 0,
      spentBudget: null,
    })
    expect(summary.nextMilestone).toBeNull()
  })
})

// Eventos Fase 14B — desglose opcional de personas dentro de una
// unidad invitada. adults_count/children_count del guest son SIEMPRE
// la fuente de verdad; esta función solo compara, nunca recalcula.
describe('computeGuestBreakdownStatus', () => {
  const guest = { adultsCount: 2, childrenCount: 1 }

  it('grupo sin personas desglosadas: 0 en todo, sin exceso', () => {
    const status = computeGuestBreakdownStatus(guest, [])
    expect(status).toEqual({ adultsMembers: 0, childrenMembers: 0, totalMembers: 0, adultsExceeded: false, childrenExceeded: false })
  })

  it('una persona desglosada (adulto)', () => {
    const status = computeGuestBreakdownStatus(guest, [{ personType: 'adulto' }])
    expect(status).toEqual({ adultsMembers: 1, childrenMembers: 0, totalMembers: 1, adultsExceeded: false, childrenExceeded: false })
  })

  it('varias personas desglosadas, mezcla de adultos y niños', () => {
    const status = computeGuestBreakdownStatus(guest, [{ personType: 'adulto' }, { personType: 'adulto' }, { personType: 'nino' }])
    expect(status).toEqual({ adultsMembers: 2, childrenMembers: 1, totalMembers: 3, adultsExceeded: false, childrenExceeded: false })
  })

  it('desglose completo (coincide exactamente con adults_count/children_count): sin aviso', () => {
    const status = computeGuestBreakdownStatus(guest, [{ personType: 'adulto' }, { personType: 'adulto' }, { personType: 'nino' }])
    expect(status.adultsExceeded).toBe(false)
    expect(status.childrenExceeded).toBe(false)
  })

  it('desglose parcial (menos personas que el recuento): sigue siendo válido, sin aviso', () => {
    const status = computeGuestBreakdownStatus(guest, [{ personType: 'adulto' }])
    expect(status.adultsExceeded).toBe(false)
    expect(status.childrenExceeded).toBe(false)
    expect(status.totalMembers).toBeLessThan(guest.adultsCount + guest.childrenCount)
  })

  it('exceso de adultos: más adultos desglosados que adults_count', () => {
    const status = computeGuestBreakdownStatus(guest, [{ personType: 'adulto' }, { personType: 'adulto' }, { personType: 'adulto' }])
    expect(status.adultsExceeded).toBe(true)
    expect(status.childrenExceeded).toBe(false)
  })

  it('exceso de niños: más niños desglosados que children_count', () => {
    const status = computeGuestBreakdownStatus(guest, [{ personType: 'nino' }, { personType: 'nino' }])
    expect(status.adultsExceeded).toBe(false)
    expect(status.childrenExceeded).toBe(true)
  })
})

// Eventos Fase 14C — mesas por persona invitada. Dos modos MUTUAMENTE
// EXCLUYENTES: una unidad sin personas desglosadas sigue ocupando por
// unidad completa (como toda la vida); en cuanto tiene alguna persona
// desglosada, cuenta solo por persona (nunca las dos a la vez, para no
// duplicar plazas).
describe('computeGuestSeatingStatus', () => {
  it('unidad sin desglose (TEST: unidad sin desglosar sigue igual): modo "unidad", nada que reportar por persona', () => {
    const status = computeGuestSeatingStatus({ adultsCount: 2, childrenCount: 1 }, [])
    expect(status).toEqual({ mode: 'unidad', totalDeclared: 3, identifiedCount: 0, unidentifiedCount: 0, seatedIdentifiedCount: 0, unassignedIdentifiedCount: 0 })
  })

  it('desglose completo: identificados = declarados, sin nadie "por nombrar"', () => {
    const status = computeGuestSeatingStatus({ adultsCount: 2, childrenCount: 1 }, [{ tableId: 't1' }, { tableId: null }, { tableId: 't1' }])
    expect(status.mode).toBe('personas')
    expect(status.identifiedCount).toBe(3)
    expect(status.unidentifiedCount).toBe(0)
    expect(status.seatedIdentifiedCount).toBe(2)
    expect(status.unassignedIdentifiedCount).toBe(1)
  })

  it('desglose parcial (TEST: grupo parcialmente desglosado): reporta total/identificados/por-nombrar/sentados/sin-mesa', () => {
    // Grupo de 5 (declarado), solo 2 personas nombradas todavía.
    const status = computeGuestSeatingStatus({ adultsCount: 3, childrenCount: 2 }, [{ tableId: 'mesa-ninos' }, { tableId: null }])
    expect(status).toEqual({
      mode: 'personas',
      totalDeclared: 5,
      identifiedCount: 2,
      unidentifiedCount: 3,
      seatedIdentifiedCount: 1,
      unassignedIdentifiedCount: 1,
    })
  })
})

describe('computeTableOccupancy (TEST: sin doble conteo, TEST: plazas sin nombre nunca se asignan a una mesa)', () => {
  const mesaNinos = { id: 'mesa-ninos' }

  it('unidad sin desglose: cuenta el grupo entero solo si su table_id de unidad es esa mesa', () => {
    const guests = [{ id: 'g1', adultsCount: 2, childrenCount: 1, tableId: 'mesa-ninos' }, { id: 'g2', adultsCount: 1, childrenCount: 0, tableId: 'otra-mesa' }]
    expect(computeTableOccupancy(mesaNinos, guests, {})).toBe(3)
  })

  it('unidad CON desglose: su table_id de unidad ya NO cuenta (evita duplicar plazas) — solo cuentan sus personas', () => {
    const guests = [{ id: 'g1', adultsCount: 2, childrenCount: 1, tableId: 'mesa-ninos' }]
    // El grupo entero "vale" 3, pero solo 1 persona real está sentada en mesa-ninos.
    const membersByGuestId = { g1: [{ tableId: 'mesa-ninos' }, { tableId: null }, { tableId: null }] }
    expect(computeTableOccupancy(mesaNinos, guests, membersByGuestId)).toBe(1)
  })

  it('las plazas sin nombre (declaradas de más, sin persona real) nunca se cuentan en ninguna mesa', () => {
    const guests = [{ id: 'g1', adultsCount: 4, childrenCount: 0, tableId: 'mesa-ninos' }]
    // Solo 1 de las 4 plazas declaradas tiene una persona real, y esa persona no está en mesa-ninos.
    const membersByGuestId = { g1: [{ tableId: null }] }
    expect(computeTableOccupancy(mesaNinos, guests, membersByGuestId)).toBe(0)
  })

  it('caso real reproducido (Bodas de plata / Mesa niños, sin tocar producción): con desglose, la mesa vacía se puede llenar', () => {
    // Reproduce la limitación real documentada en la Fase 13B: una
    // "Mesa niños" (capacidad 5) que quedaba SIEMPRE vacía porque el
    // grupo entero de 3 personas (2 adultos + 1 niño) solo se podía
    // sentar como unidad en UNA mesa. Con la Fase 14C, desglosando esa
    // unidad, el niño concreto sí puede sentarse en la mesa de niños
    // sin mover a los adultos.
    const table = { id: 'mesa-ninos' }
    const guests = [{ id: 'familia-1', adultsCount: 2, childrenCount: 1, tableId: 'mesa-principal' }]
    const membersByGuestId = {
      'familia-1': [{ tableId: 'mesa-principal' }, { tableId: 'mesa-principal' }, { tableId: 'mesa-ninos' }],
    }
    expect(computeTableOccupancy(table, guests, membersByGuestId)).toBe(1)
    expect(computeTableOccupancy({ id: 'mesa-principal' }, guests, membersByGuestId)).toBe(2)
  })
})
