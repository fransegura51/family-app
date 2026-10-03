import { describe, expect, it } from 'vitest'
import {
  decisionStatus,
  describeEffects,
  desiredForAlianzas,
  desiredForComplementos,
  desiredForDetalleEspecialResolucion,
  desiredForFloral,
  desiredForPeluqueriaResolucion,
  desiredForVestuarioResolucion,
  floralItemSelected,
  floralItemsForSlot,
  hasFloralActivity,
  isBudgetItemUntouched,
  isTaskUntouched,
  listPairBlockQuestions,
  partnerName,
  reconcilePairGeneration,
  summarizePairBlock,
  TASK_COMPLETED_MESSAGE,
  withFloralSelected,
  type ComplementosAnswer,
  type CustomResolution,
  type DetalleEspecialTipoAnswer,
  type PeluqueriaNecesidadAnswer,
  type PeluqueriaResolucionAnswer,
  type VestuarioTipoAnswer,
} from '@/domain/eventPairDecisions'
import type { EventBudgetItem, EventDecision, EventTask, FamilyEvent } from '@/domain/types'

function makeEvent(overrides: Partial<FamilyEvent> = {}): FamilyEvent {
  return {
    id: 'e1',
    familyId: 'f1',
    type: 'boda',
    subtype: null,
    title: 'Boda',
    dateStatus: 'confirmada',
    eventDate: null,
    eventTime: null,
    venueLabel: null,
    venueType: null,
    includedServices: null,
    venueLatitude: null,
    venueLongitude: null,
    venueAddress: null,
    venuePlaceId: null,
    ceremonyLocationLabel: null,
    ceremonyLocationLatitude: null,
    ceremonyLocationLongitude: null,
    ceremonyTime: null,
    celebrationLocationLabel: null,
    celebrationLocationLatitude: null,
    celebrationLocationLongitude: null,
    theme: null,
    details: {},
    enabledModules: ['ceremonia'],
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

function makeDecision(overrides: Partial<EventDecision> = {}): EventDecision {
  return {
    id: 'd1',
    eventId: 'e1',
    familyId: 'f1',
    blockKey: 'pareja',
    questionKey: 'pareja.partner1.vestuario',
    answer: {},
    isCustomOption: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeTask(overrides: Partial<EventTask> = {}): EventTask {
  return {
    id: 't1',
    eventId: 'e1',
    familyId: 'f1',
    title: 'Elegir vestido de Laura',
    done: false,
    dueDate: null,
    source: 'auto',
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    assignedMemberId: null,
    calendarEventId: null,
    decisionId: 'd1',
    ...overrides,
  }
}

function makeBudgetItem(overrides: Partial<EventBudgetItem> = {}): EventBudgetItem {
  return {
    id: 'b1',
    eventId: 'e1',
    familyId: 'f1',
    category: 'Vestido de Laura',
    plannedAmount: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    decisionId: 'd1',
    ...overrides,
  }
}

describe('decisionStatus — Sin empezar / Decidida / Por decidir', () => {
  it('sin fila: sin_empezar', () => {
    expect(decisionStatus(undefined)).toBe('sin_empezar')
  })
  it('"todavía no lo sabemos" en el nivel principal: por_decidir — nunca interpretado como sin responder', () => {
    expect(decisionStatus(makeDecision({ answer: { choice: 'todavia_no_lo_sabemos' } }))).toBe('por_decidir')
  })
  it('cualquier otra respuesta: decidida', () => {
    expect(decisionStatus(makeDecision({ answer: { choice: 'vestido' } }))).toBe('decidida')
    expect(decisionStatus(makeDecision({ answer: { choice: 'no_necesitamos' } }))).toBe('decidida')
  })
  it('"otro" con custom.action === "todavia_no_lo_sabemos": también por_decidir (no se ha resuelto nada en la práctica)', () => {
    expect(decisionStatus(makeDecision({ answer: { choice: 'otro', custom: { label: 'Corona de flores', action: 'todavia_no_lo_sabemos', hasCost: null } } }))).toBe(
      'por_decidir',
    )
  })
  it('"otro" con una acción real: decidida', () => {
    expect(decisionStatus(makeDecision({ answer: { choice: 'otro', custom: { label: 'Corona de flores', action: 'preparar', hasCost: null } } }))).toBe('decidida')
  })
})

describe('listPairBlockQuestions / summarizePairBlock — revelado progresivo y modelo reutilizable', () => {
  it('evento que no es boda: ninguna pregunta', () => {
    expect(listPairBlockQuestions(makeEvent({ type: 'comunion' }), [])).toEqual([])
    expect(summarizePairBlock(makeEvent({ type: 'comunion' }), [])).toBe('')
  })

  it('sin ninguna decisión: todas las preguntas de primer nivel están "sin_empezar", resumen solo con ese contador', () => {
    const summary = summarizePairBlock(makeEvent(), [])
    expect(summary).not.toContain('✓')
    expect(summary).not.toContain('⏳')
    expect(summary).toMatch(/\d+ sin empezar/)
  })

  it('la resolución de peluquería/maquillaje NO cuenta como pregunta hasta que la necesidad la hace relevante', () => {
    const noNecesidad = [makeDecision({ questionKey: 'pareja.partner1.peluqueria_maquillaje', answer: { choice: 'no' } })]
    const questions1 = listPairBlockQuestions(makeEvent(), noNecesidad)
    expect(questions1.some((q) => q.questionKey === 'pareja.partner1.peluqueria_maquillaje.resolucion')).toBe(false)

    const siNecesidad = [makeDecision({ questionKey: 'pareja.partner1.peluqueria_maquillaje', answer: { choice: 'peluqueria' } })]
    const questions2 = listPairBlockQuestions(makeEvent(), siNecesidad)
    expect(questions2.some((q) => q.questionKey === 'pareja.partner1.peluqueria_maquillaje.resolucion')).toBe(true)
  })

  it('la resolución de vestuario NO cuenta como pregunta hasta que el tipo es concreto', () => {
    const sinTipo = listPairBlockQuestions(makeEvent(), [])
    expect(sinTipo.some((q) => q.questionKey === 'pareja.partner1.vestuario.resolucion')).toBe(false)

    const tipoPorDecidir = [makeDecision({ questionKey: 'pareja.partner1.vestuario', answer: { choice: 'todavia_no_lo_sabemos' } })]
    expect(listPairBlockQuestions(makeEvent(), tipoPorDecidir).some((q) => q.questionKey === 'pareja.partner1.vestuario.resolucion')).toBe(false)

    const tipoConcreto = [makeDecision({ questionKey: 'pareja.partner1.vestuario', answer: { choice: 'vestido' } })]
    const questions = listPairBlockQuestions(makeEvent(), tipoConcreto)
    expect(questions.some((q) => q.questionKey === 'pareja.partner1.vestuario.resolucion')).toBe(true)
    expect(questions.find((q) => q.questionKey === 'pareja.partner1.vestuario')?.status).toBe('decidida')
    expect(questions.find((q) => q.questionKey === 'pareja.partner1.vestuario.resolucion')?.status).toBe('sin_empezar')
  })

  it('la resolución de detalle especial NO cuenta hasta que el tipo implica preparación', () => {
    const tipoNo = [makeDecision({ questionKey: 'pareja.detalle_especial', answer: { choice: 'no' } })]
    expect(listPairBlockQuestions(makeEvent(), tipoNo).some((q) => q.questionKey === 'pareja.detalle_especial.resolucion')).toBe(false)

    const tipoRegalo = [makeDecision({ questionKey: 'pareja.detalle_especial', answer: { choice: 'regalo' } })]
    expect(listPairBlockQuestions(makeEvent(), tipoRegalo).some((q) => q.questionKey === 'pareja.detalle_especial.resolucion')).toBe(true)
  })

  it('un ítem floral sin marcar (ni details ni fila) no cuenta como pregunta pendiente', () => {
    const questions = listPairBlockQuestions(makeEvent(), [])
    expect(questions.some((q) => q.questionKey === 'pareja.partner1.floral.ramo')).toBe(false)
  })

  it('un ítem floral marcado en details SIN ninguna decisión de resolución: Sin empezar, no Por decidir', () => {
    const event = makeEvent({ details: { partner1FloralSelected: ['ramo'] } })
    const questions = listPairBlockQuestions(event, [])
    expect(questions.find((q) => q.questionKey === 'pareja.partner1.floral.ramo')?.status).toBe('sin_empezar')
  })

  it('un ítem floral con decisión de resolución real ya cuenta aunque los details no se hayan actualizado', () => {
    const decisions = [makeDecision({ questionKey: 'pareja.partner1.floral.ramo', answer: { choice: 'todavia_no_lo_sabemos' } })]
    const questions = listPairBlockQuestions(makeEvent(), decisions)
    expect(questions.find((q) => q.questionKey === 'pareja.partner1.floral.ramo')?.status).toBe('por_decidir')
  })

  it('resumen omite cualquier contador en cero y nunca usa un porcentaje', () => {
    const decisions = [
      makeDecision({ questionKey: 'pareja.partner1.vestuario', answer: { choice: 'vestido' } }),
      makeDecision({ questionKey: 'pareja.partner2.vestuario', answer: { choice: 'todavia_no_lo_sabemos' } }),
    ]
    const summary = summarizePairBlock(makeEvent(), decisions)
    expect(summary).toContain('✓ 1 decidida')
    expect(summary).toContain('⏳ 1 por decidir')
    expect(summary).not.toMatch(/%/)
  })

  it('nombres de pareja se usan en las etiquetas cuando existen, "Pareja 1"/"Pareja 2" si no', () => {
    expect(partnerName(makeEvent(), 'partner1')).toBe('Pareja 1')
    expect(partnerName(makeEvent({ details: { partner1Name: 'Laura' } }), 'partner1')).toBe('Laura')
  })
})

describe('Vestuario — tipo ≠ resolución: elegir "vestido" solo dice QUÉ, nunca implica comprarlo/presupuestarlo', () => {
  const none = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false }

  it('tipo "todavía no lo sabemos": la resolución nunca genera nada, aunque se le pase una respuesta', () => {
    expect(desiredForVestuarioResolucion({ choice: 'todavia_no_lo_sabemos' }, { choice: 'elegir_comprar' }, 'Laura')).toEqual(none)
  })
  it('resolución "todavía no lo sabemos" / sin responder: nada, resolved:false', () => {
    const tipo: VestuarioTipoAnswer = { choice: 'vestido' }
    expect(desiredForVestuarioResolucion(tipo, { choice: 'todavia_no_lo_sabemos' }, 'Laura')).toEqual(none)
    expect(desiredForVestuarioResolucion(tipo, undefined, 'Laura')).toEqual(none)
  })
  it('resolución "ya lo tenemos": RESUELTO — nunca "nada", es una categoría propia que completa, no cancela', () => {
    const tipo: VestuarioTipoAnswer = { choice: 'vestido' }
    expect(desiredForVestuarioResolucion(tipo, { choice: 'ya_lo_tenemos' }, 'Laura')).toEqual({
      taskTitle: null,
      budgetCategory: null,
      providerCategory: null,
      resolved: true,
    })
  })
  it('elegir/comprar: tarea + presupuesto con el nombre real, solo cuando la resolución lo dice', () => {
    expect(desiredForVestuarioResolucion({ choice: 'vestido' }, { choice: 'elegir_comprar' }, 'Laura')).toEqual({
      taskTitle: 'Elegir/comprar vestido de Laura',
      budgetCategory: 'Vestido de Laura',
      providerCategory: null,
      resolved: false,
    })
    expect(desiredForVestuarioResolucion({ choice: 'traje' }, { choice: 'elegir_comprar' }, 'Miguel')).toEqual({
      taskTitle: 'Elegir/comprar traje de Miguel',
      budgetCategory: 'Traje de Miguel',
      providerCategory: null,
      resolved: false,
    })
  })
  it('buscando proveedor: tarea + presupuesto, nunca crea el proveedor (igual que peluquería/floristería)', () => {
    const desired = desiredForVestuarioResolucion({ choice: 'vestido' }, { choice: 'buscando_proveedor' }, 'Laura')
    expect(desired.taskTitle).toBe('Buscar dónde conseguir vestido de Laura')
    expect(desired.budgetCategory).toBe('Vestido de Laura')
    expect(desired.resolved).toBe(false)
  })
  it('tipo "otro" usa su customLabel en el texto generado por la resolución, nunca lo interpreta', () => {
    const tipo: VestuarioTipoAnswer = { choice: 'otro', customLabel: 'Mono de fiesta' }
    expect(desiredForVestuarioResolucion(tipo, { choice: 'elegir_comprar' }, 'Laura')).toEqual({
      taskTitle: 'Elegir/comprar Mono de fiesta de Laura',
      budgetCategory: 'Mono de fiesta de Laura',
      providerCategory: null,
      resolved: false,
    })
  })
  it('resolución "otro": motor explícito, presupuesto solo con hasCost === "si"', () => {
    const tipo: VestuarioTipoAnswer = { choice: 'vestido' }
    const sinCoste: CustomResolution = { label: 'Alquilarlo', action: 'buscar_contratar', hasCost: 'no' }
    expect(desiredForVestuarioResolucion(tipo, { choice: 'otro', custom: sinCoste }, 'Laura').budgetCategory).toBeNull()
    const conCoste: CustomResolution = { label: 'Alquilarlo', action: 'buscar_contratar', hasCost: 'si' }
    expect(desiredForVestuarioResolucion(tipo, { choice: 'otro', custom: conCoste }, 'Laura').budgetCategory).toBe('Alquilarlo de Laura')
  })
  it('resolución "otro" con action "resuelto": también RESUELTO — misma infraestructura que "ya lo tenemos"', () => {
    const tipo: VestuarioTipoAnswer = { choice: 'vestido' }
    const resuelto: CustomResolution = { label: 'Alquilado', action: 'resuelto', hasCost: null }
    expect(desiredForVestuarioResolucion(tipo, { choice: 'otro', custom: resuelto }, 'Laura').resolved).toBe(true)
  })
})

describe('Peluquería/maquillaje — necesidad + resolución, nunca crea proveedor', () => {
  const none = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false }
  it('necesidad "no" o "todavía no lo sabemos": nada, sin mirar la resolución', () => {
    const resolucion: PeluqueriaResolucionAnswer = { choice: 'buscando' }
    expect(desiredForPeluqueriaResolucion({ choice: 'no' }, resolucion, 'Laura')).toEqual(none)
    expect(desiredForPeluqueriaResolucion({ choice: 'todavia_no_lo_sabemos' }, resolucion, 'Laura')).toEqual(none)
  })
  it('necesidad real sin resolución todavía: nada, resolved:false', () => {
    const necesidad: PeluqueriaNecesidadAnswer = { choice: 'peluqueria' }
    expect(desiredForPeluqueriaResolucion(necesidad, undefined, 'Laura')).toEqual(none)
  })
  it('"ya lo tenemos": RESUELTO', () => {
    const necesidad: PeluqueriaNecesidadAnswer = { choice: 'peluqueria' }
    expect(desiredForPeluqueriaResolucion(necesidad, { choice: 'ya_lo_tenemos' }, 'Laura').resolved).toBe(true)
  })
  it('"buscando": genera tarea + presupuesto, nunca un proveedor (eso solo lo crea la familia)', () => {
    const necesidad: PeluqueriaNecesidadAnswer = { choice: 'ambos' }
    const desired = desiredForPeluqueriaResolucion(necesidad, { choice: 'buscando' }, 'Laura')
    expect(desired.taskTitle).toBe('Buscar peluquería/maquillaje para Laura')
    expect(desired.budgetCategory).toBe('Peluquería/maquillaje de Laura')
    expect(desired.providerCategory).toBe('Peluquería/Maquillaje')
    expect(desired.resolved).toBe(false)
  })
})

describe('Complementos generales — 3 estados reales, multiselección opcional, nunca "resuelto" (no existe ese concepto aquí)', () => {
  it('"no_necesitamos"/"todavía no lo sabemos": nunca genera nada, aunque haya algo en selected por error', () => {
    const none = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false }
    const a: ComplementosAnswer = { choice: 'no_necesitamos', selected: ['Zapatos'], customItems: [] }
    expect(desiredForComplementos(a, 'Laura')).toEqual(none)
  })
  it('"preparar" sin nada seleccionado: nada (no se interpreta una multiselección vacía como una tarea)', () => {
    const a: ComplementosAnswer = { choice: 'preparar', selected: [], customItems: [] }
    expect(desiredForComplementos(a, 'Laura').taskTitle).toBeNull()
  })
  it('"preparar" con algo seleccionado: UNA sola tarea bundle, nunca una por complemento', () => {
    const a: ComplementosAnswer = { choice: 'preparar', selected: ['Zapatos', 'Joyas'], customItems: ['Pulsera de la abuela'] }
    expect(desiredForComplementos(a, 'Laura')).toEqual({ taskTitle: 'Preparar complementos de Laura', budgetCategory: null, providerCategory: null, resolved: false })
  })
})

describe('Floral — ramo/prendido/otro, nunca infiere por proximidad ni por texto', () => {
  const none = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false }
  it('todavía no lo sabemos: nada', () => {
    expect(desiredForFloral({ choice: 'todavia_no_lo_sabemos' }, 'Ramo', 'Laura')).toEqual(none)
  })
  it('ya lo tenemos: RESUELTO — nunca "nada"', () => {
    expect(desiredForFloral({ choice: 'ya_lo_tenemos' }, 'Ramo', 'Laura')).toEqual({
      taskTitle: null,
      budgetCategory: null,
      providerCategory: null,
      resolved: true,
    })
  })
  it('preparamos: tarea, nunca presupuesto', () => {
    expect(desiredForFloral({ choice: 'preparamos' }, 'Ramo', 'Laura')).toEqual({
      taskTitle: 'Preparar ramo de Laura',
      budgetCategory: null,
      providerCategory: null,
      resolved: false,
    })
  })
  it('floristería: tarea + presupuesto independiente + categoría interna para sugerir proveedor (nunca lo crea)', () => {
    const desired = desiredForFloral({ choice: 'floristeria' }, 'Ramo', 'Laura')
    expect(desired).toEqual({ taskTitle: 'Encargar ramo de Laura', budgetCategory: 'Ramo de Laura', providerCategory: 'Floristería', resolved: false })
  })
  it('otro con action "resuelto": RESUELTO, misma infraestructura que "ya lo tenemos" — nunca interpreta el texto de la etiqueta', () => {
    const resuelto: CustomResolution = { label: 'Corona de flores', action: 'resuelto', hasCost: null }
    expect(desiredForFloral({ choice: 'otro', custom: resuelto }, 'Corona de flores', 'Laura')).toEqual({
      taskTitle: null,
      budgetCategory: null,
      providerCategory: null,
      resolved: true,
    })
  })
  it('otro con action "buscar_contratar": motor explícito, nunca interpreta el texto de la etiqueta', () => {
    const conCoste: CustomResolution = { label: 'Corona de flores', action: 'buscar_contratar', hasCost: 'si' }
    expect(desiredForFloral({ choice: 'otro', custom: conCoste }, 'Corona de flores', 'Laura')).toEqual({
      taskTitle: 'Resolver Corona de flores de Laura',
      budgetCategory: 'Corona de flores de Laura',
      providerCategory: null,
      resolved: false,
    })
  })
})

describe('Alianzas — compartida, resuelto ≠ cancelado, sin fecha dentro de la decisión', () => {
  const none = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false }
  it('todavía no lo sabemos: nada', () => {
    expect(desiredForAlianzas({ choice: 'todavia_no_lo_sabemos' })).toEqual(none)
  })
  it('"No tendremos": CANCELADO, nunca RESUELTO — no tener alianzas no es lo mismo que haberlas conseguido', () => {
    const desired = desiredForAlianzas({ choice: 'no_tendremos' })
    expect(desired).toEqual(none)
    expect(desired.resolved).toBe(false)
  })
  it('"Ya las tenemos": RESUELTO — confirmación explícita pedida', () => {
    expect(desiredForAlianzas({ choice: 'ya_las_tenemos' })).toEqual({
      taskTitle: null,
      budgetCategory: null,
      providerCategory: null,
      resolved: true,
    })
  })
  it('elegir/comprar_encargar: tarea + presupuesto compartidos, nunca "de nombre"', () => {
    expect(desiredForAlianzas({ choice: 'elegir' })).toEqual({ taskTitle: 'Elegir/Encargar las alianzas', budgetCategory: 'Alianzas', providerCategory: null, resolved: false })
  })
  it('no pide ni genera ninguna fecha — eso es un Preparativo aparte, no parte de la decisión', () => {
    const desired = desiredForAlianzas({ choice: 'comprar_encargar' })
    expect(desired).not.toHaveProperty('dueDate')
    expect(desired).not.toHaveProperty('pickupDate')
  })
})

describe('Detalle especial — tipo ≠ resolución, mismo patrón que Vestuario/Floral', () => {
  const none = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false }
  it('tipo "no"/"todavía no lo sabemos": la resolución nunca genera nada', () => {
    expect(desiredForDetalleEspecialResolucion({ choice: 'no' }, { choice: 'tenemos_que_prepararlo' })).toEqual(none)
    expect(desiredForDetalleEspecialResolucion({ choice: 'todavia_no_lo_sabemos' }, { choice: 'tenemos_que_prepararlo' })).toEqual(none)
  })
  it('resolución "todavía no lo sabemos" / sin responder: nada', () => {
    const tipo: DetalleEspecialTipoAnswer = { choice: 'regalo' }
    expect(desiredForDetalleEspecialResolucion(tipo, { choice: 'todavia_no_lo_sabemos' })).toEqual(none)
    expect(desiredForDetalleEspecialResolucion(tipo, undefined)).toEqual(none)
  })
  it('resolución "ya lo tenemos": RESUELTO', () => {
    const tipo: DetalleEspecialTipoAnswer = { choice: 'regalo' }
    expect(desiredForDetalleEspecialResolucion(tipo, { choice: 'ya_lo_tenemos' })).toEqual({
      taskTitle: null,
      budgetCategory: null,
      providerCategory: null,
      resolved: true,
    })
  })
  it('tenemos que prepararlo: tarea, nunca presupuesto', () => {
    expect(desiredForDetalleEspecialResolucion({ choice: 'carta' }, { choice: 'tenemos_que_prepararlo' })).toEqual({
      taskTitle: 'Preparar una carta para el otro',
      budgetCategory: null,
      providerCategory: null,
      resolved: false,
    })
  })
  it('buscando: tarea, tampoco presupuesto (nunca se pregunta precio en el cuestionario)', () => {
    expect(desiredForDetalleEspecialResolucion({ choice: 'sorpresa' }, { choice: 'buscando' }).budgetCategory).toBeNull()
  })
  it('resolución "otro": motor explícito, presupuesto solo con coste explícito', () => {
    const tipo: DetalleEspecialTipoAnswer = { choice: 'otro', customLabel: 'Vídeo sorpresa' }
    const conCoste: CustomResolution = { label: 'Vídeo sorpresa', action: 'buscar_contratar', hasCost: 'si' }
    expect(desiredForDetalleEspecialResolucion(tipo, { choice: 'otro', custom: conCoste })).toEqual({
      taskTitle: 'Preparar: Vídeo sorpresa',
      budgetCategory: 'Vídeo sorpresa',
      providerCategory: null,
      resolved: false,
    })
  })
})

describe('floralItemSelected / withFloralSelected — marca de selección SEPARADA de la decisión de resolución', () => {
  it('sin details: ningún ítem seleccionado', () => {
    expect(floralItemSelected(makeEvent(), 'partner1', 'ramo')).toBe(false)
  })
  it('withFloralSelected añade el ítem manteniendo el resto de details intacto (merge explícito)', () => {
    const event = makeEvent({ details: { partner1Name: 'Laura' } })
    const patch = withFloralSelected(event, 'partner1', 'ramo', true)
    expect(patch).toEqual({ partner1Name: 'Laura', partner1FloralSelected: ['ramo'] })
  })
  it('withFloralSelected no duplica si ya estaba marcado', () => {
    const event = makeEvent({ details: { partner1FloralSelected: ['ramo'] } })
    const patch = withFloralSelected(event, 'partner1', 'ramo', true)
    expect(patch.partner1FloralSelected).toEqual(['ramo'])
  })
  it('withFloralSelected(false) quita el ítem sin tocar los demás', () => {
    const event = makeEvent({ details: { partner1FloralSelected: ['ramo', 'prendido'] } })
    const patch = withFloralSelected(event, 'partner1', 'ramo', false)
    expect(patch.partner1FloralSelected).toEqual(['prendido'])
  })
  it('partner1 y partner2 usan campos independientes', () => {
    const event = makeEvent({ details: { partner1FloralSelected: ['ramo'] } })
    expect(floralItemSelected(event, 'partner1', 'ramo')).toBe(true)
    expect(floralItemSelected(event, 'partner2', 'ramo')).toBe(false)
  })
})

// Petición real: "esto no debe depender del género" — el catálogo sugerido difiere solo por POSICIÓN del
// slot (nunca por partnerRole), y nunca oculta un dato real ya existente.
describe('floralItemsForSlot — catálogo sugerido por POSICIÓN, nunca por rol/género, nunca oculta un dato real', () => {
  it('partner1 (primera persona): Ramo y Flor de solapa, igual que siempre', () => {
    const keys = floralItemsForSlot(makeEvent(), 'partner1', []).map((i) => i.key)
    expect(keys).toEqual(['ramo', 'prendido'])
  })

  it('partner2 (segunda persona) sin datos reales: Ramo no se sugiere por defecto, Flor de solapa sí', () => {
    const keys = floralItemsForSlot(makeEvent(), 'partner2', []).map((i) => i.key)
    expect(keys).toEqual(['prendido'])
  })

  it('CASO F — si partner2 YA tiene "ramo" seleccionado (dato real), nunca se oculta aunque no se sugiera por defecto', () => {
    const event = makeEvent({ details: { partner2FloralSelected: ['ramo'] } })
    const keys = floralItemsForSlot(event, 'partner2', []).map((i) => i.key)
    expect(keys).toContain('ramo')
  })

  it('si partner2 YA tiene una decisión de resolución para "ramo" (sin estar marcado en details), tampoco se oculta', () => {
    const decisions = [makeDecision({ questionKey: 'pareja.partner2.floral.ramo', answer: { choice: 'floristeria' } })]
    const keys = floralItemsForSlot(makeEvent(), 'partner2', decisions).map((i) => i.key)
    expect(keys).toContain('ramo')
  })

  it('nunca decide por partnerRole (novia/novio) — depende solo de PartnerSlot', () => {
    const eventNovio1 = makeEvent({ details: { partner1Role: 'novio' } })
    const eventNovia1 = makeEvent({ details: { partner1Role: 'novia' } })
    expect(floralItemsForSlot(eventNovio1, 'partner1', [])).toEqual(floralItemsForSlot(eventNovia1, 'partner1', []))
  })
})

// RETOQUE (petición real: "Paco no tiene esa posibilidad") — causa raíz: el render ocultaba el bloque
// floral entero detrás de la pregunta general de Complementos (sin relación con flores), aunque ya
// existiera una selección o decisión floral real. hasFloralActivity es el mismo criterio que
// listPairBlockQuestions ya usaba para el contador "✓ N decididas" (nunca mira Complementos).
describe('hasFloralActivity — una persona con cualquier dato floral real nunca queda oculta, sea cual sea su respuesta de Complementos', () => {
  it('false sin ninguna actividad floral', () => {
    expect(hasFloralActivity(makeEvent(), 'partner2', [])).toBe(false)
  })

  it('true si el ítem está marcado en details (aunque no tenga decisión de resolución todavía)', () => {
    const event = makeEvent({ details: { partner2FloralSelected: ['prendido'] } })
    expect(hasFloralActivity(event, 'partner2', [])).toBe(true)
  })

  it('true si ya existe una decisión floral.* para esa persona (caso real: pareja.partner2.floral.prendido con respuesta)', () => {
    const decisions = [makeDecision({ questionKey: 'pareja.partner2.floral.prendido', answer: { choice: 'floristeria' } })]
    expect(hasFloralActivity(makeEvent(), 'partner2', decisions)).toBe(true)
  })

  it('true si existe un complemento floral libre ("+Otro") para esa persona (floral.custom:*)', () => {
    const decisions = [makeDecision({ questionKey: 'pareja.partner2.floral.custom:abc123', answer: { choice: 'otro', custom: { label: 'Corona floral', action: 'buscar_contratar', hasCost: null } } })]
    expect(hasFloralActivity(makeEvent(), 'partner2', decisions)).toBe(true)
  })

  it('ignora la actividad floral de OTRO slot — partner1 con ramo no hace true a partner2', () => {
    const event = makeEvent({ details: { partner1FloralSelected: ['ramo'] } })
    expect(hasFloralActivity(event, 'partner2', [])).toBe(false)
  })
})

const PENDING_NONE = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false }
const RESOLVED = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: true }

describe('Reconciliación — nunca "borrar siempre" ni "nunca borrar" (acción pendiente / cancelado / por decidir)', () => {
  it('nada existe, se desea algo: crear', () => {
    const desired = { taskTitle: 'Elegir vestido de Laura', budgetCategory: 'Vestido de Laura', providerCategory: null, resolved: false }
    const { actions } = reconcilePairGeneration(desired, undefined, undefined)
    expect(actions).toEqual(
      expect.arrayContaining([
        { op: 'create_task', title: 'Elegir vestido de Laura' },
        { op: 'create_budget', category: 'Vestido de Laura' },
      ]),
    )
  })

  it('ya existe y coincide: no hace nada (responder dos veces lo mismo no duplica)', () => {
    const desired = { taskTitle: 'Elegir vestido de Laura', budgetCategory: 'Vestido de Laura', providerCategory: null, resolved: false }
    const task = makeTask({ title: 'Elegir vestido de Laura' })
    const budget = makeBudgetItem({ category: 'Vestido de Laura' })
    expect(reconcilePairGeneration(desired, task, budget).actions).toEqual([])
  })

  it('cambio de nombre: tarea/presupuesto prístinos se actualizan en el sitio', () => {
    const desired = { taskTitle: 'Elegir vestido de Laura María', budgetCategory: 'Vestido de Laura María', providerCategory: null, resolved: false }
    const task = makeTask({ title: 'Elegir vestido de Laura' })
    const budget = makeBudgetItem({ category: 'Vestido de Laura' })
    expect(reconcilePairGeneration(desired, task, budget).actions).toEqual(
      expect.arrayContaining([
        { op: 'update_task', id: 't1', title: 'Elegir vestido de Laura María' },
        { op: 'update_budget', id: 'b1', category: 'Vestido de Laura María' },
      ]),
    )
  })

  it('tarea ya marcada hecha: NO se actualiza el título aunque el nombre cambie — ya no es prístina', () => {
    const desired = { taskTitle: 'Elegir vestido de Laura María', budgetCategory: null, providerCategory: null, resolved: false }
    const task = makeTask({ title: 'Elegir vestido de Laura', done: true })
    expect(reconcilePairGeneration(desired, task, undefined).actions).toEqual([])
  })
  it('tarea con fecha puesta: tampoco prístina, aunque el título siga intacto', () => {
    const task = makeTask({ dueDate: '2026-12-01' })
    expect(isTaskUntouched(task)).toBe(false)
  })
  it('tarea con responsable: tampoco prístina', () => {
    expect(isTaskUntouched(makeTask({ assignedMemberId: 'm1' }))).toBe(false)
  })
  it('tarea enlazada al Calendario: tampoco prístina', () => {
    expect(isTaskUntouched(makeTask({ calendarEventId: 'c1' }))).toBe(false)
  })
  it('tarea source "manual" (aunque tenga decisionId de antes): tampoco prístina', () => {
    expect(isTaskUntouched(makeTask({ source: 'manual' }))).toBe(false)
  })
  it('tarea realmente intacta: prístina', () => {
    expect(isTaskUntouched(makeTask())).toBe(true)
  })

  it('presupuesto con importe real: NO prístino, no se actualiza ni se borra', () => {
    expect(isBudgetItemUntouched(makeBudgetItem({ plannedAmount: 450 }))).toBe(false)
  })
  it('presupuesto sin importe: prístino', () => {
    expect(isBudgetItemUntouched(makeBudgetItem())).toBe(true)
  })

  it('cancelado (resolved:false, sin taskTitle), tarea prístina: se borra de verdad (nunca queda como resto)', () => {
    const task = makeTask()
    expect(reconcilePairGeneration(PENDING_NONE, task, undefined).actions).toEqual([{ op: 'delete_task', id: 't1' }])
  })
  it('cancelado, tarea NO prístina (ya marcada hecha a mano): se conserva, solo se desvincula — nunca se marca falsamente como completado "por" el motor', () => {
    const task = makeTask({ done: true })
    expect(reconcilePairGeneration(PENDING_NONE, task, undefined).actions).toEqual([{ op: 'detach_task', id: 't1' }])
  })
  it('"todavía no lo sabemos" (resolved:false) con datos enriquecidos: se desvincula, NUNCA se destruye silenciosamente', () => {
    const task = makeTask({ assignedMemberId: 'm1' })
    const budget = makeBudgetItem({ plannedAmount: 200 })
    const result = reconcilePairGeneration(PENDING_NONE, task, budget)
    expect(result.actions).toEqual(expect.arrayContaining([{ op: 'detach_task', id: 't1' }, { op: 'detach_budget', id: 'b1' }]))
    expect(result.actions).not.toContainEqual({ op: 'delete_task', id: 't1' })
    expect(result.actions).not.toContainEqual({ op: 'delete_budget', id: 'b1' })
  })
  it('lo mismo para presupuesto: prístino se borra, con importe real se desvincula (caso cancelado/por decidir)', () => {
    expect(reconcilePairGeneration(PENDING_NONE, undefined, makeBudgetItem()).actions).toEqual([{ op: 'delete_budget', id: 'b1' }])
    expect(reconcilePairGeneration(PENDING_NONE, undefined, makeBudgetItem({ plannedAmount: 300 })).actions).toEqual([{ op: 'detach_budget', id: 'b1' }])
  })
})

describe('Reconciliación — RESUELTO ≠ CANCELADO (corrección aprobada)', () => {
  it('resolved:true + tarea pendiente real: complete_task, NUNCA delete_task', () => {
    const task = makeTask()
    const result = reconcilePairGeneration(RESOLVED, task, undefined)
    expect(result.actions).toEqual([{ op: 'complete_task', id: 't1' }])
  })
  it('resuelto sin tarea previa: no fabrica una tarea ya completada de la nada', () => {
    const result = reconcilePairGeneration(RESOLVED, undefined, undefined)
    expect(result.actions).toEqual([])
  })
  it('resuelto + tarea ya completada antes (a mano): no hace nada (idempotente, no hay "doble completar")', () => {
    const task = makeTask({ done: true })
    const result = reconcilePairGeneration(RESOLVED, task, undefined)
    expect(result.actions).toEqual([])
  })
  it('resuelto + tarea con fecha/responsable/calendario: se completa igualmente — completar nunca borra esos datos, el reconciliador no los toca', () => {
    const task = makeTask({ dueDate: '2026-12-01', assignedMemberId: 'm1', calendarEventId: 'c1' })
    const result = reconcilePairGeneration(RESOLVED, task, undefined)
    expect(result.actions).toEqual([{ op: 'complete_task', id: 't1' }])
  })
  it('resuelto + presupuesto con importe null: se conserva intacto (ninguna acción) + pendingBudgetItem lo recoge', () => {
    const budget = makeBudgetItem()
    const result = reconcilePairGeneration(RESOLVED, undefined, budget)
    expect(result.actions).toEqual([])
    expect(result.pendingBudgetItem).toEqual({ id: 'b1', category: 'Vestido de Laura' })
  })
  it('resuelto + presupuesto con importe real: se conserva intacto, ninguna acción, pendingBudgetItem es null (nunca vuelve a preguntar)', () => {
    const budget = makeBudgetItem({ plannedAmount: 650 })
    const result = reconcilePairGeneration(RESOLVED, undefined, budget)
    expect(result.actions).toEqual([])
    expect(result.pendingBudgetItem).toBeNull()
  })
  it('resuelto sin ninguna partida: pendingBudgetItem es null (nunca se fabrica una partida solo para preguntar)', () => {
    const result = reconcilePairGeneration(RESOLVED, undefined, undefined)
    expect(result.pendingBudgetItem).toBeNull()
  })
  it('pendiente (no resuelto) con presupuesto null: nunca pendingBudgetItem, aunque el importe sea null', () => {
    const desired = { taskTitle: 'Elegir vestido de Laura', budgetCategory: null, providerCategory: null, resolved: false }
    const budget = makeBudgetItem()
    expect(reconcilePairGeneration(desired, undefined, budget).pendingBudgetItem).toBeNull()
  })
})

describe('describeEffects — el toast se construye SIEMPRE de las acciones reales, nunca de la respuesta elegida', () => {
  it('lista vacía: ningún mensaje', () => {
    expect(describeEffects([])).toBeNull()
  })
  it('solo updates (renombrados silenciosos): ningún mensaje', () => {
    expect(describeEffects([{ op: 'update_task', id: 't1', title: 'x' }, { op: 'update_budget', id: 'b1', category: 'y' }])).toBeNull()
  })
  it('solo detach (derivado ya tocado a mano, se conserva tal cual): ningún mensaje — nada visible cambió en Preparativos/Presupuesto', () => {
    expect(describeEffects([{ op: 'detach_task', id: 't1' }, { op: 'detach_budget', id: 'b1' }])).toBeNull()
  })
  it('RETOQUE — borrar de verdad un derivado prístino (delete_task/delete_budget) SÍ avisa: "🗑️ Retirado de..."', () => {
    expect(describeEffects([{ op: 'delete_task', id: 't1' }])).toBe('🗑️ Retirado de Preparativos')
    expect(describeEffects([{ op: 'delete_budget', id: 'b1' }])).toBe('🗑️ Retirado de Presupuesto')
    expect(describeEffects([{ op: 'delete_task', id: 't1' }, { op: 'delete_budget', id: 'b1' }])).toBe('🗑️ Retirado de Preparativos y Presupuesto')
  })
  it('crear/completar sigue teniendo prioridad sobre cualquier retirada en la misma lista (nunca deberían coexistir en la práctica, pero el orden de prioridad queda definido)', () => {
    expect(describeEffects([{ op: 'create_task', title: 'x' }, { op: 'delete_budget', id: 'b1' }])).toBe('✅ Añadido a Preparativos')
  })
  it('crea solo tarea: "Añadido a Preparativos"', () => {
    expect(describeEffects([{ op: 'create_task', title: 'x' }])).toBe('✅ Añadido a Preparativos')
  })
  it('crea tarea + presupuesto: lista unida con "y", un único mensaje', () => {
    expect(describeEffects([{ op: 'create_task', title: 'x' }, { op: 'create_budget', category: 'y' }])).toBe('✅ Añadido a Preparativos y Presupuesto')
  })
  it('completa una tarea: "Preparativo completado"', () => {
    expect(describeEffects([{ op: 'complete_task', id: 't1' }])).toBe(TASK_COMPLETED_MESSAGE)
  })
})
