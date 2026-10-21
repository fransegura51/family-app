import { describe, expect, it } from 'vitest'
import { ageLabel, birthDateLine } from '@/domain/memberBirthLabel'

describe('edad en la ficha', () => {
  it('años cumplidos, contando el día del cumpleaños', () => {
    expect(ageLabel('2018-10-21', '2026-10-21')).toBe('8 años')
    expect(ageLabel('2018-10-22', '2026-10-21')).toBe('7 años')
    expect(ageLabel('2025-10-21', '2026-10-21')).toBe('1 año')
  })
  it('menores de un año: meses', () => {
    expect(ageLabel('2026-05-10', '2026-10-21')).toBe('5 meses')
    expect(ageLabel('2026-09-21', '2026-10-21')).toBe('1 mes')
    expect(ageLabel('2026-10-10', '2026-10-21')).toBe('recién nacido/a')
  })
  it('fecha futura o rara: sin edad', () => {
    expect(ageLabel('2030-01-01', '2026-10-21')).toBeNull()
    expect(ageLabel('hola', '2026-10-21')).toBeNull()
  })
  it('línea de la ficha', () => {
    expect(birthDateLine('1985-03-12', '2026-10-21')).toBe('🎂 12/03/1985 (41 años)')
    expect(birthDateLine(null, '2026-10-21')).toBeNull()
  })
})
