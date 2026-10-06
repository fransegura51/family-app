import { describe, expect, it } from 'vitest'
import { daysUntilDate, proposeTaskPriority, recommendTasks, type TaskForRanking } from '@/domain/eventTaskPriority'

const TODAY = new Date(2026, 9, 7) // 7 oct 2026 (local)
const task = (over: Partial<TaskForRanking> & { id: string; title: string }): TaskForRanking => ({
  done: false,
  dueDate: null,
  priority: null,
  priorityReason: null,
  sortOrder: 0,
  ...over,
})

describe('propuesta de prioridad inicial (PEPA)', () => {
  it('clases de baile para el primer baile → Alta por práctica, aunque no haya fecha', () => {
    expect(proposeTaskPriority({ title: 'Buscar clases de baile', dependsOnDecision: false })).toEqual({ priority: 'alta', reason: 'practica' })
  })
  it('fotógrafo → Alta por reserva (se cierra con antelación)', () => {
    expect(proposeTaskPriority({ title: 'Buscar fotógrafo', dependsOnDecision: false })).toEqual({ priority: 'alta', reason: 'reserva' })
  })
  it('tarea que depende de una decisión → Media por dependencia', () => {
    expect(proposeTaskPriority({ title: 'Revisar la lista de invitados', dependsOnDecision: true })).toEqual({ priority: 'media', reason: 'dependencia' })
  })
  it('caso general → Media, motivo general (no inventa Alta)', () => {
    expect(proposeTaskPriority({ title: 'Decorar la mesa', dependsOnDecision: false })).toEqual({ priority: 'media', reason: 'general' })
  })
})

describe('urgencia: solo con fecha real', () => {
  it('días hasta una fecha; null sin fecha (nunca se inventa)', () => {
    expect(daysUntilDate(null, TODAY)).toBeNull()
    expect(daysUntilDate('2026-10-10', TODAY)).toBe(3)
    expect(daysUntilDate('2026-10-01', TODAY)).toBe(-6)
  })
})

describe('recomendaciones — no son las tres primeras; respetan prioridad y fecha real', () => {
  it('por prioridad: una Alta gana a una Baja aunque se creara después', () => {
    const r = recommendTasks([task({ id: 'b', title: 'Lista', priority: 'baja', sortOrder: 1 }), task({ id: 'a', title: 'Fotógrafo', priority: 'alta', sortOrder: 9 })], TODAY)
    expect(r[0].task.id).toBe('a')
  })

  it('por fecha real: una tarea vencida sube aunque su prioridad sea Media, y explica que está atrasada', () => {
    const r = recommendTasks([task({ id: 'x', title: 'Cosa', priority: 'media', dueDate: '2026-10-20' }), task({ id: 'y', title: 'Otra', priority: 'media', dueDate: '2026-10-01' })], TODAY)
    expect(r[0].task.id).toBe('y')
    expect(r[0].explanation).toMatch(/atrasada/)
  })

  it('sin fecha: una Alta sin fecha se recomienda con su explicación de práctica', () => {
    const r = recommendTasks([task({ id: 'c', title: 'Clases de baile', priority: 'alta', priorityReason: 'practica' })], TODAY)
    expect(r[0].daysUntil).toBeNull()
    expect(r[0].explanation).toMatch(/conviene empezar pronto/)
  })

  it('las completadas salen de las recomendaciones y la siguiente relevante entra', () => {
    const tasks = [task({ id: 'a', title: 'Fotógrafo', priority: 'alta', priorityReason: 'reserva' }), task({ id: 'b', title: 'Flores', priority: 'media' }), task({ id: 'c', title: 'Música', priority: 'alta', priorityReason: 'reserva' })]
    const before = recommendTasks(tasks, TODAY)
    expect(before.map((r) => r.task.id)).toContain('a')
    const after = recommendTasks(tasks.map((t) => (t.id === 'a' ? { ...t, done: true } : t)), TODAY)
    expect(after.map((r) => r.task.id)).not.toContain('a')
    expect(after.map((r) => r.task.id)).toContain('c')
  })

  it('como mucho 3 recomendaciones por defecto y ninguna completada', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id, i) => task({ id, title: id, priority: 'media', sortOrder: i }))
    expect(recommendTasks(many, TODAY)).toHaveLength(3)
    expect(recommendTasks([task({ id: 'z', title: 'z', done: true })], TODAY)).toEqual([])
  })

  it('sin información suficiente usa reglas estables (mismo resultado en dos llamadas)', () => {
    const tasks = [task({ id: 'p', title: 'p', sortOrder: 2 }), task({ id: 'q', title: 'q', sortOrder: 1 })]
    expect(recommendTasks(tasks, TODAY).map((r) => r.task.id)).toEqual(recommendTasks(tasks, TODAY).map((r) => r.task.id))
  })
})
