// Detalle del aviso agrupado de tareas (resumen diario, categoría `task_daily_summary`).
//
// El servidor (migración 0280) guarda en el `payload` del aviso TODAS las tareas de cada grupo —no solo las tres que salen en el texto—: id, título completo,
// fecha de la ocurrencia y personas asignadas. Aquí se lee y se valida ese payload para enseñarlo en la ventana de detalle de la campana. Los avisos enviados
// ANTES de esa mejora no lo tienen: `parseTaskSummary` devuelve null y la pantalla lo explica sin inventar nada (enseña el texto que sí se guardó y lleva a Calendario).
import { calendarEventLink, isIsoDate } from '@/domain/calendarDeepLink'

export const TASK_SUMMARY_CATEGORY = 'task_daily_summary'

export interface SummaryTask {
  id: string
  title: string
  // Fecha (AAAA-MM-DD) de la ocurrencia: el vencimiento de la tarea o de esa repetición.
  date: string
  // Nombres de las personas asignadas (puede estar vacío).
  assigned: string[]
}

export interface SummaryGroup {
  // Número REAL de tareas del grupo (el listado se corta a 100 en el servidor: puede haber más que `tasks.length`).
  count: number
  tasks: SummaryTask[]
}

export interface TaskSummaryDetail {
  date: string
  today: SummaryGroup
  overdue: SummaryGroup
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseTask(raw: unknown): SummaryTask | null {
  if (typeof raw !== 'object' || raw === null) return null
  const t = raw as Record<string, unknown>
  if (typeof t.id !== 'string' || !UUID.test(t.id)) return null
  if (typeof t.title !== 'string' || t.title.trim() === '') return null
  if (!isIsoDate(t.date)) return null
  const assigned = Array.isArray(t.assigned) ? t.assigned.filter((n): n is string => typeof n === 'string' && n.trim() !== '') : []
  return { id: t.id.toLowerCase(), title: t.title, date: t.date, assigned }
}

function parseGroup(raw: unknown): SummaryGroup {
  if (typeof raw !== 'object' || raw === null) return { count: 0, tasks: [] }
  const g = raw as Record<string, unknown>
  const tasks = (Array.isArray(g.tasks) ? g.tasks : []).map(parseTask).filter((t): t is SummaryTask => t !== null)
  const count = typeof g.count === 'number' && Number.isFinite(g.count) ? Math.max(Math.floor(g.count), tasks.length) : tasks.length
  return { count, tasks }
}

// null = aviso antiguo (o payload que no se entiende): no hay listado completo que enseñar.
export function parseTaskSummary(payload: Record<string, unknown> | null | undefined): TaskSummaryDetail | null {
  if (!payload || payload.version !== 1 || !isIsoDate(payload.date)) return null
  const today = parseGroup(payload.today)
  const overdue = parseGroup(payload.overdue)
  if (today.tasks.length === 0 && overdue.tasks.length === 0) return null
  return { date: payload.date, today, overdue }
}

// Cuántas tareas del grupo no caben en el listado guardado (solo si hubo más de 100).
export function omittedCount(group: SummaryGroup): number {
  return Math.max(group.count - group.tasks.length, 0)
}

// Dirección para abrir esa tarea en Calendario (la misma que usan los demás avisos). null si los datos no valen.
export function summaryTaskLink(task: SummaryTask): string | null {
  return calendarEventLink(task.id, task.date)
}

export function assignedText(task: SummaryTask): string | null {
  return task.assigned.length > 0 ? task.assigned.join(', ') : null
}
