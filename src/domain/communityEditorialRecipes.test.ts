// Fichas de recetas de los artículos oficiales: lectura, comparación antes/después, comprobación de lo que dice Pepa y edición manual sin pérdida de datos.
import { describe, expect, it } from 'vitest'
import {
  applyRecipeEdits,
  cardsToEdits,
  changeSummary,
  checkReviseClaims,
  claimsNewRecipe,
  compareRecipeCards,
  readRecipeCards,
  recipeCardsOf,
  recipesAdmitted,
  recipesChanged,
  validateRecipeEdits,
} from '@/domain/communityEditorialRecipes'
import { buildProposalPayload, proposalToForm, toProposals, validateProposalForm } from '@/domain/communityAdmin'

const stew = (over: Record<string, unknown> = {}) => ({
  key: 'estofado-pollo',
  title: 'Estofado casero de pollo con verduras',
  servings: 4,
  ingredients: [
    { name: 'muslos de pollo', quantity: '800', unit: 'g' },
    { name: 'zanahoria', quantity: '3', unit: 'unidades' },
    { name: 'patata', quantity: '2', unit: 'unidades' },
  ],
  steps: ['Dora el pollo.', 'Añade las verduras.', 'Cuece 40 minutos.'],
  tip: 'Mejor de un día para otro.',
  time: { active: 20, total: 70 },
  freeze: { ideal: true, note: 'hasta 3 meses' },
  tags: ['Platos de cuchara'],
  ...over,
})
const soup = () => ({ key: 'sopa', title: 'Sopa de fideos', servings: 2, ingredients: [{ name: 'fideos', quantity: '100', unit: 'g' }], steps: ['Hierve el caldo.', 'Echa los fideos.'] })

describe('lectura de las fichas', () => {
  it('lee título, raciones, tiempos, ingredientes, pasos, consejo y congelación', () => {
    const [c] = readRecipeCards([stew()])
    expect(c.title).toBe('Estofado casero de pollo con verduras')
    expect(c.servings).toBe(4)
    expect(c.time).toEqual({ active: 20, total: 70 })
    expect(c.freeze).toEqual({ ideal: true, note: 'hasta 3 meses' })
    expect(c.tip).toBe('Mejor de un día para otro.')
    expect(c.ingredients[0]).toEqual({ name: 'muslos de pollo', quantity: '800', unit: 'g' })
    expect(c.steps).toHaveLength(3)
  })
  it('es tolerante: algo a medias se enseña (para decidir) y nada rompe', () => {
    expect(readRecipeCards(null)).toEqual([])
    expect(readRecipeCards('x')).toEqual([])
    const [c] = readRecipeCards([{ title: 'Sin nada' }, 5, null])
    expect(c.ingredients).toEqual([])
    expect(c.steps).toEqual([])
    expect(c.servings).toBeNull()
  })
})

describe('comparación de fichas', () => {
  it('receta NUEVA: se detecta y se enseña la ficha completa', () => {
    const ch = compareRecipeCards(readRecipeCards([soup()]), readRecipeCards([soup(), stew()]))
    expect(ch).toHaveLength(1)
    expect(ch[0].kind).toBe('added')
    expect(ch[0].after?.ingredients).toHaveLength(3)
    expect(changeSummary(ch[0])).toBe('Receta añadida: Estofado casero de pollo con verduras (3 ingredientes, 3 pasos).')
  })
  it('receta ELIMINADA', () => {
    const ch = compareRecipeCards(readRecipeCards([soup(), stew()]), readRecipeCards([soup()]))
    expect(ch.map((c) => c.kind)).toEqual(['removed'])
    expect(changeSummary(ch[0])).toBe('Receta eliminada: Estofado casero de pollo con verduras.')
  })
  it('receta MODIFICADA: ingredientes, cantidades y pasos, no solo «cambiada»', () => {
    const after = stew({
      ingredients: [
        { name: 'muslos de pollo', quantity: '1000', unit: 'g' },
        { name: 'zanahoria', quantity: '3', unit: 'unidades' },
        { name: 'guisantes', quantity: '150', unit: 'g' },
      ],
      steps: ['Dora el pollo.', 'Añade las verduras y el caldo.', 'Cuece 40 minutos.', 'Reposa 10 minutos.'],
    })
    const [c] = compareRecipeCards(readRecipeCards([stew()]), readRecipeCards([after]))
    expect(c.kind).toBe('changed')
    expect(c.diff?.ingredientsChanged.map((x) => x.after.name)).toEqual(['muslos de pollo'])
    expect(c.diff?.ingredientsChanged[0].before.quantity).toBe('800')
    expect(c.diff?.ingredientsChanged[0].after.quantity).toBe('1000')
    expect(c.diff?.ingredientsAdded.map((i) => i.name)).toEqual(['guisantes'])
    expect(c.diff?.ingredientsRemoved.map((i) => i.name)).toEqual(['patata'])
    expect(c.diff?.stepOps.some((o) => o.type === 'added')).toBe(true)
    expect(changeSummary(c)).toContain('Receta cambiada: Estofado casero de pollo con verduras (')
  })
  it('cambios solo en consejo, tiempos o congelación también cuentan', () => {
    const [c] = compareRecipeCards(readRecipeCards([stew()]), readRecipeCards([stew({ tip: 'Sírvelo con pan.', time: { active: 30, total: 90 }, freeze: { ideal: false } })]))
    expect(c.kind).toBe('changed')
    expect(c.extras.join(' ')).toMatch(/consejo/i)
    expect(c.extras.join(' ')).toMatch(/Tiempos/)
    expect(c.extras.join(' ')).toMatch(/Congelación/)
  })
  it('un cambio de nombre con la misma clave es «modificada», no «eliminada + añadida»', () => {
    const ch = compareRecipeCards(readRecipeCards([stew()]), readRecipeCards([stew({ title: 'Estofado de pollo' })]))
    expect(ch.map((c) => c.kind)).toEqual(['changed'])
    expect(ch[0].diff?.titleChanged).toEqual({ from: 'Estofado casero de pollo con verduras', to: 'Estofado de pollo' })
  })
  it('propuesta SIN cambios reales: ninguna diferencia', () => {
    expect(compareRecipeCards(readRecipeCards([stew(), soup()]), readRecipeCards([stew(), soup()]))).toEqual([])
    // Mayúsculas y espacios no cuentan como cambio.
    expect(compareRecipeCards(readRecipeCards([stew()]), readRecipeCards([stew({ title: ' ESTOFADO CASERO DE POLLO CON VERDURAS ' })]))).toEqual([])
  })
})

describe('admisión de fichas (regla editorial vigente, sin cambios)', () => {
  it('solo la sección «recetas» o un artículo que ya trae fichas', () => {
    expect(recipesAdmitted('recetas', {})).toBe(true)
    expect(recipesAdmitted('hogar', { recipes: [stew()] })).toBe(true)
    expect(recipesAdmitted('hogar', {})).toBe(false)
    expect(recipesAdmitted('cocina', { recipes: [] })).toBe(false)
  })
})

describe('lo que Pepa dice frente a lo que contiene la propuesta', () => {
  const base = { instruction: 'Añade la receta del estofado de pollo con verduras', before: { recipes: [soup()] } as Record<string, unknown> }
  it('detecta que se afirma haber añadido una receta', () => {
    expect(claimsNewRecipe('He incorporado la ficha de la receta del estofado.')).toBe(true)
    expect(claimsNewRecipe('He añadido la receta de estofado de pollo al artículo.')).toBe(true)
    expect(claimsNewRecipe('Añade la receta del estofado')).toBe(true)
    expect(claimsNewRecipe('He acortado la introducción y quitado una repetición.')).toBe(false)
    expect(claimsNewRecipe('La receta ya estaba en el artículo.')).toBe(false)
  })
  it('Pepa dice que añadió una receta y SÍ hay una ficha nueva: sin aviso', () => {
    const w = checkReviseClaims({ ...base, notes: 'He añadido la ficha de la receta del estofado.', section: 'recetas', result: { recipes: [soup(), stew()] } })
    expect(w).toEqual([])
  })
  it('Pepa dice que añadió una receta pero solo MODIFICÓ una existente: aviso claro', () => {
    const w = checkReviseClaims({ instruction: base.instruction, notes: 'He incorporado la ficha de la receta del estofado.', section: 'recetas', before: { recipes: [stew()] }, result: { recipes: [stew({ steps: ['Dora el pollo.', 'Cuece.'] })] } })
    expect(w.map((x) => x.code)).toEqual(['claims-new-recipe'])
    expect(w[0].message).toContain('NO contiene ninguna ficha nueva')
    expect(w[0].message).toContain('«Estofado casero de pollo con verduras»')
  })
  it('Pepa dice que añadió una receta y la propuesta no cambia las fichas: aviso', () => {
    const w = checkReviseClaims({ ...base, notes: 'He añadido la receta al artículo.', section: 'recetas', result: { recipes: [soup()] } })
    expect(w.map((x) => x.code)).toEqual(['claims-new-recipe'])
  })
  it('artículo que NO admite fichas: se explica y no se afirma que se haya añadido', () => {
    const w = checkReviseClaims({ instruction: base.instruction, notes: 'He añadido la ficha de la receta del estofado.', section: 'hogar', before: {}, result: {} })
    expect(w.map((x) => x.code)).toEqual(['recipes-not-admitted'])
    expect(w[0].message).toContain('no admite fichas de recetas según las reglas actuales')
    expect(w[0].message).toContain('NO se ha añadido ninguna ficha')
  })
  it('se pidió añadir una receta y la propuesta no la trae (aunque Pepa no lo afirme)', () => {
    const w = checkReviseClaims({ ...base, notes: 'Cambios aplicados según la instrucción.', section: 'recetas', result: { recipes: [soup()] } })
    expect(w.map((x) => x.code)).toEqual(['asked-new-recipe'])
  })
  it('propuesta sin cambios reales en las recetas y sin nada que advertir', () => {
    const w = checkReviseClaims({ instruction: 'Hazlo más corto', notes: 'He acortado el texto.', section: 'recetas', before: { recipes: [soup()] }, result: { recipes: [soup()] } })
    expect(w).toEqual([])
  })
  it('cambia fichas sin que la instrucción hablara de recetas: aviso; elimina una sin pedirlo: aviso', () => {
    const changed = checkReviseClaims({ instruction: 'Hazlo más cercano', notes: 'Texto más cercano.', section: 'recetas', before: { recipes: [soup()] }, result: { recipes: [soup(), stew()] } })
    expect(changed.map((x) => x.code)).toContain('unrequested-recipe-change')
    const removed = checkReviseClaims({ instruction: 'Hazlo más cercano', notes: 'Texto más cercano.', section: 'recetas', before: { recipes: [soup(), stew()] }, result: { recipes: [soup()] } })
    expect(removed.map((x) => x.code)).toContain('recipes-removed')
  })
})

describe('edición manual de las fichas', () => {
  const payload = { editorial: true, sources: [], recipes: [stew(), soup()] }
  it('sin tocar nada no hay cambios y se conserva todo (tiempos, congelación, claves)', () => {
    const edits = cardsToEdits(recipeCardsOf(payload))
    expect(recipesChanged(payload.recipes, edits)).toBe(false)
    expect(applyRecipeEdits(payload.recipes, edits)[0]).toMatchObject({ time: { active: 20, total: 70 }, freeze: { ideal: true, note: 'hasta 3 meses' }, key: 'estofado-pollo' })
  })
  it('cambiar una cantidad y un paso solo toca esa ficha y conserva lo que el editor no muestra', () => {
    const edits = cardsToEdits(recipeCardsOf(payload))
    edits[0].ingredients[0] = { ...edits[0].ingredients[0], quantity: '1000' }
    edits[0].steps = [...edits[0].steps, 'Reposa 10 minutos.']
    expect(recipesChanged(payload.recipes, edits)).toBe(true)
    const out = applyRecipeEdits(payload.recipes, edits)
    expect((out[0].ingredients as { quantity: string }[])[0].quantity).toBe('1000')
    expect(out[0].steps).toHaveLength(4)
    expect(out[0]).toMatchObject({ time: { active: 20, total: 70 }, freeze: { ideal: true } })
    expect(out[1]).toEqual(soup())
    expect(validateRecipeEdits(payload.recipes, edits)).toBeNull()
  })
  it('conserva las validaciones: sin pasos, sin ingredientes, sin nombre o con ingrediente repetido no se guarda', () => {
    const mk = (f: (e: ReturnType<typeof cardsToEdits>) => void) => {
      const e = cardsToEdits(recipeCardsOf(payload))
      f(e)
      return validateRecipeEdits(payload.recipes, e)
    }
    expect(mk((e) => (e[0].steps = []))).toMatch(/paso/)
    expect(mk((e) => (e[0].ingredients = []))).toMatch(/ingrediente/)
    expect(mk((e) => (e[0].title = '  '))).toMatch(/título|nombre/)
    expect(mk((e) => (e[0].ingredients = [e[0].ingredients[0], { ...e[0].ingredients[0] }]))).toMatch(/repetido/)
  })
  it('el formulario del borrador solo manda las fichas si cambian y las valida al guardar', () => {
    const [a] = toProposals([{ id: 'a1', kind: 'article', section: 'recetas', topicId: 't', title: 'Menús sin perder la paciencia', body: 'Texto', payload, status: 'proposed', version: 1 }])
    const form = proposalToForm(a)
    expect(form.recipes).toHaveLength(2)
    const same = buildProposalPayload('article', a.payload, form)
    expect(same?.recipes).toEqual(payload.recipes)
    const edited = { ...form, recipes: form.recipes.map((r, i) => (i === 0 ? { ...r, steps: [] } : r)) }
    expect(validateProposalForm('article', edited, a.payload)).toContain('Una ficha de receta no es válida')
    const ok = { ...form, recipes: form.recipes.map((r, i) => (i === 0 ? { ...r, tip: 'Con pan.' } : r)) }
    expect(validateProposalForm('article', ok, a.payload)).toBeNull()
    expect((buildProposalPayload('article', a.payload, ok)?.recipes as { tip?: string }[])[0].tip).toBe('Con pan.')
  })
})
