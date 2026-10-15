// Puente receta privada ↔ receta pública de Comunidad (CMN-§5): conversión, consentimiento, importación y actualización voluntaria.
import { describe, expect, it } from 'vitest'
import {
  RECIPE_CONSENT_TEXT,
  authorLabel,
  canPublishRecipe,
  cleanRecipeDraft,
  formatScaledQuantity,
  ingredientLine,
  ingredientLinesFromPublic,
  mergeTagsOnUpdate,
  notesFromSteps,
  privateCopyEditedSinceImport,
  privateRecipeToDraft,
  privateRecipeToDiffRecipe,
  publicRecipeToKitchenInput,
  recipePublishProblems,
  recipeUpdateToKitchenInput,
  stepsFromNotes,
  stepsToText,
} from '@/domain/communityRecipeBridge'
import type { RecipeDraftInput } from '@/domain/community'
import type { Recipe } from '@/domain/types'

const privateRecipe: Recipe = {
  id: 'priv-uuid-1',
  familyId: 'fam-uuid-9',
  title: '  Tortilla de patatas  ',
  notes: '1. Pelar y cortar las patatas.\n2. Freírlas a fuego lento.\n3. Mezclar con el huevo y cuajar.',
  imagePath: 'fam-uuid-9/foto.jpg',
  tags: ['Favoritos', 'Fáciles de preparar', 'favoritos'],
  servings: 4,
  servingsSource: null,
  ingredients: [
    { id: 'ing-1', name: 'Patatas', quantity: '500', unit: 'g' },
    { id: 'ing-2', name: 'Huevos', quantity: '6', unit: 'unidades' },
    { id: 'ing-3', name: 'Sal', quantity: null, unit: null },
    { id: 'ing-4', name: '   ', quantity: '1', unit: 'kg' },
  ],
}

describe('receta privada → borrador público', () => {
  const draft = privateRecipeToDraft(privateRecipe)

  it('copia título, raciones, ingredientes, pasos y etiquetas', () => {
    expect(draft.title).toBe('Tortilla de patatas')
    expect(draft.recipe.servings).toBe(4)
    expect(draft.recipe.ingredients).toEqual([
      { name: 'Patatas', quantity: '500', unit: 'g' },
      { name: 'Huevos', quantity: '6', unit: 'unidades' },
      { name: 'Sal', quantity: '', unit: '' },
    ])
    expect(draft.recipe.steps).toBe('1. Pelar y cortar las patatas.\n2. Freírlas a fuego lento.\n3. Mezclar con el huevo y cuajar.')
    // Etiquetas en minúsculas y sin repetir, como las guarda el servidor.
    expect(draft.recipe.tags).toEqual(['favoritos', 'fáciles de preparar'])
  })

  it('NUNCA lleva ids ni datos de la familia (ni de la receta ni de los ingredientes ni de la foto)', () => {
    const json = JSON.stringify(draft)
    for (const secret of ['priv-uuid-1', 'fam-uuid-9', 'ing-1', 'ing-2', 'foto.jpg', 'familyId', 'imagePath', 'recipe_id']) {
      expect(json).not.toContain(secret)
    }
    expect(Object.keys(draft.recipe).sort()).toEqual(['ingredients', 'servings', 'steps', 'tags'])
  })

  it('unas raciones no válidas no se publican (el servidor solo admite enteros o medios puntos de 1 a 50)', () => {
    expect(privateRecipeToDraft({ ...privateRecipe, servings: 0 }).recipe.servings).toBeNull()
    expect(privateRecipeToDraft({ ...privateRecipe, servings: 3.3 }).recipe.servings).toBeNull()
    expect(privateRecipeToDraft({ ...privateRecipe, servings: 6.5 }).recipe.servings).toBe(6.5)
    expect(privateRecipeToDraft({ ...privateRecipe, servings: null }).recipe.servings).toBeNull()
  })

  it('los pasos de una receta con texto libre (sin numerar) o con numeración repetida se ordenan igual', () => {
    expect(stepsFromNotes('Mezclar todo\nHornear 20 minutos')).toEqual(['Mezclar todo', 'Hornear 20 minutos'])
    expect(stepsFromNotes('1. 1. En primer lugar\n2. 2. Después')).toEqual(['En primer lugar', 'Después'])
    expect(stepsFromNotes(null)).toEqual([])
    expect(stepsFromNotes('\n\n')).toEqual([])
    // «2.5 cucharadas» o «-5 grados» no son numeración.
    expect(stepsFromNotes('2.5 cucharadas de aceite\n-5 grados en el congelador')).toEqual(['2.5 cucharadas de aceite', '-5 grados en el congelador'])
  })

  it('stepsToText numera una línea por paso y un paso con saltos de línea sigue siendo UN paso', () => {
    expect(stepsToText(['a', ' ', 'b\nsigue'])).toBe('1. a\n2. b sigue')
  })

  it('respeta los límites del servidor (80 ingredientes, 120 letras de nombre, 30 de cantidad, 12 etiquetas de 30)', () => {
    const big = cleanRecipeDraft({
      servings: 2,
      ingredients: [{ name: 'x'.repeat(200), quantity: 'q'.repeat(50), unit: 'u'.repeat(50) }],
      steps: '',
      tags: Array.from({ length: 20 }, (_, i) => `etiqueta-${i}-` + 'z'.repeat(40)),
    })
    expect(big.ingredients[0].name).toHaveLength(120)
    expect(big.ingredients[0].quantity).toHaveLength(30)
    expect(big.ingredients[0].unit).toHaveLength(30)
    expect(big.tags).toHaveLength(12)
    expect(big.tags.every((t) => t.length <= 30)).toBe(true)
  })
})

describe('consentimiento y reglas de publicación', () => {
  const draft = privateRecipeToDraft(privateRecipe)
  const ok = { consent: true, topicId: 'platos-principales', title: draft.title, draft: draft.recipe }

  it('el texto del consentimiento es el exacto de la especificación', () => {
    expect(RECIPE_CONSENT_TEXT).toBe('Entiendo que esta receta será pública, la podrá leer cualquier persona y no incluirá datos de mi familia')
  })

  it('sin la casilla de consentimiento NO se puede publicar', () => {
    expect(canPublishRecipe(ok)).toBe(true)
    expect(canPublishRecipe({ ...ok, consent: false })).toBe(false)
  })

  it('exige tema, nombre de al menos 3 letras y un ingrediente con nombre', () => {
    expect(canPublishRecipe({ ...ok, topicId: null })).toBe(false)
    expect(canPublishRecipe({ ...ok, topicId: '' })).toBe(false)
    expect(canPublishRecipe({ ...ok, title: 'ab' })).toBe(false)
    expect(canPublishRecipe({ ...ok, title: 'x'.repeat(141) })).toBe(false)
    expect(canPublishRecipe({ ...ok, draft: { ...draft.recipe, ingredients: [] } })).toBe(false)
    expect(canPublishRecipe({ ...ok, draft: { ...draft.recipe, ingredients: [{ name: '  ', quantity: '1', unit: '' }] } })).toBe(false)
  })

  it('explica con frases claras qué falta', () => {
    const problems = recipePublishProblems('', { servings: null, ingredients: [], steps: '', tags: [] })
    expect(problems.join(' ')).toContain('nombre')
    expect(problems.join(' ')).toContain('ingrediente')
    expect(recipePublishProblems('Tarta', draft.recipe)).toEqual([])
  })
})

describe('receta pública → Cocina privada (importar)', () => {
  const publicRecipe = {
    servings: 4,
    ingredients: [
      { name: 'Harina, de fuerza', quantity: '1,5', unit: 'kg' },
      { name: 'Agua', quantity: '', unit: '' },
      { name: '   ', quantity: '1', unit: 'g' },
    ],
    steps: '1. Amasar.\n2. Dejar reposar.',
    tags: ['pan', 'fáciles de preparar'],
  }

  it('crea los datos de la copia editable con las líneas «nombre, cantidad, unidad» de la Cocina', () => {
    const input = publicRecipeToKitchenInput('  Pan casero ', publicRecipe, 'fam/foto-copia.jpg')
    expect(input).toEqual({
      title: 'Pan casero',
      notes: '1. Amasar.\n2. Dejar reposar.',
      ingredientLines: ['Harina de fuerza, 1.5, kg', 'Agua, , '],
      tags: ['pan', 'fáciles de preparar'],
      imagePath: 'fam/foto-copia.jpg',
      servings: 4,
      servingsSource: null,
    })
  })

  it('una coma en el nombre, la cantidad o la unidad no descuadra los tres campos de la línea', () => {
    for (const line of ingredientLinesFromPublic(publicRecipe.ingredients)) expect(line.split(',')).toHaveLength(3)
    expect(ingredientLine({ name: 'a, b', quantity: '1,5', unit: 'x, y' }).split(',')).toHaveLength(3)
    expect(ingredientLine({ name: 'Sal', quantity: '', unit: '' })).toBe('Sal, , ')
  })

  it('sin foto, sin raciones válidas: nulos, nunca 0', () => {
    const input = publicRecipeToKitchenInput('Pan', { ...publicRecipe, servings: null }, null)
    expect(input.imagePath).toBeNull()
    expect(input.servings).toBeNull()
    expect(publicRecipeToKitchenInput('Pan', { ...publicRecipe, servings: 0 }, null).servings).toBeNull()
  })

  it('las notas salen numeradas para que la Cocina las trate como pasos', () => {
    expect(notesFromSteps('Amasar\nHornear')).toBe('1. Amasar\n2. Hornear')
    expect(notesFromSteps('')).toBe('')
  })
})

describe('actualización voluntaria de la copia importada', () => {
  const imported = { title: 'Pan', servings: 4, ingredients: [{ name: 'Harina', quantity: '500', unit: 'g' }], steps: '1. Amasar', tags: ['pan'] }
  const current = { title: 'Pan casero', servings: 6, ingredients: [{ name: 'Harina', quantity: '750', unit: 'g' }, { name: 'Sal', quantity: '1', unit: 'pizca' }], steps: '1. Amasar\n2. Hornear', tags: ['pan', 'rápidas'] }
  const copy: Recipe = {
    id: 'copy-1',
    familyId: 'fam-1',
    title: 'Pan',
    notes: '1. Amasar',
    imagePath: 'fam-1/mi-foto.jpg',
    tags: ['pan', 'favoritos'],
    servings: 4,
    servingsSource: '4 personas',
    ingredients: [{ id: 'i1', name: 'Harina', quantity: '500', unit: 'g' }],
  }

  it('mantiene la foto de la familia y sus etiquetas propias; trae título, ingredientes y pasos nuevos', () => {
    const input = recipeUpdateToKitchenInput(copy, current, imported)
    expect(input.imagePath).toBe('fam-1/mi-foto.jpg')
    expect(input.title).toBe('Pan casero')
    expect(input.notes).toBe('1. Amasar\n2. Hornear')
    expect(input.ingredientLines).toEqual(['Harina, 750, g', 'Sal, 1, pizca'])
    expect(input.tags).toEqual(['pan', 'rápidas', 'favoritos'])
    expect(input.servings).toBe(6)
    expect(input.servingsSource).toBeNull()
  })

  it('si las raciones no cambian se conserva el texto original de la fuente', () => {
    const input = recipeUpdateToKitchenInput(copy, { ...current, servings: 4 }, imported)
    expect(input.servings).toBe(4)
    expect(input.servingsSource).toBe('4 personas')
  })

  it('mergeTagsOnUpdate: una etiqueta que la familia quitó de lo importado no vuelve; la que añadió se queda', () => {
    expect(mergeTagsOnUpdate(['favoritos'], ['pan'], ['pan'])).toEqual(['pan', 'favoritos'])
    expect(mergeTagsOnUpdate([], ['pan'], ['pan'])).toEqual(['pan'])
    expect(mergeTagsOnUpdate(['Pan'], ['pan'], ['pan'])).toEqual(['pan'])
  })

  it('detecta si la familia cambió su copia desde que la importó (para avisar de que se pierde al actualizar)', () => {
    expect(privateCopyEditedSinceImport(copy, imported)).toBe(false)
    expect(privateCopyEditedSinceImport({ ...copy, notes: '1. Amasar mucho' }, imported)).toBe(true)
    expect(privateCopyEditedSinceImport({ ...copy, ingredients: [...copy.ingredients, { id: 'i2', name: 'Agua', quantity: '1', unit: 'l' }] }, imported)).toBe(true)
    // Las etiquetas y las raciones no cuentan.
    expect(privateCopyEditedSinceImport({ ...copy, tags: ['otra'], servings: 8 }, imported)).toBe(false)
  })

  it('la receta privada es comparable con una versión pública', () => {
    expect(privateRecipeToDiffRecipe(copy).steps).toBe('1. Amasar')
  })
})

describe('presentación', () => {
  it('cantidades con coma decimal y sin ceros sobrantes', () => {
    expect(formatScaledQuantity(1.5)).toBe('1,5')
    expect(formatScaledQuantity(250)).toBe('250')
    expect(formatScaledQuantity(0.3333333)).toBe('0,33')
  })

  it('el autor se atribuye por alias, nunca por nombre real', () => {
    expect(authorLabel('Cocinillas', false)).toBe('Cocinillas')
    expect(authorLabel(null, false)).toBe('Alguien')
    expect(authorLabel('Cocinillas', true)).toBe('Usuario eliminado')
  })

  it('un borrador vacío se normaliza sin romper', () => {
    const empty: RecipeDraftInput = { servings: null, ingredients: [], steps: '', tags: [] }
    expect(cleanRecipeDraft(empty)).toEqual(empty)
  })
})
