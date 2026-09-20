import { describe, expect, it } from 'vitest'
import { ageInMonths, curvePoints, effectiveMemberType, lmsAt, normalCdf, percentileBand, percentileFor, valueAtZ, formatPercentile } from './growth'

describe('normalCdf', () => {
  it('matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-1.0364)).toBeCloseTo(0.15, 3)
  })
})

describe('WHO growth (LMS)', () => {
  it('a boy at the WHO median weight at birth is on the 50th percentile', () => {
    expect(percentileFor('weight', 'male', 0, 3.3464)).toBeCloseTo(50, 1)
  })

  it('the median value round-trips and the 97th curve is above the median', () => {
    const median = valueAtZ('weight', 'female', 6, 0)!
    expect(percentileFor('weight', 'female', 6, median)).toBeCloseTo(50, 1)
    expect(valueAtZ('weight', 'female', 6, 1.8808)!).toBeGreaterThan(median)
  })

  it('WHO published percentile values are reproduced (boys, 12 months, weight P3 ~ 7.7 kg, P97 ~ 11.8 kg)', () => {
    expect(valueAtZ('weight', 'male', 12, -1.8808)!).toBeCloseTo(7.7, 0)
    expect(valueAtZ('weight', 'male', 12, 1.8808)!).toBeCloseTo(11.8, 0)
  })

  it('interpolates between months and returns null outside 0-60', () => {
    const a = lmsAt('length', 'male', 3)!
    const b = lmsAt('length', 'male', 4)!
    const mid = lmsAt('length', 'male', 3.5)!
    expect(mid.m).toBeCloseTo((a.m + b.m) / 2, 6)
    expect(lmsAt('length', 'male', 61)).toBeNull()
    expect(percentileFor('weight', 'male', 70, 10)).toBeNull()
  })

  it('a heavier baby has a higher percentile', () => {
    const low = percentileFor('weight', 'female', 3, 5.2)!
    const high = percentileFor('weight', 'female', 3, 7.5)!
    expect(high).toBeGreaterThan(low)
  })
})

describe('helpers', () => {
  it('age in months', () => {
    expect(ageInMonths('2026-06-19', '2026-09-19')).toBeCloseTo(3, 0)
    expect(ageInMonths('2026-09-19', '2026-09-19')).toBe(0)
  })

  it('curve points cover the requested months', () => {
    const pts = curvePoints('head', 'male', 0, 0, 24)
    expect(pts[0].month).toBe(0)
    expect(pts[pts.length - 1].month).toBe(24)
  })

  it('bands and formatting', () => {
    expect(percentileBand(2).band).toBe('muy-bajo')
    expect(percentileBand(50).band).toBe('normal')
    expect(percentileBand(90).band).toBe('alto')
    expect(percentileBand(99).band).toBe('muy-alto')
    expect(formatPercentile(35.7)).toBe('36')
    expect(formatPercentile(0.2)).toBe('<1')
  })
})

describe('effectiveMemberType', () => {
  it('turns a baby into a child at the configured age, and leaves other types alone', () => {
    expect(effectiveMemberType('baby', '2026-09-01', 24, '2027-09-01')).toBe('baby')
    expect(effectiveMemberType('baby', '2024-09-01', 24, '2026-09-02')).toBe('child')
    expect(effectiveMemberType('baby', '2025-09-01', 12, '2026-09-02')).toBe('child')
    expect(effectiveMemberType('baby', null, 24, '2030-01-01')).toBe('baby')
    expect(effectiveMemberType('adult', '2000-01-01', 24, '2026-09-02')).toBe('adult')
  })
})
