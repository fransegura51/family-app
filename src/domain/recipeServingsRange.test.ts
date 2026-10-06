import { describe, expect, it } from 'vitest'
import { isValidServings, servingsFromSource } from '@/domain/recipeServings'
import { parseWikibooksRecipe } from '@/domain/wikibooksRecipeParser'
import { scaleIngredientQuantity } from '@/domain/recipeScaling'

const src = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const ALIM = src('src/ui/AlimentacionScreen.tsx')
const FOOD = src('src/data/food.ts')
const URL_CLIENT = src('src/services/recipeUrlImport.ts')
const PEPA_ACTIONS = src('src/pepa/actions/recipeActions.ts')
const MIG = (import.meta.glob('/supabase/migrations/0201_recipe_servings_halves_and_source.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/migrations/0201_recipe_servings_halves_and_source.sql']

const wikitext = (params: string) => `{{Artes culinarias/Datos de receta|${params}}}\n== Ingredientes ==\n* 1 kg de pulpo\n== Procedimiento ==\n# Cocer.`

describe('rangos reconocidos → punto medio, con el texto original como fuente', () => {
  it('1. «6-7 personas» → 6,5, fuente «6-7 personas»', () => {
    expect(servingsFromSource('6-7 personas')).toEqual({ servings: 6.5, servingsSource: '6-7 personas' })
  })
  it('2. «6–7 personas» (guion largo) → 6,5', () => {
    expect(servingsFromSource('6–7 personas')?.servings).toBe(6.5)
  })
  it('3. «6 - 7 personas» → 6,5', () => {
    expect(servingsFromSource('6 - 7 personas')?.servings).toBe(6.5)
  })
  it('4. «6 a 7 personas» → 6,5', () => {
    expect(servingsFromSource('6 a 7 personas')?.servings).toBe(6.5)
  })
  it('5. «entre 6 y 7 personas» → 6,5', () => {
    expect(servingsFromSource('entre 6 y 7 personas')).toEqual({ servings: 6.5, servingsSource: 'entre 6 y 7 personas' })
  })
  it('6. «4-6 raciones» → 5', () => {
    expect(servingsFromSource('4-6 raciones')).toEqual({ servings: 5, servingsSource: '4-6 raciones' })
  })
  it('7. «8-10 personas» → 9', () => {
    expect(servingsFromSource('8-10 personas')?.servings).toBe(9)
  })
  it('también «porciones», «comensales» y prefijo «para»', () => {
    expect(servingsFromSource('4-6 porciones')?.servings).toBe(5)
    expect(servingsFromSource('6-8 comensales')?.servings).toBe(7)
    expect(servingsFromSource('Para 6-7 personas')?.servings).toBe(6.5)
  })
})

describe('valores exactos → sin fuente de rango', () => {
  it('8. «4 personas» → 4, sin texto de rango', () => {
    expect(servingsFromSource('4 personas')).toEqual({ servings: 4, servingsSource: null })
  })
  it('9. «4 raciones» → 4', () => {
    expect(servingsFromSource('4 raciones')).toEqual({ servings: 4, servingsSource: null })
  })
})

describe('lo que NO se interpreta como raciones', () => {
  it('10. «20-30 minutos» → null', () => expect(servingsFromSource('20-30 minutos')).toBeNull())
  it('11. «200-250 g» → null', () => expect(servingsFromSource('200-250 g')).toBeNull())
  it('12. «6-7 huevos» → null', () => expect(servingsFromSource('6-7 huevos')).toBeNull())
  it('180-200 ºC → null', () => expect(servingsFromSource('180-200 ºC')).toBeNull())
  it('13. sin raciones → null', () => {
    expect(servingsFromSource(null)).toBeNull()
    expect(servingsFromSource('')).toBeNull()
    expect(servingsFromSource('Fácil y rápida')).toBeNull()
  })
  it('número ambiguo sin palabra de raciones → null', () => {
    expect(servingsFromSource('4')).toBeNull()
    expect(servingsFromSource('6-7')).toBeNull()
  })
  it('«6 y 7 personas» sin «entre» no es un rango inequívoco → null', () => {
    expect(servingsFromSource('6 y 7 personas')).toBeNull()
  })
  it('rangos vacíos o invertidos → null', () => {
    expect(servingsFromSource('7-6 personas')).toBeNull()
    expect(servingsFromSource('6-6 personas')).toBeNull()
    expect(servingsFromSource('0-2 personas')).toBeNull()
  })
})

describe('valores válidos: entero o medio punto entre 1 y 50', () => {
  it('admite 6,5 y rechaza 6,25, 0, 51 y valores no numéricos', () => {
    expect(isValidServings(6.5)).toBe(true)
    expect(isValidServings(4)).toBe(true)
    expect(isValidServings(6.25)).toBe(false)
    expect(isValidServings(0)).toBe(false)
    expect(isValidServings(51)).toBe(false)
    expect(isValidServings(null)).toBe(false)
    expect(isValidServings(NaN)).toBe(false)
  })
})

describe('Wikibooks — parámetro explícito con rango', () => {
  it('14. raciones = 6-7 → 6,5 con la fuente «6-7 raciones»', () => {
    const parsed = parseWikibooksRecipe('Artes culinarias/Recetas/Pulpo', wikitext('raciones = 6-7'))
    expect(parsed.servings).toBe(6.5)
    expect(parsed.servingsSource).toBe('6-7 raciones')
  })
  it('raciones = 4 → 4, sin fuente de rango', () => {
    const parsed = parseWikibooksRecipe('Artes culinarias/Recetas/Pulpo', wikitext('raciones = 4'))
    expect(parsed.servings).toBe(4)
    expect(parsed.servingsSource).toBeNull()
  })
  it('sin parámetro de raciones → null', () => {
    expect(parseWikibooksRecipe('Artes culinarias/Recetas/Pulpo', wikitext('ingredientes = x')).servings).toBeNull()
  })
})

describe('URL — recipeYield se interpreta con el mismo parser', () => {
  it('14b. recipeYield «6-7 personas» → 6,5 y fuente', () => {
    expect(servingsFromSource('6-7 personas')).toEqual({ servings: 6.5, servingsSource: '6-7 personas' })
  })
  it('el cliente usa servingsFromSource para servings y servingsSource', () => {
    expect(URL_CLIENT).toContain("servingsFromSource(typeof json.recipeYield === 'string' ? json.recipeYield : null)")
    expect(URL_CLIENT).toContain('servingsSource:')
  })
})

describe('revisión: corregible, con la fuente visible y sin presentar 6,5 como dato de la fuente', () => {
  it('16. el campo Raciones acepta medios puntos (step 0,5) y se puede modificar antes de guardar', () => {
    expect(ALIM).toContain('step={0.5}')
    expect(ALIM).toContain('onChange={(e) => setServingsText(e.target.value)}')
  })
  it('la revisión muestra «Fuente» con el texto original y explica que PEPA usa el punto medio', () => {
    expect(ALIM).toContain('servingsSourceNote(servingsSource, sourceValue')
    expect(ALIM).not.toMatch(/6,5 personas/)
  })
  it('si el usuario corrige el valor, la revisión lo indica y el texto de la fuente no cambia', () => {
    expect(ALIM).toContain('servingsNow')
    const onChange = ALIM.slice(ALIM.indexOf('onChange={(e) => setServingsText'), ALIM.indexOf('onChange={(e) => setServingsText') + 60)
    expect(onChange).not.toContain('setServingsSource')
  })
  it('nunca se recalculan las raciones desde la fuente tras una edición: solo al importar', () => {
    const calls = ALIM.match(/setServingsText\(/g) ?? []
    // Una vez en el campo (edición manual), una al importar (useFoundRecipe), una al inicializar la pantalla.
    expect(calls.length).toBeLessThanOrEqual(3)
    const fromSource = ALIM.split('\n').filter((l) => l.includes('setServingsText(') && l.includes('sourceValue'))
    expect(fromSource).toEqual([])
  })
})

describe('guardar: solo al confirmar, con raciones y fuente juntas', () => {
  it('17. cancelar no llama a createRecipe ni updateRecipe (solo el envío lo hace)', () => {
    expect(ALIM.match(/createRecipe\(input\)/g)?.length).toBe(1)
    expect(ALIM.match(/updateRecipe\(recipe\.id, input\)/g)?.length).toBe(1)
  })
  it('18. confirmar envía servings y servingsSource; sin raciones la fuente no se guarda', () => {
    expect(ALIM).toContain('servings: servingsValue, servingsSource }')
  })
  it('createRecipe y updateRecipe escriben servings_source junto a servings; nunca fuente sin raciones', () => {
    expect(FOOD).toContain('servings_source: input.servingsSource ?? null,')
    expect(FOOD).toContain('servings_source: input.servingsSource ?? null } : {})')
  })
  it('la lectura de recetas trae la fuente', () => {
    expect(FOOD).toContain('servings, servings_source, recipe_ingredients')
    expect(FOOD).toContain('servingsSource: r.servings_source ?? null')
  })
  it('la longitud de la fuente se limita a 60 caracteres (y la base de datos lo repite)', () => {
    expect(MIG).toContain('char_length(servings_source) <= 60')
  })
})

describe('escalado con 6,5 raciones: factor exacto, sin redondear el factor', () => {
  it('19. 10 comensales / 6,5 raciones: 1,5 kg → 1,5 × 10 / 6,5 (no 10/6 ni 10/7)', () => {
    const result = scaleIngredientQuantity('1,5', 'kg', 6.5, 10)
    expect(result.scaled).toBe(true)
    expect(result.value).toBeCloseTo((1.5 * 10) / 6.5, 12)
    expect(result.value).not.toBeCloseTo((1.5 * 10) / 6, 3)
    expect(result.value).not.toBeCloseTo((1.5 * 10) / 7, 3)
  })
  it('cantidades desconocidas siguen desconocidas con raciones decimales', () => {
    expect(scaleIngredientQuantity(null, 'g', 6.5, 10)).toMatchObject({ value: null, scaled: false, reason: 'cantidad_no_numerica' })
  })
})

describe('migración 0201 y recetas antiguas', () => {
  it('cambia el tipo a numeric(4,1), restricción de medios puntos y columna de fuente', () => {
    expect(MIG).toContain('alter column servings type numeric(4,1)')
    expect(MIG).toContain('servings * 2 = floor(servings * 2)')
    expect(MIG).toContain('add column servings_source text null')
  })
  it('21. sin backfill: la migración no actualiza filas de recetas', () => {
    const code = MIG.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(code).not.toMatch(/\bupdate\s+recipes\b/i)
    expect(code).not.toMatch(/\bdelete\b/i)
  })
  it('el borrador de IA valida con la misma regla (entero o medio punto)', () => {
    expect(PEPA_ACTIONS).toContain('!isValidServings(rec.servings)')
  })
})
