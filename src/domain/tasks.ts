// Lógica de negocio de tareas — sin dependencias de framework ni de
// Supabase, para que sea trivial de razonar/testear (Skill 01).

import { expandOccurrences } from '@/domain/calendar'

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Racha de días consecutivos completados hasta hoy (o hasta ayer, si hoy
// todavía no se ha completado — la racha no se rompe hasta que pase el día).
export function calculateStreak(completedDates: string[]): number {
  const dates = new Set(completedDates)
  const cursor = new Date()
  if (!dates.has(toDateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  let streak = 0
  while (dates.has(toDateStr(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function isCompletedToday(completedDates: string[]): boolean {
  return completedDates.includes(toDateStr(new Date()))
}

// Reutiliza el mismo expandidor de recurrencia (RRULE simplificado) que
// el calendario — una tarea "de lunes a viernes" y un evento semanal se
// calculan igual, solo cambia qué fecha/hora se usa como ancla.
export function isTaskDueOn(
  task: { startDate: string; timeOfDay: string | null; recurrenceRule: string | null },
  dateStr: string,
): boolean {
  const startAt = `${task.startDate}T${task.timeOfDay ?? '00:00'}`
  return expandOccurrences({ startAt, recurrenceRule: task.recurrenceRule }, dateStr, dateStr).length > 0
}

export function memberPointsBalance(
  memberId: string,
  completions: { memberId: string; pointsAwarded: number }[],
  redemptions: { memberId: string; pointsSpent: number }[],
): number {
  const earned = completions
    .filter((c) => c.memberId === memberId)
    .reduce((sum, c) => sum + c.pointsAwarded, 0)
  const spent = redemptions
    .filter((r) => r.memberId === memberId)
    .reduce((sum, r) => sum + r.pointsSpent, 0)
  return earned - spent
}
