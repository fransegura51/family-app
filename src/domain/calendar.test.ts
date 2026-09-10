import { describe, expect, it } from 'vitest'
import { expandOccurrences } from '@/domain/calendar'

// Hora LOCAL a propósito (10:00): expandOccurrences lee la fecha en hora
// local (bug real: recortar el ISO UTC desplazaba un día). Así el test
// vale igual en Madrid que en el runner de CI (UTC).
function at(y: number, m1: number, d: number): string {
  return new Date(y, m1 - 1, d, 10, 0).toISOString()
}

describe('expandOccurrences', () => {
  it('sin repetición: solo su fecha, y solo si cae en el rango', () => {
    const ev = { startAt: at(2026, 9, 1), recurrenceRule: null }
    expect(expandOccurrences(ev, '2026-09-01', '2026-09-30')).toEqual(['2026-09-01'])
    expect(expandOccurrences(ev, '2026-09-02', '2026-09-30')).toEqual([])
  })

  it('DAILY: cada día del rango a partir del inicio', () => {
    const ev = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=DAILY' }
    expect(expandOccurrences(ev, '2026-09-01', '2026-09-05')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'])
    expect(expandOccurrences(ev, '2026-09-10', '2026-09-12')).toEqual(['2026-09-10', '2026-09-11', '2026-09-12'])
  })

  it('WEEKLY sin BYDAY: cada 7 días; con INTERVAL=2, cada 14', () => {
    const weekly = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=WEEKLY' }
    expect(expandOccurrences(weekly, '2026-09-01', '2026-09-30')).toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'])
    const biweekly = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2' }
    expect(expandOccurrences(biweekly, '2026-09-01', '2026-09-30')).toEqual(['2026-09-01', '2026-09-15', '2026-09-29'])
  })

  it('WEEKLY;BYDAY laborables: cae en cada día marcado, nunca antes del inicio', () => {
    // 2026-09-01 es martes.
    const ev = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' }
    expect(expandOccurrences(ev, '2026-09-01', '2026-09-06')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'])
    // El lunes 31 de agosto es laborable pero anterior al inicio.
    expect(expandOccurrences(ev, '2026-08-31', '2026-09-02')).toEqual(['2026-09-01', '2026-09-02'])
  })

  it('MONTHLY y YEARLY', () => {
    const monthly = { startAt: at(2026, 1, 15), recurrenceRule: 'FREQ=MONTHLY' }
    expect(expandOccurrences(monthly, '2026-01-01', '2026-04-30')).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'])
    const yearly = { startAt: at(2025, 3, 10), recurrenceRule: 'FREQ=YEARLY' }
    expect(expandOccurrences(yearly, '2026-01-01', '2027-12-31')).toEqual(['2026-03-10', '2027-03-10'])
  })

  it('UNTIL corta la serie; exceptionDates y festivos quitan días sueltos', () => {
    const until = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=DAILY;UNTIL=2026-09-03' }
    expect(expandOccurrences(until, '2026-09-01', '2026-09-10')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])

    const withException = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=DAILY', exceptionDates: ['2026-09-02'] }
    expect(expandOccurrences(withException, '2026-09-01', '2026-09-03')).toEqual(['2026-09-01', '2026-09-03'])

    const skipHolidays = { startAt: at(2026, 9, 1), recurrenceRule: 'FREQ=DAILY;SKIPHOLIDAYS=1' }
    expect(expandOccurrences(skipHolidays, '2026-09-01', '2026-09-03', new Set(['2026-09-02']))).toEqual(['2026-09-01', '2026-09-03'])
    // Sin SKIPHOLIDAYS, los festivos no se tocan.
    expect(expandOccurrences({ ...skipHolidays, recurrenceRule: 'FREQ=DAILY' }, '2026-09-01', '2026-09-03', new Set(['2026-09-02']))).toHaveLength(3)
  })
})
