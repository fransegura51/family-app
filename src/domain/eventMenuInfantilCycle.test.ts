import { describe, expect, it } from 'vitest'
import { buildFoodContext, desiredForMenuInfantil, listFoodBlockQuestions, ninosNeedMenuInfantil } from '@/domain/eventFood'
import { buildFoodDecisionSummary } from '@/domain/eventDecisionsSummary'
import { makeDecision, makeEvent } from '@/domain/eventFoodFixtures'
import type { EventDecision } from '@/domain/types'

// Menú infantil: necesidad → respuesta → desaparición → reaparición. Sin borrar histórico útil.
const NEED = makeDecision('invitados.ninos.necesidades', { choice: 'preparar', selected: ['Menú infantil'] })
const ctx = (decisions: EventDecision[]) => buildFoodContext(makeEvent(), decisions, [], null)

describe('menú infantil: el ciclo completo', () => {
  it('necesidad activa + respuesta «pedir» genera la tarea de pedirlo', () => {
    const d = [NEED, makeDecision('comida.menu_infantil', { choice: 'pedir' })]
    expect(ninosNeedMenuInfantil(d)).toBe(true)
    expect(desiredForMenuInfantil(ctx(d)).taskTitle).toBe('Pedir el menú infantil')
  })

  it('al desaparecer la necesidad en Invitados, la respuesta antigua deja de estar operativa (sin tareas)', () => {
    const noNeed = [makeDecision('invitados.ninos.necesidades', { choice: 'no_necesitamos' }), makeDecision('comida.menu_infantil', { choice: 'pedir' })]
    expect(ninosNeedMenuInfantil(noNeed)).toBe(false)
    expect(desiredForMenuInfantil(ctx(noNeed))).toMatchObject({ taskTitle: null })
  })

  it('la respuesta no se borra al desaparecer la necesidad: sigue en los datos para poder reaparecer', () => {
    const answer = makeDecision('comida.menu_infantil', { choice: 'pedir' })
    const noNeed = [makeDecision('invitados.ninos.necesidades', { choice: 'no_necesitamos' }), answer]
    expect(noNeed).toContain(answer)
  })

  it('al reaparecer la necesidad, la respuesta antigua vuelve a aplicar', () => {
    const d = [NEED, makeDecision('comida.menu_infantil', { choice: 'pedir' })]
    expect(desiredForMenuInfantil(ctx(d)).taskTitle).toBe('Pedir el menú infantil')
  })

  it('con la necesidad activa y sin responder, «todavía no» aparece como POR DECIDIR en el resumen', () => {
    const d = [NEED, makeDecision('comida.menu_infantil', { choice: 'todavia_no_lo_sabemos' })]
    const s = buildFoodDecisionSummary(ctx(d))
    expect(s.pending.some((p) => p.key === 'comida.menu_infantil')).toBe(true)
    expect(s.taken.some((t) => t.key === 'comida.menu_infantil')).toBe(false)
  })

  it('sin necesidad, la pregunta de menú infantil no aparece como pendiente', () => {
    const noNeed = [makeDecision('invitados.ninos.necesidades', { choice: 'no_necesitamos' })]
    expect(listFoodBlockQuestions(ctx(noNeed)).some((q) => q.questionKey === 'comida.menu_infantil')).toBe(false)
  })

  it('las opciones nuevas (mismo menú, menú infantil, alternativa) no generan tareas ni presupuesto', () => {
    for (const choice of ['mismo_menu', 'menu_infantil', 'alternativa']) {
      expect(desiredForMenuInfantil(ctx([NEED, makeDecision('comida.menu_infantil', { choice })])).taskTitle).toBeNull()
    }
  })

  it('«Incluido» resuelve sin tarea (y la familia puede elegirlo sin pasar por el menú de la comida)', () => {
    expect(desiredForMenuInfantil(ctx([NEED, makeDecision('comida.menu_infantil', { choice: 'incluido' })]))).toMatchObject({ resolved: true })
  })
})
