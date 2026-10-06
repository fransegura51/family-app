import { describe, expect, it } from 'vitest'
import { parseWikibooksRecipe } from '@/domain/wikibooksRecipeParser'

// Importación de raciones (2.ª tanda de Recetas): lo inequívoco se propone; lo demás queda en null.
const src = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const ALIM = src('src/ui/AlimentacionScreen.tsx')
const FOOD = src('src/data/food.ts')
const PEPA_ACTIONS = src('src/pepa/actions/recipeActions.ts')
const URL_CLIENT = src('src/services/recipeUrlImport.ts')
const EDGE = (import.meta.glob('/supabase/functions/import-recipe-url/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/functions/import-recipe-url/index.ts']

const wikitext = (params: string) => `{{Artes culinarias/Datos de receta|${params}}}\n== Ingredientes ==\n* 1 kg de pulpo\n== Procedimiento ==\n# Cocer.`

describe('Wikibooks — raciones desde la plantilla', () => {
  it('«raciones = 4» → 4 (el nombre del parámetro dice que son raciones)', () => {
    expect(parseWikibooksRecipe('Artes culinarias/Recetas/Pulpo', wikitext('ingredientes = x|raciones = 4')).servings).toBe(4)
  })
  it('«personas = 6 personas» → 6', () => {
    expect(parseWikibooksRecipe('Artes culinarias/Recetas/Pulpo', wikitext('personas = 6 personas')).servings).toBe(6)
  })
  it('sin parámetro de raciones → null (nunca 0, nunca deducido)', () => {
    expect(parseWikibooksRecipe('Artes culinarias/Recetas/Pulpo', wikitext('ingredientes = x')).servings).toBeNull()
  })
  it('rango «4-6» → punto medio 5 (el nombre del parámetro da el contexto)', () => {
    expect(parseWikibooksRecipe('Artes culinarias/Recetas/Pulpo', wikitext('raciones = 4-6')).servings).toBe(5)
  })
  it('sin plantilla (secciones normales) → null', () => {
    expect(parseWikibooksRecipe('Artes culinarias/Recetas/Pulpo', '== Ingredientes ==\n* 1 kg de pulpo\n== Preparación ==\n# Cocer.').servings).toBeNull()
  })
  it('el texto de ingredientes y pasos no cambia por leer las raciones', () => {
    const parsed = parseWikibooksRecipe('Artes culinarias/Recetas/Pulpo', wikitext('raciones = 4'))
    expect(parsed.ingredients).toEqual(['1 kg de pulpo'])
    expect(parsed.steps).toEqual(['Cocer.'])
  })
})

describe('revisión antes de guardar — las raciones se rellenan y son editables', () => {
  it('al usar un resultado importado, las raciones de la fuente pasan al campo solo si existen', () => {
    const fn = ALIM.slice(ALIM.indexOf('function useFoundRecipe()'), ALIM.indexOf('setFound(null)', ALIM.indexOf('function useFoundRecipe()')))
    expect(fn).toContain('if (found.servings !== null) {')
    expect(fn).toContain('setServingsText(String(found.servings))')
    expect(fn).toContain('setServingsSource(found.servingsSource ?? null)')
  })

  it('el campo Raciones es editable (onChange) y se muestra antes de guardar', () => {
    expect(ALIM).toContain('aria-label="Raciones"')
    expect(ALIM).toMatch(/aria-label="Raciones"[^>]*/)
    expect(ALIM).toContain('onChange={(e) => setServingsText(e.target.value)}')
  })

  it('cada importador pasa servings al resultado: URL, candidato de búsqueda, Wikibooks y FatSecret/Cookpad', () => {
    expect(ALIM).toContain('servings: result.servings,')
    expect(ALIM).toContain('setFound({ title: detail.name, ingredients: detail.ingredients, steps: detail.directions, servings: null, servingsSource: null })')
    expect(ALIM).toContain('setFound(parsed)')
  })
})

describe('guardar — solo al confirmar, y con servings estructurado', () => {
  it('createRecipe solo se llama desde el envío del formulario (no al importar ni al cancelar)', () => {
    expect(ALIM.match(/createRecipe\(input\)/g)?.length).toBe(1)
    const submit = ALIM.slice(ALIM.indexOf('async function handleSubmit('), ALIM.indexOf('onDone()', ALIM.indexOf('async function handleSubmit(')))
    expect(submit).toContain('createRecipe(input)')
    expect(submit).toContain('servings: servingsValue')
  })

  it('vacío → null, y fuera de 1–50 se rechaza (nunca 0)', () => {
    expect(ALIM).toContain("servingsText.trim() === '' ? null : Number(servingsText.trim().replace(',', '.'))")
    expect(ALIM).toContain('if (servingsValue !== null && !isValidServings(servingsValue)) {')
  })

  it('listar recetas mapea servings nulo a null, no a 0 (las recetas antiguas no cambian)', () => {
    expect(FOOD).toContain('servings: r.servings ?? null')
  })

  it('la acción de PEPA que guarda el borrador de IA pasa las raciones a la columna', () => {
    expect(PEPA_ACTIONS).toContain('servings: params.servings,')
  })
})

describe('importación por URL — la ficha schema.org se lee sin adivinar', () => {
  it('la función de servidor devuelve recipeYield tal cual (no interpreta)', () => {
    expect(EDGE).toContain('recipeYield: yieldText(obj.recipeYield)')
    expect(EDGE).toContain('function yieldText(')
  })

  it('el cliente interpreta recipeYield con el parser estricto', () => {
    expect(URL_CLIENT).toContain("servingsFromSource(typeof json.recipeYield === 'string' ? json.recipeYield : null)")
  })
})
