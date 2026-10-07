// Preparativos — sugerencias de PEPA sobre una prioridad que YA fijó el usuario (migración 0208,
// event_task_priority_suggestions). Nunca sobrescribe: solo propone, con motivo, y el usuario acepta o
// rechaza. Una propuesta rechazada no vuelve a aparecer para el MISMO contexto — solo si algo
// suficientemente nuevo cambia (el "fingerprint" de abajo), nunca por repetirse sin más.
import { daysUntilDate, effectivePriority, type DecisionLookup, type PriorityReason, type TaskPriority } from '@/domain/eventTaskPriority'

export interface SuggestableTask {
  id: string
  title: string
  decisionId?: string | null
  dueDate?: string | null
  priority?: TaskPriority | null
  priorityReason?: PriorityReason | null
  prioritySource?: 'pepa' | 'usuario' | null
}

export interface PrioritySuggestionContext {
  proposedPriority: TaskPriority
  reason: PriorityReason
  // Resume qué provocó la propuesta (señal + franja de urgencia). Mientras no cambie, es EL MISMO
  // contexto: una propuesta ya rechazada con este fingerprint no se repite.
  fingerprint: string
}

function urgencyBucket(daysUntil: number | null): string {
  if (daysUntil === null) return 'sin_fecha'
  if (daysUntil < 0) return 'atrasada'
  if (daysUntil <= 7) return '7d'
  if (daysUntil <= 30) return '30d'
  return 'lejos'
}

// Solo tiene sentido para una prioridad fijada por el usuario (origen 'usuario'), incluida «Sin
// prioridad» — una tarea que gestiona PEPA ya se recalcula sola (effectivePriority) y nunca necesita que
// se le "proponga" nada: null en cualquier otro caso.
export function computePrioritySuggestion(task: SuggestableTask, decisions: DecisionLookup[], today: Date): PrioritySuggestionContext | null {
  if (task.prioritySource !== 'usuario') return null
  const asIfManaged = effectivePriority({ ...task, prioritySource: 'pepa' }, decisions, today)
  if (!asIfManaged.priority || asIfManaged.priority === task.priority) return null
  const decisionQuestionKey = task.decisionId ? (decisions.find((d) => d.id === task.decisionId)?.questionKey ?? '') : ''
  const daysUntil = daysUntilDate(task.dueDate ?? null, today)
  const fingerprint = `${asIfManaged.priority}:${asIfManaged.reason}:${decisionQuestionKey}:${urgencyBucket(daysUntil)}`
  return { proposedPriority: asIfManaged.priority, reason: asIfManaged.reason, fingerprint }
}

export const PRIORITY_ORDER: Record<TaskPriority, number> = { baja: 1, media: 2, alta: 3 }
const PRIORITY_LABEL: Record<TaskPriority, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }

function reasonPhrase(reason: PriorityReason): string {
  if (reason === 'practica') return 'esta tarea requiere varias sesiones de práctica y sigue pendiente'
  if (reason === 'reserva') return 'conviene resolverlo pronto: los proveedores suelen tener fechas limitadas'
  if (reason === 'dependencia') return 'hay preparativos que dependen de esta tarea'
  if (reason === 'fecha_proxima') return 'se está acercando la fecha que marcasteis y todavía está pendiente'
  return 'ha cambiado el contexto de esta tarea'
}

// Texto completo de la propuesta, listo para mostrar junto a sus dos acciones (aceptar/mantener).
export function explainPrioritySuggestion(taskTitle: string, currentPriority: TaskPriority | null, proposedPriority: TaskPriority, reason: PriorityReason): string {
  const action = !currentPriority
    ? `asignarle prioridad ${PRIORITY_LABEL[proposedPriority]}`
    : PRIORITY_ORDER[proposedPriority] > PRIORITY_ORDER[currentPriority]
      ? `subirla a ${PRIORITY_LABEL[proposedPriority]}`
      : `bajarla a ${PRIORITY_LABEL[proposedPriority]}`
  return `«${taskTitle}»: ${reasonPhrase(reason)}. ¿Quieres que PEPA la ${action}?`
}
