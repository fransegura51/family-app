import { describe, expect, it } from 'vitest'
import { pastelPalette, toPastel, paletteByName, pastelFromHsl, colorForName, colorForClass, storeColorResolver, distinctTagColor, toneFor, solidPalette, solidToneHex } from './colors'

describe('toneFor', () => {
  it('keeps the hue in both styles; vivo is more saturated and darker but never below 58% lightness', () => {
    expect(toneFor('pastel', 200)).toBe('hsl(200, 70%, 90%)')
    expect(toneFor('vivo', 200)).toBe('hsl(200, 80%, 70%)')
    expect(toneFor('vivo', 10, 65, 88)).toBe('hsl(10, 80%, 68%)')
    expect(toneFor('vivo', 10, 50, 72)).toBe('hsl(10, 80%, 58%)')
  })

  it('neutro is a light gray background with a thin stripe of the usual hue', () => {
    const t = toneFor('neutro', 120)
    expect(t).toContain('linear-gradient')
    expect(t).toContain('hsl(120, 65%, 62%)')
    expect(t).toContain('#f3f4f6')
  })

  it('still gives every palette entry a different hue in the vivo style', () => {
    expect(new Set(pastelPalette(20, 'vivo')).size).toBe(20)
  })
})

describe('distinctTagColor', () => {
  it('gives valid, different hex colors for consecutive tags', () => {
    const colors = Array.from({ length: 12 }, (_, i) => distinctTagColor(i))
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(colors).size).toBe(12)
  })
})

// Petición real (categorías del Calendario): "quiero reutilizar la MISMA paleta de los estilos
// globales Pastel/Vivo/Neutro, no una paleta nueva" — pero el color de una categoría se usa en sitios
// que esperan siempre hex plano (readableTextColor en domain/calendar.ts no entiende hsl(...) ni el
// degradado de "neutro"). solidPalette/solidToneHex reutilizan toneFor (la fuente real) y convierten
// su resultado a hex — estos tests comprueban que la conversión es exacta, no solo "parece un color".
describe('solidToneHex / solidPalette', () => {
  it('siempre da hex plano, nunca hsl(...) ni el degradado de neutro, en los tres estilos', () => {
    for (const theme of ['pastel', 'vivo', 'neutro'] as const) {
      for (const h of [0, 90, 180, 270]) {
        expect(solidToneHex(theme, h)).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('pastel: mismo tono que toneFor(\'pastel\', h) convertido a hex exacto', () => {
    // toneFor('pastel', 0) === 'hsl(0, 70%, 90%)' (ver describe('toneFor') arriba) — conversión manual.
    expect(solidToneHex('pastel', 0)).toBe('#f7d4d4')
  })

  it('vivo: mismo tono que toneFor(\'vivo\', h) convertido a hex exacto', () => {
    // toneFor('vivo', 0) === 'hsl(0, 80%, 70%)' — conversión manual.
    expect(solidToneHex('vivo', 0)).toBe('#f07575')
  })

  it('neutro: usa la franja de acento sólida (hsl(h, 65%, 62%)), nunca el degradado completo', () => {
    expect(solidToneHex('neutro', 0)).toBe('#dd5f5f')
    // El acento de "neutro" no depende de s/l (a diferencia de pastel/vivo) — solo del tono.
    expect(solidToneHex('neutro', 120, 10, 10)).toBe(solidToneHex('neutro', 120, 99, 99))
  })

  it('cada estilo global da un color distinto para el mismo índice — el selector refleja de verdad el estilo activo', () => {
    const pastel = solidToneHex('pastel', 40)
    const vivo = solidToneHex('vivo', 40)
    const neutro = solidToneHex('neutro', 40)
    expect(new Set([pastel, vivo, neutro]).size).toBe(3)
  })

  it('solidPalette reparte por el mismo ángulo dorado que pastelPalette (índice 0 = tono 0)', () => {
    expect(solidPalette(1, 'pastel')[0]).toBe(solidToneHex('pastel', 0))
  })

  it('nunca repite un color dentro de una paleta razonable, en ningún estilo', () => {
    for (const theme of ['pastel', 'vivo', 'neutro'] as const) {
      expect(new Set(solidPalette(8, theme)).size).toBe(8)
    }
  })
})

describe('storeColorResolver', () => {
  const stores = [
    { name: 'Mercadona', createdAt: '2026-01-01' },
    { name: 'Hiperber', createdAt: '2026-01-02' },
    { name: 'Aldi', createdAt: '2026-01-03' },
  ]

  it('gives registered stores clearly different colors', () => {
    const colorOf = storeColorResolver(stores)
    const hue = (n: string) => Number(colorOf(n).match(/hsl\((\d+)/)![1])
    const gap = Math.abs(hue('Mercadona') - hue('Hiperber'))
    expect(Math.min(gap, 360 - gap)).toBeGreaterThan(60)
  })

  it('does not change existing colors when a new store is added later', () => {
    const before = storeColorResolver(stores)('Mercadona')
    const after = storeColorResolver([...stores, { name: 'Lidl', createdAt: '2026-02-01' }])('Mercadona')
    expect(after).toBe(before)
  })

  it('spreads many loose stores apart from each other and from the registered ones', () => {
    const loose = ['Amazon', 'Repsol', 'MACRO ASIA', 'Charter', 'ADEO LEROY MERLIN', 'H M-Barcelona', 'C A MODE GMBH', 'E.S. POLIGONO']
    const colorOf = storeColorResolver(stores, loose)
    const hueOf = (c: string) => Number(c.match(/hsl\((\d+)/)![1])
    const all = [...stores.map((s) => s.name), ...loose]
    const hues = all.map((n) => hueOf(colorOf(n)))
    let minGap = 360
    for (let i = 0; i < hues.length; i++)
      for (let j = i + 1; j < hues.length; j++) {
        const gap = Math.abs(hues[i] - hues[j])
        minGap = Math.min(minGap, gap, 360 - gap)
      }
    expect(minGap).toBeGreaterThanOrEqual(20)
    expect(colorOf('repsol ')).toBe(colorOf('Repsol'))
  })

  it('does not depend on the order the loose names arrive in', () => {
    const a = storeColorResolver(stores, ['Amazon', 'Repsol', 'Charter'])
    const b = storeColorResolver(stores, ['Charter', 'Amazon', 'Repsol'])
    for (const n of ['Amazon', 'Repsol', 'Charter']) expect(a(n)).toBe(b(n))
  })

  it('still colors a name it was never told about', () => {
    expect(storeColorResolver(stores)('Repsol')).toBe(colorForName('Repsol'))
  })
})

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
