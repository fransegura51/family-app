import { describe, expect, it } from 'vitest'
import { assignedText, omittedCount, parseTaskSummary, summaryTaskLink, type SummaryTask } from '@/domain/taskSummaryNotice'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n: number, date = '2026-10-10', assigned: string[] = []) => ({ id: id(n), title: `Tarea ${n} con un nombre bastante largo para comprobar que se enseña completo`, date, assigned })
const payload = (overdue: unknown[], today: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  version: 1,
  date: '2026-10-17',
  today: { count: today.length, tasks: today },
  overdue: { count: overdue.length, tasks: overdue },
  ...extra,
})

describe('detalle del aviso agrupado de tareas', () => {
  it.each([1, 3, 5, 12])('con %i tareas atrasadas se leen TODAS, con su título completo y su fecha real', (n) => {
    const tasks = Array.from({ length: n }, (_, i) => task(i + 1, `2026-10-${String(10 - (i % 9)).padStart(2, '0')}`))
    const d = parseTaskSummary(payload(tasks))
    expect(d).not.toBeNull()
    expect(d!.overdue.tasks).toHaveLength(n)
    expect(d!.overdue.count).toBe(n)
    expect(omittedCount(d!.overdue)).toBe(0)
    d!.overdue.tasks.forEach((t, i) => {
      expect(t.title).toBe(tasks[i].title)
      expect(t.date).toBe(tasks[i].date)
    })
  })

  it('lee las dos agrupaciones (atrasadas y de hoy) y las personas asignadas', () => {
    const d = parseTaskSummary(payload([task(1, '2026-10-02', ['Ana', 'Luis'])], [task(2, '2026-10-17')]))!
    expect(d.overdue.tasks[0].assigned).toEqual(['Ana', 'Luis'])
    expect(assignedText(d.overdue.tasks[0])).toBe('Ana, Luis')
    expect(assignedText(d.today.tasks[0])).toBeNull()
    expect(d.today.count).toBe(1)
  })

  it('si el servidor cortó el listado (más de 100), se sabe cuántas faltan y no se inventan', () => {
    const tasks = Array.from({ length: 100 }, (_, i) => task(i + 1))
    const raw = { version: 1, date: '2026-10-17', today: { count: 0, tasks: [] }, overdue: { count: 130, tasks: tasks } }
    const d = parseTaskSummary(raw)!
    expect(d.overdue.tasks).toHaveLength(100)
    expect(omittedCount(d.overdue)).toBe(30)
  })

  it('cada tarea abre Calendario con su id y su fecha (el mismo enlace que usan los demás avisos)', () => {
    const t: SummaryTask = parseTaskSummary(payload([task(7, '2026-10-03')]))!.overdue.tasks[0]
    expect(summaryTaskLink(t)).toBe(`/calendario?evento=${id(7)}&fecha=2026-10-03`)
  })

  it('un aviso ANTIGUO (sin listado) o un payload que no se entiende no devuelve datos inventados', () => {
    expect(parseTaskSummary({})).toBeNull()
    expect(parseTaskSummary(null)).toBeNull()
    expect(parseTaskSummary(undefined)).toBeNull()
    expect(parseTaskSummary({ version: 2, date: '2026-10-17', overdue: { count: 1, tasks: [task(1)] } })).toBeNull()
    expect(parseTaskSummary(payload([]))).toBeNull()
  })

  it('descarta entradas dañadas (sin id válido, sin título o con fecha mala) y conserva las buenas', () => {
    const d = parseTaskSummary(payload([task(1), { id: 'no-es-uuid', title: 'x', date: '2026-10-10' }, { id: id(3), title: '  ', date: '2026-10-10' }, { id: id(4), title: 'ok', date: '10/10' }, task(5)]))!
    expect(d.overdue.tasks.map((t) => t.id)).toEqual([id(1), id(5)])
  })
})
