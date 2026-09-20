import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { comparablePrevious, parsePeriodText, resolvePeriod } from './financePeriod'

// Hoy = domingo 20 de septiembre de 2026 (los meses contables se calculan con el reloj del sistema).
const TODAY = new Date(2026, 8, 20)
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

const resolve = (text: string, startDay = 1) => {
  const m = parsePeriodText(text, TODAY)
  return m ? resolvePeriod(m.spec, TODAY, startDay) : null
}

describe('periodos habituales', () => {
  it('hoy / ayer', () => {
    expect(resolve('hoy')).toMatchObject({ from: '2026-09-20', to: '2026-09-20', label: 'hoy' })
    expect(resolve('ayer')).toMatchObject({ from: '2026-09-19', to: '2026-09-19', label: 'ayer' })
  })
  it('esta semana / semana pasada (lunes a domingo)', () => {
    expect(resolve('esta semana')).toMatchObject({ from: '2026-09-14', to: '2026-09-20' })
    expect(resolve('la semana pasada')).toMatchObject({ from: '2026-09-07', to: '2026-09-13' })
  })
  it('este mes / mes pasado', () => {
    expect(resolve('este mes')).toMatchObject({ from: '2026-09-01', to: '2026-09-30', ongoing: true })
    expect(resolve('el mes pasado')).toMatchObject({ from: '2026-08-01', to: '2026-08-31', ongoing: false })
  })
  it('este año / año pasado', () => {
    expect(resolve('este año')).toMatchObject({ from: '2026-01-01', to: '2026-12-31' })
    expect(resolve('el año pasado')).toMatchObject({ from: '2025-01-01', to: '2025-12-31' })
  })
  it('desde junio / desde enero', () => {
    expect(resolve('desde junio')).toMatchObject({ from: '2026-06-01', to: '2026-09-20', label: 'desde junio' })
    expect(resolve('desde enero')).toMatchObject({ from: '2026-01-01' })
  })
  it('desde un mes futuro: el del año pasado, y se dice el año', () => {
    expect(resolve('desde diciembre')).toMatchObject({ from: '2025-12-01', label: 'desde diciembre de 2025' })
  })
  it('últimos 30 días / 3 meses / 2 semanas', () => {
    expect(resolve('los ultimos 30 dias')).toMatchObject({ from: '2026-08-22', to: '2026-09-20' })
    expect(resolve('ultimos 3 meses')).toMatchObject({ from: '2026-07-01', to: '2026-09-20' })
    expect(resolve('ultimas dos semanas')).toMatchObject({ from: '2026-09-07', to: '2026-09-20' })
  })
})

describe('meses concretos', () => {
  it('"agosto" en septiembre es agosto de este año', () => {
    expect(resolve('cuanto gastamos en agosto')).toMatchObject({ from: '2026-08-01', to: '2026-08-31', label: 'agosto' })
  })
  it('el mes actual por su nombre', () => {
    expect(resolve('en septiembre')).toMatchObject({ from: '2026-09-01', to: '2026-09-30', ongoing: true })
  })
  it('un mes que aún no ha llegado se entiende del año pasado y se dice', () => {
    expect(resolve('en diciembre')).toMatchObject({ from: '2025-12-01', label: 'diciembre de 2025' })
  })
  it('con el año dicho', () => {
    expect(resolve('en marzo de 2025')).toMatchObject({ from: '2025-03-01', to: '2025-03-31', label: 'marzo de 2025' })
  })
})

describe('mes contable con día de inicio', () => {
  it('"este mes" respeta el día de inicio configurado, como Economía', () => {
    // Con inicio el día 25 y hoy 20/09, el mes contable en curso empezó el 25/08.
    expect(resolve('este mes', 25)).toMatchObject({ from: '2026-08-25', to: '2026-09-24' })
    expect(resolve('el mes pasado', 25)).toMatchObject({ from: '2026-07-25', to: '2026-08-24' })
  })
})

describe('sin periodo dicho', () => {
  it('no inventa: devuelve null', () => {
    expect(parsePeriodText('cuanto hemos gastado', TODAY)).toBeNull()
    expect(parsePeriodText('el otro dia', TODAY)).toBeNull()
  })
  it('devuelve lo que queda de la frase sin el periodo', () => {
    expect(parsePeriodText('cuanto gastamos en alimentacion este mes', TODAY)?.rest).toBe('cuanto gastamos en alimentacion')
  })
})

describe('regla de corte (comparar el mismo tramo)', () => {
  it('este mes a día 20: 1-20 contra 1-20 del mes anterior', () => {
    const period = resolve('este mes')!
    const cp = comparablePrevious(period, TODAY, 1)
    expect(cp.cutoff).toBe(true)
    expect(cp.current).toEqual({ from: '2026-09-01', to: '2026-09-20' })
    expect(cp.previous).toEqual({ from: '2026-08-01', to: '2026-08-20' })
  })
  it('con "completo" se comparan meses enteros', () => {
    const cp = comparablePrevious(resolve('este mes')!, TODAY, 1, true)
    expect(cp.cutoff).toBe(false)
    expect(cp.current).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(cp.previous).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })
  it('un mes ya cerrado se compara entero con el anterior', () => {
    const cp = comparablePrevious(resolve('el mes pasado')!, TODAY, 1)
    expect(cp.cutoff).toBe(false)
    expect(cp.previous).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })
  it('un tramo corto del mes anterior nunca se pasa de su fin', () => {
    const feb = new Date(2026, 2, 31)
    vi.setSystemTime(feb)
    const cp = comparablePrevious(resolvePeriod({ t: 'month', offset: 0 }, feb, 1), feb, 1)
    expect(cp.previous.to).toBe('2026-02-28')
  })
})
