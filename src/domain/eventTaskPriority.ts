// Preparativos: prioridad propuesta por PEPA, urgencia y explicación de las recomendaciones. Reglas deterministas.
//  - PRIORIDAD = importancia/plazo/dependencias/dificultad. Se propone al crear la tarea y se guarda con su motivo.
//  - URGENCIA = situación temporal real, SOLO si la tarea tiene fecha puesta por el usuario. Nunca se inventan fechas.
// Una prioridad elegida por el usuario (priority_source = 'usuario') manda: nunca se recalcula.

export type TaskPriority = 'alta' | 'media' | 'baja'
export type PriorityReason = 'practica' | 'reserva' | 'fecha_proxima' | 'dependencia' | 'general'

export interface PriorityProposal {
  priority: TaskPriority
  reason: PriorityReason
}

// Tareas que necesitan varias sesiones o práctica: conviene empezar pronto aunque no tengan fecha.
const PRACTICE_PATTERN = /clase|practic|ensayo|ensayar|coreograf|baile/i
// Cosas que se reservan o se encargan con antelación (proveedores, fabricación, personalización).
const BOOKING_PATTERN = /fot[oó]grafo|catering|m[uú]sica|\bdj\b|grupo|vestid|traje|sal[oó]n|reserv|florista|tarta|pastel|invitaci[oó]n|imprenta|encargar|fabric|alquiler/i

export function proposeTaskPriority(input: { title: string; dependsOnDecision: boolean }): PriorityProposal {
  const title = input.title.trim()
  if (PRACTICE_PATTERN.test(title)) return { priority: 'alta', reason: 'practica' }
  if (BOOKING_PATTERN.test(title)) return { priority: 'alta', reason: 'reserva' }
  if (input.dependsOnDecision) return { priority: 'media', reason: 'dependencia' }
  return { priority: 'media', reason: 'general' }
}

// Días hasta una fecha YYYY-MM-DD (negativo = ya pasó). null si no hay fecha.
export function daysUntilDate(dueDate: string | null, today: Date): number | null {
  if (!dueDate) return null
  const [y, m, d] = dueDate.split('-').map(Number)
  const due = Date.UTC(y, m - 1, d)
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((due - now) / 86400000)
}

export interface TaskForRanking {
  id: string
  title: string
  done: boolean
  dueDate: string | null
  // Opcionales: ausente = sin prioridad guardada (tarea antigua sin tocar).
  priority?: TaskPriority | null
  priorityReason?: PriorityReason | null
  sortOrder: number
}

export interface RecommendedTask<T extends TaskForRanking> {
  task: T
  daysUntil: number | null
  explanation: string
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { alta: 3, media: 2, baja: 1 }

// Urgencia real (solo con fecha): vencida o muy próxima sube; lejana no influye.
function urgencyWeight(days: number | null): number {
  if (days === null) return 0
  if (days < 0) return 4
  if (days <= 7) return 2
  if (days <= 30) return 1
  return 0
}

function explain(task: TaskForRanking, days: number | null): string {
  if (days !== null && days < 0) return 'Está atrasada: ya ha pasado la fecha que le pusisteis.'
  if (days !== null && days <= 7) return 'Se acerca la fecha que le pusisteis.'
  if (task.priorityReason === 'practica') return 'Como necesitáis práctica, conviene empezar pronto: suelen hacer falta varias sesiones.'
  if (task.priorityReason === 'reserva') return 'Conviene resolverlo pronto: los proveedores suelen tener fechas limitadas.'
  if (task.priorityReason === 'dependencia') return 'Otras decisiones del evento dependen de esta.'
  return 'Pendiente de preparar.'
}

// Ranking determinista: sin completadas; prioridad guardada + urgencia real (solo con fecha) + motivo de práctica.
// No depende del orden de creación: el orden manual solo desempata.
export function recommendTasks<T extends TaskForRanking>(tasks: T[], today: Date, limit = 3): RecommendedTask<T>[] {
  return tasks
    .filter((t) => !t.done)
    .map((task) => {
      const daysUntil = daysUntilDate(task.dueDate, today)
      const score =
        (task.priority ? PRIORITY_WEIGHT[task.priority] : 1.5) +
        urgencyWeight(daysUntil) +
        (task.priorityReason === 'practica' ? 1 : 0)
      return { task, daysUntil, explanation: explain(task, daysUntil), score }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.daysUntil !== null && b.daysUntil !== null && a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil
      if (a.daysUntil !== null && b.daysUntil === null) return -1
      if (a.daysUntil === null && b.daysUntil !== null) return 1
      return a.task.sortOrder - b.task.sortOrder
    })
    .slice(0, limit)
    .map(({ task, daysUntil, explanation }) => ({ task, daysUntil, explanation }))
}
