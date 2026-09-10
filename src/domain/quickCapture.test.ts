import { describe, expect, it } from 'vitest'
import { splitEntries } from '@/domain/quickCapture'

describe('splitEntries', () => {
  it('"leche, patata y huevo" son tres apuntes, no uno', () => {
    expect(splitEntries('leche, patata y huevo')).toEqual(['leche', 'patata', 'huevo'])
  })
  it('separa por comas, por " y " y por las dos mezcladas; ignora huecos', () => {
    expect(splitEntries('pan,  agua , y aceite')).toEqual(['pan', 'agua', 'aceite'])
    expect(splitEntries('  ')).toEqual([])
  })
  it('una "y" dentro de una palabra no corta ("yogur", "Mayte")', () => {
    expect(splitEntries('yogur y mayonesa')).toEqual(['yogur', 'mayonesa'])
    expect(splitEntries('regalo para Mayte')).toEqual(['regalo para Mayte'])
  })
})
