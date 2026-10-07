import { describe, expect, it } from 'vitest'
import { daysUntilDate, effectivePriority, proposeTaskPriority, recommendTasks, type TaskForRanking } from '@/domain/eventTaskPriority'

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
    expect(proposeTaskPriority({ title: 'Buscar clases de baile', dependsOnDecision: false })).toMatchObject({ priority: 'alta', reason: 'practica' })
  })
  it('fotógrafo → Alta por reserva (se cierra con antelación)', () => {
    expect(proposeTaskPriority({ title: 'Buscar fotógrafo', dependsOnDecision: false })).toMatchObject({ priority: 'alta', reason: 'reserva' })
  })
  it('tarea que depende de una decisión → Media por dependencia', () => {
    expect(proposeTaskPriority({ title: 'Revisar la lista de invitados', dependsOnDecision: true })).toMatchObject({ priority: 'media', reason: 'dependencia' })
  })
  it('caso general → Media, motivo general (no inventa Alta)', () => {
    expect(proposeTaskPriority({ title: 'Decorar la mesa', dependsOnDecision: false })).toMatchObject({ priority: 'media', reason: 'general' })
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

describe('motor: señal estructurada de la decisión > dependencia > título (respaldo)', () => {
  it('«¿Necesitáis clases de baile?» = sí → práctica, aunque el título no diga «clases»', () => {
    expect(proposeTaskPriority({ title: 'Primer baile: preparar', dependsOnDecision: true, decisionQuestionKey: 'momentos_especiales.primer_baile.clases_baile' })).toMatchObject({ priority: 'alta', reason: 'practica', basis: 'estructurada' })
  })
  it('una tarea de decisión sin señal especial es dependencia, no respaldo por título', () => {
    expect(proposeTaskPriority({ title: 'Buscar clases de baile', dependsOnDecision: true })).toMatchObject({ basis: 'dependencia' })
  })
  it('tarea manual sin metadata: el título sirve de respaldo y se marca como tal', () => {
    expect(proposeTaskPriority({ title: 'Buscar clases de baile', dependsOnDecision: false })).toMatchObject({ priority: 'alta', basis: 'titulo' })
  })
})

describe('compatibilidad con tareas antiguas sin prioridad guardada (sin backfill)', () => {
  it('la prioridad efectiva de una tarea antigua la propone el motor y NO se marca como guardada', () => {
    expect(effectivePriority({ title: 'Buscar fotógrafo', priority: null })).toMatchObject({ priority: 'alta', stored: false })
  })
  it('una prioridad guardada siempre gana sobre la propuesta', () => {
    expect(effectivePriority({ title: 'Buscar fotógrafo', priority: 'baja', priorityReason: null })).toMatchObject({ priority: 'baja', stored: true })
  })
  it('las tareas antiguas participan en «Pepa te recomienda» con su prioridad efectiva', () => {
    const r = recommendTasks([{ id: 'old', title: 'Clases de baile', done: false, dueDate: null, sortOrder: 1 }, { id: 'new', title: 'Revisar lista', done: false, dueDate: null, priority: 'media', sortOrder: 0 }], TODAY)
    expect(r[0].task.id).toBe('old')
  })
  it('sin fechas inventadas: una tarea antigua sin fecha no obtiene urgencia', () => {
    expect(recommendTasks([{ id: 'x', title: 'x', done: false, dueDate: null, sortOrder: 0 }], TODAY)[0].daysUntil).toBeNull()
  })
})

describe('«Sin prioridad» elegida por el usuario se respeta (no vuelve a proponerse)', () => {
  it('origen usuario con prioridad vacía → sin prioridad, stored', () => {
    expect(effectivePriority({ title: 'Buscar fotógrafo', priority: null, prioritySource: 'usuario' })).toMatchObject({ priority: null, stored: true })
  })
  it('sin origen (tarea antigua) → se propone', () => {
    expect(effectivePriority({ title: 'Buscar fotógrafo', priority: null, prioritySource: null })).toMatchObject({ priority: 'alta', stored: false })
  })
})
