import { describe, expect, it } from 'vitest'
import { bmi, bmiBand, changeOverDays, filterRange, goalProgress } from './bodyStats'

describe('bmi', () => {
  it('computes and classifies', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.86, 1)
    expect(bmi(70, 50)).toBeNull()
    expect(bmiBand(17).band).toBe('bajo')
    expect(bmiBand(22).band).toBe('normal')
    expect(bmiBand(27).band).toBe('sobrepeso')
    expect(bmiBand(32).band).toBe('obesidad')
  })
})

describe('changeOverDays / filterRange', () => {
  const pts = [
    { date: '2026-06-01', value: 80 },
    { date: '2026-08-01', value: 78 },
    { date: '2026-09-10', value: 77 },
    { date: '2026-09-20', value: 76.5 },
  ]

  it('compares with the closest measure at least N days old', () => {
    const c = changeOverDays(pts, 30)!
    expect(c.since).toBe('2026-08-01')
    expect(c.delta).toBeCloseTo(-1.5, 5)
  })

  it('falls back to the first measure when nothing is old enough', () => {
    const c = changeOverDays(pts, 365)!
    expect(c.since).toBe('2026-06-01')
    expect(changeOverDays([pts[0]], 30)).toBeNull()
  })

  it('filters by range', () => {
    expect(filterRange(pts, '1M', '2026-09-20').map((p) => p.date)).toEqual(['2026-09-10', '2026-09-20'])
    expect(filterRange(pts, 'Todo', '2026-09-20')).toHaveLength(4)
  })
})

describe('goalProgress', () => {
  it('goes from 0 to 1 towards the goal in either direction', () => {
    expect(goalProgress(90, 80, 70)).toBeCloseTo(0.5, 5)
    expect(goalProgress(60, 65, 70)).toBeCloseTo(0.5, 5)
    expect(goalProgress(90, 95, 70)).toBe(0)
    expect(goalProgress(90, 65, 70)).toBe(1)
  })
})
