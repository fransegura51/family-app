// Preparativos: filtro de la LISTA por responsable y correspondencia entre la campana y los cinco recordatorios.
// Solo presentación: no cambia datos, prioridades ni la recomendación global del evento.
import type { EventReminder } from '@/domain/reminders'

// Claves del filtro: 'none' (sin responsables activos), 'm:<memberId>' (familiar), 'h:<helperId>' (persona externa).
export const NO_RESPONSIBLE_KEY = 'none'

export interface ResponsibleTaskLike {
  assignedMemberId: string | null
  responsibleMemberIds?: string[]
  helpers?: { helperId: string | null }[]
}

// Una tarea aparece si coincide con CUALQUIERA de las claves elegidas. Sin claves = sin filtro.
// Las referencias históricas (helperId null) no cuentan como responsables activos.
export function taskMatchesResponsibleFilter(task: ResponsibleTaskLike, selected: string[]): boolean {
  if (selected.length === 0) return true
  const memberIds = task.responsibleMemberIds && task.responsibleMemberIds.length > 0 ? task.responsibleMemberIds : task.assignedMemberId ? [task.assignedMemberId] : []
  const helperIds = (task.helpers ?? []).flatMap((h) => (h.helperId ? [h.helperId] : []))
  const hasNone = memberIds.length === 0 && helperIds.length === 0
  return selected.some((key) => {
    if (key === NO_RESPONSIBLE_KEY) return hasNone
    if (key.startsWith('m:')) return memberIds.includes(key.slice(2))
    if (key.startsWith('h:')) return helperIds.includes(key.slice(2))
    return false
  })
}

export type ReminderChoice = 'none' | 'same_day' | '1_day' | '1_week' | 'custom'

// Qué opción muestra la campana según los avisos guardados de la tarea (mismo criterio que el editor).
export function reminderChoiceFrom(reminders: Pick<EventReminder, 'minutesBefore'>[]): ReminderChoice {
  const r = reminders[0]
  if (!r) return 'none'
  if (r.minutesBefore === 0) return 'same_day'
  if (r.minutesBefore === 1440) return '1_day'
  if (r.minutesBefore === 10080) return '1_week'
  return 'custom'
}

// Avisos que se guardan para cada opción rápida. «Personalizado» no tiene preset: se edita en el editor completo.
export function presetRemindersFor(choice: Exclude<ReminderChoice, 'custom'>): EventReminder[] {
  switch (choice) {
    case 'none':
      return []
    case 'same_day':
      return [{ minutesBefore: 0, anchor: 'start' }]
    case '1_day':
      return [{ minutesBefore: 1440, anchor: 'start' }]
    case '1_week':
      return [{ minutesBefore: 10080, anchor: 'start' }]
  }
}
