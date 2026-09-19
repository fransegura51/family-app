import { describe, expect, it } from 'vitest'
import { pastelPalette, toPastel, paletteByName, pastelFromHsl, colorForName, colorForClass } from './colors'

describe('colorForClass', () => {
  it('is always the same for the same class, regardless of case or accents', () => {
    expect(colorForClass('Lácteos y huevos')).toBe(colorForClass('lacteos Y huevos'))
    expect(colorForClass('Postres')).toMatch(/^hsl\(\d+, (70|74|78)%, (90|85|80)%\)$/)
  })

  it('keeps the same hue as colorForName, only the shade may be stronger', () => {
    const hue = (c: string) => c.match(/hsl\((\d+)/)![1]
    expect(hue(colorForClass('Carne'))).toBe(hue(colorForName('Carne')))
  })
})

describe('colorForName', () => {
  it('gives any name a color, always the same one for the same name', () => {
    expect(colorForName('Repsol')).toBe(colorForName('Repsol'))
    expect(colorForName('Repsol')).toMatch(/^hsl\(\d+, 70%, 90%\)$/)
  })

  it('ignores case, accents and extra spaces', () => {
    expect(colorForName('  MERCADONA ')).toBe(colorForName('Mercadona'))
    expect(colorForName('Panadería')).toBe(colorForName('panaderia'))
  })

  it('does not depend on which other names exist', () => {
    const alone = colorForName('Aldi')
    paletteByName(['Amazon', 'Aldi', 'Zara'])
    expect(colorForName('Aldi')).toBe(alone)
  })
})

describe('pastelPalette', () => {
  it('never repeats a color, however many are requested', () => {
    const palette = pastelPalette(30)
    expect(new Set(palette).size).toBe(30)
  })

  it('returns an empty array for zero', () => {
    expect(pastelPalette(0)).toEqual([])
  })
})

describe('toPastel', () => {
  it('keeps the hue of a saturated color but forces pastel lightness/saturation', () => {
    expect(toPastel('#ff0000')).toBe('hsl(0, 65%, 88%)')
    expect(toPastel('#00ff00')).toBe('hsl(120, 65%, 88%)')
    expect(toPastel('#0000ff')).toBe('hsl(240, 65%, 88%)')
  })

  it('handles 3-digit hex shorthand', () => {
    expect(toPastel('#f00')).toBe('hsl(0, 65%, 88%)')
  })

  it('handles a color already close to gray without crashing', () => {
    expect(toPastel('#808080')).toBe('hsl(0, 65%, 88%)')
  })
})

describe('pastelFromHsl', () => {
  it('keeps the hue of an existing hsl(...) color but forces pastel lightness/saturation', () => {
    expect(pastelFromHsl('hsl(4, 75%, 46%)')).toBe('hsl(4, 65%, 88%)')
    expect(pastelFromHsl('hsl(221, 70%, 56%)')).toBe('hsl(221, 65%, 88%)')
  })
})

describe('paletteByName', () => {
  it('gives the same name the same color regardless of insertion order', () => {
    const a = paletteByName(['Lácteos', 'Carne', 'Fruta'])
    const b = paletteByName(['Fruta', 'Lácteos', 'Carne'])
    expect(a.get('Lácteos')).toBe(b.get('Lácteos'))
    expect(a.get('Carne')).toBe(b.get('Carne'))
    expect(a.get('Fruta')).toBe(b.get('Fruta'))
  })

  it('de-duplicates repeated names', () => {
    const map = paletteByName(['Pan', 'Pan', 'Leche'])
    expect(map.size).toBe(2)
  })

  it('never assigns the same color to two different names', () => {
    const map = paletteByName(['A', 'B', 'C', 'D', 'E'])
    expect(new Set(map.values()).size).toBe(5)
  })
})
