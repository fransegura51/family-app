import { describe, expect, it } from 'vitest'
import { isTaskUntouched, reconcilePairGeneration } from '@/domain/eventPairDecisions'
import {
  desiredForInvitacion,
  desiredForListaInvitados,
  desiredForMenuInvitacion,
  desiredForNinosNecesidadItem,
  GUESTS_INVITACION_QUESTION_KEY,
  GUESTS_LISTA_QUESTION_KEY,
  GUESTS_MENU_QUESTION_KEY,
  GUESTS_MOMENTOS_QUESTION_KEY,
  GUESTS_NINOS_NECESIDADES_QUESTION_KEY,
  GUESTS_NINOS_QUESTION_KEY,
  guestsNinosNecesidadItemKey,
  listGuestsBlockQuestions,
  summarizeGuestsBlock,
} from '@/domain/eventGuestDecisions'
import type { EventBudgetItem, EventDecision, EventTask } from '@/domain/types'

function makeDecision(overrides: Partial<EventDecision> = {}): EventDecision {
  return {
    id: 'd1',
    eventId: 'e1',
    familyId: 'f1',
    blockKey: 'invitados',
    questionKey: GUESTS_LISTA_QUESTION_KEY,
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
    title: 'Preparar lista de invitados',
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
    category: 'Animación / juegos',
    plannedAmount: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    decisionId: 'd1',
    ...overrides,
  }
}

describe('Lista de invitados', () => {
  it('"ya la tenemos" sin tarea previa no genera ninguna acción (RESOLVED con existingTask=undefined es inocuo)', () => {
    const desired = desiredForListaInvitados({ choice: 'ya_la_tenemos' })
    const result = reconcilePairGeneration(desired, undefined, undefined)
    expect(result.actions).toEqual([])
  })

  it('"tenemos que prepararla" genera la tarea "Preparar lista de invitados", sin presupuesto', () => {
    const desired = desiredForListaInvitados({ choice: 'tenemos_que_prepararla' })
    const result = reconcilePairGeneration(desired, undefined, undefined)
    expect(result.actions).toEqual([{ op: 'create_task', title: 'Preparar lista de invitados' }])
  })

  it('"tenemos que prepararla" → "ya la tenemos" completa la tarea existente en vez de borrarla (resuelto ≠ cancelado)', () => {
    const existingTask = makeTask({ title: 'Preparar lista de invitados' })
    const desired = desiredForListaInvitados({ choice: 'ya_la_tenemos' })
    const result = reconcilePairGeneration(desired, existingTask, undefined)
    expect(result.actions).toEqual([{ op: 'complete_task', id: 't1' }])
  })

  it('"todavía no lo sabemos" nunca genera ni toca nada', () => {
    const desired = desiredForListaInvitados({ choice: 'todavia_no_lo_sabemos' })
    expect(desired).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
    expect(reconcilePairGeneration(desired, undefined, undefined).actions).toEqual([])
  })

  it('cancelar (pasar a "todavía no lo sabemos") borra una tarea prístina pero conserva una ya tocada (detach, no delete)', () => {
    const pristine = makeTask({ title: 'Preparar lista de invitados' })
    const touched = makeTask({ title: 'Preparar lista de invitados', done: true })
    const desired = desiredForListaInvitados({ choice: 'todavia_no_lo_sabemos' })
    expect(reconcilePairGeneration(desired, pristine, undefined).actions).toEqual([{ op: 'delete_task', id: 't1' }])
    expect(reconcilePairGeneration(desired, touched, undefined).actions).toEqual([{ op: 'detach_task', id: 't1' }])
  })

  it('"otro" con coste genera tarea + presupuesto; sin coste, solo tarea (reutiliza fromCustom/CustomResolution tal cual)', () => {
    const withCost = desiredForListaInvitados({ choice: 'otro', custom: { label: 'Pedir la lista al salón', action: 'otro', hasCost: 'si' } })
    expect(withCost.taskTitle).toBe('Lista de invitados: Pedir la lista al salón')
    expect(withCost.budgetCategory).toBe('Lista de invitados: Pedir la lista al salón')
    const withoutCost = desiredForListaInvitados({ choice: 'otro', custom: { label: 'Pedir la lista al salón', action: 'otro', hasCost: 'no' } })
    expect(withoutCost.budgetCategory).toBeNull()
  })
})

describe('Menú en la invitación — nunca genera Preparativo/Presupuesto (la definición real vive en Comida y celebración, fase futura)', () => {
  it('"sí" no genera ninguna acción', () => {
    expect(desiredForMenuInvitacion({ choice: 'si' })).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
  })

  it('"no" no genera ninguna acción', () => {
    expect(desiredForMenuInvitacion({ choice: 'no' })).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
  })

  it('"todavía no lo sabemos" no genera ninguna acción (sigue siendo una respuesta válida, no la ausencia de fila)', () => {
    expect(desiredForMenuInvitacion({ choice: 'todavia_no_lo_sabemos' })).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
  })

  it('"otro" sigue las reglas normales de CustomResolution (reutiliza fromCustom, no se reimplementa)', () => {
    const withCost = desiredForMenuInvitacion({ choice: 'otro', custom: { label: 'Preguntar al catering', action: 'otro', hasCost: 'si' } })
    expect(withCost.taskTitle).toBe('Menú en la invitación: Preguntar al catering')
    expect(withCost.budgetCategory).toBe('Menú en la invitación: Preguntar al catering')
    const withoutCost = desiredForMenuInvitacion({ choice: 'otro', custom: { label: 'Preguntar al catering', action: 'otro', hasCost: 'no' } })
    expect(withoutCost.budgetCategory).toBeNull()
  })
})

describe('Niños — necesidades accionables (Animación/Monitor)', () => {
  it('seleccionado: genera tarea + presupuesto + categoría de proveedor; no seleccionado: NONE', () => {
    const selected = desiredForNinosNecesidadItem(true, 'animacion')
    expect(selected.taskTitle).toBe('Buscar/contratar: animación / juegos')
    expect(selected.budgetCategory).toBe('Animación / juegos')
    expect(selected.providerCategory).toBe('Animación infantil')
    const unselected = desiredForNinosNecesidadItem(false, 'animacion')
    expect(unselected).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
  })

  it('deseleccionar retira una tarea prístina, conserva una ya tocada (mismas reglas de siempre)', () => {
    const pristine = makeTask({ title: 'Buscar/contratar: monitor' })
    const touched = makeTask({ title: 'Buscar/contratar: monitor', assignedMemberId: 'm1' })
    const desired = desiredForNinosNecesidadItem(false, 'monitor')
    expect(reconcilePairGeneration(desired, pristine, undefined).actions).toEqual([{ op: 'delete_task', id: 't1' }])
    expect(reconcilePairGeneration(desired, touched, undefined).actions).toEqual([{ op: 'detach_task', id: 't1' }])
  })

  it('cada necesidad accionable tiene su propia questionKey, nunca comparten una sola decisión', () => {
    expect(guestsNinosNecesidadItemKey('animacion')).toBe('invitados.ninos.necesidad.animacion')
    expect(guestsNinosNecesidadItemKey('monitor')).toBe('invitados.ninos.necesidad.monitor')
    expect(guestsNinosNecesidadItemKey('animacion')).not.toBe(guestsNinosNecesidadItemKey('monitor'))
  })
})

describe('Invitación — "Preparar invitación" sí, "Enviar invitaciones" NUNCA (ya existe como Preparativo automático de siempre)', () => {
  it('"con_pepa" genera únicamente "Preparar invitación"', () => {
    const desired = desiredForInvitacion({ choice: 'con_pepa' })
    expect(desired.taskTitle).toBe('Preparar invitación')
    expect(desired.budgetCategory).toBeNull()
  })

  it('"externa" no genera nada — no obliga a usar el editor de PEPA', () => {
    expect(desiredForInvitacion({ choice: 'externa' })).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
  })

  it('"todavía no lo sabemos" no genera nada', () => {
    expect(desiredForInvitacion({ choice: 'todavia_no_lo_sabemos' })).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
  })

  it('ninguna función de este módulo genera literalmente el título "Enviar las invitaciones" — evita duplicar el Preparativo automático ya existente (TASK_TEMPLATES)', () => {
    for (const desired of [
      desiredForInvitacion({ choice: 'con_pepa' }),
      desiredForInvitacion({ choice: 'otro', custom: { label: 'x', action: 'preparar', hasCost: null } }),
      desiredForListaInvitados({ choice: 'tenemos_que_prepararla' }),
    ]) {
      expect(desired.taskTitle).not.toBe('Enviar las invitaciones')
    }
  })
})

describe('listGuestsBlockQuestions / summarizeGuestsBlock — revelado progresivo y contadores', () => {
  it('con menos de 2 momentos reales, la pregunta de Momentos no aparece como pregunta relevante (ni siquiera "sin empezar")', () => {
    const questions = listGuestsBlockQuestions([], 1)
    expect(questions.some((q) => q.questionKey === GUESTS_MOMENTOS_QUESTION_KEY)).toBe(false)
  })

  it('con 2+ momentos reales, Momentos sí es una pregunta relevante', () => {
    const questions = listGuestsBlockQuestions([], 2)
    expect(questions.some((q) => q.questionKey === GUESTS_MOMENTOS_QUESTION_KEY)).toBe(true)
  })

  it('Necesidades infantiles solo aparece cuando Niños ya se respondió "sí" — nunca antes', () => {
    const sinResponder = listGuestsBlockQuestions([], 0)
    expect(sinResponder.some((q) => q.questionKey === GUESTS_NINOS_NECESIDADES_QUESTION_KEY)).toBe(false)

    const conNo = listGuestsBlockQuestions([makeDecision({ questionKey: GUESTS_NINOS_QUESTION_KEY, answer: { choice: 'no' } })], 0)
    expect(conNo.some((q) => q.questionKey === GUESTS_NINOS_NECESIDADES_QUESTION_KEY)).toBe(false)

    const conSi = listGuestsBlockQuestions([makeDecision({ questionKey: GUESTS_NINOS_QUESTION_KEY, answer: { choice: 'si' } })], 0)
    expect(conSi.some((q) => q.questionKey === GUESTS_NINOS_NECESIDADES_QUESTION_KEY)).toBe(true)
  })

  it('siempre incluye Lista, Menú en la invitación e Invitación, independientemente de momentos/niños', () => {
    const questions = listGuestsBlockQuestions([], 0)
    expect(questions.map((q) => q.questionKey)).toEqual([
      GUESTS_LISTA_QUESTION_KEY,
      GUESTS_MENU_QUESTION_KEY,
      GUESTS_NINOS_QUESTION_KEY,
      GUESTS_INVITACION_QUESTION_KEY,
    ])
  })

  it('"todavía no lo sabemos" cuenta como ⏳ Por decidir, nunca como "sin empezar" ni como decidida', () => {
    const decisions = [makeDecision({ questionKey: GUESTS_LISTA_QUESTION_KEY, answer: { choice: 'todavia_no_lo_sabemos' } })]
    const summary = summarizeGuestsBlock(decisions, 0)
    expect(summary).toContain('⏳ 1 por decidir')
    expect(summary).not.toContain('decidida')
  })

  it('los contadores en cero se omiten del resumen', () => {
    const decisions = [
      makeDecision({ questionKey: GUESTS_LISTA_QUESTION_KEY, answer: { choice: 'ya_la_tenemos' } }),
      makeDecision({ questionKey: GUESTS_MENU_QUESTION_KEY, answer: { choice: 'no' } }),
      makeDecision({ questionKey: GUESTS_NINOS_QUESTION_KEY, answer: { choice: 'no' } }),
      makeDecision({ questionKey: GUESTS_INVITACION_QUESTION_KEY, answer: { choice: 'con_pepa' } }),
    ]
    const summary = summarizeGuestsBlock(decisions, 0)
    expect(summary).toBe('✓ 4 decididas')
  })
})

describe('Registros manuales protegidos — mismo motor, mismas reglas que "La pareja" (isTaskUntouched sin reimplementar)', () => {
  it('una tarea con fecha, responsable o enlace de Calendario ya no es prístina, aunque el título coincida exactamente', () => {
    const base = makeTask({ title: 'Preparar invitación' })
    expect(isTaskUntouched(base)).toBe(true)
    expect(isTaskUntouched({ ...base, dueDate: '2026-06-01' })).toBe(false)
    expect(isTaskUntouched({ ...base, assignedMemberId: 'm1' })).toBe(false)
    expect(isTaskUntouched({ ...base, calendarEventId: 'c1' })).toBe(false)
    expect(isTaskUntouched({ ...base, done: true })).toBe(false)
  })

  it('una partida de presupuesto con importe ya puesto nunca se borra ni se actualiza en silencio al cambiar la respuesta', () => {
    const touchedBudget = makeBudgetItem({ plannedAmount: 150 })
    const desired = desiredForNinosNecesidadItem(false, 'animacion')
    const result = reconcilePairGeneration(desired, undefined, touchedBudget)
    expect(result.actions).toEqual([{ op: 'detach_budget', id: 'b1' }])
  })
})
