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

export const PRIORITY_ORDER: Record<TaskPriority, number> = { baja: 1, media: 2, alta: 3 }

// Corrección real (revisión manual): "Buscar/organizar clases de baile" estaba en Alta y PEPA proponía
// bajarla a Media "porque hay preparativos que dependen de esta tarea" — al revés de lo razonable (que
// algo dependa de esta tarea es, como mucho, un argumento para no bajarla nunca, no para hacerlo). La
// causa de fondo no era ese título: NINGUNA señal de este motor (practica/reserva/fecha_proxima/
// dependencia/general) representa "esto importa menos que antes" — todas son, como mucho, neutras o de
// subida. Por eso la regla general, no un parche puntual: una propuesta SOLO puede subir prioridad o
// asignar una cuando no había ninguna ("Sin prioridad" elegido a mano) — nunca bajar una que el usuario
// ya fijó. Si en el futuro se diseña una señal real de "esto ya no es tan urgente" (p. ej. la tarea de la
// que dependía se resolvió), esta función es el único sitio que hay que tocar.
export function computePrioritySuggestion(task: SuggestableTask, decisions: DecisionLookup[], today: Date): PrioritySuggestionContext | null {
  if (task.prioritySource !== 'usuario') return null
  const asIfManaged = effectivePriority({ ...task, prioritySource: 'pepa' }, decisions, today)
  if (!asIfManaged.priority || asIfManaged.priority === task.priority) return null
  if (task.priority && PRIORITY_ORDER[asIfManaged.priority] < PRIORITY_ORDER[task.priority]) return null
  const decisionQuestionKey = task.decisionId ? (decisions.find((d) => d.id === task.decisionId)?.questionKey ?? '') : ''
  const daysUntil = daysUntilDate(task.dueDate ?? null, today)
  const fingerprint = `${asIfManaged.priority}:${asIfManaged.reason}:${decisionQuestionKey}:${urgencyBucket(daysUntil)}`
  return { proposedPriority: asIfManaged.priority, reason: asIfManaged.reason, fingerprint }
}
const PRIORITY_LABEL: Record<TaskPriority, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }

// Corregido: "dependencia" significa que ESTA tarea depende de una decisión ya tomada del evento (nunca
// al revés — nunca "otras tareas dependen de esta"), así que el texto ya no puede sugerir lo contrario.
function reasonPhrase(reason: PriorityReason): string {
  if (reason === 'practica') return 'esta tarea requiere varias sesiones de práctica y sigue pendiente'
  if (reason === 'reserva') return 'conviene resolverlo pronto: los proveedores suelen tener fechas limitadas'
  if (reason === 'dependencia') return 'esta tarea depende de una decisión ya tomada del evento'
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
