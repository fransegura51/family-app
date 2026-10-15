// Editor de recetas COMPARTIDO (Cocina + Comunidad): se pinta el componente con react-dom/server y se comprueba, leyendo el código fuente, que las dos pantallas usan
// la MISMA implementación y que no queda un segundo editor.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

import { COMMUNITY_RECIPE_LIMITS } from '@/domain/communityRecipeEditor'
import { ingredientRowsFrom, stepRowsFrom } from '@/domain/recipeEditor'

const { RecipeEditorFields, RecipeTitleField } = await import('@/ui/recipeEditor/RecipeEditorFields')
const { RecipeFields } = await import('@/ui/community/recipes/RecipeFields')

const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const src = (path: string) => SOURCES[`/${path}`]
const ALIM = src('src/ui/AlimentacionScreen.tsx')
const COMUNIDAD = src('src/ui/community/recipes/RecipeFields.tsx')
const EDITOR = src('src/ui/recipeEditor/RecipeEditorFields.tsx')
const PUBLISH = src('src/ui/community/recipes/RecipePublishSheet.tsx')

const noop = () => undefined
const base = {
  servingsText: '4',
  onServingsTextChange: noop,
  tags: ['Postres'],
  onTagsChange: noop,
  ingredients: ingredientRowsFrom([{ name: 'Patatas', quantity: '500', unit: 'g' }, { name: 'Huevos', quantity: '6', unit: 'unidades' }]),
  onIngredientsChange: noop,
  steps: stepRowsFrom(['Pelar las patatas.', 'Cuajar la tortilla.']),
  onStepsChange: noop,
}
const html = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(RecipeEditorFields, { ...base, ...props }))

describe('RecipeEditorFields — render', () => {
  it('pinta raciones, etiquetas, ingredientes y pasos con etiquetas accesibles en español', () => {
    const out = html()
    expect(out).toContain('Raciones (opcional)')
    expect(out).toContain('for="')
    expect(out).toContain('value="4"')
    expect(out).toContain('aria-pressed="true"')
    expect(out).toContain('Nueva etiqueta')
    expect(out).toContain('value="Patatas"')
    expect(out).toContain('aria-label="Ingrediente 1"')
    expect(out).toContain('aria-label="Cantidad del ingrediente 2"')
    expect(out).toContain('aria-label="Unidad del ingrediente 1"')
    expect(out).toContain('aria-label="Quitar el ingrediente 2"')
    expect(out).toContain('aria-label="Paso 2"')
    expect(out).toContain('aria-label="Subir el paso 2"')
    expect(out).toContain('aria-label="Bajar el paso 1"')
    expect(out).toContain('+ Añadir ingrediente')
    expect(out).toContain('+ Añadir paso')
    // Las sugerencias de unidades están en una lista asociada a las cajas de unidad.
    expect(out).toMatch(/list="[^"]+-units"/)
    expect(out).toContain('<option value="cucharadas"')
  })

  it('usa las clases de siempre de la Cocina (objetivo táctil lo da cada pantalla con su envoltorio)', () => {
    const out = html()
    for (const cls of ['recipe-field', 'recipe-field-label', 'recipe-ing-row', 'recipe-ing-name', 'recipe-ing-qty', 'recipe-ing-unit', 'recipe-step-row', 'recipe-step-num', 'recipe-row-remove', 'recipe-inline-row', 'chip']) {
      expect(out).toContain(cls)
    }
  })

  it('sin límites (Cocina) no pone máximos en las cajas; con los de Comunidad sí', () => {
    const free = html()
    expect(free).not.toContain('maxLength')
    expect(free).not.toContain('maxlength')
    const limited = html({ limits: COMMUNITY_RECIPE_LIMITS })
    expect(limited).toContain('maxLength="120"')
    expect(limited).toContain('maxLength="30"')
  })

  it('raciones inválidas: lo dice con el mismo texto y marca el campo; válidas o vacías no', () => {
    const bad = html({ servingsText: '2.3' })
    expect(bad).toContain('Las raciones deben ser un número entre 1 y 50')
    expect(bad).toContain('aria-invalid="true"')
    for (const ok of ['', '4', '6.5']) expect(html({ servingsText: ok })).not.toContain('Las raciones deben ser')
  })

  it('el hueco bajo las raciones (la «fuente» de la Cocina) se pinta tal cual', () => {
    expect(html({ servingsNote: createElement('p', { className: 'nota-fuente' }, 'Fuente: «6-7 personas»') })).toContain('Fuente: «6-7 personas»')
  })

  it('notas antiguas en texto libre: un solo cuadro «Preparación / notas» en vez de pasos', () => {
    const out = html({ legacyNotes: { value: 'Mezclar y hornear sin más.', onChange: noop } })
    expect(out).toContain('Preparación / notas')
    expect(out).toContain('Mezclar y hornear sin más.')
    expect(out).not.toContain('recipe-step-row')
    expect(out).not.toContain('+ Añadir paso')
  })

  it('etiquetas: las sugeridas se pueden cambiar, las propias salen con ✕ y el máximo se avisa', () => {
    const out = html({ tagOptions: ['Postres', 'Cena'], tags: ['Postres', 'mis cenas'] })
    expect(out).toContain('>Cena<')
    expect(out).toContain('Quitar la etiqueta mis cenas')
    expect(html({ limits: { maxTags: 2, tagCase: 'lower' } })).not.toContain('Máximo')
    expect(html({ tags: ['a', 'b'], limits: { maxTags: 2, tagCase: 'lower' } })).toContain('Máximo 2 etiquetas.')
  })

  it('desactivado: no se puede tocar nada', () => {
    const controls = html({ disabled: true }).match(/<(input|textarea|button)\b[^>]*>/g) ?? []
    expect(controls.length).toBeGreaterThan(10)
    expect(controls.every((c) => /disabled=""/.test(c))).toBe(true)
  })

  it('el texto de la persona nunca se pinta como HTML', () => {
    const out = html({ ingredients: ingredientRowsFrom([{ name: '<script>alert(1)</script>' }]), steps: stepRowsFrom(['<img src=x onerror=alert(1)>']) })
    expect(out).not.toContain('<script>')
    expect(out).not.toContain('<img')
    expect(EDITOR).not.toContain('dangerouslySetInnerHTML')
  })
})

describe('RecipeTitleField', () => {
  it('con etiqueta visible usa label/for; sin ella, aria-label; con sugerencias, lista de ayuda', () => {
    const withLabel = renderToStaticMarkup(createElement(RecipeTitleField, { value: 'Pan', onChange: noop, label: 'Nombre de la receta', maxLength: 150, large: false }))
    expect(withLabel).toContain('Nombre de la receta')
    expect(withLabel).toMatch(/<label[^>]*for="[^"]+-title"/)
    expect(withLabel).toContain('maxLength="150"')
    expect(withLabel).not.toContain('recipe-title-input')
    const withList = renderToStaticMarkup(createElement(RecipeTitleField, { value: '', onChange: noop, suggestions: ['tortilla', 'paella'], required: true, placeholder: 'Nombre' }))
    expect(withList).toContain('aria-label="Título"')
    expect(withList).toContain('recipe-title-input')
    expect(withList).toContain('required=""')
    expect(withList).toContain('<option value="paella"')
  })
})

describe('Comunidad usa el editor compartido', () => {
  it('RecipeFields (adaptador) pinta lo mismo y respeta los límites de Comunidad y el envoltorio de 44 px', () => {
    const out = renderToStaticMarkup(
      createElement(RecipeFields, { value: { servings: 4, ingredients: [{ name: 'Patatas', quantity: '500', unit: 'g' }], steps: '1. Pelar.', tags: ['favoritos'] }, onChange: noop }),
    )
    expect(out).toContain('community-recipe-fields')
    expect(out).toContain('maxLength="120"')
    expect(out).toContain('aria-label="Ingrediente 1"')
    expect(out).toContain('Quitar la etiqueta favoritos')
  })
})

describe('una sola implementación, ningún segundo editor', () => {
  it('Cocina y Comunidad importan y montan el mismo componente', () => {
    expect(ALIM).toContain("from '@/ui/recipeEditor/RecipeEditorFields'")
    expect(ALIM).toContain('<RecipeEditorFields')
    expect(ALIM).toContain('<RecipeTitleField')
    expect(COMUNIDAD).toContain("from '@/ui/recipeEditor/RecipeEditorFields'")
    expect(COMUNIDAD).toContain('<RecipeEditorFields')
    expect(PUBLISH).toContain('<RecipeTitleField')
  })

  it('las filas de ingredientes y de pasos se pintan en UN solo archivo de la aplicación', () => {
    const owners = (needle: string) =>
      Object.entries(SOURCES)
        .filter(([path, text]) => path.startsWith('/src/ui/') && !path.includes('.test.') && text.includes(needle))
        .map(([path]) => path)
    for (const needle of ['className="recipe-ing-row"', 'className="recipe-step-row"', 'className="recipe-step-num"', 'className="recipe-row-remove"', 'Describe el primer paso', 'className="recipe-ing-qty"', 'aria-label="Nueva etiqueta"']) {
      expect(owners(needle), needle).toEqual(['/src/ui/recipeEditor/RecipeEditorFields.tsx'])
    }
  })

  it('la Cocina y Comunidad no guardan copias de las reglas de filas: salen de src/domain/recipeEditor.ts', () => {
    for (const text of [ALIM, COMUNIDAD, EDITOR]) {
      expect(text).not.toContain('UNIT_SUGGESTIONS = [')
      expect(text).not.toMatch(/let (form)?[rR]owSeq/)
      expect(text).not.toContain('function moveStep(')
      expect(text).not.toContain('function addIngredientAfter(')
    }
    expect(ALIM).toContain("from '@/domain/recipeEditor'")
    expect(EDITOR).toContain("from '@/domain/recipeEditor'")
    expect(src('src/domain/communityRecipeEditor.ts')).toContain("from '@/domain/recipeEditor'")
  })

  it('lo propio de cada lado sigue aparte: la Cocina guarda su receta privada; Comunidad no llama a la red desde los campos', () => {
    expect(ALIM).toContain('createRecipe(input)')
    expect(ALIM).toContain('updateRecipe(recipe.id, input)')
    expect(ALIM).toContain('legacyNotes={legacyNotes ?')
    expect(COMUNIDAD).toContain('COMMUNITY_RECIPE_LIMITS')
    for (const text of [COMUNIDAD, EDITOR]) {
      expect(text).not.toContain('@/data/')
      expect(text).not.toContain('createPost(')
    }
  })
})
