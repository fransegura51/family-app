import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextBirthday, sortByDaysUntil } from '@/domain/birthdays'

describe('nextBirthday', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 11, 15, 30)) // 11 sept 2026, tarde
  })
  afterEach(() => vi.useRealTimers())

  it('si es hoy, cuenta como hoy (0 días), no como el año que viene', () => {
    expect(nextBirthday('m', '2000-09-11')).toEqual({ memberId: 'm', birthDate: '2000-09-11', nextDate: '2026-09-11', daysUntil: 0, turningAge: 26 })
  })

  it('si ya pasó este año, el próximo es el año que viene', () => {
    const b = nextBirthday('m', '2000-09-10')
    expect(b.nextDate).toBe('2027-09-10')
    expect(b.daysUntil).toBe(364)
    expect(b.turningAge).toBe(27)
  })

  it('si aún no ha llegado, es este año', () => {
    const b = nextBirthday('m', '2020-12-25')
    expect(b.nextDate).toBe('2026-12-25')
    expect(b.daysUntil).toBe(105)
    expect(b.turningAge).toBe(6)
  })

  it('sortByDaysUntil ordena del más cercano al más lejano sin mutar la lista', () => {
    const list = [nextBirthday('a', '2000-12-25'), nextBirthday('b', '2000-09-11'), nextBirthday('c', '2000-09-10')]
    const sorted = sortByDaysUntil(list)
    expect(sorted.map((b) => b.memberId)).toEqual(['b', 'a', 'c'])
    expect(list.map((b) => b.memberId)).toEqual(['a', 'b', 'c'])
  })
})
