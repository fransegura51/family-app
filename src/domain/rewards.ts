// Lógica de negocio de puntos/recompensas — sin dependencias de
// framework ni de Supabase (Skill 01). Los puntos se ganan al marcar
// "Hecho" un evento del calendario asignado a una sola persona (ver
// calendar_event_completions.points_awarded), no de una tabla de
// tareas aparte.

export function memberPointsBalance(
  memberId: string,
  completions: { memberId: string | null; pointsAwarded: number }[],
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
