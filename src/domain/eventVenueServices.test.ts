import { describe, expect, it } from 'vitest'
import { makeDecision, makeEvent } from '@/domain/eventFoodFixtures'
import { buildFoodContext, listFoodBlockQuestions, FOOD_QUIEN_KEY, quienApplies } from '@/domain/eventFood'
import {
  legacyIncludedServicesToVenue,
  resolveVenueCase,
  toggleVenueService,
  VENUE_SERVICES,
  VENUE_SERVICES_QUESTION_KEY,
  venueIncludesService,
  venueServicesAnswer,
  venueServicesQuestionLabel,
  venueServicesStatus,
  withVenueServiceCustomItems,
  withVenueServicesNinguno,
} from '@/domain/eventVenueServices'

const contexto = (choice: string) => makeDecision('lugar.contexto', { choice })
const servicios = (answer: Record<string, unknown>) => makeDecision(VENUE_SERVICES_QUESTION_KEY, answer)

describe('Servicios del lugar — A. lugar contratado razonablemente (caso A)', () => {
  it('"Restaurante / local" confirmado → pregunta «¿Qué incluye el lugar contratado?»', () => {
    const decisions = [contexto('restaurante_local')]
    expect(resolveVenueCase(makeEvent(), decisions)).toBe('contratado')
    expect(venueServicesQuestionLabel('contratado')).toBe('¿Qué incluye el lugar contratado?')
  })
  it('un evento creado como «restaurante/local» (dato heredado) también cuenta como contratado', () => {
    expect(resolveVenueCase(makeEvent({ venueType: 'restaurante_local' }), [])).toBe('contratado')
  })
})

describe('Servicios del lugar — B. lugar ambiguo (caso B)', () => {
  it('hay dirección pero no se sabe si es negocio o casa → «¿El lugar de celebración incluye algún servicio?»', () => {
    const event = makeEvent({ venueLabel: 'Calle Mayor 3', venueAddress: 'Calle Mayor 3, Madrid' })
    expect(resolveVenueCase(event, [])).toBe('incierto')
    expect(venueServicesQuestionLabel('incierto')).toBe('¿El lugar de celebración incluye algún servicio?')
  })
  it('una dirección que no parece un negocio NUNCA se supone una casa particular', () => {
    const event = makeEvent({ venueAddress: 'Calle Mayor 3, Madrid', venueLatitude: 40.4, venueLongitude: -3.7 })
    expect(resolveVenueCase(event, [])).not.toBe('casa')
  })
  it('exterior u otro lugar → también incierto, nunca contratado ni casa', () => {
    expect(resolveVenueCase(makeEvent(), [contexto('exterior')])).toBe('incierto')
    expect(resolveVenueCase(makeEvent(), [contexto('otro')])).toBe('incierto')
  })
  it('sin ningún dato de lugar no se pregunta nada todavía', () => {
    expect(resolveVenueCase(makeEvent(), [])).toBe('desconocido')
    expect(venueServicesQuestionLabel('desconocido')).toBeNull()
  })
})

describe('Servicios del lugar — C. «En casa» confirmado: no se pregunta', () => {
  it('"En casa" explícito → caso casa y sin pregunta de servicios', () => {
    expect(resolveVenueCase(makeEvent(), [contexto('en_casa')])).toBe('casa')
    expect(venueServicesQuestionLabel('casa')).toBeNull()
  })
  it('venue_type «casa propia» del alta también es una afirmación expresa', () => {
    expect(resolveVenueCase(makeEvent({ venueType: 'casa_propia' }), [])).toBe('casa')
  })
  it('lo dicho en el configurador manda sobre el dato heredado', () => {
    expect(resolveVenueCase(makeEvent({ venueType: 'casa_propia' }), [contexto('restaurante_local')])).toBe('contratado')
  })
  it('en casa, una respuesta vieja de servicios nunca cuenta como servicio del lugar', () => {
    const decisions = [contexto('en_casa'), servicios({ choice: 'seleccionar', selected: ['comida'], customItems: [] })]
    expect(venueIncludesService('casa', decisions, 'comida')).toBe(false)
  })
})

describe('Servicios del lugar — D. «Ninguno» es incompatible con el resto', () => {
  it('marcar «Ninguno» vacía la selección', () => {
    expect(withVenueServicesNinguno()).toEqual({ choice: 'ninguno', selected: [], customItems: [] })
  })
  it('marcar un servicio concreto después de «Ninguno» anula «Ninguno»', () => {
    const next = toggleVenueService(withVenueServicesNinguno(), 'comida')
    expect(next.choice).toBe('seleccionar')
    expect(next.selected).toEqual(['comida'])
  })
  it('quitar la última casilla no deja una decisión vacía: vuelve a «sin empezar»', () => {
    const only = toggleVenueService(undefined, 'tarta')
    const emptied = toggleVenueService(only, 'tarta')
    expect(venueServicesStatus([servicios(emptied as unknown as Record<string, unknown>)])).toBe('sin_empezar')
  })
  it('«Ninguno» cuenta como decidida; «Todavía no lo sabemos» como por decidir', () => {
    expect(venueServicesStatus([servicios({ choice: 'ninguno', selected: [], customItems: [] })])).toBe('decidida')
    expect(venueServicesStatus([servicios({ choice: 'todavia_no_lo_sabemos', selected: [], customItems: [] })])).toBe('por_decidir')
  })
})

describe('Servicios del lugar — E. «Otro» es texto libre sin derivaciones', () => {
  it('«Otro» se guarda tal cual y no activa ningún servicio del catálogo', () => {
    const answer = withVenueServiceCustomItems(undefined, ['barra libre de cócteles y comida casera'])
    expect(answer.customItems).toEqual(['barra libre de cócteles y comida casera'])
    expect(answer.selected).toEqual([])
    const decisions = [contexto('restaurante_local'), servicios(answer as unknown as Record<string, unknown>)]
    expect(venueIncludesService('contratado', decisions, 'comida')).toBe(false)
    expect(venueIncludesService('contratado', decisions, 'barra_libre')).toBe(false)
  })
})

describe('Servicios del lugar — F. si el lugar incluye la comida no se pregunta «quién se encarga»', () => {
  it('comida incluida → «¿Quién se encargará?» no aplica y no cuenta como pregunta', () => {
    const decisions = [contexto('restaurante_local'), servicios({ choice: 'seleccionar', selected: ['comida'], customItems: [] })]
    const ctx = buildFoodContext(makeEvent(), decisions, [], null)
    expect(quienApplies(ctx)).toBe(false)
    expect(listFoodBlockQuestions(ctx).map((q) => q.questionKey)).not.toContain(FOOD_QUIEN_KEY)
  })
  it('sin comida incluida (o en casa) sí se pregunta', () => {
    const ctxCasa = buildFoodContext(makeEvent(), [contexto('en_casa')], [], null)
    expect(quienApplies(ctxCasa)).toBe(true)
    const ctxSinComida = buildFoodContext(makeEvent(), [contexto('restaurante_local'), servicios({ choice: 'seleccionar', selected: ['bebidas'], customItems: [] })], [], null)
    expect(quienApplies(ctxSinComida)).toBe(true)
  })
})

describe('Servicios del lugar — G. Música, Decoración, Alojamiento y Barra libre quedan disponibles como dato transversal', () => {
  it('el catálogo ofrece todos los servicios de la especificación', () => {
    const keys = VENUE_SERVICES.map((s) => s.key)
    for (const k of ['comida', 'bebidas', 'tarta', 'personal', 'mobiliario', 'decoracion', 'musica', 'barra_libre', 'alojamiento']) expect(keys).toContain(k)
  })
  it('se guardan y se pueden consultar desde cualquier otra fase sin derivar nada de ellos', () => {
    const decisions = [contexto('restaurante_local'), servicios({ choice: 'seleccionar', selected: ['musica', 'decoracion', 'alojamiento', 'barra_libre'], customItems: [] })]
    for (const k of ['musica', 'decoracion', 'alojamiento', 'barra_libre'] as const) expect(venueIncludesService('contratado', decisions, k)).toBe(true)
    // …y ninguna de ellas altera las preguntas de comida
    const ctx = buildFoodContext(makeEvent(), decisions, [], null)
    expect(quienApplies(ctx)).toBe(true)
  })
  it('lo marcado al crear el evento solo se ofrece como importación; nunca se preselecciona', () => {
    expect(legacyIncludedServicesToVenue(['food', 'drinks', 'photography', 'favors'])).toEqual(['comida', 'bebidas'])
    expect(venueServicesAnswer([])).toBeUndefined()
  })
})
