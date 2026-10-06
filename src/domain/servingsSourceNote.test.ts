import { describe, expect, it } from 'vitest'
import { servingsSourceNote } from '@/domain/servingsSourceNote'
import { servingsFromSource } from '@/domain/recipeServings'

const SOURCE = '6-7 personas'
const PROPOSED = servingsFromSource(SOURCE)!.servings // 6,5

const src = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const ALIM = src('src/ui/AlimentacionScreen.tsx')

describe('texto de la revisión según el valor ACTUAL de Raciones', () => {
  it('1. sin editar: 6,5 con «punto medio del rango»', () => {
    expect(servingsSourceNote(SOURCE, PROPOSED, PROPOSED)).toBe(
      'Fuente: «6-7 personas». PEPA calculará con 6,5 (punto medio del rango). Puedes cambiarlo antes de guardar.',
    )
  })

  it('2. el usuario cambia a 7: muestra 7 y «valor que has corregido tú» (no 6,5)', () => {
    const text = servingsSourceNote(SOURCE, PROPOSED, 7)
    expect(text).toBe('Fuente: «6-7 personas». PEPA calculará con 7 (valor que has corregido tú). Puedes cambiarlo antes de guardar.')
    expect(text).not.toContain('6,5')
  })

  it('3. cambia a 6: muestra 6', () => {
    expect(servingsSourceNote(SOURCE, PROPOSED, 6)).toContain('PEPA calculará con 6 (valor que has corregido tú).')
  })

  it('4. cambia a 7,5: muestra 7,5 con coma decimal', () => {
    expect(servingsSourceNote(SOURCE, PROPOSED, 7.5)).toContain('PEPA calculará con 7,5 (valor que has corregido tú).')
  })

  it('5. en todos los casos la fuente sigue siendo exactamente «6-7 personas»', () => {
    for (const current of [PROPOSED, 6, 7, 7.5, null]) {
      expect(servingsSourceNote(SOURCE, PROPOSED, current)).toContain('Fuente: «6-7 personas».')
    }
  })

  it('volver a escribir el punto medio cuenta como valor propuesto, no como corrección', () => {
    expect(servingsSourceNote(SOURCE, PROPOSED, 6.5)).toContain('(punto medio del rango)')
  })

  it('campo vacío: no inventa un número; avisa de que no hay raciones para escalar', () => {
    const text = servingsSourceNote(SOURCE, PROPOSED, null)
    expect(text).toBe('Fuente: «6-7 personas». Sin raciones: PEPA no podrá escalar esta receta.')
    expect(text).not.toMatch(/calculará con \d/)
  })
})

describe('el valor guardado es el valor ACTUAL del campo, no el punto medio original', () => {
  it('6. la confirmación usa servingsNow (valor actual) y la fuente se guarda sin cambios', () => {
    expect(ALIM).toContain('const servingsValue = servingsNow')
    expect(ALIM).toContain('servings: servingsValue, servingsSource: servingsValue === null ? null : servingsSource')
  })

  it('la revisión llama a la función con el valor actual del campo, no con sourceValue', () => {
    expect(ALIM).toContain('servingsSourceNote(servingsSource, sourceValue, Number.isFinite(servingsNow) ? servingsNow : null)')
    expect(ALIM).not.toMatch(/PEPA calculará con \{String\(sourceValue\)/)
  })

  it('ninguna edición escribe en servingsSource', () => {
    const onChange = ALIM.slice(ALIM.indexOf('onChange={(e) => setServingsText'), ALIM.indexOf('onChange={(e) => setServingsText') + 60)
    expect(onChange).not.toContain('setServingsSource')
  })
})
