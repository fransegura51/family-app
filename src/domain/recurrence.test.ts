import { describe, expect, it } from 'vitest'
import { buildRecurrenceRule, matchRecurrencePreset, parseRecurrenceRule, recurrenceLabel } from '@/domain/recurrence'

describe('buildRecurrenceRule / parseRecurrenceRule', () => {
  it('ida y vuelta con todas las opciones', () => {
    const rule = buildRecurrenceRule('WEEKLY', ['MO', 'FR'], true, '2026-12-31', 2)
    expect(rule).toBe('FREQ=WEEKLY;BYDAY=MO,FR;INTERVAL=2;UNTIL=2026-12-31;SKIPHOLIDAYS=1')
    expect(parseRecurrenceRule(rule)).toEqual({ freq: 'WEEKLY', byDay: ['MO', 'FR'], skipHolidays: true, until: '2026-12-31', interval: 2 })
  })
  it('sin frecuencia no hay regla; INTERVAL=1 no se escribe; BYDAY solo en semanal', () => {
    expect(buildRecurrenceRule('', ['MO'])).toBeNull()
    expect(buildRecurrenceRule('DAILY', [], false, null, 1)).toBe('FREQ=DAILY')
    expect(buildRecurrenceRule('MONTHLY', ['MO'])).toBe('FREQ=MONTHLY')
  })
  it('parse de null y de reglas raras no rompe', () => {
    expect(parseRecurrenceRule(null)).toEqual({ freq: '', byDay: [], skipHolidays: false, until: null, interval: 1 })
    expect(parseRecurrenceRule('FREQ=WEEKLY;INTERVAL=abc').interval).toBe(1)
    expect(parseRecurrenceRule('FREQ=WEEKLY;INTERVAL=0').interval).toBe(1)
  })
})

describe('matchRecurrencePreset', () => {
  it('reconoce "días laborables" sin importar el orden de los días', () => {
    expect(matchRecurrencePreset('WEEKLY', ['FR', 'MO', 'TU', 'WE', 'TH'], 1)?.key).toBe('weekdays')
  })
  it('cada 2 semanas y combinaciones sueltas', () => {
    expect(matchRecurrencePreset('WEEKLY', [], 2)?.key).toBe('biweekly')
    expect(matchRecurrencePreset('WEEKLY', ['MO', 'TU'], 1)).toBeNull()
    expect(matchRecurrencePreset('', [], 1)?.key).toBe('none')
  })
})

describe('recurrenceLabel', () => {
  it('etiquetas legibles', () => {
    expect(recurrenceLabel(null)).toBe('')
    expect(recurrenceLabel('FREQ=DAILY')).toBe('Cada día')
    expect(recurrenceLabel('FREQ=WEEKLY;INTERVAL=2')).toBe('Cada 2 semanas')
    expect(recurrenceLabel('FREQ=DAILY;SKIPHOLIDAYS=1')).toBe('Cada día, sin festivos')
  })
})
