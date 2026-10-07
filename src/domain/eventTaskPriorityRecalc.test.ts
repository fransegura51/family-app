import { describe, expect, it } from 'vitest'
import { effectivePriority, recommendTasks } from '@/domain/eventTaskPriority'

// Corrección real tras revisión manual en iPhone: una prioridad gestionada por PEPA (origen 'pepa', o
// ausente en tareas antiguas) NUNCA debe quedarse congelada en lo guardado al crear la tarea — se
// recalcula en vivo con el contexto actual (decisión de origen + fecha real) cada vez que se consulta.
// Solo una prioridad de origen 'usuario' (incluida «Sin prioridad») se congela para siempre.

describe('PEPA sigue gestionando la prioridad mientras el usuario no la fije', () => {
  it('sube de prioridad sola cuando el usuario añade una fecha cercana (sin que nadie la edite)', () => {
    const task = { title: 'Revisar proveedor', priority: 'media' as const, prioritySource: 'pepa' as const, dueDate: null }
    const sinFecha = effectivePriority(task, [], new Date('2026-06-01'))
    expect(sinFecha.priority).toBe('media')
    const conFechaCercana = effectivePriority({ ...task, dueDate: '2026-06-03' }, [], new Date('2026-06-01'))
    expect(conFechaCercana.priority).toBe('alta')
  })

  it('baja de nuevo si la fecha se aleja o se quita (reversible, nunca se queda "pegada" arriba)', () => {
    const task = { title: 'Revisar proveedor', priority: 'media' as const, prioritySource: 'pepa' as const }
    const cercana = effectivePriority({ ...task, dueDate: '2026-06-03' }, [], new Date('2026-06-01'))
    expect(cercana.priority).toBe('alta')
    const lejana = effectivePriority({ ...task, dueDate: '2026-09-03' }, [], new Date('2026-06-01'))
    expect(lejana.priority).toBe('media')
    const sinFecha = effectivePriority({ ...task, dueDate: null }, [], new Date('2026-06-01'))
    expect(sinFecha.priority).toBe('media')
  })

  it('una tarea vencida siempre sube a alta, sea cual sea la prioridad guardada', () => {
    const r = effectivePriority({ title: 'Confirmar catering', priority: 'baja', prioritySource: 'pepa', dueDate: '2026-05-20' }, [], new Date('2026-06-01'))
    expect(r.priority).toBe('alta')
  })

  it('la decisión de origen se relee en vivo: si cambia el enlace a la decisión, cambia la propuesta', () => {
    const decisions = [{ id: 'd1', questionKey: 'momentos_especiales.primer_baile.clases_baile' }]
    const conDecision = effectivePriority({ title: 'Buscar clases de baile', decisionId: 'd1', prioritySource: 'pepa' }, decisions, new Date('2026-06-01'))
    expect(conDecision.reason).toBe('practica')
    expect(conDecision.priority).toBe('alta')
    const sinDecision = effectivePriority({ title: 'Tarea cualquiera', decisionId: null, prioritySource: 'pepa' }, decisions, new Date('2026-06-01'))
    expect(sinDecision.reason).not.toBe('practica')
  })

  it('una tarea antigua (sin prioridad guardada, sin origen) también se recalcula en vivo', () => {
    const r = effectivePriority({ title: 'Buscar fotógrafo', dueDate: '2026-05-20' }, [], new Date('2026-06-01'))
    expect(r.managedByUser).toBe(false)
    expect(r.priority).toBe('alta')
  })
})

describe('una prioridad fijada por el usuario queda protegida: nunca se recalcula sola', () => {
  it('con fecha vencida, una prioridad baja elegida por el usuario sigue baja', () => {
    const r = effectivePriority({ title: 'Lo que sea', priority: 'baja', prioritySource: 'usuario', dueDate: '2026-01-01' }, [], new Date('2026-06-01'))
    expect(r.priority).toBe('baja')
    expect(r.managedByUser).toBe(true)
  })

  it('«Sin prioridad» elegida por el usuario (priority null, origen usuario) sigue sin prioridad aunque haya fecha cercana', () => {
    const r = effectivePriority({ title: 'Lo que sea', priority: null, prioritySource: 'usuario', dueDate: '2026-06-02' }, [], new Date('2026-06-01'))
    expect(r.priority).toBeNull()
    expect(r.managedByUser).toBe(true)
  })
})

describe('«Pepa te recomienda» usa la prioridad recalculada, no la congelada', () => {
  it('una tarea con fecha que se acaba de acercar sube de posición sin que nadie la edite', () => {
    const tasks = [
      { id: 'a', title: 'Tarea A', done: false, dueDate: '2026-06-02', priority: 'media' as const, prioritySource: 'pepa' as const, sortOrder: 0 },
      { id: 'b', title: 'Tarea B', done: false, dueDate: null, priority: 'alta' as const, prioritySource: 'usuario' as const, sortOrder: 1 },
    ]
    const r = recommendTasks(tasks, new Date('2026-06-01'), 2)
    // A (gestionada por PEPA) sube a alta por la fecha cercana y empata/supera a B en el ranking por urgencia real.
    expect(r[0].task.id).toBe('a')
  })
})
