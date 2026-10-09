import { describe, expect, it } from 'vitest'
import { memberPointsBalance } from '@/domain/rewards'

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
