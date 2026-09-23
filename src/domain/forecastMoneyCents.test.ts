import { describe, expect, it } from 'vitest'
import { centsToEurosString, checkCentsDistribution, distributeTotalCentsEvenly, eurosStringToCents } from './forecastMoneyCents'

describe('eurosStringToCents / centsToEurosString', () => {
  it('convierte ida y vuelta sin error de punto flotante', () => {
    expect(eurosStringToCents('867.56')).toBe(86756)
    expect(eurosStringToCents('144.59')).toBe(14459)
    expect(centsToEurosString(86756)).toBe('867.56')
  })

  it('vacío o no numérico -> null', () => {
    expect(eurosStringToCents('')).toBeNull()
    expect(eurosStringToCents('  ')).toBeNull()
    expect(eurosStringToCents('abc')).toBeNull()
  })

  it('Math.round evita el clásico error de flotante (0.1+0.2)', () => {
    expect(eurosStringToCents('0.1')).toBe(10)
    expect(eurosStringToCents('0.29')).toBe(29)
  })
})

describe('distributeTotalCentsEvenly — CASO REAL: 867,56 € entre 6 pagos', () => {
  it('86756 céntimos / 6 = base 14459, resto entero a la última', () => {
    const amounts = distributeTotalCentsEvenly(86756, 6)
    expect(amounts).toEqual([14459, 14459, 14459, 14459, 14459, 14461])
  })

  it('la suma de las 6 líneas es EXACTAMENTE el total, siempre', () => {
    const amounts = distributeTotalCentsEvenly(86756, 6)
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(86756)
  })

  it('total divisible exactamente entre N: todas las líneas iguales', () => {
    expect(distributeTotalCentsEvenly(84600, 6)).toEqual([14100, 14100, 14100, 14100, 14100, 14100]) // 846 € / 6 = 141 € exactos (caso IBI original de 1D-b)
  })

  it('total con resto no divisible', () => {
    expect(distributeTotalCentsEvenly(100, 3)).toEqual([33, 33, 34])
    expect(distributeTotalCentsEvenly(100, 3).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('1 sola cuota: se lleva el total entero', () => {
    expect(distributeTotalCentsEvenly(86756, 1)).toEqual([86756])
  })

  it('rechaza count inválido', () => {
    expect(() => distributeTotalCentsEvenly(100, 0)).toThrow()
    expect(() => distributeTotalCentsEvenly(100, -1)).toThrow()
    expect(() => distributeTotalCentsEvenly(100, 2.5)).toThrow()
  })
})

describe('checkCentsDistribution', () => {
  it('coincide exactamente: matches=true, diferencia 0', () => {
    const check = checkCentsDistribution(86756, [14459, 14459, 14459, 14459, 14459, 14461])
    expect(check).toEqual({ totalCents: 86756, distributedCents: 86756, differenceCents: 0, matches: true })
  })

  it('diferencia positiva: falta por repartir', () => {
    const check = checkCentsDistribution(86756, [14454, 14454, 14454, 14453, 14454, 14454]) // el usuario aún no ha corregido la última línea
    expect(check.matches).toBe(false)
    expect(check.differenceCents).toBe(86756 - (14454 * 4 + 14453 + 14454))
    expect(check.differenceCents).toBeGreaterThan(0)
  })

  it('diferencia negativa: se ha repartido de más', () => {
    const check = checkCentsDistribution(100, [60, 60])
    expect(check.matches).toBe(false)
    expect(check.differenceCents).toBe(-20)
  })

  it('unknown (null) nunca cuenta como 0 céntimos aportados, pero tampoco rompe el cálculo', () => {
    const check = checkCentsDistribution(86756, [14459, 14459, null, 14459, 14459, 14461])
    expect(check.distributedCents).toBe(14459 * 4 + 14461)
    expect(check.matches).toBe(false)
  })

  it('CASO REAL con los importes reales del IBI (144,54×5 con un 144,53 + 145,87 = 868,56 €, no 867,56 € como se dijo inicialmente)', () => {
    // Nota: la suma real de los 6 importes proporcionados es 868,56 €, no "867,56 €" — se usan los
    // importes individuales como verdad (instrucción explícita) y se calcula el total a partir de ellos.
    const lineEuros = [144.54, 144.54, 144.54, 144.53, 144.54, 145.87]
    const lineCents = lineEuros.map((e) => eurosStringToCents(String(e)))
    const totalCents = lineCents.reduce((a: number, b) => a + (b ?? 0), 0)
    expect(totalCents).toBe(86856) // 868,56 €
    const check = checkCentsDistribution(totalCents, lineCents)
    expect(check.matches).toBe(true)
  })
})
