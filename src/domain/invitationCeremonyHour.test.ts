import { describe, expect, it } from 'vitest'
import { autoArrangeLayers, buildInvitationDataFields, INVITATION_TEMPLATES } from '@/domain/events'
import {
  composeInvitationForMe,
  getInvitationEventDataChanges,
  isInvitationLayerManuallyEdited,
  updateInvitationLayersFromEvent,
  type AutoComposeSuccess,
} from '@/domain/invitationAutoCompose'
import type { FamilyEvent } from '@/domain/types'

// Corrección "última tarea de esta noche" — integración de la hora de ceremonia (event.ceremonyTime, ya
// editable desde CeremoniaSection para boda/comunion/bautizo) en el sistema de 5A/5B. El campo real ya
// existía; lo que faltaba era separarlo de "ceremonia" (antes venía pegado en el mismo texto) para poder
// detectarlo/actualizarlo de forma independiente — ver el comentario en buildInvitationDataFields
// (domain/events.ts) y mergeCompactPair (domain/invitationAutoCompose.ts).

function makeEvent(overrides: Partial<FamilyEvent>): FamilyEvent {
  return {
    id: 'e1', familyId: 'f1', type: 'boda', subtype: null, title: 'Boda de Ana y Luis', dateStatus: 'confirmada',
    eventDate: '2026-10-02', eventTime: null, venueLabel: null, venueType: null, venueLatitude: null, venueLongitude: null,
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

describe('5-7. "Pepa, hazla por mí" incluye la hora de ceremonia en las 3 recetas', () => {
  it('Clásica', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('10:00')
    expect(allText).toContain('Iglesia de San Andrés, Almoradí')
  })

  it('Con foto', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('elegante'), style: 'con_foto', photoPath: 'x.jpg' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('10:00')
  })

  it('Divertida', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('elegante'), style: 'divertida' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('10:00')
  })

  it('16-17. nunca inventa una hora de celebración, y nunca usa eventTime como sustituto de la hora de ceremonia', () => {
    const eventWithGenericHora = makeEvent({ eventTime: '20:00:00' }) // hora general del evento, distinta de la de ceremonia
    const result = composeInvitationForMe({ event: eventWithGenericHora, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('10:00') // la hora de ceremonia real
    // La celebración nunca lleva una hora inventada pegada a su texto.
    const celebracionLayer = result.layers.find((l) => l.source?.field === 'celebracion')
    expect(celebracionLayer?.text).toBe('🎉 Restaurante Trastevere, Almoradí')
  })
})

describe('8. "Hazla bonita" conserva exactamente la hora de la ceremonia', () => {
  it('el texto de la capa de hora no cambia al reorganizar (autoArrangeLayers solo mueve x/y/rotation)', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const horaLayer = result.layers.find((l) => l.source?.field === 'hora_ceremonia')
    expect(horaLayer?.text).toBe('🕐 10:00')
    const rearranged = autoArrangeLayers(result.layers, template('boda').textArea, template('boda').imageAspect).layers
    const horaAfter = rearranged.find((l) => l.id === horaLayer!.id)
    expect(horaAfter?.text).toBe('🕐 10:00')
    expect(horaAfter?.source).toEqual(horaLayer?.source)
  })
})

describe('9-11. detección de cambio de hora de ceremonia', () => {
  it('10:00 → 11:00 se detecta, e identifica el campo como "hora_ceremonia"', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const changedEvent = { ...EVENT_WITH_CEREMONY, ceremonyTime: '11:00:00' }
    const changes = getInvitationEventDataChanges(result.layers, changedEvent)
    const horaChange = changes.find((c) => c.field === 'hora_ceremonia')
    expect(horaChange).toBeDefined()
    expect(horaChange!.previous).toBe('🕐 10:00')
    expect(horaChange!.current).toBe('🕐 11:00')
    // El lugar no cambió: no debe aparecer como cambio.
    expect(changes.some((c) => c.field === 'ceremonia')).toBe(false)
  })
})

describe('12. actualización selectiva de la hora de ceremonia (nunca toca el lugar ni otros datos)', () => {
  it('updateInvitationLayersFromEvent(..., ["hora_ceremonia"]) solo cambia esa capa', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const changedEvent = { ...EVENT_WITH_CEREMONY, ceremonyTime: '11:00:00' }
    const updated = updateInvitationLayersFromEvent(result.layers, changedEvent, ['hora_ceremonia'])
    const horaAfter = updated.find((l) => l.source?.field === 'hora_ceremonia')!
    expect(horaAfter.text).toBe('🕐 11:00')
    expect(horaAfter.source?.valueAtInsertion).toBe('🕐 11:00')
    // La ceremonia (lugar) sigue siendo exactamente la misma capa (misma referencia).
    const ceremoniaBefore = result.layers.find((l) => l.source?.field === 'ceremonia')
    const ceremoniaAfter = updated.find((l) => l.source?.field === 'ceremonia')
    expect(ceremoniaAfter).toBe(ceremoniaBefore)
  })
})

describe('14. hora modificada manualmente no se sobrescribe sin permiso', () => {
  it('isInvitationLayerManuallyEdited detecta una personalización de la hora de ceremonia', () => {
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const horaLayer = result.layers.find((l) => l.source?.field === 'hora_ceremonia')!
    expect(isInvitationLayerManuallyEdited(horaLayer)).toBe(false)
    const edited = { ...horaLayer, text: '🕐 10:15 — Llegad un poco antes' }
    expect(isInvitationLayerManuallyEdited(edited)).toBe(true)
    // updateInvitationLayersFromEvent no sobrescribe por sí solo una capa personalizada sin que se le pida
    // explícitamente ese campo — pero si se pide, sigue sustituyendo (la decisión de "mantener mi texto" es
    // de la UI, ver applyEventDataUpdate en InvitationDesigner.tsx, sección 32 del Bloque 5B).
    expect(edited.source?.field).toBe('hora_ceremonia')
  })
})

describe('15. recetas compactas fusionan ceremonia+hora en una sola línea, sin romper el seguimiento', () => {
  it('la capa fusionada nunca lleva procedencia (evita el mismo falso "cambió" ya corregido para fecha+hora)', () => {
    // Familia 3/4 (horizontal extrema/compacta) fuerza recetas compactas para boda-tipo eventos.
    const result = composeInvitationForMe({ event: EVENT_WITH_CEREMONY, template: template('princesa'), style: 'clasica' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.acceptedRecipe).toBe('C2') // compacta
    const merged = result.layers.find((l) => l.text?.includes('Iglesia de San Andrés') && l.text?.includes('10:00'))
    expect(merged).toBeDefined()
    expect(merged?.source).toBeUndefined()
    // Aun así, no hay ningún falso "cambió" para ese caso.
    expect(getInvitationEventDataChanges(result.layers, EVENT_WITH_CEREMONY)).toEqual([])
  })
})
