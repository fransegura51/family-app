// Preparativos: prioridad propuesta por PEPA, prioridad efectiva (incluye tareas antiguas sin prioridad guardada),
// urgencia y explicación de las recomendaciones. Reglas deterministas.
//  - PRIORIDAD = importancia/plazo/dependencias/dificultad. Orden de las señales:
//      1) decisión estructurada del propio evento (pregunta de event_decisions que originó la tarea);
//      2) dependencia de una decisión;
//      3) el título, SOLO como respaldo cuando no hay ninguna metadata mejor (tarea manual o antigua).
//  - URGENCIA = situación temporal real, SOLO si la tarea tiene una fecha puesta por el usuario. Nunca se inventan fechas.
// Una prioridad elegida por el usuario (priority_source = 'usuario') manda: nunca se recalcula ni se sobrescribe.
// Las tareas antiguas sin prioridad guardada usan la prioridad efectiva (mismo motor) SIN escribirla en la base de datos.

export type TaskPriority = 'alta' | 'media' | 'baja'
export type PriorityReason = 'practica' | 'reserva' | 'fecha_proxima' | 'dependencia' | 'general'

export interface PriorityProposal {
  priority: TaskPriority
  reason: PriorityReason
  // De dónde sale: estructurada (decisión del evento), dependencia o título (respaldo).
  basis: 'estructurada' | 'dependencia' | 'titulo' | 'general'
}

// Señales estructuradas: clave = pregunta de event_decisions que genera la tarea. Solo lo ya registrado en la app.
// «¿Necesitáis clases de baile?» → sí = práctica (varias sesiones, conviene empezar pronto).
export const STRUCTURED_TASK_SIGNALS: Record<string, { practice?: boolean; booking?: boolean }> = {
  'momentos_especiales.primer_baile.clases_baile': { practice: true },
}

// Respaldo por título. Auxiliar: solo se usa sin señal estructurada.
const PRACTICE_PATTERN = /clase|practic|ensayo|ensayar|coreograf|baile/i
const BOOKING_PATTERN = /fot[oó]grafo|catering|m[uú]sica|\bdj\b|grupo|vestid|traje|sal[oó]n|reserv|florista|tarta|pastel|invitaci[oó]n|imprenta|encargar|fabric|alquiler/i

export interface PriorityInput {
  title: string
  dependsOnDecision: boolean
  // Pregunta concreta de la decisión que originó la tarea, si se conoce.
  decisionQuestionKey?: string | null
}

export function proposeTaskPriority(input: PriorityInput): PriorityProposal {
  const signal = input.decisionQuestionKey ? STRUCTURED_TASK_SIGNALS[input.decisionQuestionKey] : undefined
  if (signal?.practice) return { priority: 'alta', reason: 'practica', basis: 'estructurada' }
  if (signal?.booking) return { priority: 'alta', reason: 'reserva', basis: 'estructurada' }
  if (input.dependsOnDecision) return { priority: 'media', reason: 'dependencia', basis: 'dependencia' }
  const title = input.title.trim()
  if (PRACTICE_PATTERN.test(title)) return { priority: 'alta', reason: 'practica', basis: 'titulo' }
  if (BOOKING_PATTERN.test(title)) return { priority: 'alta', reason: 'reserva', basis: 'titulo' }
  return { priority: 'media', reason: 'general', basis: 'general' }
}

// Corrección real (revisión manual en iPhone): una prioridad PROPUESTA POR PEPA no debe quedarse
// congelada para siempre en lo que se guardó al crear la tarea — PEPA sigue gestionándola mientras el
// usuario no la haya tocado. Solo una prioridad de origen 'usuario' (incluida «Sin prioridad», que se
// guarda como prioridad vacía con ese mismo origen) se congela y nunca se recalcula.
//
// Urgencia real (solo con fecha puesta por el usuario, nunca inventada): una tarea gestionada por PEPA
// puede subir de prioridad al acercarse su fecha, y bajar otra vez si la fecha se quita o se aleja —
// siempre en vivo, nunca escrito en la base de datos.
function urgencyEscalate(priority: TaskPriority, daysUntil: number | null): TaskPriority {
  if (daysUntil === null) return priority
  if (daysUntil <= 7) return 'alta' // vencida o a menos de una semana: conviene ocuparse ya
  if (daysUntil <= 30 && priority === 'baja') return 'media'
  return priority
}

export interface DecisionLookup {
  id: string
  questionKey: string
}

// Prioridad efectiva de una tarea: si el usuario la fijó (o eligió explícitamente «Sin prioridad»),
// se respeta tal cual, siempre. Si la gestiona PEPA, se recalcula en vivo con el contexto actual
// (decisión de origen + fecha real) en cada llamada — nunca se queda con lo que se guardó al crearla.
export function effectivePriority(
  task: {
    title: string
    decisionId?: string | null
    dueDate?: string | null
    priority?: TaskPriority | null
    priorityReason?: PriorityReason | null
    prioritySource?: 'pepa' | 'usuario' | null
  },
  decisions: DecisionLookup[] = [],
  today: Date = new Date(),
): {
  priority: TaskPriority | null
  reason: PriorityReason
  stored: boolean
  // false mientras PEPA la gestione (se recalcula); true en cuanto el usuario la fija a mano (incluido «Sin prioridad»).
  managedByUser: boolean
} {
  if (task.prioritySource === 'usuario') return { priority: task.priority ?? null, reason: task.priorityReason ?? 'general', stored: true, managedByUser: true }
  const decisionQuestionKey = task.decisionId ? (decisions.find((d) => d.id === task.decisionId)?.questionKey ?? null) : null
  const proposal = proposeTaskPriority({ title: task.title, dependsOnDecision: Boolean(task.decisionId), decisionQuestionKey })
  const daysUntil = daysUntilDate(task.dueDate ?? null, today)
  const priority = urgencyEscalate(proposal.priority, daysUntil)
  // Si lo que decidió el resultado final fue la fecha (y no ya la propia señal estructural), el motivo que
  // se explica al usuario también debe ser la fecha — nunca «general» cuando lo que realmente pasó es que
  // se acerca el plazo.
  const reason: PriorityReason = priority !== proposal.priority && daysUntil !== null && daysUntil <= 7 ? 'fecha_proxima' : proposal.reason
  return { priority, reason, stored: false, managedByUser: false }
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
  decisionId?: string | null
  // Opcionales: ausente = sin prioridad guardada (tarea antigua; se usa la efectiva).
  priority?: TaskPriority | null
  priorityReason?: PriorityReason | null
  prioritySource?: 'pepa' | 'usuario' | null
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

function explain(reason: PriorityReason, days: number | null): string {
  if (days !== null && days < 0) return 'Está atrasada: ya ha pasado la fecha que le pusisteis.'
  if (days !== null && days <= 7) return 'Se acerca la fecha que le pusisteis.'
  if (reason === 'practica') return 'Como necesitáis práctica, conviene empezar pronto: suelen hacer falta varias sesiones.'
  if (reason === 'reserva') return 'Conviene resolverlo pronto: los proveedores suelen tener fechas limitadas.'
  if (reason === 'dependencia') return 'Otras decisiones del evento dependen de esta.'
  return 'Pendiente de preparar.'
}

// Ranking determinista y ÚNICO: sin completadas; prioridad efectiva + urgencia real (solo con fecha) + práctica.
// No depende de la fecha del evento ni de que existan fechas. El orden manual solo desempata.
export function recommendTasks<T extends TaskForRanking>(tasks: T[], today: Date, limit = 3, decisions: DecisionLookup[] = []): RecommendedTask<T>[] {
  return tasks
    .filter((t) => !t.done)
    .map((task) => {
      const daysUntil = daysUntilDate(task.dueDate, today)
      const eff = effectivePriority(task, decisions, today)
      const score = (eff.priority ? PRIORITY_WEIGHT[eff.priority] : 1.5) + urgencyWeight(daysUntil) + (eff.reason === 'practica' ? 1 : 0)
      return { task, daysUntil, explanation: explain(eff.reason, daysUntil), score }
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
