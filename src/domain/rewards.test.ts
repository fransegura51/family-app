import { describe, expect, it } from 'vitest'
import { memberPointsBalance, isMemberRewardsEnabled, memberLifetimePoints, memberMonthlyRacePoints, monthlyRaceStandings } from '@/domain/rewards'

describe('memberPointsBalance', () => {
  const completions = [
    { memberId: 'eric', pointsAwarded: 5 },
    { memberId: 'eric', pointsAwarded: 3 },
    { memberId: 'fernando', pointsAwarded: 10 },
    // Evento sin persona asignada: no da puntos a nadie.
    { memberId: null, pointsAwarded: 100 },
  ]
  const redemptions = [
    { memberId: 'eric', pointsSpent: 2, status: 'disfrutada' },
    { memberId: 'fernando', pointsSpent: 10, status: 'disfrutada' },
  ]

  it('ganados menos canjeados, por persona', () => {
    expect(memberPointsBalance('eric', completions, redemptions)).toBe(6)
    expect(memberPointsBalance('fernando', completions, redemptions)).toBe(0)
  })

  it('quien no tiene nada, 0 (nunca negativo por puntos de otros)', () => {
    expect(memberPointsBalance('nadie', completions, redemptions)).toBe(0)
  })
})

// Fase 4 (Parte 4.3, prompt maestro) — "al solicitar, reservar los puntos... al rechazar, liberar la
// reserva... al marcar como disfrutada, no descontar otra vez". El saldo debe reflejar esto SOLO con el
// status de cada canje, sin ninguna columna de "reservado" aparte.
describe('memberPointsBalance — reserva de puntos según el estado del canje', () => {
  const completions = [{ memberId: 'eric', pointsAwarded: 10 }]

  it('un canje "pendiente" ya resta del saldo disponible (reservado, para impedir un segundo canje que lo duplique)', () => {
    const redemptions = [{ memberId: 'eric', pointsSpent: 4, status: 'pendiente' }]
    expect(memberPointsBalance('eric', completions, redemptions)).toBe(6)
  })

  it('un canje "aprobada" también resta (el descuento ya es definitivo)', () => {
    const redemptions = [{ memberId: 'eric', pointsSpent: 4, status: 'aprobada' }]
    expect(memberPointsBalance('eric', completions, redemptions)).toBe(6)
  })

  it('un canje "disfrutada" resta igual que "aprobada" — nunca se descuenta una segunda vez', () => {
    const redemptions = [{ memberId: 'eric', pointsSpent: 4, status: 'disfrutada' }]
    expect(memberPointsBalance('eric', completions, redemptions)).toBe(6)
  })

  it('un canje "rechazada" libera la reserva — no resta nada del saldo', () => {
    const redemptions = [{ memberId: 'eric', pointsSpent: 4, status: 'rechazada' }]
    expect(memberPointsBalance('eric', completions, redemptions)).toBe(10)
  })
})

// Fase 4 (Parte 4.4) — "Dar puntos" manualmente suma al saldo igual que los puntos ganados por tareas;
// una corrección es una fila de amount negativo, nunca una edición de la original.
describe('memberPointsBalance — puntos dados a mano (point_grants)', () => {
  it('se suman al saldo igual que los puntos de tareas', () => {
    const completions = [{ memberId: 'eric', pointsAwarded: 5 }]
    const grants = [{ memberId: 'eric', amount: 3 }]
    expect(memberPointsBalance('eric', completions, [], grants)).toBe(8)
  })

  it('una corrección (amount negativo) resta del total dado, sin tocar la fila original', () => {
    const grants = [
      { memberId: 'eric', amount: 5 },
      { memberId: 'eric', amount: -5 },
    ]
    expect(memberPointsBalance('eric', [], [], grants)).toBe(0)
  })

  it('sin grants (parámetro omitido), el cálculo sigue funcionando igual que antes de la Fase 4', () => {
    const completions = [{ memberId: 'eric', pointsAwarded: 5 }]
    expect(memberPointsBalance('eric', completions, [])).toBe(5)
  })
})

// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos empiezan desactivados, cada niño/a activable o
// desactivable individualmente, nunca toca los permisos generales de la familia". Ausencia de fila en
// reward_participants = valor por defecto según el tipo de miembro, nunca un error ni "false" a ciegas.
describe('isMemberRewardsEnabled', () => {
  it('sin ninguna fila: un adulto/admin empieza desactivado, un niño/bebé/invitado empieza activado', () => {
    expect(isMemberRewardsEnabled('paco', 'admin', [])).toBe(false)
    expect(isMemberRewardsEnabled('jennifer', 'adult', [])).toBe(false)
    expect(isMemberRewardsEnabled('eric', 'child', [])).toBe(true)
    expect(isMemberRewardsEnabled('bebe', 'baby', [])).toBe(true)
    expect(isMemberRewardsEnabled('invitado', 'guest', [])).toBe(true)
  })

  it('una fila explícita siempre manda sobre el valor por defecto de su tipo', () => {
    const participants = [{ memberId: 'eric', enabled: false }]
    expect(isMemberRewardsEnabled('eric', 'child', participants)).toBe(false)
    const reactivated = [{ memberId: 'paco', enabled: true }]
    expect(isMemberRewardsEnabled('paco', 'admin', reactivated)).toBe(true)
  })
})

// PG-PUNTOS-FINANZAS (Parte A3) — el "Camino de recompensas" nunca se reinicia y, a propósito, nunca
// baja al canjear un premio (a diferencia del saldo gastable de memberPointsBalance).
describe('memberLifetimePoints — Camino de recompensas', () => {
  it('suma todo lo ganado alguna vez, sin restar ningún canje', () => {
    const completions = [{ memberId: 'eric', pointsAwarded: 5 }, { memberId: 'eric', pointsAwarded: 3 }]
    const grants = [{ memberId: 'eric', amount: 10 }]
    expect(memberLifetimePoints('eric', completions, grants)).toBe(18)
  })

  it('canjear un premio (modelado aparte en memberPointsBalance) nunca hace retroceder el camino', () => {
    const completions = [{ memberId: 'eric', pointsAwarded: 20 }]
    const beforeRedeeming = memberLifetimePoints('eric', completions, [])
    // Un canje no es un parámetro de esta función a propósito: no hay forma de pasarle uno que la
    // haga bajar, que es justo la garantía que pide el prompt ("nunca debe hacer retroceder a un niño").
    expect(memberLifetimePoints('eric', completions, [])).toBe(beforeRedeeming)
  })
})

// PG-PUNTOS-FINANZAS (Parte A3) — la "Carrera mensual" se reinicia SOLO al cambiar de mes (filtrando
// desde cero), nunca borrando ni tocando ningún dato real de completions/point_grants.
describe('memberMonthlyRacePoints — Carrera mensual', () => {
  const completions = [
    { memberId: 'eric', pointsAwarded: 5, occurrenceDate: '2026-10-02' },
    { memberId: 'eric', pointsAwarded: 7, occurrenceDate: '2026-10-15' },
    { memberId: 'eric', pointsAwarded: 9, occurrenceDate: '2026-09-28' },
  ]
  const grants = [
    { memberId: 'eric', amount: 4, createdAt: '2026-10-05T10:00:00Z' },
    { memberId: 'eric', amount: 6, createdAt: '2026-09-30T10:00:00Z' },
  ]

  it('solo cuenta lo ganado dentro del mes pedido', () => {
    expect(memberMonthlyRacePoints('eric', '2026-10', completions, grants)).toBe(16)
  })

  it('el mes anterior sigue intacto para su propia consulta — nada se ha borrado', () => {
    expect(memberMonthlyRacePoints('eric', '2026-09', completions, grants)).toBe(15)
  })

  it('un mes sin ningún movimiento da 0, nunca un error', () => {
    expect(memberMonthlyRacePoints('eric', '2026-01', completions, grants)).toBe(0)
  })
})

// PG-PUNTOS-FINANZAS (Parte A3/A6) — "trofeos adaptados al número real de participantes, con empates
// justos" — el ranking 1224 (empatados comparten puesto, el siguiente puesto salta) es lo que hace que
// repartir medallas más adelante (A6) nunca invente un 2º puesto que en realidad no existió.
describe('monthlyRaceStandings — Carrera mensual, ranking con empates justos (1224)', () => {
  it('sin empates: 1º, 2º, 3º en orden de puntos', () => {
    const completions = [
      { memberId: 'eric', pointsAwarded: 10, occurrenceDate: '2026-10-01' },
      { memberId: 'fernando', pointsAwarded: 20, occurrenceDate: '2026-10-01' },
      { memberId: 'lucia', pointsAwarded: 5, occurrenceDate: '2026-10-01' },
    ]
    const standings = monthlyRaceStandings(['eric', 'fernando', 'lucia'], '2026-10', completions, [])
    expect(standings).toEqual([
      { memberId: 'fernando', points: 20, rank: 1 },
      { memberId: 'eric', points: 10, rank: 2 },
      { memberId: 'lucia', points: 5, rank: 3 },
    ])
  })

  it('un empate en cabeza: los dos comparten el 1º puesto, el siguiente es 3º (nunca 2º)', () => {
    const completions = [
      { memberId: 'eric', pointsAwarded: 20, occurrenceDate: '2026-10-01' },
      { memberId: 'fernando', pointsAwarded: 20, occurrenceDate: '2026-10-01' },
      { memberId: 'lucia', pointsAwarded: 5, occurrenceDate: '2026-10-01' },
    ]
    const standings = monthlyRaceStandings(['eric', 'fernando', 'lucia'], '2026-10', completions, [])
    expect(standings.find((s) => s.memberId === 'eric')?.rank).toBe(1)
    expect(standings.find((s) => s.memberId === 'fernando')?.rank).toBe(1)
    expect(standings.find((s) => s.memberId === 'lucia')?.rank).toBe(3)
  })

  it('nadie ha ganado puntos este mes: todos empatados a 0 en el mismo puesto 1º, nunca un error', () => {
    const standings = monthlyRaceStandings(['eric', 'fernando'], '2026-10', [], [])
    expect(standings).toEqual([
      { memberId: 'eric', points: 0, rank: 1 },
      { memberId: 'fernando', points: 0, rank: 1 },
    ])
  })

  it('un solo participante activo: va 1º solo/a, sin necesitar a nadie más', () => {
    const completions = [{ memberId: 'eric', pointsAwarded: 7, occurrenceDate: '2026-10-01' }]
    expect(monthlyRaceStandings(['eric'], '2026-10', completions, [])).toEqual([{ memberId: 'eric', points: 7, rank: 1 }])
  })
})
