import { describe, expect, it } from 'vitest'
import {
  decisionStatus,
  desiredForAlianzas,
  desiredForComplementos,
  desiredForDetalleEspecialResolucion,
  desiredForFloral,
  desiredForPeluqueriaResolucion,
  desiredForVestuarioResolucion,
  floralItemSelected,
  isBudgetItemUntouched,
  isTaskUntouched,
  listPairBlockQuestions,
  partnerName,
  reconcilePairGeneration,
  summarizePairBlock,
  withFloralSelected,
  type AlianzasAnswer,
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
  const none = { taskTitle: null, budgetCategory: null, providerCategory: null }

  it('tipo "todavía no lo sabemos": la resolución nunca genera nada, aunque se le pase una respuesta', () => {
    expect(desiredForVestuarioResolucion({ choice: 'todavia_no_lo_sabemos' }, { choice: 'elegir_comprar' }, 'Laura')).toEqual(none)
  })
  it('resolución "ya lo tenemos" / "todavía no lo sabemos" / sin responder: nada', () => {
    const tipo: VestuarioTipoAnswer = { choice: 'vestido' }
    expect(desiredForVestuarioResolucion(tipo, { choice: 'ya_lo_tenemos' }, 'Laura')).toEqual(none)
    expect(desiredForVestuarioResolucion(tipo, { choice: 'todavia_no_lo_sabemos' }, 'Laura')).toEqual(none)
    expect(desiredForVestuarioResolucion(tipo, undefined, 'Laura')).toEqual(none)
  })
  it('elegir/comprar: tarea + presupuesto con el nombre real, solo cuando la resolución lo dice', () => {
    expect(desiredForVestuarioResolucion({ choice: 'vestido' }, { choice: 'elegir_comprar' }, 'Laura')).toEqual({
      taskTitle: 'Elegir/comprar vestido de Laura',
      budgetCategory: 'Vestido de Laura',
      providerCategory: null,
    })
    expect(desiredForVestuarioResolucion({ choice: 'traje' }, { choice: 'elegir_comprar' }, 'Miguel')).toEqual({
      taskTitle: 'Elegir/comprar traje de Miguel',
      budgetCategory: 'Traje de Miguel',
      providerCategory: null,
    })
  })
  it('buscando proveedor: tarea + presupuesto, nunca crea el proveedor (igual que peluquería/floristería)', () => {
    const desired = desiredForVestuarioResolucion({ choice: 'vestido' }, { choice: 'buscando_proveedor' }, 'Laura')
    expect(desired.taskTitle).toBe('Buscar dónde conseguir vestido de Laura')
    expect(desired.budgetCategory).toBe('Vestido de Laura')
  })
  it('tipo "otro" usa su customLabel en el texto generado por la resolución, nunca lo interpreta', () => {
    const tipo: VestuarioTipoAnswer = { choice: 'otro', customLabel: 'Mono de fiesta' }
    expect(desiredForVestuarioResolucion(tipo, { choice: 'elegir_comprar' }, 'Laura')).toEqual({
      taskTitle: 'Elegir/comprar Mono de fiesta de Laura',
      budgetCategory: 'Mono de fiesta de Laura',
      providerCategory: null,
    })
  })
  it('resolución "otro": motor explícito, presupuesto solo con hasCost === "si"', () => {
    const tipo: VestuarioTipoAnswer = { choice: 'vestido' }
    const sinCoste: CustomResolution = { label: 'Alquilarlo', action: 'buscar_contratar', hasCost: 'no' }
    expect(desiredForVestuarioResolucion(tipo, { choice: 'otro', custom: sinCoste }, 'Laura').budgetCategory).toBeNull()
    const conCoste: CustomResolution = { label: 'Alquilarlo', action: 'buscar_contratar', hasCost: 'si' }
    expect(desiredForVestuarioResolucion(tipo, { choice: 'otro', custom: conCoste }, 'Laura').budgetCategory).toBe('Alquilarlo de Laura')
  })
})

describe('Peluquería/maquillaje — necesidad + resolución, nunca crea proveedor', () => {
  it('necesidad "no" o "todavía no lo sabemos": nada, sin mirar la resolución', () => {
    const none = { taskTitle: null, budgetCategory: null, providerCategory: null }
    const resolucion: PeluqueriaResolucionAnswer = { choice: 'buscando' }
    expect(desiredForPeluqueriaResolucion({ choice: 'no' }, resolucion, 'Laura')).toEqual(none)
    expect(desiredForPeluqueriaResolucion({ choice: 'todavia_no_lo_sabemos' }, resolucion, 'Laura')).toEqual(none)
  })
  it('necesidad real sin resolución todavía, o "ya lo tenemos": nada', () => {
    const necesidad: PeluqueriaNecesidadAnswer = { choice: 'peluqueria' }
    expect(desiredForPeluqueriaResolucion(necesidad, undefined, 'Laura').taskTitle).toBeNull()
    expect(desiredForPeluqueriaResolucion(necesidad, { choice: 'ya_lo_tenemos' }, 'Laura').taskTitle).toBeNull()
  })
  it('"buscando": genera tarea + presupuesto, nunca un proveedor (eso solo lo crea la familia)', () => {
    const necesidad: PeluqueriaNecesidadAnswer = { choice: 'ambos' }
    const desired = desiredForPeluqueriaResolucion(necesidad, { choice: 'buscando' }, 'Laura')
    expect(desired.taskTitle).toBe('Buscar peluquería/maquillaje para Laura')
    expect(desired.budgetCategory).toBe('Peluquería/maquillaje de Laura')
    expect(desired.providerCategory).toBe('Peluquería/Maquillaje')
  })
})

describe('Complementos generales — 3 estados reales, multiselección opcional', () => {
  it('"no_necesitamos"/"todavía no lo sabemos": nunca genera nada, aunque haya algo en selected por error', () => {
    const none = { taskTitle: null, budgetCategory: null, providerCategory: null }
    const a: ComplementosAnswer = { choice: 'no_necesitamos', selected: ['Zapatos'], customItems: [] }
    expect(desiredForComplementos(a, 'Laura')).toEqual(none)
  })
  it('"preparar" sin nada seleccionado: nada (no se interpreta una multiselección vacía como una tarea)', () => {
    const a: ComplementosAnswer = { choice: 'preparar', selected: [], customItems: [] }
    expect(desiredForComplementos(a, 'Laura').taskTitle).toBeNull()
  })
  it('"preparar" con algo seleccionado: UNA sola tarea bundle, nunca una por complemento', () => {
    const a: ComplementosAnswer = { choice: 'preparar', selected: ['Zapatos', 'Joyas'], customItems: ['Pulsera de la abuela'] }
    expect(desiredForComplementos(a, 'Laura')).toEqual({ taskTitle: 'Preparar complementos de Laura', budgetCategory: null, providerCategory: null })
  })
})

describe('Floral — ramo/prendido/otro, nunca infiere por proximidad ni por texto', () => {
  const none = { taskTitle: null, budgetCategory: null, providerCategory: null }
  it('ya_lo_tenemos / todavía no lo sabemos: nada', () => {
    expect(desiredForFloral({ choice: 'ya_lo_tenemos' }, 'Ramo', 'Laura')).toEqual(none)
    expect(desiredForFloral({ choice: 'todavia_no_lo_sabemos' }, 'Ramo', 'Laura')).toEqual(none)
  })
  it('preparamos: tarea, nunca presupuesto', () => {
    expect(desiredForFloral({ choice: 'preparamos' }, 'Ramo', 'Laura')).toEqual({ taskTitle: 'Preparar ramo de Laura', budgetCategory: null, providerCategory: null })
  })
  it('floristería: tarea + presupuesto independiente + categoría interna para sugerir proveedor (nunca lo crea)', () => {
    const desired = desiredForFloral({ choice: 'floristeria' }, 'Ramo', 'Laura')
    expect(desired).toEqual({ taskTitle: 'Encargar ramo de Laura', budgetCategory: 'Ramo de Laura', providerCategory: 'Floristería' })
  })
  it('otro: motor explícito, nunca interpreta el texto de la etiqueta', () => {
    const resuelto: CustomResolution = { label: 'Corona de flores', action: 'resuelto', hasCost: null }
    expect(desiredForFloral({ choice: 'otro', custom: resuelto }, 'Corona de flores', 'Laura')).toEqual(none)
    const conCoste: CustomResolution = { label: 'Corona de flores', action: 'buscar_contratar', hasCost: 'si' }
    expect(desiredForFloral({ choice: 'otro', custom: conCoste }, 'Corona de flores', 'Laura')).toEqual({
      taskTitle: 'Resolver Corona de flores de Laura',
      budgetCategory: 'Corona de flores de Laura',
      providerCategory: null,
    })
  })
})

describe('Alianzas — compartida, sin fecha dentro de la decisión', () => {
  const none = { taskTitle: null, budgetCategory: null, providerCategory: null }
  it('ya_las_tenemos / no_tendremos / todavía no lo sabemos: nada', () => {
    const choices: AlianzasAnswer['choice'][] = ['ya_las_tenemos', 'no_tendremos', 'todavia_no_lo_sabemos']
    for (const choice of choices) expect(desiredForAlianzas({ choice })).toEqual(none)
  })
  it('elegir/comprar_encargar: tarea + presupuesto compartidos, nunca "de nombre"', () => {
    expect(desiredForAlianzas({ choice: 'elegir' })).toEqual({ taskTitle: 'Elegir/Encargar las alianzas', budgetCategory: 'Alianzas', providerCategory: null })
  })
  it('no pide ni genera ninguna fecha — eso es un Preparativo aparte, no parte de la decisión', () => {
    const desired = desiredForAlianzas({ choice: 'comprar_encargar' })
    expect(desired).not.toHaveProperty('dueDate')
    expect(desired).not.toHaveProperty('pickupDate')
  })
})

describe('Detalle especial — tipo ≠ resolución, mismo patrón que Vestuario/Floral', () => {
  const none = { taskTitle: null, budgetCategory: null, providerCategory: null }
  it('tipo "no"/"todavía no lo sabemos": la resolución nunca genera nada', () => {
    expect(desiredForDetalleEspecialResolucion({ choice: 'no' }, { choice: 'tenemos_que_prepararlo' })).toEqual(none)
    expect(desiredForDetalleEspecialResolucion({ choice: 'todavia_no_lo_sabemos' }, { choice: 'tenemos_que_prepararlo' })).toEqual(none)
  })
  it('resolución "ya lo tenemos" / "todavía no lo sabemos" / sin responder: nada', () => {
    const tipo: DetalleEspecialTipoAnswer = { choice: 'regalo' }
    expect(desiredForDetalleEspecialResolucion(tipo, { choice: 'ya_lo_tenemos' })).toEqual(none)
    expect(desiredForDetalleEspecialResolucion(tipo, { choice: 'todavia_no_lo_sabemos' })).toEqual(none)
    expect(desiredForDetalleEspecialResolucion(tipo, undefined)).toEqual(none)
  })
  it('tenemos que prepararlo: tarea, nunca presupuesto', () => {
    expect(desiredForDetalleEspecialResolucion({ choice: 'carta' }, { choice: 'tenemos_que_prepararlo' })).toEqual({
      taskTitle: 'Preparar una carta para el otro',
      budgetCategory: null,
      providerCategory: null,
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

describe('Reconciliación — nunca "borrar siempre" ni "nunca borrar"', () => {
  it('nada existe, se desea algo: crear', () => {
    const desired = { taskTitle: 'Elegir vestido de Laura', budgetCategory: 'Vestido de Laura', providerCategory: null }
    const actions = reconcilePairGeneration(desired, undefined, undefined)
    expect(actions).toEqual(
      expect.arrayContaining([
        { op: 'create_task', title: 'Elegir vestido de Laura' },
        { op: 'create_budget', category: 'Vestido de Laura' },
      ]),
    )
  })

  it('ya existe y coincide: no hace nada (responder dos veces lo mismo no duplica)', () => {
    const desired = { taskTitle: 'Elegir vestido de Laura', budgetCategory: 'Vestido de Laura', providerCategory: null }
    const task = makeTask({ title: 'Elegir vestido de Laura' })
    const budget = makeBudgetItem({ category: 'Vestido de Laura' })
    expect(reconcilePairGeneration(desired, task, budget)).toEqual([])
  })

  it('cambio de nombre: tarea/presupuesto prístinos se actualizan en el sitio', () => {
    const desired = { taskTitle: 'Elegir vestido de Laura María', budgetCategory: 'Vestido de Laura María', providerCategory: null }
    const task = makeTask({ title: 'Elegir vestido de Laura' })
    const budget = makeBudgetItem({ category: 'Vestido de Laura' })
    expect(reconcilePairGeneration(desired, task, budget)).toEqual(
      expect.arrayContaining([
        { op: 'update_task', id: 't1', title: 'Elegir vestido de Laura María' },
        { op: 'update_budget', id: 'b1', category: 'Vestido de Laura María' },
      ]),
    )
  })

  it('tarea ya marcada hecha: NO se actualiza el título aunque el nombre cambie — ya no es prístina', () => {
    const desired = { taskTitle: 'Elegir vestido de Laura María', budgetCategory: null, providerCategory: null }
    const task = makeTask({ title: 'Elegir vestido de Laura', done: true })
    expect(reconcilePairGeneration(desired, task, undefined)).toEqual([])
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

  it('ya no se implica nada y la tarea está prístina: se borra de verdad (nunca queda como resto)', () => {
    const none = { taskTitle: null, budgetCategory: null, providerCategory: null }
    const task = makeTask()
    expect(reconcilePairGeneration(none, task, undefined)).toEqual([{ op: 'delete_task', id: 't1' }])
  })
  it('ya no se implica nada y la tarea NO está prístina (ya marcada hecha): se conserva, solo se desvincula', () => {
    const none = { taskTitle: null, budgetCategory: null, providerCategory: null }
    const task = makeTask({ done: true })
    expect(reconcilePairGeneration(none, task, undefined)).toEqual([{ op: 'detach_task', id: 't1' }])
  })
  it('lo mismo para presupuesto: prístino se borra, con importe real se desvincula', () => {
    const none = { taskTitle: null, budgetCategory: null, providerCategory: null }
    expect(reconcilePairGeneration(none, undefined, makeBudgetItem())).toEqual([{ op: 'delete_budget', id: 'b1' }])
    expect(reconcilePairGeneration(none, undefined, makeBudgetItem({ plannedAmount: 300 }))).toEqual([{ op: 'detach_budget', id: 'b1' }])
  })
})
