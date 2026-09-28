import { describe, expect, it } from 'vitest'
import { autoArrangeLayers, INVITATION_TEMPLATES } from '@/domain/events'
import {
  buildCustomTemplateMeta,
  checkAllStyleCompatibility,
  checkStyleCompatibility,
  composeInvitationForMe,
  CUSTOM_TEMPLATE_KEY,
  getInvitationEventDataChanges,
  invitationHasTrackedEventData,
  isInvitationLayerManuallyEdited,
  removeInvitationLayersForRemovedFields,
  toEventFieldKey,
  updateInvitationLayersFromEvent,
  type AutoComposeSuccess,
} from '@/domain/invitationAutoCompose'
import type { FamilyEvent, InvitationLayer } from '@/domain/types'

// Fase 3 Bloque 5B, evolucionado 2026-09-28 — compatibilidad de estilo, plantilla propia, y seguimiento de
// datos del evento sobre el generador narrativo (source.kind: 'event_field' | 'event_narrative'). Sin React
// Testing Library (igual que el resto de domain/*.test.ts): funciones puras, llamadas directamente.

function makeEvent(overrides: Partial<FamilyEvent>): FamilyEvent {
  return {
    id: 'e1', familyId: 'f1', type: 'cumpleanos', subtype: null, title: 'Evento', dateStatus: 'confirmada',
    eventDate: null, eventTime: null, venueLabel: null, venueType: null, venueLatitude: null, venueLongitude: null,
    ceremonyLocationLabel: null, ceremonyLocationLatitude: null, ceremonyLocationLongitude: null, ceremonyTime: null,
    celebrationLocationLabel: null, celebrationLocationLatitude: null, celebrationLocationLongitude: null,
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

const FULL_EVENT = makeEvent({
  type: 'cumpleanos',
  title: 'Cumpleaños de Valentina',
  eventDate: '2026-11-14',
  eventTime: '18:00',
  venueLabel: 'Salón de fiestas Arcoíris',
  details: { ageTurning: 8 },
})

function bodyLayer(layers: InvitationLayer[]): InvitationLayer {
  const l = layers.find((l) => l.id === 'auto-body')
  if (!l) throw new Error('capa auto-body no encontrada')
  return l
}

describe('toEventFieldKey', () => {
  it('normaliza "edad" a "subtitle", el resto se queda igual', () => {
    expect(toEventFieldKey('edad')).toBe('subtitle')
    expect(toEventFieldKey('fecha')).toBe('fecha')
    expect(toEventFieldKey('lugar')).toBe('lugar')
  })
})

describe('checkStyleCompatibility / checkAllStyleCompatibility', () => {
  it('Clásico es compatible con una plantilla normal', () => {
    const result = checkStyleCompatibility({ event: FULL_EVENT, template: template('boda'), style: 'clasico' })
    expect(result.compatible).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('checkAllStyleCompatibility devuelve los 2 estilos, en el mismo orden', () => {
    const all = checkAllStyleCompatibility({ event: FULL_EVENT, template: template('boda') })
    expect(all.map((r) => r.style)).toEqual(['clasico', 'divertido'])
  })

  it('la compatibilidad con foto se recalcula pasando photoPath — puede diferir de sin foto', () => {
    const withoutPhoto = checkStyleCompatibility({ event: FULL_EVENT, template: template('boda'), style: 'clasico' })
    const withPhoto = checkStyleCompatibility({ event: FULL_EVENT, template: template('boda'), style: 'clasico', photoPath: 'x.jpg' })
    expect(withoutPhoto.compatible).toBe(true)
    expect(typeof withPhoto.compatible).toBe('boolean')
  })

  it('no hay ningún caso especial hardcodeado por nombre de plantilla: la compatibilidad se deriva siempre de composeInvitationForMe', () => {
    for (const key of ['otono_hogar', 'bruja', 'corazones_terraza', 'delfin_tortuga']) {
      const direct = composeInvitationForMe({ event: FULL_EVENT, template: template(key), style: 'clasico', photoPath: 'x.jpg' })
      const compat = checkStyleCompatibility({ event: FULL_EVENT, template: template(key), style: 'clasico', photoPath: 'x.jpg' })
      expect(compat.compatible).toBe(direct.status === 'success')
    }
  })
})

describe('buildCustomTemplateMeta', () => {
  const textArea = { x: 0.1, y: 0.2, width: 0.6, height: 0.5 }

  it('construye una InvitationTemplateMeta sintética con la clave reservada, nunca del catálogo real', () => {
    const meta = buildCustomTemplateMeta(textArea)
    expect(meta.key).toBe(CUSTOM_TEMPLATE_KEY)
    expect(INVITATION_TEMPLATES.some((t) => t.key === CUSTOM_TEMPLATE_KEY)).toBe(false)
    expect(meta.textArea).toEqual(textArea)
    expect(meta.imageAspect).toBe(1)
  })

  it('composeInvitationForMe funciona igual sobre una plantilla propia que sobre una real (mismo motor, sin caso especial)', () => {
    const meta = buildCustomTemplateMeta(textArea)
    const result = composeInvitationForMe({ event: FULL_EVENT, template: meta, style: 'clasico' })
    expect(result.status).toBe('success')
  })

  it('nunca se añade al catálogo INVITATION_TEMPLATES al construirla (solo se lee, nunca se escribe)', () => {
    const before = INVITATION_TEMPLATES.length
    buildCustomTemplateMeta(textArea)
    expect(INVITATION_TEMPLATES.length).toBe(before)
  })
})

describe('seguimiento de datos del evento — capa BODY narrativa (source.kind: "event_narrative")', () => {
  it('el título sigue llevando procedencia "event_field" (un hecho = una capa)', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const titleLayer = result.layers.find((l) => l.id === 'auto-title')!
    expect(titleLayer.source).toEqual({ kind: 'event_field', field: 'title', valueAtInsertion: 'Cumpleaños de Valentina' })
  })

  it('el BODY lleva procedencia "event_narrative" con TODOS los campos reales que tejió, y el texto completo generado', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const body = bodyLayer(result.layers)
    expect(body.source?.kind).toBe('event_narrative')
    if (body.source?.kind !== 'event_narrative') throw new Error('unreachable')
    expect(body.source.bodyAtInsertion).toBe(body.text)
    const fields = body.source.fields.map((f) => f.field).sort()
    expect(fields).toEqual(['fecha', 'hora', 'lugar', 'subtitle'].sort())
  })

  it('el cierre genérico nunca lleva procedencia', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const closingLayer = result.layers.find((l) => l.id === 'auto-closing')
    if (closingLayer) expect(closingLayer.source).toBeUndefined()
  })

  it('invitationHasTrackedEventData: false para capas sin procedencia (invitación anterior a este bloque o texto libre)', () => {
    const freeform: InvitationLayer[] = [{ id: 'a', type: 'text', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 0, text: 'Hola' }]
    expect(invitationHasTrackedEventData(freeform)).toBe(false)
  })

  it('invitationHasTrackedEventData: true en cuanto una capa generada por el motor está presente (event_field o event_narrative)', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    expect(invitationHasTrackedEventData(result.layers)).toBe(true)
  })

  it('getInvitationEventDataChanges: sin cambios cuando el evento sigue igual', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    expect(getInvitationEventDataChanges(result.layers, FULL_EVENT)).toEqual([])
  })

  it('getInvitationEventDataChanges: detecta fecha y lugar cambiados dentro del MISMO párrafo narrativo, ambos reportados', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const changedEvent = { ...FULL_EVENT, eventDate: '2026-12-20', venueLabel: 'Restaurante Nuevo' }
    const changes = getInvitationEventDataChanges(result.layers, changedEvent)
    const fields = changes.map((c) => c.field).sort()
    expect(fields).toEqual(['fecha', 'lugar'])
  })

  it('getInvitationEventDataChanges: dato eliminado del evento da current:null, no lanza', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const eventWithoutHora = { ...FULL_EVENT, eventTime: null }
    const changes = getInvitationEventDataChanges(result.layers, eventWithoutHora)
    const horaChange = changes.find((c) => c.field === 'hora')
    expect(horaChange).toBeDefined()
    expect(horaChange!.current).toBeNull()
  })

  it('getInvitationEventDataChanges: un campo NUEVO que la invitación nunca usó no se reporta como cambio', () => {
    const eventWithoutHora = { ...FULL_EVENT, eventTime: null }
    const result = composeInvitationForMe({ event: eventWithoutHora, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const eventWithNewHora = { ...FULL_EVENT, eventTime: '20:00' }
    const changes = getInvitationEventDataChanges(result.layers, eventWithNewHora)
    expect(changes.some((c) => c.field === 'hora')).toBe(false)
  })

  it('getInvitationEventDataChanges: invitación sin ninguna capa con procedencia no reporta nada (no puede saberlo)', () => {
    const freeform: InvitationLayer[] = [{ id: 'a', type: 'text', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 0, text: 'Hola' }]
    expect(getInvitationEventDataChanges(freeform, { ...FULL_EVENT, title: 'Otro título' })).toEqual([])
  })

  it('isInvitationLayerManuallyEdited: false cuando el párrafo sigue siendo el generado originalmente', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    expect(isInvitationLayerManuallyEdited(bodyLayer(result.layers))).toBe(false)
  })

  it('isInvitationLayerManuallyEdited: true cuando el usuario reescribió el párrafo después de generarlo', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const edited = { ...bodyLayer(result.layers), text: 'Un párrafo totalmente distinto, escrito a mano' }
    expect(isInvitationLayerManuallyEdited(edited)).toBe(true)
  })

  it('isInvitationLayerManuallyEdited: false para una capa sin procedencia (texto libre)', () => {
    const freeform: InvitationLayer = { id: 'a', type: 'text', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 0, text: 'Hola' }
    expect(isInvitationLayerManuallyEdited(freeform)).toBe(false)
  })

  it('la metadata nunca se borra al editar el párrafo a mano — sigue sabiéndose qué campos participaron', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const edited = { ...bodyLayer(result.layers), text: 'Reescrito a mano por completo' }
    expect(edited.source?.kind).toBe('event_narrative')
    expect(isInvitationLayerManuallyEdited(edited)).toBe(true)
  })
})

describe('updateInvitationLayersFromEvent — regenera el párrafo entero, nunca busca/reemplaza (sección 10)', () => {
  it('regenera el BODY completo cuando alguno de sus campos cambia; la gramática se reconstruye si un dato deja de estar', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const eventWithoutHora = { ...FULL_EVENT, eventTime: null }
    const updated = updateInvitationLayersFromEvent(result.layers, eventWithoutHora, ['hora'])
    const newBody = bodyLayer(updated)
    expect(newBody.text).not.toMatch(/\d{2}:\d{2}/)
    expect(newBody.text).toContain('Salón de fiestas Arcoíris') // el resto de la frase se conserva
  })

  it('el texto regenerado nunca es un patch palabra por palabra: es exactamente lo que buildInvitationContent generaría hoy', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const changedEvent = { ...FULL_EVENT, eventDate: '2026-12-20' }
    const updated = updateInvitationLayersFromEvent(result.layers, changedEvent, ['fecha'])
    const regenerated = composeInvitationForMe({ event: changedEvent, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    expect(bodyLayer(updated).text).toBe(bodyLayer(regenerated.layers).text)
  })

  it('solo regenera el BODY si el campo pedido participa en él — otros campos (título) no se tocan', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const titleBefore = result.layers.find((l) => l.id === 'auto-title')!
    const changedEvent = { ...FULL_EVENT, eventDate: '2026-12-20' }
    const updated = updateInvitationLayersFromEvent(result.layers, changedEvent, ['fecha'])
    const titleAfter = updated.find((l) => l.id === 'auto-title')!
    expect(titleAfter).toBe(titleBefore) // misma referencia — nunca tocado.
  })

  it('nunca toca texto libre, decoración, ni capas sin procedencia', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('unicornio'), style: 'divertido' }) as AutoComposeSuccess
    const freeform: InvitationLayer = { id: 'manual-1', type: 'text', x: 0.5, y: 0.9, rotation: 0, scale: 1, zIndex: 99, text: 'Texto libre del usuario' }
    const layers = [...result.layers, freeform]
    const changedEvent = { ...FULL_EVENT, eventDate: '2026-12-20' }
    const updated = updateInvitationLayersFromEvent(layers, changedEvent, ['fecha'])
    expect(updated.find((l) => l.id === 'manual-1')).toEqual(freeform)
  })

  it('con una lista vacía de campos, devuelve exactamente el mismo array (misma referencia)', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    expect(updateInvitationLayersFromEvent(result.layers, FULL_EVENT, [])).toBe(result.layers)
  })
})

describe('protección de ediciones manuales (sección 11) — PEPA avisa, nunca borra en silencio', () => {
  it('un BODY editado a mano NO se sobrescribe aunque su campo esté explícitamente en fieldsToUpdate', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const editedText = 'Venid todos a celebrar el cumple de Valentina, ¡nos vemos en su casa como siempre!'
    const layersWithEdit = result.layers.map((l) => (l.id === 'auto-body' ? { ...l, text: editedText } : l))
    const changedEvent = { ...FULL_EVENT, eventTime: '20:00' }
    const updated = updateInvitationLayersFromEvent(layersWithEdit, changedEvent, ['hora'])
    expect(bodyLayer(updated).text).toBe(editedText)
  })

  it('un dato suelto (event_field) editado a mano tampoco se sobrescribe, aunque se pida explícitamente su campo', () => {
    // Reutiliza el mismo mecanismo que protege el BODY: cualquier capa con procedencia se protege igual,
    // sea "event_field" o "event_narrative" — defensa en profundidad, no un caso especial del narrativo.
    const titleLayer: InvitationLayer = {
      id: 't1', type: 'text', x: 0.5, y: 0.2, rotation: 0, scale: 1, zIndex: 1,
      text: 'Un título que el usuario reescribió a mano',
      source: { kind: 'event_field', field: 'title', valueAtInsertion: 'Cumpleaños de Valentina' },
    }
    const changedEvent = { ...FULL_EVENT, title: 'Cumpleaños de Valentina (actualizado)' }
    const updated = updateInvitationLayersFromEvent([titleLayer], changedEvent, ['title'])
    expect(updated[0].text).toBe('Un título que el usuario reescribió a mano')
  })

  it('sin edición manual, la actualización SÍ se aplica con normalidad (la protección no bloquea el caso normal)', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const changedEvent = { ...FULL_EVENT, eventTime: '20:00' }
    const updated = updateInvitationLayersFromEvent(result.layers, changedEvent, ['hora'])
    expect(bodyLayer(updated).text).toContain('20:00')
    expect(bodyLayer(updated).text).not.toBe(bodyLayer(result.layers).text)
  })

  it('getInvitationEventDataChanges SIGUE detectando el cambio incluso si la capa fue editada a mano (PEPA puede avisar)', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const layersWithEdit = result.layers.map((l) => (l.id === 'auto-body' ? { ...l, text: 'Texto reescrito a mano' } : l))
    const changedEvent = { ...FULL_EVENT, eventTime: '20:00' }
    const changes = getInvitationEventDataChanges(layersWithEdit, changedEvent)
    expect(changes.some((c) => c.field === 'hora')).toBe(true)
  })
})

describe('"Pepa, hazla bonita" (autoArrangeLayers) tras "Pepa, hazla por mí"', () => {
  it('conserva la metadata de procedencia de cada capa — solo reorganiza x/y/rotation, nunca el contenido', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const before = result.layers.filter((l) => l.source)
    expect(before.length).toBeGreaterThan(0)
    const rearranged = autoArrangeLayers(result.layers, template('boda').textArea, template('boda').imageAspect).layers
    for (const layer of before) {
      const after = rearranged.find((l) => l.id === layer.id)!
      expect(after.source).toEqual(layer.source)
      expect(after.text).toBe(layer.text)
    }
  })
})

describe('removeInvitationLayersForRemovedFields', () => {
  it('quita la capa de un dato suelto (event_field) cuyo campo ya no existe', () => {
    const layers: InvitationLayer[] = [
      { id: 'a', type: 'event_data', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 0, text: '📍 Salón X', source: { kind: 'event_field', field: 'lugar', valueAtInsertion: '📍 Salón X' } },
      { id: 'b', type: 'text', x: 0.5, y: 0.2, rotation: 0, scale: 1, zIndex: 1, text: 'Título', source: { kind: 'event_field', field: 'title', valueAtInsertion: 'Título' } },
    ]
    const after = removeInvitationLayersForRemovedFields(layers, ['lugar'])
    expect(after.some((l) => l.id === 'a')).toBe(false)
    expect(after.some((l) => l.id === 'b')).toBe(true)
  })

  it('NUNCA quita una capa "event_narrative", aunque uno de sus campos ya no exista — perdería el resto de hechos que sigue teniendo', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const after = removeInvitationLayersForRemovedFields(result.layers, ['hora', 'lugar', 'fecha', 'subtitle'])
    expect(after.some((l) => l.id === 'auto-body')).toBe(true)
  })

  it('con una lista vacía, devuelve exactamente el mismo array', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    expect(removeInvitationLayersForRemovedFields(result.layers, [])).toBe(result.layers)
  })

  it('nunca quita una capa de texto libre', () => {
    const freeform: InvitationLayer = { id: 'manual-1', type: 'text', x: 0.5, y: 0.9, rotation: 0, scale: 1, zIndex: 99, text: 'Texto libre' }
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const layers = [...result.layers, freeform]
    const after = removeInvitationLayersForRemovedFields(layers, ['hora'])
    expect(after.some((l) => l.id === 'manual-1')).toBe(true)
  })
})
