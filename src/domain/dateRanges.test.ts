import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accountingMonthRange, accountingMonthsBack, rangeForPreset, toDateStr } from '@/domain/dateRanges'

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

describe('accountingMonthsBack', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Viernes 11 de septiembre de 2026, mediodía local.
    vi.setSystemTime(new Date(2026, 8, 11, 12, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('mes de calendario (día 1): del más antiguo al más reciente, el actual incluido', () => {
    const periods = accountingMonthsBack(3, 1)
    expect(periods.map((p) => [p.from, p.to])).toEqual([
      ['2026-07-01', '2026-07-31'],
      ['2026-08-01', '2026-08-31'],
      ['2026-09-01', '2026-09-30'],
    ])
    expect(periods[2]).toMatchObject({ monthLabelYear: 2026, monthLabelMonth0: 8 })
  })

  it('inicio contable el 25: hoy (11 sept) cae antes del 25, así que "este mes" es 25 ago–24 sep', () => {
    const periods = accountingMonthsBack(2, 25)
    expect(periods.map((p) => [p.from, p.to])).toEqual([
      ['2026-07-25', '2026-08-24'],
      ['2026-08-25', '2026-09-24'],
    ])
  })

  it('inicio el 31 se recorta al último día real de cada mes', () => {
    const periods = accountingMonthsBack(2, 31)
    expect(periods.map((p) => [p.from, p.to])).toEqual([
      ['2026-07-31', '2026-08-30'],
      ['2026-08-31', '2026-09-29'],
    ])
  })
})

describe('accountingMonthRange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Viernes 11 de septiembre de 2026, mediodía local.
    vi.setSystemTime(new Date(2026, 8, 11, 12, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('offset 0 es el mes actual; navega hacia atrás y hacia delante', () => {
    expect(accountingMonthRange(1, 0)).toMatchObject({ from: '2026-09-01', to: '2026-09-30' })
    expect(accountingMonthRange(1, -1)).toMatchObject({ from: '2026-08-01', to: '2026-08-31' })
    expect(accountingMonthRange(1, 1)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('respeta el mismo día de inicio contable que rangeForPreset/accountingMonthsBack', () => {
    expect(accountingMonthRange(25, 0)).toMatchObject({ from: '2026-08-25', to: '2026-09-24' })
  })

  it('es la misma pieza que arma accountingMonthsBack (equivalente a offset negativo)', () => {
    const back = accountingMonthsBack(3, 1)
    expect(accountingMonthRange(1, -2)).toMatchObject({ from: back[0].from, to: back[0].to })
    expect(accountingMonthRange(1, 0)).toMatchObject({ from: back[2].from, to: back[2].to })
  })
})
