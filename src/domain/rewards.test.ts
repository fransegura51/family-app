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
    { memberId: 'eric', pointsSpent: 2 },
    { memberId: 'fernando', pointsSpent: 10 },
  ]

  it('ganados menos canjeados, por persona', () => {
    expect(memberPointsBalance('eric', completions, redemptions)).toBe(6)
    expect(memberPointsBalance('fernando', completions, redemptions)).toBe(0)
  })

  it('quien no tiene nada, 0 (nunca negativo por puntos de otros)', () => {
    expect(memberPointsBalance('nadie', completions, redemptions)).toBe(0)
  })
})
