// Lógica de negocio de puntos/recompensas — sin dependencias de
// framework ni de Supabase (Skill 01). Los puntos se ganan al marcar
// "Hecho" un evento del calendario asignado a una sola persona (ver
// calendar_event_completions.points_awarded), con "Dar puntos" manualmente
// (point_grants, Fase 4 Parte 4.4) o se gastan en un canje.
//
// Fase 4 (Parte 4.3, prompt maestro) — un canje reserva sus puntos desde que se solicita, no solo
// cuando se aprueba: "al solicitar, reservar los puntos... al aprobar, descontar definitivamente... al
// rechazar, liberar la reserva... al marcar como disfrutada, no descontar otra vez". Por eso el saldo
// resta TODO canje que no esté 'rechazada' (pendiente/aprobada/disfrutada cuentan igual) — nunca una
// columna de "reservado" aparte que pudiera desincronizarse de verdad del estado real del canje.
export function memberPointsBalance(
  memberId: string,
  completions: { memberId: string | null; pointsAwarded: number }[],
  redemptions: { memberId: string; pointsSpent: number; status: string }[],
  grants: { memberId: string; amount: number }[] = [],
): number {
  const earned = completions
    .filter((c) => c.memberId === memberId)
    .reduce((sum, c) => sum + c.pointsAwarded, 0)
  const granted = grants
    .filter((g) => g.memberId === memberId)
    .reduce((sum, g) => sum + g.amount, 0)
  const spent = redemptions
    .filter((r) => r.memberId === memberId && r.status !== 'rechazada')
    .reduce((sum, r) => sum + r.pointsSpent, 0)
  return earned + granted - spent
}
