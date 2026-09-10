import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rangeForPreset, toDateStr } from '@/domain/dateRanges'

describe('rangeForPreset', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Viernes 11 de septiembre de 2026, mediodía local.
    vi.setSystemTime(new Date(2026, 8, 11, 12, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('hoy, esta semana (lunes a domingo) y este año', () => {
    expect(rangeForPreset('dia', '', '')).toEqual(['2026-09-11', '2026-09-11'])
    expect(rangeForPreset('semana', '', '')).toEqual(['2026-09-07', '2026-09-13'])
    expect(rangeForPreset('año', '', '')).toEqual(['2026-01-01', '2026-12-31'])
  })

  it('este mes: calendario normal por defecto', () => {
    expect(rangeForPreset('mes', '', '')).toEqual(['2026-09-01', '2026-09-30'])
  })

  it('este mes con inicio contable: el 25 → del 25 de agosto al 24 de septiembre', () => {
    expect(rangeForPreset('mes', '', '', 25)).toEqual(['2026-08-25', '2026-09-24'])
  })

  it('inicio el 31 se recorta al último día real del mes', () => {
    expect(rangeForPreset('mes', '', '', 31)).toEqual(['2026-08-31', '2026-09-29'])
  })

  it('rango: lo que diga el usuario, y hoy si está vacío', () => {
    expect(rangeForPreset('rango', '2026-01-01', '2026-01-31')).toEqual(['2026-01-01', '2026-01-31'])
    expect(rangeForPreset('rango', '', '')).toEqual(['2026-09-11', '2026-09-11'])
  })

  it('toDateStr usa hora local y rellena con ceros', () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
