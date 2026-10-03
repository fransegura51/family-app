import { describe, expect, it } from 'vitest'
import { autoArrangeLayers, buildInvitationContent, buildInvitationDataFields, INVITATION_TEMPLATES } from '@/domain/events'
import { composeInvitationForMe, getInvitationEventDataChanges, isInvitationLayerManuallyEdited, updateInvitationLayersFromEvent, type AutoComposeSuccess } from '@/domain/invitationAutoCompose'
import type { FamilyEvent, InvitationLayer } from '@/domain/types'

// Corrección "última tarea de esta noche" — integración de la hora de ceremonia (event.ceremonyTime, ya
// editable desde CeremoniaSection para boda/comunion/bautizo), evolucionado 2026-09-28 para el generador
// narrativo: la hora de ceremonia ahora se teje DENTRO del párrafo BODY (buildInvitationContent,
// domain/events.ts) en vez de vivir en su propia capa — el campo real (buildInvitationDataFields) no
// cambió, solo cómo llega a la invitación.

function makeEvent(overrides: Partial<FamilyEvent>): FamilyEvent {
  return {
    id: 'e1', familyId: 'f1', type: 'boda', subtype: null, title: 'Boda de Ana y Luis', dateStatus: 'confirmada',
    eventDate: '2026-10-02', eventTime: null, venueLabel: null, venueType: null, includedServices: null, venueLatitude: null, venueLongitude: null, venueAddress: null, venuePlaceId: null,
    ceremonyLocationLabel: 'Iglesia de San Andrés, Almoradí', ceremonyLocationLatitude: null, ceremonyLocationLongitude: null,
    ceremonyTime: '10:00:00',
    celebrationLocationLabel: 'Restaurante Trastevere, Almoradí', celebrationLocationLatitude: null, celebrationLocationLongitude: null,
    theme: null, details: {}, enabledModules: [], status: 'planificacion', tagId: null, calendarEventId: null,
    rsvpDeadline: null, rsvpDeadlineCalendarEventId: null, openRsvpToken: null, createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides,
  }
}

function template(key: string) {
  const t = INVITATION_TEMPLATES.find((t) => t.key === key)
  if (!t) throw new Error(`plantilla de test no encontrada: ${key}`)
  return t
}

const EVENT_WITH_CEREMONY = makeEvent({})

function bodyLayer(layers: InvitationLayer[]): InvitationLayer {
  const l = layers.find((l) => l.id === 'auto-body')
  if (!l) throw new Error('capa auto-body no encontrada')
  return l
}

describe('1-4. campo real identificado correctamente (ceremonyTime, ya editable en CeremoniaSection)', () => {
  it('boda/comunion/bautizo con ceremonyTime da un campo "hora_ceremonia" independiente de "ceremonia"', () => {
    const fields = buildInvitationDataFields(EVENT_WITH_CEREMONY)
    expect(fields.find((f) => f.key === 'ceremonia')?.value).toBe('🕊️ Iglesia de San Andrés, Almoradí')
    expect(fields.find((f) => f.key === 'hora_ceremonia')?.value).toBe('🕐 10:00')
  })

  it('sin ceremonyTime, no se inventa ninguna hora de ceremonia', () => {
    const fields = buildInvitationDataFields(makeEvent({ ceremonyTime: null }))
    expect(fields.some((f) => f.key === 'hora_ceremonia')).toBe(false)
  })

  it('comunión y bautizo también reciben el campo (no es exclusivo de boda)', () => {
    for (const type of ['comunion', 'bautizo'] as const) {
      const fields = buildInvitationDataFields(makeEvent({ type }))
      expect(fields.find((f) => f.key === 'hora_ceremonia')?.value, type).toBe('🕐 10:00')
    }
  })

  it('cumpleaños/celebración/personalizado nunca reciben hora de ceremonia (no son DUAL_LOCATION)', () => {
    for (const type of ['cumpleanos', 'celebracion', 'personalizado'] as const) {
      const fields = buildInvitationDataFields(makeEvent({ type, ceremonyLocationLabel: null, celebrationLocationLabel: null, venueLabel: 'Salón X' }))
      expect(fields.some((f) => f.key === 'hora_ceremonia'), type).toBe(false)
    }
  })
})

describe('5-7. buildInvitationContent teje la hora de ceremonia dentro del BODY, para los dos estilos y con/sin foto', () => {
  it('Clásico', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('10:00')
    expect(allText).toContain('Iglesia de San Andrés, Almoradí')
  })

  it('Clásico con foto', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('elegante'), style: 'clasico', photoPath: 'x.jpg' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('10:00')
  })

  it('Divertido', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('elegante'), style: 'divertido' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('10:00')
  })

  it('16-17. nunca inventa una hora de celebración, y nunca usa eventTime como sustituto de la hora de ceremonia', () => {
    const eventWithGenericHora = makeEvent({ eventTime: '20:00:00' }) // hora general del evento, distinta de la de ceremonia
    const result = composeInvitationForMe({ event: eventWithGenericHora, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('10:00') // la hora de ceremonia real
    expect(allText).not.toMatch(/20:00/) // eventTime nunca sustituye a la hora de ceremonia
  })

  it('la relación ceremonia→celebración se entiende, no se enumera ("...en X, y después...en Y")', () => {
    const content = buildInvitationContent(EVENT_WITH_CEREMONY)
    expect(content.body).toMatch(/Iglesia de San Andrés.*después.*Restaurante Trastevere/)
  })
})

describe('8. "Hazla bonita" conserva exactamente el párrafo (incluida la hora de la ceremonia)', () => {
  it('el texto de la capa BODY no cambia al reorganizar (autoArrangeLayers solo mueve x/y/rotation)', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const before = bodyLayer(result.layers)
    expect(before.text).toContain('10:00')
    const rearranged = autoArrangeLayers(result.layers, template('boda').textArea, template('boda').imageAspect).layers
    const after = bodyLayer(rearranged)
    expect(after.text).toBe(before.text)
    expect(after.source).toEqual(before.source)
  })
})

describe('9-11. detección de cambio de hora de ceremonia', () => {
  it('10:00 → 11:00 se detecta, e identifica el campo como "hora_ceremonia"', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const changedEvent = { ...EVENT_WITH_CEREMONY, ceremonyTime: '11:00:00' }
    const changes = getInvitationEventDataChanges(result.layers, changedEvent)
    const horaChange = changes.find((c) => c.field === 'hora_ceremonia')
    expect(horaChange).toBeDefined()
    expect(horaChange!.previous).toBe('🕐 10:00')
    expect(horaChange!.current).toBe('🕐 11:00')
    // El lugar de la ceremonia no cambió: no debe aparecer como cambio.
    expect(changes.some((c) => c.field === 'ceremonia')).toBe(false)
  })
})

describe('12. actualización selectiva de la hora de ceremonia — regenera el párrafo entero (sección 10)', () => {
  it('updateInvitationLayersFromEvent(..., ["hora_ceremonia"]) regenera el BODY con la nueva hora, conservando el resto', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const changedEvent = { ...EVENT_WITH_CEREMONY, ceremonyTime: '11:00:00' }
    const updated = updateInvitationLayersFromEvent(result.layers, changedEvent, ['hora_ceremonia'])
    const after = bodyLayer(updated)
    expect(after.text).toContain('11:00')
    expect(after.text).not.toContain('10:00')
    expect(after.text).toContain('Iglesia de San Andrés, Almoradí') // el lugar sigue ahí, no se pierde
    expect(after.text).toContain('Restaurante Trastevere, Almoradí')
  })
})

describe('14. párrafo modificado manualmente no se sobrescribe sin permiso (sección 11)', () => {
  it('isInvitationLayerManuallyEdited detecta una personalización del párrafo', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const before = bodyLayer(result.layers)
    expect(isInvitationLayerManuallyEdited(before)).toBe(false)
    const edited = { ...before, text: 'Llegad a las 10:15, un poco antes de lo previsto' }
    expect(isInvitationLayerManuallyEdited(edited)).toBe(true)
  })

  it('updateInvitationLayersFromEvent NO sobrescribe el párrafo editado a mano, aunque se pida su campo explícitamente (principio obligatorio, sección 11)', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const editedText = 'Os esperamos en la Iglesia de San Andrés, llegad con tiempo — ¡luego lo celebramos en Trastevere!'
    const layersWithEdit = result.layers.map((l) => (l.id === 'auto-body' ? { ...l, text: editedText } : l))
    const changedEvent = { ...EVENT_WITH_CEREMONY, ceremonyTime: '11:00:00' }
    const updated = updateInvitationLayersFromEvent(layersWithEdit, changedEvent, ['hora_ceremonia'])
    expect(bodyLayer(updated).text).toBe(editedText)
  })
})

describe('15. la hora de ceremonia siempre viaja tejida en el mismo párrafo que el resto — nunca una capa suelta que pueda desincronizarse', () => {
  it('nunca hay una capa de texto separada que contenga solo "10:00" sin el resto del párrafo', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('princesa'), style: 'clasico' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const loneHourLayer = result.layers.find((l) => l.text?.trim() === '🕐 10:00')
    expect(loneHourLayer).toBeUndefined()
    // Sigue sin haber falsos "cambió" para este caso.
    expect(getInvitationEventDataChanges(result.layers, EVENT_WITH_CEREMONY)).toEqual([])
  })
})
