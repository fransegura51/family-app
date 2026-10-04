import { describe, expect, it } from 'vitest'
import {
  ageTurning,
  celebrationBlockTitle,
  celebrationDateStatus,
  celebrationPlaceStatus,
  dateStatusLabel,
  dateWithStatusLabel,
  deriveOperationalDate,
  listCelebrationQuestions,
  longSpanishDate,
  momentDateStatus,
  summarizeCelebrationBlock,
} from '@/domain/eventCelebration'
import { buildFoodContext, listFoodBlockQuestions, FOOD_QUIEN_KEY, includedByVenueLines, quienApplies, venueIncludes } from '@/domain/eventFood'
import {
  effectiveVenueServicesAnswer,
  legacyOnlyServiceLabels,
  resolveVenueCase,
  venueIncludesService,
  venueServiceIdsForPlan,
  venueServicesFromLegacy,
  venueServicesQuestionLabel,
  venueServicesStatus,
  VENUE_SERVICES_QUESTION_KEY,
} from '@/domain/eventVenueServices'
import { makeDecision, makeEvent } from '@/domain/eventFoodFixtures'
import type { EventMoment } from '@/domain/types'

function moment(overrides: Partial<EventMoment> = {}): EventMoment {
  return { id: 'm1', eventId: 'e1', familyId: 'f1', title: 'Ceremonia', momentDate: null, momentTime: null, locationLabel: null, locationLatitude: null, locationLongitude: null, locationAddress: null, locationPlaceId: null, sortOrder: 0, createdAt: '', dateStatus: null, ...overrides }
}
const contexto = (choice: string) => makeDecision('lugar.contexto', { choice })

describe('Primer bloque — K/L/M: «Ceremonia y celebración» o «Celebración» según el evento', () => {
  it('K. una boda con ceremonia muestra «Ceremonia y celebración»', () => {
    expect(celebrationBlockTitle('boda', true)).toBe('💍 Ceremonia y celebración')
    expect(celebrationBlockTitle('comunion', true)).toBe('⛪ Ceremonia y celebración')
    expect(celebrationBlockTitle('bautizo', true)).toBe('⛪ Ceremonia y celebración')
  })
  it('L. un cumpleaños muestra «Celebración»', () => {
    expect(celebrationBlockTitle('cumpleanos', false)).toBe('🎂 Celebración')
  })
  it('M. un evento simple (celebración, personalizado, o una boda sin ceremonia) muestra «Celebración», sin obligar a tener ceremonia', () => {
    expect(celebrationBlockTitle('celebracion', false)).toBe('🎉 Celebración')
    expect(celebrationBlockTitle('personalizado', false)).toBe('🎉 Celebración')
    expect(celebrationBlockTitle('boda', false)).toBe('🎉 Celebración')
  })
})

describe('Edad del cumpleaños — N/AG/AH/AI: vive dentro de «Celebración»', () => {
  const base = { decisions: [], hasMomentLocation: false, structuredByMoments: false }
  it('N. la edad es una pregunta del propio bloque Celebración (cumpleaños), nunca de un bloque aparte', () => {
    const questions = listCelebrationQuestions({ ...base, event: makeEvent({ type: 'cumpleanos' }) })
    expect(questions.map((q) => q.key)).toEqual(['edad', 'fecha', 'lugar'])
  })
  it('AI. un cumpleaños sin edad cuenta como «sin empezar» (se puede crear incompleto) y con edad pasa a decidida', () => {
    const sin = listCelebrationQuestions({ ...base, event: makeEvent({ type: 'cumpleanos', details: {} }) })
    expect(sin.find((q) => q.key === 'edad')?.status).toBe('sin_empezar')
    const con = listCelebrationQuestions({ ...base, event: makeEvent({ type: 'cumpleanos', details: { ageTurning: 6 } }) })
    expect(con.find((q) => q.key === 'edad')?.status).toBe('decidida')
  })
  it('AG. la edad sigue siendo details.ageTurning para quien la necesite (invitaciones, regalos)', () => {
    expect(ageTurning(makeEvent({ details: { ageTurning: 42 } }))).toBe(42)
    expect(ageTurning(makeEvent({ details: {} }))).toBeNull()
    expect(ageTurning(makeEvent({ details: { ageTurning: '42' } }))).toBeNull()
  })
  it('solo los cumpleaños preguntan la edad', () => {
    for (const type of ['boda', 'comunion', 'bautizo', 'celebracion', 'personalizado'] as const) {
      expect(listCelebrationQuestions({ ...base, event: makeEvent({ type }) }).map((q) => q.key)).not.toContain('edad')
    }
  })
})

describe('Fecha con estado — Q/R/S/T/U', () => {
  it('Q/R. se etiqueta «◷ Provisional» o «✓ Confirmada» junto a la fecha', () => {
    expect(dateStatusLabel('provisional')).toBe('◷ Provisional')
    expect(dateStatusLabel('confirmada')).toBe('✓ Confirmada')
    expect(dateWithStatusLabel('2027-02-14', 'provisional')).toBe('14 febrero 2027 · ◷ Provisional')
    expect(dateWithStatusLabel('2027-02-14', 'confirmada')).toBe('14 febrero 2027 · ✓ Confirmada')
  })
  it('S. pasar de Provisional a Confirmada cambia el estado de LA MISMA fecha: no hay otra fecha', () => {
    const provisional = dateWithStatusLabel('2027-02-14', 'provisional')
    const confirmada = dateWithStatusLabel('2027-02-14', 'confirmada')
    expect(provisional?.split(' · ')[0]).toBe(confirmada?.split(' · ')[0])
  })
  it('sin fecha o «Todavía no lo sabemos» no se inventa ninguna etiqueta', () => {
    expect(dateWithStatusLabel(null, 'confirmada')).toBeNull()
    expect(dateWithStatusLabel('2027-02-14', 'pendiente')).toBeNull()
    expect(longSpanishDate('2027-12-01')).toBe('1 diciembre 2027')
  })
  it('estado del bloque: confirmada = decidida, provisional = por decidir, pendiente sin respuesta = sin empezar, «Todavía no lo sabemos» respondido = por decidir', () => {
    expect(celebrationDateStatus({ dateStatus: 'confirmada', eventDate: '2027-02-14' }, [])).toBe('decidida')
    expect(celebrationDateStatus({ dateStatus: 'provisional', eventDate: '2027-02-14' }, [])).toBe('por_decidir')
    expect(celebrationDateStatus({ dateStatus: 'pendiente', eventDate: null }, [])).toBe('sin_empezar')
    expect(celebrationDateStatus({ dateStatus: 'pendiente', eventDate: null }, [makeDecision('celebracion.fecha', { choice: 'todavia_no_lo_sabemos' })])).toBe('por_decidir')
  })
  it('una fecha provisional nunca se promociona sola a confirmada', () => {
    expect(momentDateStatus({ momentDate: '2027-02-14', dateStatus: null }, 'provisional')).toBe('provisional')
    expect(momentDateStatus({ momentDate: '2027-02-14', dateStatus: null }, 'pendiente')).toBe('provisional')
    expect(momentDateStatus({ momentDate: '2027-02-14', dateStatus: 'provisional' }, 'confirmada')).toBe('provisional')
  })
})

describe('Fecha operativa del evento — U/V y regla de momentos/días', () => {
  it('U. con varios momentos, la fecha del evento es la del primer día con fecha y hereda el estado de ESE momento', () => {
    const moments = [
      moment({ id: 'a', title: 'Celebración', momentDate: '2027-02-13', dateStatus: 'confirmada', sortOrder: 2 }),
      moment({ id: 'b', title: 'Matrimonio civil', momentDate: '2027-02-12', dateStatus: 'provisional', sortOrder: 1 }),
    ]
    expect(deriveOperationalDate(moments, 'confirmada')).toEqual({ eventDate: '2027-02-12', dateStatus: 'provisional' })
  })
  it('V. varios días y varios lugares: nada se destruye, los momentos conservan su fecha y la derivación es solo una lectura', () => {
    const moments = [moment({ id: 'a', momentDate: '2027-02-12', locationLabel: 'Juzgado' }), moment({ id: 'b', momentDate: '2027-02-13', locationLabel: 'Casa' })]
    const before = JSON.stringify(moments)
    deriveOperationalDate(moments, 'confirmada')
    expect(JSON.stringify(moments)).toBe(before)
  })
  it('T. cambiar la fecha de un momento da una única fecha operativa (sin duplicar momento)', () => {
    const one = [moment({ momentDate: '2027-03-01' })]
    expect(deriveOperationalDate(one, 'confirmada')).toEqual({ eventDate: '2027-03-01', dateStatus: 'confirmada' })
  })
  it('un momento sin estado propio hereda el del evento (momentos anteriores a esta versión)', () => {
    expect(deriveOperationalDate([moment({ momentDate: '2027-03-01', dateStatus: null })], 'confirmada')?.dateStatus).toBe('confirmada')
    expect(deriveOperationalDate([moment({ momentDate: '2027-03-01', dateStatus: null })], 'provisional')?.dateStatus).toBe('provisional')
  })
  it('sin ningún momento fechado no se toca la fecha del evento (la fecha general antigua se conserva)', () => {
    expect(deriveOperationalDate([moment({ momentDate: null })], 'confirmada')).toBeNull()
    expect(deriveOperationalDate([], 'confirmada')).toBeNull()
  })
  it('los momentos sintetizados a partir de campos antiguos (legacy) no mueven la fecha', () => {
    expect(deriveOperationalDate([moment({ momentDate: '2027-03-01', isLegacy: true })], 'confirmada')).toBeNull()
  })
  it('a igualdad de día manda el de menor orden', () => {
    const moments = [moment({ id: 'x', momentDate: '2027-02-12', dateStatus: 'confirmada', sortOrder: 5 }), moment({ id: 'y', momentDate: '2027-02-12', dateStatus: 'provisional', sortOrder: 1 })]
    expect(deriveOperationalDate(moments, 'confirmada')?.dateStatus).toBe('provisional')
  })
})

describe('Lugar y servicios — O/P/W/X/Y/Z', () => {
  it('X. un lugar contratado (restaurante/local) pregunta «¿Qué incluye el lugar contratado?»', () => {
    const decisions = [contexto('restaurante_local')]
    expect(venueServicesQuestionLabel(resolveVenueCase(makeEvent(), decisions))).toBe('¿Qué incluye el lugar contratado?')
  })
  it('Y/Z. un lugar ambiguo (también una dirección sin datos comerciales) usa la pregunta genérica y NUNCA se convierte en Casa', () => {
    const event = makeEvent({ venueLabel: 'Calle Mayor 3', venueAddress: 'Calle Mayor 3, Almoradí' })
    const venueCase = resolveVenueCase(event, [])
    expect(venueCase).toBe('incierto')
    expect(venueServicesQuestionLabel(venueCase)).toBe('¿El lugar de celebración incluye algún servicio?')
  })
  it('un evento por momentos con lugar en algún momento también cuenta como «hay un sitio» (incierto, no casa ni desconocido)', () => {
    expect(resolveVenueCase(makeEvent(), [], true)).toBe('incierto')
    expect(resolveVenueCase(makeEvent(), [], false)).toBe('desconocido')
  })
  it('W. «En casa» expreso no pregunta qué incluye el lugar', () => {
    expect(venueServicesQuestionLabel(resolveVenueCase(makeEvent(), [contexto('en_casa')]))).toBeNull()
  })
  it('la pregunta de servicios solo cuenta en el bloque cuando hay un lugar que pueda incluirlos', () => {
    const base = { hasMomentLocation: false, structuredByMoments: false }
    const keys = (decisions: ReturnType<typeof contexto>[], event = makeEvent()) => listCelebrationQuestions({ ...base, event, decisions }).map((q) => q.key)
    expect(keys([contexto('restaurante_local')])).toContain('servicios')
    expect(keys([contexto('en_casa')])).not.toContain('servicios')
    expect(keys([])).not.toContain('servicios')
  })
  it('P. el lugar cuenta como decidido si ya hay uno registrado, aunque el evento sea anterior a la pregunta de contexto', () => {
    expect(celebrationPlaceStatus(makeEvent({ venueLabel: 'Restaurante La Gran Fiesta' }), [], false)).toBe('decidida')
    expect(celebrationPlaceStatus(makeEvent(), [], false)).toBe('sin_empezar')
    expect(celebrationPlaceStatus(makeEvent(), [contexto('todavia_no_lo_sabemos')], false)).toBe('por_decidir')
    expect(celebrationPlaceStatus(makeEvent(), [], true)).toBe('decidida')
  })
  it('AK. el lugar que se indicó en el alta antigua (venue_type) cuenta como respuesta histórica: decidido, sin volver a pedirlo', () => {
    expect(celebrationPlaceStatus(makeEvent({ venueType: 'restaurante_local' }), [], false)).toBe('decidida')
    expect(celebrationPlaceStatus(makeEvent({ venueType: 'casa_propia' }), [], false)).toBe('decidida')
  })
})

describe('Fuente ÚNICA de servicios incluidos — AA…AF', () => {
  it('AA. la decisión del primer bloque manda sobre cualquier dato antiguo', () => {
    const decisions = [makeDecision(VENUE_SERVICES_QUESTION_KEY, { choice: 'seleccionar', selected: ['comida'], customItems: [] })]
    const answer = effectiveVenueServicesAnswer(decisions, ['music'])
    expect(answer?.selected).toEqual(['comida'])
    expect(venueServicesFromLegacy(decisions, ['music'])).toBe(false)
  })
  it('AF. un evento antiguo con Música/DJ se adopta como «Música incluida», SIN pedir ningún clic ni preseleccionar nada más', () => {
    const answer = effectiveVenueServicesAnswer([], ['music'])
    expect(answer).toEqual({ choice: 'seleccionar', selected: ['musica'], customItems: [] })
    expect(venueServicesFromLegacy([], ['music'])).toBe(true)
    expect(venueServicesStatus([], ['music'])).toBe('decidida')
    expect(venueIncludesService('contratado', [], 'musica', ['music'])).toBe(true)
    expect(venueIncludesService('contratado', [], 'comida', ['music'])).toBe(false)
  })
  it('lo que no existe en el catálogo nuevo (fotografía, flores) se conserva como información y no entra en el catálogo', () => {
    expect(legacyOnlyServiceLabels(['music', 'flowers', 'photography'])).toEqual(['flores', 'fotografía/vídeo'])
    expect(effectiveVenueServicesAnswer([], ['flowers'])).toBeUndefined()
  })
  it('sin respuesta antigua ni nueva no hay nada adoptado (nunca se inventan servicios)', () => {
    expect(effectiveVenueServicesAnswer([], null)).toBeUndefined()
    expect(effectiveVenueServicesAnswer([], [])).toBeUndefined()
    expect(venueServicesStatus([], null)).toBe('sin_empezar')
  })
  it('«Organízamelo Pepa» lee la misma fuente: la decisión nueva + los servicios antiguos que no existen en el catálogo', () => {
    const decisions = [makeDecision(VENUE_SERVICES_QUESTION_KEY, { choice: 'seleccionar', selected: ['comida', 'tarta', 'alojamiento'], customItems: [] })]
    expect(venueServiceIdsForPlan(decisions, ['flowers']).sort()).toEqual(['cake', 'flowers', 'food'])
    expect(venueServiceIdsForPlan([], ['music', 'flowers'])).toEqual(['music', 'flowers'])
  })
  it('AB/AC. «Ninguno» sigue siendo excluyente y «Otro» conserva su texto (probado en eventVenueServices.test.ts; aquí, que la fuente nueva los respeta)', () => {
    const none = effectiveVenueServicesAnswer([makeDecision(VENUE_SERVICES_QUESTION_KEY, { choice: 'ninguno', selected: [], customItems: [] })], ['music'])
    expect(none?.choice).toBe('ninguno')
    expect(none?.selected).toEqual([])
    const custom = effectiveVenueServicesAnswer([makeDecision(VENUE_SERVICES_QUESTION_KEY, { choice: 'seleccionar', selected: [], customItems: ['piscina'] })], null)
    expect(custom?.customItems).toEqual(['piscina'])
  })
})

describe('Comida y bebida CONSUME el primer bloque — AD/AP/AQ/AR', () => {
  it('AD. con la comida incluida (decisión nueva) Comida lo muestra como información y no pregunta quién se encarga ni qué incluye el lugar', () => {
    const decisions = [contexto('restaurante_local'), makeDecision(VENUE_SERVICES_QUESTION_KEY, { choice: 'seleccionar', selected: ['comida'], customItems: [] })]
    const ctx = buildFoodContext(makeEvent(), decisions, [], null)
    expect(venueIncludes(ctx, 'comida')).toBe(true)
    expect(includedByVenueLines(ctx)).toContain('✓ Comida / menú incluido en el lugar contratado')
    expect(quienApplies(ctx)).toBe(false)
    expect(listFoodBlockQuestions(ctx).map((q) => q.questionKey)).not.toContain(FOOD_QUIEN_KEY)
  })
  it('AQ. lo mismo con un evento ANTIGUO cuyo alta marcó «comida» (adoptado, sin volver a pedirlo)', () => {
    const event = makeEvent({ venueType: 'restaurante_local', includedServices: ['food', 'drinks'] })
    const ctx = buildFoodContext(event, [], [], null)
    expect(ctx.venueCase).toBe('contratado')
    expect(venueIncludes(ctx, 'comida')).toBe(true)
    expect(venueIncludes(ctx, 'bebidas')).toBe(true)
    expect(quienApplies(ctx)).toBe(false)
  })
  it('AP. en casa: Comida no habla de servicios del lugar y sí pregunta quién se encarga', () => {
    const ctx = buildFoodContext(makeEvent(), [contexto('en_casa')], [], null)
    expect(ctx.venueCase).toBe('casa')
    expect(includedByVenueLines(ctx)).toEqual([])
    expect(quienApplies(ctx)).toBe(true)
    expect(listFoodBlockQuestions(ctx).map((q) => q.questionKey)).toContain(FOOD_QUIEN_KEY)
  })
  it('AR. con el lugar sin resolver Comida no inventa servicios incluidos, y puede seguir con lo independiente', () => {
    const ctx = buildFoodContext(makeEvent(), [], [], null)
    expect(ctx.venueCase).toBe('desconocido')
    expect(includedByVenueLines(ctx)).toEqual([])
    expect(listFoodBlockQuestions(ctx).map((q) => q.questionKey)).toContain(FOOD_QUIEN_KEY)
  })
})

describe('Resumen del bloque (✓ decididas · ⏳ por decidir · sin empezar)', () => {
  it('un cumpleaños recién creado (sin edad, fecha ni lugar) aparece como «3 sin empezar» — el evento existe, el bloque pide configuración', () => {
    expect(summarizeCelebrationBlock({ event: makeEvent({ type: 'cumpleanos', dateStatus: 'pendiente', eventDate: null, details: {} }), decisions: [], hasMomentLocation: false, structuredByMoments: false })).toBe('3 sin empezar')
  })
  it('mezcla de estados', () => {
    const event = makeEvent({ type: 'cumpleanos', details: { ageTurning: 6 }, dateStatus: 'provisional', eventDate: '2027-02-20', venueLabel: 'Casa de los abuelos' })
    expect(summarizeCelebrationBlock({ event, decisions: [], hasMomentLocation: false, structuredByMoments: false })).toBe('✓ 2 decididas · ⏳ 1 por decidir · 1 sin empezar')
  })
})
