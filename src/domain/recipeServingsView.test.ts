import { describe, expect, it } from 'vitest'
import { recipeServingsView } from '@/domain/recipeServingsView'

const src = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const ALIM = src('src/ui/AlimentacionScreen.tsx')

describe('ficha de la receta: qué se muestra de las raciones', () => {
  it('1. servings = 4, sin fuente → «Raciones: 4» y sin «Fuente original»', () => {
    expect(recipeServingsView(4, null)).toEqual({ value: '4', source: null })
  })

  it('2. servings = 6,5 con fuente «6-7 personas» → 6,5 en coma decimal y la fuente original', () => {
    expect(recipeServingsView(6.5, '6-7 personas')).toEqual({ value: '6,5', source: '6-7 personas' })
  })

  it('3. servings = 7 con fuente «6-7 personas» (corregida) → «7» y la fuente se conserva', () => {
    expect(recipeServingsView(7, '6-7 personas')).toEqual({ value: '7', source: '6-7 personas' })
  })

  it('4. servings = null → nada que mostrar (ni fila vacía, ni «desconocidas»)', () => {
    expect(recipeServingsView(null, null)).toBeNull()
    expect(recipeServingsView(undefined, null)).toBeNull()
    expect(recipeServingsView(null, '6-7 personas')).toBeNull()
  })

  it('servings_source vacío o nulo nunca produce «Fuente original»', () => {
    expect(recipeServingsView(4, '')).toEqual({ value: '4', source: null })
    expect(recipeServingsView(4, undefined)).toEqual({ value: '4', source: null })
  })

  it('no inventa ni modifica el valor: solo cambia el separador decimal', () => {
    expect(recipeServingsView(8, '6-7 personas')?.value).toBe('8')
  })
})

describe('la ficha muestra las raciones antes de «Ingredientes» y solo si hay dato', () => {
  it('se usa la función de presentación con los dos campos de la receta', () => {
    expect(ALIM).toContain('recipeServingsView(viewing.servings, viewing.servingsSource)')
  })

  it('el bloque de raciones aparece antes del bloque de ingredientes del visor', () => {
    const raciones = ALIM.indexOf('recipeServingsView(viewing.servings')
    const ingredientes = ALIM.indexOf('{viewing.ingredients.length > 0 && (')
    expect(raciones).toBeGreaterThan(-1)
    expect(ingredientes).toBeGreaterThan(raciones)
  })

  it('la fuente original se pinta solo cuando existe', () => {
    expect(ALIM).toContain('{view.source && (')
    expect(ALIM).toContain('Fuente original: {view.source}')
  })

  it('sin raciones no se pinta ninguna fila', () => {
    expect(ALIM).toContain(': null\n            })()}')
  })
})

describe('edición: el formulario recibe raciones y fuente, y guardar conserva la fuente', () => {
  it('el botón ✏️ abre el formulario con la receta completa (incluye servings y servingsSource)', () => {
    expect(ALIM).toContain('onClick={() => setEditing(viewing)}')
    expect(ALIM).toContain('recipe={editing}')
  })

  it('el formulario carga las raciones y la fuente de la receta', () => {
    expect(ALIM).toContain("useState(recipe?.servings ? String(recipe.servings) : '')")
    expect(ALIM).toContain('useState<string | null>(recipe?.servingsSource ?? null)')
  })

  it('guardar sin cambiar Raciones conserva la fuente: se envía el estado tal cual', () => {
    expect(ALIM).toContain('servings: servingsValue, servingsSource')
  })

  it('cambiar Raciones no escribe en la fuente y la edición nunca recalcula raciones desde la fuente', () => {
    const onChange = ALIM.slice(ALIM.indexOf('onChange={(e) => setServingsText'), ALIM.indexOf('onChange={(e) => setServingsText') + 60)
    expect(onChange).not.toContain('setServingsSource')
    const fromSource = ALIM.split('\n').filter((l) => l.includes('setServingsText(') && l.includes('sourceValue'))
    expect(fromSource).toEqual([])
  })

  it('la actualización escribe servings_source junto a servings, y no lo borra al editar otros campos', () => {
    const food = src('src/data/food.ts')
    expect(food).toContain('servings_source: input.servingsSource ?? null')
  })
})
