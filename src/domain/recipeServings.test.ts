import { describe, expect, it } from 'vitest'
import { servingsFromText } from '@/domain/recipeServings'

describe('raciones desde texto de una fuente — solo lo inequívoco', () => {
  it('«4 raciones» → 4', () => expect(servingsFromText('4 raciones')).toBe(4))
  it('«Para 6 personas» → 6', () => expect(servingsFromText('Para 6 personas')).toBe(6))
  it('«Rinde 8 porciones» → 8', () => expect(servingsFromText('Rinde 8 porciones')).toBe(8))
  it('«Serves 4» → 4 (formato schema.org en inglés)', () => expect(servingsFromText('Serves 4')).toBe(4))
  it('una palabra sin número ("RACIÓN") no es raciones → null', () => expect(servingsFromText('  RACIÓN  ')).toBeNull())
  it('mayúsculas, tildes y espacios sobrantes no cambian el número', () => expect(servingsFromText('  Para   4   Raciones ')).toBe(4))
  it('sin raciones (vacío, null, texto libre) → null', () => {
    expect(servingsFromText(null)).toBeNull()
    expect(servingsFromText(undefined)).toBeNull()
    expect(servingsFromText('')).toBeNull()
    expect(servingsFromText('Fácil y rápida')).toBeNull()
  })
  it('número ambiguo sin palabra de raciones → null (no se asume que son raciones)', () => {
    expect(servingsFromText('4')).toBeNull()
    expect(servingsFromText('12 galletas')).toBeNull()
    expect(servingsFromText('1 molde')).toBeNull()
  })
  it('rangos u opciones → null', () => {
    expect(servingsFromText('4-6 raciones')).toBeNull()
    expect(servingsFromText('2 o 3 personas')).toBeNull()
  })
  it('valores fuera de 1–50 o no enteros → null', () => {
    expect(servingsFromText('0 raciones')).toBeNull()
    expect(servingsFromText('100 raciones')).toBeNull()
    expect(servingsFromText('2,5 raciones')).toBeNull()
  })
})
