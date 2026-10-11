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

// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos empiezan desactivados, cada niño/a se puede activar o
// desactivar individualmente, nunca toca los permisos generales de la familia". Sin fila en
// reward_participants para ese miembro, el valor por defecto depende solo de su tipo — nunca hace falta
// un backfill al crear la tabla ni al dar de alta un miembro nuevo.
export function isMemberRewardsEnabled(
  memberId: string,
  memberType: 'admin' | 'adult' | 'child' | 'baby' | 'guest',
  participants: { memberId: string; enabled: boolean }[],
): boolean {
  const override = participants.find((p) => p.memberId === memberId)
  if (override) return override.enabled
  return memberType !== 'admin' && memberType !== 'adult'
}

// PG-PUNTOS-FINANZAS (Parte A3) — progreso del "Camino de recompensas": TODO lo ganado alguna vez
// (tareas + puntos dados a mano), a propósito SIN restar lo ya canjeado — "nunca se reinicia" significa
// que pedir un premio no puede hacer retroceder el camino, a diferencia del saldo gastable de
// memberPointsBalance (ese sí baja al canjear).
export function memberLifetimePoints(
  memberId: string,
  completions: { memberId: string | null; pointsAwarded: number }[],
  grants: { memberId: string; amount: number }[],
): number {
  const earned = completions
    .filter((c) => c.memberId === memberId)
    .reduce((sum, c) => sum + c.pointsAwarded, 0)
  const granted = grants
    .filter((g) => g.memberId === memberId)
    .reduce((sum, g) => sum + g.amount, 0)
  return earned + granted
}

// PG-PUNTOS-FINANZAS (Parte A3) — progreso de la "Carrera mensual": lo mismo que memberLifetimePoints
// pero solo con lo ganado DENTRO del mes indicado (yearMonth, formato "YYYY-MM") — se reinicia solo al
// cambiar de mes porque cada mes nuevo vuelve a filtrar desde cero, nunca por borrar nada. Independiente
// del saldo gastable a propósito: "redimir un premio no debe hacer retroceder a un niño en la carrera".
export function memberMonthlyRacePoints(
  memberId: string,
  yearMonth: string,
  completions: { memberId: string | null; pointsAwarded: number; occurrenceDate: string }[],
  grants: { memberId: string; amount: number; createdAt: string }[],
): number {
  const earned = completions
    .filter((c) => c.memberId === memberId && c.occurrenceDate.startsWith(yearMonth))
    .reduce((sum, c) => sum + c.pointsAwarded, 0)
  const granted = grants
    .filter((g) => g.memberId === memberId && g.createdAt.startsWith(yearMonth))
    .reduce((sum, g) => sum + g.amount, 0)
  return earned + granted
}

export interface MonthlyRaceStanding {
  memberId: string
  points: number
  rank: number
}

// PG-PUNTOS-FINANZAS (Parte A3/A6) — clasificación de la "Carrera mensual": empate = mismo puesto para
// todos los empatados (ranking "1224": 1º, 1º, 3º — nunca "1º, 1º, 2º", que inflaría el siguiente puesto
// como si no hubiera habido empate) — "adaptados al número real de participantes, con empates justos"
// es justo lo que pide A6 para los trofeos; esta misma función servirá para repartirlos sin repetirla.
export function monthlyRaceStandings(
  memberIds: string[],
  yearMonth: string,
  completions: { memberId: string | null; pointsAwarded: number; occurrenceDate: string }[],
  grants: { memberId: string; amount: number; createdAt: string }[],
): MonthlyRaceStanding[] {
  const scored = memberIds
    .map((memberId) => ({ memberId, points: memberMonthlyRacePoints(memberId, yearMonth, completions, grants) }))
    .sort((a, b) => b.points - a.points)

  let rank = 0
  let previousPoints: number | null = null
  return scored.map((entry, index) => {
    if (previousPoints === null || entry.points !== previousPoints) rank = index + 1
    previousPoints = entry.points
    return { ...entry, rank }
  })
}
