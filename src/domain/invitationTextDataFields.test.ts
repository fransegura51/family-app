import { describe, expect, it } from 'vitest'
import { autoArrangeLayers, buildInvitationDataFields, estimateLayerBoxFraction, resolveLayerFontWeight } from '@/domain/events'
import type { FamilyEvent, InvitationLayer } from '@/domain/types'

// Fase 3 Bloque 2 (2026-09-27) — texto (alineación/negrita/cursiva) y "📋 Datos" reales del evento.
// Compatibilidad CRÍTICA: una capa guardada ANTES de este bloque no tiene textAlign/bold/italic — debe
// renderizar EXACTAMENTE igual que antes (ver resolveLayerFontWeight y el default 'center' en
// InvitationLayerVisual, ui/InvitationDesigner.tsx).

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

function layer(type: InvitationLayer['type'], overrides: Partial<InvitationLayer> = {}): InvitationLayer {
  return { id: 'l1', type, x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 1, ...overrides }
}

describe('resolveLayerFontWeight — compatible con invitaciones guardadas antes de este bloque', () => {
  it('capa "text" SIN bold (undefined) sigue dando 700 — el aspecto de una invitación antigua no cambia', () => {
    expect(resolveLayerFontWeight(layer('text'))).toBe(700)
  })

  it('capa "event_data" SIN bold (undefined) sigue dando 400', () => {
    expect(resolveLayerFontWeight(layer('event_data'))).toBe(400)
  })

  it('bold=true fuerza 700 aunque el tipo sea event_data', () => {
    expect(resolveLayerFontWeight(layer('event_data', { bold: true }))).toBe(700)
  })

  it('bold=false fuerza 400 aunque el tipo sea text', () => {
    expect(resolveLayerFontWeight(layer('text', { bold: false }))).toBe(400)
  })
})

describe('buildInvitationDataFields — solo datos reales, nunca inventados', () => {
  it('evento sin fecha/hora/lugar todavía no devuelve ningún campo', () => {
    const event = makeEvent({ dateStatus: 'pendiente', eventDate: null, eventTime: null, venueLabel: null })
    expect(buildInvitationDataFields(event)).toEqual([])
  })

  it('fecha se formatea en humano y en es-ES, con año — nunca el ISO en crudo', () => {
    const event = makeEvent({ eventDate: '2026-12-19' })
    const fields = buildInvitationDataFields(event)
    const fecha = fields.find((f) => f.key === 'fecha')
    expect(fecha?.value).toBe('📅 19 de diciembre de 2026')
    expect(fecha?.value).not.toContain('2026-12-19')
    expect(fecha?.value).not.toContain('T00:00')
  })

  it('fecha "pendiente" (dateStatus) no se incluye aunque eventDate tenga un valor previo guardado', () => {
    const event = makeEvent({ dateStatus: 'pendiente', eventDate: '2026-12-19' })
    expect(buildInvitationDataFields(event).some((f) => f.key === 'fecha')).toBe(false)
  })

  it('hora solo aparece si eventTime tiene valor, formateada HH:MM (sin segundos)', () => {
    const conHora = buildInvitationDataFields(makeEvent({ eventTime: '18:00:00' }))
    expect(conHora.find((f) => f.key === 'hora')?.value).toBe('🕐 18:00')
    const sinHora = buildInvitationDataFields(makeEvent({ eventTime: null }))
    expect(sinHora.some((f) => f.key === 'hora')).toBe(false)
  })

  it('cumpleaños: "lugar" usa venueLabel cuando existe', () => {
    const event = makeEvent({ type: 'cumpleanos', venueLabel: 'Parque de bolas Diverlandia' })
    expect(buildInvitationDataFields(event).find((f) => f.key === 'lugar')?.value).toBe('📍 Parque de bolas Diverlandia')
  })

  it('cumpleaños: "edad" solo si details.ageTurning es un número real (obligatorio al crear el evento, pero se comprueba igual)', () => {
    const conEdad = buildInvitationDataFields(makeEvent({ type: 'cumpleanos', details: { ageTurning: 7 } }))
    expect(conEdad.find((f) => f.key === 'edad')?.value).toBe('🎂 Cumple 7 años')
    const sinEdad = buildInvitationDataFields(makeEvent({ type: 'cumpleanos', details: {} }))
    expect(sinEdad.some((f) => f.key === 'edad')).toBe(false)
  })

  it('un tipo que no sea cumpleaños nunca inventa un campo "edad", aunque details tenga esa clave por error', () => {
    const event = makeEvent({ type: 'celebracion', details: { ageTurning: 40 } })
    expect(buildInvitationDataFields(event).some((f) => f.key === 'edad')).toBe(false)
  })

  it('boda (dual-location): ceremonia y celebración son campos separados, nunca un "lugar" genérico', () => {
    const event = makeEvent({
      type: 'boda',
      venueLabel: null,
      ceremonyLocationLabel: 'Parroquia de San José',
      ceremonyTime: '12:00:00',
      celebrationLocationLabel: 'Restaurante Los Olivos',
    })
    const fields = buildInvitationDataFields(event)
    expect(fields.find((f) => f.key === 'ceremonia')?.value).toBe('🕊️ Parroquia de San José · 12:00')
    expect(fields.find((f) => f.key === 'celebracion')?.value).toBe('🎉 Restaurante Los Olivos')
    expect(fields.some((f) => f.key === 'lugar')).toBe(false)
  })

  it('boda con solo celebración puesta: no inventa una ceremonia inexistente', () => {
    const event = makeEvent({ type: 'boda', ceremonyLocationLabel: null, celebrationLocationLabel: 'Jardines del Retiro' })
    const fields = buildInvitationDataFields(event)
    expect(fields.some((f) => f.key === 'ceremonia')).toBe(false)
    expect(fields.find((f) => f.key === 'celebracion')?.value).toBe('🎉 Jardines del Retiro')
  })

  it('evento completo de cumpleaños: fecha, hora, lugar y edad en ese orden', () => {
    const event = makeEvent({
      type: 'cumpleanos',
      eventDate: '2026-10-02',
      eventTime: '17:00:00',
      venueLabel: 'Parque de bolas Diverlandia',
      details: { ageTurning: 5 },
    })
    const fields = buildInvitationDataFields(event)
    expect(fields.map((f) => f.key)).toEqual(['fecha', 'hora', 'lugar', 'edad'])
  })
})

describe('autoArrangeLayers ("Pepa, hazla bonita") conserva textAlign/bold/italic — no toca estilo ni contenido', () => {
  const zone = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }

  it('una capa de texto con textAlign/bold/italic explícitos conserva esos 3 valores tras recolocarse', () => {
    const layers: InvitationLayer[] = [layer('text', { text: 'Hola', textAlign: 'left', bold: false, italic: true, y: 0.9 })]
    const result = autoArrangeLayers(layers, zone)
    const out = result.layers.find((l) => l.id === 'l1')!
    expect(out.textAlign).toBe('left')
    expect(out.bold).toBe(false)
    expect(out.italic).toBe(true)
    expect(out.text).toBe('Hola') // el contenido nunca cambia
  })

  it('una capa antigua sin esas propiedades sigue sin tenerlas tras "hazla bonita" (no las inventa)', () => {
    const layers: InvitationLayer[] = [layer('event_data', { text: 'Mensaje', y: 0.9 })]
    const result = autoArrangeLayers(layers, zone)
    const out = result.layers.find((l) => l.id === 'l1')!
    expect(out.textAlign).toBeUndefined()
    expect(out.bold).toBeUndefined()
    expect(out.italic).toBeUndefined()
  })
})

describe('estimateLayerBoxFraction usa el peso real (bold) al medir el ancho de línea', () => {
  it('pasa el fontWeight resuelto (no siempre el fijo por tipo) al measurer inyectado', () => {
    const seenWeights: number[] = []
    const measurer = (text: string, fontSize: number, fontWeight: number) => {
      seenWeights.push(fontWeight)
      return text.length * fontSize * 0.5
    }
    estimateLayerBoxFraction(layer('event_data', { text: 'Hola', bold: true }), 0.8, 1, measurer)
    expect(seenWeights).toContain(700)
    seenWeights.length = 0
    estimateLayerBoxFraction(layer('text', { text: 'Hola', bold: false }), 0.8, 1, measurer)
    expect(seenWeights).toContain(400)
  })
})
