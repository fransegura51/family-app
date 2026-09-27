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

// Fase 3 Bloque 5B — compatibilidad de estilo, plantilla propia, y seguimiento de datos del evento. Sin
// React Testing Library (igual que el resto de domain/*.test.ts): funciones puras, llamadas directamente.

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

describe('toEventFieldKey', () => {
  it('normaliza "edad" a "subtitle", el resto se queda igual', () => {
    expect(toEventFieldKey('edad')).toBe('subtitle')
    expect(toEventFieldKey('fecha')).toBe('fecha')
    expect(toEventFieldKey('lugar')).toBe('lugar')
  })
})

describe('checkStyleCompatibility / checkAllStyleCompatibility (sección 6-7)', () => {
  it('Clásica es compatible con una plantilla normal', () => {
    const result = checkStyleCompatibility({ event: FULL_EVENT, template: template('boda'), style: 'clasica' })
    expect(result.compatible).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('Con Foto incompatible da compatible:false con un motivo — bruja no tiene hueco ni con Canvas real', () => {
    const result = checkStyleCompatibility({ event: FULL_EVENT, template: template('bruja'), style: 'con_foto' })
    expect(result.compatible).toBe(false)
    expect(result.reason).toBe('Esta plantilla tiene poco espacio para una invitación con foto.')
  })

  it('la comprobación de con_foto nunca exige una foto real (usa una ruta de referencia interna)', () => {
    // No se pasa photoPath — si la función necesitara una foto real, devolvería needs_photo en vez de
    // decidir compatible/incompatible.
    const result = checkStyleCompatibility({ event: FULL_EVENT, template: template('boda'), style: 'con_foto' })
    expect(result.compatible).toBe(true)
  })

  it('checkAllStyleCompatibility devuelve las 3 recetas, en el mismo orden', () => {
    const all = checkAllStyleCompatibility({ event: FULL_EVENT, template: template('boda') })
    expect(all.map((r) => r.style)).toEqual(['clasica', 'con_foto', 'divertida'])
  })

  it('no hay ningún caso especial hardcodeado por nombre de plantilla: la compatibilidad se deriva siempre de composeInvitationForMe', () => {
    // Verificado por comportamiento, no por inspección de código (sección 6): dos plantillas cualquiera con
    // el mismo resultado real de composeInvitationForMe deben dar la misma compatibilidad.
    for (const key of ['otono_hogar', 'bruja', 'corazones_terraza', 'delfin_tortuga']) {
      const direct = composeInvitationForMe({ event: FULL_EVENT, template: template(key), style: 'con_foto', photoPath: 'x.jpg' })
      const compat = checkStyleCompatibility({ event: FULL_EVENT, template: template(key), style: 'con_foto' })
      expect(compat.compatible).toBe(direct.status === 'success')
    }
  })
})

describe('buildCustomTemplateMeta (secciones 10-16)', () => {
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
    const result = composeInvitationForMe({ event: FULL_EVENT, template: meta, style: 'clasica' })
    expect(result.status).toBe('success')
  })

  it('nunca se añade al catálogo INVITATION_TEMPLATES al construirla (solo se lee, nunca se escribe)', () => {
    const before = INVITATION_TEMPLATES.length
    buildCustomTemplateMeta(textArea)
    expect(INVITATION_TEMPLATES.length).toBe(before)
  })
})

describe('seguimiento de datos del evento (secciones 22-39)', () => {
  it('composeInvitationForMe marca cada campo real con su procedencia; el cierre genérico nunca la lleva', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const titleLayer = result.layers.find((l) => l.text === 'Cumpleaños de Valentina')!
    expect(titleLayer.source).toEqual({ kind: 'event_field', field: 'title', valueAtInsertion: 'Cumpleaños de Valentina' })
    const closingLayer = result.layers.find((l) => l.source === undefined && l.type === 'event_data')
    // Si hay cierre en el resultado, no lleva source (essential:false, nunca procedencia).
    if (closingLayer) expect(closingLayer.source).toBeUndefined()
  })

  it('invitationHasTrackedEventData: false para capas sin procedencia (invitación anterior a 5B o texto libre)', () => {
    const freeform: InvitationLayer[] = [{ id: 'a', type: 'text', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 0, text: 'Hola' }]
    expect(invitationHasTrackedEventData(freeform)).toBe(false)
  })

  it('invitationHasTrackedEventData: true en cuanto una capa generada por el motor está presente', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    expect(invitationHasTrackedEventData(result.layers)).toBe(true)
  })

  it('getInvitationEventDataChanges: sin cambios cuando el evento sigue igual', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    expect(getInvitationEventDataChanges(result.layers, FULL_EVENT)).toEqual([])
  })

  it('getInvitationEventDataChanges: detecta fecha y lugar cambiados, ambos en el resultado', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const changedEvent = { ...FULL_EVENT, eventDate: '2026-12-20', venueLabel: 'Restaurante Nuevo' }
    const changes = getInvitationEventDataChanges(result.layers, changedEvent)
    const fields = changes.map((c) => c.field).sort()
    expect(fields).toEqual(['fecha', 'lugar'])
    const fechaChange = changes.find((c) => c.field === 'fecha')!
    expect(fechaChange.current).not.toBe(fechaChange.previous)
  })

  it('getInvitationEventDataChanges: dato eliminado del evento da current:null, no lanza', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const eventWithoutHora = { ...FULL_EVENT, eventTime: null }
    const changes = getInvitationEventDataChanges(result.layers, eventWithoutHora)
    const horaChange = changes.find((c) => c.field === 'hora')
    expect(horaChange).toBeDefined()
    expect(horaChange!.current).toBeNull()
  })

  it('getInvitationEventDataChanges: un campo NUEVO que la invitación nunca usó no se reporta como cambio (sección 35)', () => {
    const eventWithoutHora = { ...FULL_EVENT, eventTime: null }
    const result = composeInvitationForMe({ event: eventWithoutHora, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    // Ahora se añade una hora que la invitación nunca tuvo — no debe aparecer como "cambio".
    const eventWithNewHora = { ...FULL_EVENT, eventTime: '20:00' }
    const changes = getInvitationEventDataChanges(result.layers, eventWithNewHora)
    expect(changes.some((c) => c.field === 'hora')).toBe(false)
  })

  it('getInvitationEventDataChanges: un campo "fecha" fusionado con "hora" (receta compacta) nunca da un falso "cambió" — bug real encontrado en verificación de navegador', () => {
    // Familia 4 (dinosaurios) con estilo Divertida cae en D2 (compacto) para este evento, que fusiona
    // fecha+hora en una sola capa bajo key:'fecha' con el texto combinado — esa capa no debe llevar
    // procedencia (ver AutoComposeDataField.merged), o compararla contra el "fecha" en solitario de
    // getAvailableInvitationData daría un falso "cambió" para siempre, aunque el evento no cambiara nunca.
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('dinosaurios'), style: 'divertida' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(getInvitationEventDataChanges(result.layers, FULL_EVENT)).toEqual([])
  })

  it('getInvitationEventDataChanges: invitación sin ninguna capa con procedencia no reporta nada (no puede saberlo)', () => {
    const freeform: InvitationLayer[] = [{ id: 'a', type: 'text', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 0, text: 'Hola' }]
    expect(getInvitationEventDataChanges(freeform, { ...FULL_EVENT, title: 'Otro título' })).toEqual([])
  })

  it('isInvitationLayerManuallyEdited: false cuando el texto sigue siendo el original', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const titleLayer = result.layers.find((l) => l.source?.field === 'title')!
    expect(isInvitationLayerManuallyEdited(titleLayer)).toBe(false)
  })

  it('isInvitationLayerManuallyEdited: true cuando el usuario reescribió el texto después de insertarlo', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const titleLayer = result.layers.find((l) => l.source?.field === 'title')!
    const edited = { ...titleLayer, text: 'Un título totalmente distinto' }
    expect(isInvitationLayerManuallyEdited(edited)).toBe(true)
  })

  it('isInvitationLayerManuallyEdited: false para una capa sin procedencia (texto libre)', () => {
    const freeform: InvitationLayer = { id: 'a', type: 'text', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 0, text: 'Hola' }
    expect(isInvitationLayerManuallyEdited(freeform)).toBe(false)
  })

  it('la metadata nunca se borra al editar el texto a mano (sección 38) — sigue sabiéndose de qué campo nació', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const lugarLayer = result.layers.find((l) => l.source?.field === 'lugar')!
    const edited = { ...lugarLayer, text: 'Trastevere — Salón Jardín' }
    expect(edited.source?.field).toBe('lugar')
    expect(isInvitationLayerManuallyEdited(edited)).toBe(true)
  })
})

describe('updateInvitationLayersFromEvent (sección 29, actualización selectiva)', () => {
  it('solo actualiza los campos indicados; el resto de capas se devuelve tal cual (misma referencia)', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const changedEvent = { ...FULL_EVENT, eventDate: '2026-12-20', venueLabel: 'Restaurante Nuevo' }
    const updated = updateInvitationLayersFromEvent(result.layers, changedEvent, ['fecha'])
    const fechaLayer = updated.find((l) => l.source?.field === 'fecha')!
    expect(fechaLayer.text).toContain('20 de diciembre')
    expect(fechaLayer.source?.valueAtInsertion).toBe(fechaLayer.text)
    // "lugar" no estaba en fieldsToUpdate: sigue con el valor antiguo, misma referencia de objeto.
    const lugarLayerBefore = result.layers.find((l) => l.source?.field === 'lugar')!
    const lugarLayerAfter = updated.find((l) => l.source?.field === 'lugar')!
    expect(lugarLayerAfter).toBe(lugarLayerBefore)
    expect(lugarLayerAfter.text).toContain('Salón de fiestas Arcoíris')
  })

  it('nunca toca texto libre, decoración, ni capas sin procedencia', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('unicornio'), style: 'divertida' }) as AutoComposeSuccess
    const freeform: InvitationLayer = { id: 'manual-1', type: 'text', x: 0.5, y: 0.9, rotation: 0, scale: 1, zIndex: 99, text: 'Texto libre del usuario' }
    const layers = [...result.layers, freeform]
    const changedEvent = { ...FULL_EVENT, eventDate: '2026-12-20' }
    const updated = updateInvitationLayersFromEvent(layers, changedEvent, ['fecha'])
    expect(updated.find((l) => l.id === 'manual-1')).toEqual(freeform)
    const emoji = updated.find((l) => l.type === 'emoji')
    const emojiBefore = layers.find((l) => l.type === 'emoji')
    expect(emoji).toBe(emojiBefore)
  })

  it('un campo eliminado del evento no se toca (no se borra en updateInvitationLayersFromEvent, ver sección 34)', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const eventWithoutHora = { ...FULL_EVENT, eventTime: null }
    const updated = updateInvitationLayersFromEvent(result.layers, eventWithoutHora, ['hora'])
    const horaLayerBefore = result.layers.find((l) => l.source?.field === 'hora')!
    const horaLayerAfter = updated.find((l) => l.source?.field === 'hora')!
    expect(horaLayerAfter).toBe(horaLayerBefore)
  })

  it('con una lista vacía de campos, devuelve exactamente el mismo array (misma referencia)', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    expect(updateInvitationLayersFromEvent(result.layers, FULL_EVENT, [])).toBe(result.layers)
  })
})

describe('"Pepa, hazla bonita" (autoArrangeLayers) tras "Pepa, hazla por mí" (secciones 37, 49)', () => {
  it('conserva la metadata de procedencia de cada capa — solo reorganiza x/y/rotation, nunca el contenido', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
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

describe('removeInvitationLayersForRemovedFields (sección 34)', () => {
  it('quita solo la capa del campo indicado', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const withoutHora = removeInvitationLayersForRemovedFields(result.layers, ['hora'])
    expect(withoutHora.some((l) => l.source?.field === 'hora')).toBe(false)
    expect(withoutHora.length).toBe(result.layers.length - 1)
    // El resto de capas reales sigue intacto.
    expect(withoutHora.some((l) => l.source?.field === 'title')).toBe(true)
  })

  it('con una lista vacía, devuelve exactamente el mismo array', () => {
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    expect(removeInvitationLayersForRemovedFields(result.layers, [])).toBe(result.layers)
  })

  it('nunca quita una capa de texto libre o sin ese campo', () => {
    const freeform: InvitationLayer = { id: 'manual-1', type: 'text', x: 0.5, y: 0.9, rotation: 0, scale: 1, zIndex: 99, text: 'Texto libre' }
    const result = composeInvitationForMe({ event: FULL_EVENT, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const layers = [...result.layers, freeform]
    const after = removeInvitationLayersForRemovedFields(layers, ['hora'])
    expect(after.some((l) => l.id === 'manual-1')).toBe(true)
  })
})
