import { describe, expect, it } from 'vitest'
import { computePrioritySuggestion, explainPrioritySuggestion, PRIORITY_ORDER, type SuggestableTask } from '@/domain/eventTaskPrioritySuggestion'
import type { DecisionLookup } from '@/domain/eventTaskPriority'

// Bug real (revisión manual): "Buscar/organizar clases de baile" en prioridad Alta (manual) recibió una
// propuesta de PEPA para bajarla a Media "porque hay preparativos que dependen de esta tarea" — al
// revés de lo razonable. Causa de fondo: ninguna señal de este motor representa "esto importa menos que
// antes", así que una propuesta nunca debe poder bajar una prioridad que el usuario ya fijó.
const DANCE_DECISION_KEY = 'momentos_especiales.primer_baile.clases_baile'
const decisions: DecisionLookup[] = [{ id: 'd1', questionKey: DANCE_DECISION_KEY }]

function manualTask(overrides: Partial<SuggestableTask> = {}): SuggestableTask {
  return { id: 't1', title: 'Tarea cualquiera', prioritySource: 'usuario', priority: 'alta', ...overrides }
}

describe('regresión exacta del bug: dependencia nunca baja una prioridad manual', () => {
  it('«Buscar/organizar clases de baile» en Alta manual, enlazada a la decisión de baile: no genera ninguna propuesta (PEPA también la pondría en Alta)', () => {
    const task = manualTask({ title: 'Buscar/organizar clases de baile', decisionId: 'd1', priority: 'alta' })
    expect(computePrioritySuggestion(task, decisions, new Date('2026-06-01'))).toBeNull()
  })
  it('una tarea en Alta manual, enlazada a una decisión SIN señal estructurada (solo "depende de una decisión"): nunca propone bajar a Media', () => {
    const task = manualTask({ title: 'Tarea sin palabras clave', decisionId: 'd1', priority: 'alta', })
    const sinSenalDecisions: DecisionLookup[] = [{ id: 'd1', questionKey: 'invitados.lista' }] // no mapeada a ninguna señal estructurada
    expect(computePrioritySuggestion(task, sinSenalDecisions, new Date('2026-06-01'))).toBeNull()
  })
  it('lo mismo en Media manual: la dependencia tampoco la baja a Baja (no hay ningún caso en el que "dependencia" baje algo)', () => {
    const task = manualTask({ title: 'Tarea sin palabras clave', decisionId: 'd1', priority: 'media' })
    const sinSenalDecisions: DecisionLookup[] = [{ id: 'd1', questionKey: 'invitados.lista' }]
    // Aquí "lo que propondría PEPA" (dependsOnDecision=true, sin señal) es 'media' — igual que la manual: tampoco debe proponer nada (regla de "no proponer el mismo valor").
    expect(computePrioritySuggestion(task, sinSenalDecisions, new Date('2026-06-01'))).toBeNull()
  })
})

describe('regla general: una propuesta solo puede subir o asignar, nunca bajar', () => {
  it('tarea en Alta manual: ninguna propuesta posible la baja, sea cual sea el motivo calculado', () => {
    for (const reason of ['practica', 'reserva', 'general'] as const) {
      // practica/reserva siempre calculan 'alta' (igual que la manual → null); 'general' calcula 'media' (más bajo → null).
      const task = manualTask({ title: reason === 'practica' ? 'clases de baile' : reason === 'reserva' ? 'reservar catering' : 'tarea neutra', priority: 'alta' })
      expect(computePrioritySuggestion(task, [], new Date('2026-06-01'))).toBeNull()
    }
  })
  it('tarea en Baja manual con una fecha vencida: SÍ puede proponer subir a Alta (vencida escala siempre hacia arriba)', () => {
    const task = manualTask({ title: 'Tarea neutra', priority: 'baja', dueDate: '2026-05-01' })
    const s = computePrioritySuggestion(task, [], new Date('2026-06-01'))
    expect(s).not.toBeNull()
    expect(s?.proposedPriority).toBe('alta')
  })
  it('"Sin prioridad" (priority null, origen usuario): puede recibir una propuesta de asignación (nunca es "bajar" porque no había nada)', () => {
    const task = manualTask({ title: 'Tarea neutra', priority: null, dueDate: '2026-05-01' })
    const s = computePrioritySuggestion(task, [], new Date('2026-06-01'))
    expect(s).not.toBeNull()
    expect(s?.proposedPriority).toBe('alta')
  })
})

describe('no se propone cambiar al mismo valor que ya tiene', () => {
  it('Media manual, PEPA también propondría Media: sin propuesta', () => {
    const task = manualTask({ title: 'Tarea neutra', priority: 'media', decisionId: 'd1' })
    const sinSenal: DecisionLookup[] = [{ id: 'd1', questionKey: 'invitados.lista' }]
    expect(computePrioritySuggestion(task, sinSenal, new Date('2026-06-01'))).toBeNull()
  })
})

describe('la explicación corresponde siempre con la dirección propuesta', () => {
  it('subir: dice "subirla", nunca "bajarla"', () => {
    const text = explainPrioritySuggestion('Reservar catering', 'baja', 'alta', 'reserva')
    expect(text).toContain('subirla a Alta')
    expect(text).not.toContain('bajarla')
  })
  it('asignar (sin prioridad previa): dice "asignarle", no "subirla"', () => {
    const text = explainPrioritySuggestion('Tarea nueva', null, 'media', 'general')
    expect(text).toContain('asignarle prioridad Media')
  })
  it('el motivo "dependencia" ya no dice que otras tareas dependen de esta (estaba al revés)', () => {
    const text = explainPrioritySuggestion('Tarea', 'baja', 'media', 'dependencia')
    expect(text).not.toContain('dependen de esta tarea')
    expect(text).toContain('depende de una decisión')
  })
  it('PRIORITY_ORDER sigue reflejando baja < media < alta (usado también por la UI para elegir "Subir"/"Asignar")', () => {
    expect(PRIORITY_ORDER.baja).toBeLessThan(PRIORITY_ORDER.media)
    expect(PRIORITY_ORDER.media).toBeLessThan(PRIORITY_ORDER.alta)
  })
})

describe('solo aplica a prioridad de origen usuario — nunca a tareas que PEPA ya gestiona', () => {
  it('prioritySource "pepa": nunca se calcula una sugerencia (effectivePriority ya la recalcula sola)', () => {
    const task: SuggestableTask = { id: 't1', title: 'Tarea cualquiera', prioritySource: 'pepa', priority: 'media' }
    expect(computePrioritySuggestion(task, [], new Date('2026-06-01'))).toBeNull()
  })
})
