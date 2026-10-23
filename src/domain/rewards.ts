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
  grants: { id?: string; memberId: string; amount: number; createdAt: string; reversesGrantId?: string | null }[],
): number {
  const earned = completions
    .filter((c) => c.memberId === memberId && c.occurrenceDate.startsWith(yearMonth))
    .reduce((sum, c) => sum + c.pointsAwarded, 0)
  // Una corrección o anulación (fila con reversesGrantId) cuenta en el MES DE LA CONCESIÓN ORIGINAL, no en el
  // mes en que se corrigió: así anular hoy un «Dar puntos» de otro mes no deja negativo el mes actual ni
  // toca un mes ya cerrado de la Carrera (sus resultados guardados nunca se recalculan).
  const monthOf = new Map(grants.filter((g) => g.id).map((g) => [g.id as string, g.createdAt]))
  const granted = grants
    .filter((g) => g.memberId === memberId && ((g.reversesGrantId && monthOf.get(g.reversesGrantId)) || g.createdAt).startsWith(yearMonth))
    .reduce((sum, g) => sum + g.amount, 0)
  return earned + granted
}

// Corregir o anular puntos concedidos por error (migración 0309). El libro de movimientos nunca se edita: la
// cantidad VIGENTE de una concesión es la original más la suma de las filas de corrección/anulación que la
// referencian. memberLifetimePoints (Mi Camino) y memberPointsBalance ya suman todas las filas, así que el
// recorrido y el saldo se actualizan solos; los canjes jamás tocan el recorrido.
export type PointGrantStatus = 'vigente' | 'corregida' | 'anulada'

interface GrantRow {
  id: string
  amount: number
  kind: 'concesion' | 'correccion' | 'anulacion'
  reversesGrantId: string | null
}

export function grantEffectiveAmount(grant: GrantRow, allGrants: GrantRow[]): number {
  return grant.amount + allGrants.filter((g) => g.reversesGrantId === grant.id).reduce((sum, g) => sum + g.amount, 0)
}

export function isOriginalGrant(grant: GrantRow): boolean {
  return grant.kind === 'concesion' && !grant.reversesGrantId && grant.amount > 0
}

export function grantStatus(grant: GrantRow, allGrants: GrantRow[]): PointGrantStatus {
  const effective = grantEffectiveAmount(grant, allGrants)
  if (effective <= 0) return 'anulada'
  return effective === grant.amount ? 'vigente' : 'corregida'
}

// Solo una concesión original y todavía no anulada admite «Corregir puntos» / «Anular concesión» (nunca un canje,
// una corrección ni un movimiento de Calendario). El servidor lo vuelve a comprobar.
export function canAdjustGrant(grant: GrantRow, allGrants: GrantRow[]): boolean {
  return isOriginalGrant(grant) && grantEffectiveAmount(grant, allGrants) > 0
}

// ¿Dejaría este cambio el saldo del niño/a en negativo? (los puntos ya gastados o reservados en canjes no se
// pueden descontar). delta < 0 al bajar o anular. El servidor aplica la misma regla.
export function adjustmentWouldMakeBalanceNegative(balance: number, delta: number): boolean {
  return delta < 0 && balance + delta < 0
}

export interface MilestoneProgress {
  milestoneSize: number
  completedMilestones: number
  pointsIntoSegment: number
  pct: number
}

// PG-PUNTOS-FINANZAS (Parte A4/A5) — hito cada 10 puntos (A5), calculado a partir del progreso real
// (Camino o Carrera según el modo, decidido por quien llama) — nunca una posición inventada aparte. La
// pista provisional de A4 usa `pct` para colocar su marcador; A5 reutilizará `completedMilestones` para
// saber cuántos premios de hito tocan ya, sin repetir este cálculo.
export function milestoneProgress(points: number, milestoneSize = 10): MilestoneProgress {
  const safePoints = Math.max(0, points)
  const completedMilestones = Math.floor(safePoints / milestoneSize)
  const pointsIntoSegment = safePoints % milestoneSize
  const pct = Math.round((pointsIntoSegment / milestoneSize) * 100)
  return { milestoneSize, completedMilestones, pointsIntoSegment, pct }
}

// PG-PUNTOS-FINANZAS (Parte A5) — qué hitos de 10 puntos son NUEVOS desde el último que ya se le enseñó
// a este miembro (highestSeen), calculados sobre el saldo canjeable REAL (memberPointsBalance) — nunca
// sobre el progreso de Camino/Carrera, que a propósito no baja al canjear y podría "festejar" puntos que
// ya no se pueden gastar de verdad. Si hay varios de golpe (p. ej. un "Dar puntos" grande), se devuelven
// todos para registrarlos como vistos, pero la pantalla solo celebra el más alto — "una celebración
// breve", nunca varias seguidas por el mismo evento.
export function newlyReachedMilestones(balance: number, highestSeen: number, milestoneSize = 10): number[] {
  const { completedMilestones } = milestoneProgress(balance, milestoneSize)
  if (completedMilestones <= highestSeen) return []
  return Array.from({ length: completedMilestones - highestSeen }, (_, i) => highestSeen + i + 1)
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

// PG-PUNTOS-FINANZAS (Parte A6) — trofeos "adaptados al número real de participantes, con empates
// justos": el reparto es un simple mapa de puesto → trofeo porque monthlyRaceStandings() ya resuelve los
// empates (1224) antes de llegar aquí — si solo hay 2 participantes, nadie llega al puesto 3, así que
// nadie recibe bronce; un empate en el 1º puesto da oro a los dos y deja el puesto 2 vacío de verdad (el
// siguiente es 3º, bronce, nunca plata). Nunca concede puntos — ningún trofeo toca point_grants.
export type RewardTrophy = 'oro' | 'plata' | 'bronce' | 'participacion'

export interface RewardTrophyResult {
  memberId: string
  points: number
  rank: number
  trophy: RewardTrophy
}

export function assignTrophies(standings: MonthlyRaceStanding[]): RewardTrophyResult[] {
  return standings.map((s) => ({
    ...s,
    trophy: s.rank === 1 ? 'oro' : s.rank === 2 ? 'plata' : s.rank === 3 ? 'bronce' : 'participacion',
  }))
}

// PG-PUNTOS-FINANZAS (Parte A7) — "Gran Copa Anual": quien ganó MÁS carreras mensuales (trofeos "oro")
// en el año indicado — "ties shared, no new points system", por eso cuenta trofeos YA guardados
// (reward_monthly_results, Parte A6) en vez de inventar un sistema de puntos nuevo, y declara ganador a
// TODOS los que empaten con el máximo (nunca desempata con un criterio no pedido). Sin ningún oro ese
// año, no hay ganador — un array vacío, nunca un ganador inventado con 0 carreras ganadas.
export interface AnnualCupStanding {
  memberId: string
  goldCount: number
  isWinner: boolean
}

export function annualCupStandings(results: { memberId: string; yearMonth: string; trophy: RewardTrophy }[], year: string): AnnualCupStanding[] {
  const goldByMember = new Map<string, number>()
  for (const r of results) {
    if (r.trophy !== 'oro' || !r.yearMonth.startsWith(`${year}-`)) continue
    goldByMember.set(r.memberId, (goldByMember.get(r.memberId) ?? 0) + 1)
  }
  const maxGold = Math.max(0, ...goldByMember.values())
  return Array.from(goldByMember.entries()).map(([memberId, goldCount]) => ({
    memberId,
    goldCount,
    isWinner: maxGold > 0 && goldCount === maxGold,
  }))
}

// Encargo "Separar puntos de carrera y saldo de recompensas" (COR-3) — progreso hacia la PRÓXIMA
// recompensa del catálogo que todavía no se puede pedir, a partir del saldo canjeable REAL
// (memberPointsBalance) — nunca del progreso de Camino/Carrera ni de milestoneProgress (ese es un
// mecanismo aparte: celebra cada 10 puntos de saldo con confeti, "premio de hito" en newlyReachedMilestones,
// y no tiene nada que ver con el catálogo). El objetivo es el coste MÁS BAJO que todavía esté por
// encima del saldo (nunca uno ya alcanzado, que debe pasar a "ya puedes conseguir" en vez de aquí). Sin
// ningún coste por encima del saldo (ya se puede pedir todo, o no hay catálogo) no hay "próxima", null.
export interface NextRewardProgress {
  targetCost: number
  targetTitle: string
  targetEmoji: string | null
  progress: number
  remaining: number
  pct: number
}

export function nextRewardProgress(
  balance: number,
  rewards: { title: string; emoji: string | null; pointsCost: number }[],
): NextRewardProgress | null {
  const safeBalance = Math.max(0, balance)
  const target = [...rewards].filter((r) => r.pointsCost > safeBalance).sort((a, b) => a.pointsCost - b.pointsCost)[0]
  if (!target) return null
  return {
    targetCost: target.pointsCost,
    targetTitle: target.title,
    targetEmoji: target.emoji,
    progress: safeBalance,
    remaining: target.pointsCost - safeBalance,
    pct: Math.round((safeBalance / target.pointsCost) * 100),
  }
}

// PG-PUNTOS-FINANZAS (Parte A6) — el mes de Carrera anterior al indicado, mismo formato "YYYY-MM" —
// sirve para saber qué mes cerrar en cuanto termina (nunca el mes en curso, que sigue cambiando).
export function previousYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  date.setUTCMonth(date.getUTCMonth() - 1)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
