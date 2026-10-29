import { describe, expect, it } from 'vitest'
import {
  addRecipe,
  buildMenuPayload,
  changedMealTitles,
  checkSummaryLines,
  EDIT_DAYS,
  formToRecipe,
  menuChanged,
  menuEditorialCheck,
  mealOf,
  moveRecipe,
  newRecipeRaw,
  recipeToForm,
  recipesOf,
  removeRecipe,
  replaceRecipe,
  setMealFields,
  toEditableMenuItem,
  validateMenuLocal,
  validateRecipeForm,
  type Rec,
} from '@/domain/communityMenuEdit'

const recipe = (title: string, over: Rec = {}): Rec => ({
  title,
  servings: 4,
  ingredients: [{ name: `base de ${title}`, quantity: '200', unit: 'g' }],
  steps: ['Cocina todo.'],
  tip: 'Un truco.',
  time: { active: 10, total: 30 },
  freeze: { ideal: false },
  ...over,
})
const meal = (title: string, extra: Rec[] = []): Rec => ({ title, side: 'Pan', recipes: [recipe(title), ...extra] })
const menuOf = (): Rec => ({
  version: 1,
  servings: 4,
  days: EDIT_DAYS.map((day, i) => ({ day, meals: { comida: meal(`Comida ${i}`), cena: meal(`Cena ${i}`) } })),
})
const payloadOf = () => ({ schedule: 'saturday', source: 'Banco editorial', editorial: { slot: 1 }, menu: menuOf() })
const row = (over: Rec = {}) => ({ id: 'm1', kind: 'menu', title: 'Menú', body: 'Texto', version: 3, status: 'proposed', published_post_id: null, payload: payloadOf(), ...over })

describe('lectura del menú editable', () => {
  it('acepta un menú de 7 días y conserva el contenido completo', () => {
    const item = toEditableMenuItem(row())
    expect(item?.id).toBe('m1')
    expect(item?.payload.schedule).toBe('saturday')
    expect(item?.status).toBe('proposed')
  })
  it('rechaza lo que no es un menú editable: otro tipo, ya publicado, sin siete días', () => {
    expect(toEditableMenuItem(row({ kind: 'article' }))).toBeNull()
    expect(toEditableMenuItem(row({ published_post_id: 'p1' }))).toBeNull()
    expect(toEditableMenuItem(row({ status: 'published' }))).toBeNull()
    expect(toEditableMenuItem(row({ payload: { menu: { days: [] } } }))).toBeNull()
    expect(toEditableMenuItem(null)).toBeNull()
  })
})

describe('operaciones: solo cambia lo tocado y el resto queda idéntico byte a byte', () => {
  const sameExcept = (a: Rec, b: Rec, day: number) => {
    const da = a.days as Rec[]
    const db = b.days as Rec[]
    for (let i = 0; i < 7; i++) if (i !== day) expect(JSON.stringify(db[i])).toBe(JSON.stringify(da[i]))
  }

  it('cambiar el título y el acompañamiento de una comida', () => {
    const m = menuOf()
    const before = JSON.stringify(m)
    const next = setMealFields(m, 1, 'cena', { title: 'Sopa de letras', side: '' })
    expect(mealOf(next, 1, 'cena')?.title).toBe('Sopa de letras')
    expect(mealOf(next, 1, 'cena')).not.toHaveProperty('side')
    expect(mealOf(next, 1, 'comida')).toBe(mealOf(m, 1, 'comida'))
    sameExcept(m, next, 1)
    expect(JSON.stringify(m)).toBe(before) // el original no se toca
  })

  it('sustituir una receta cambia solo esa', () => {
    const m = menuOf()
    const next = replaceRecipe(m, 2, 'comida', 0, recipe('Nueva'))
    expect(recipesOf(next, 2, 'comida')[0].title).toBe('Nueva')
    expect(mealOf(next, 2, 'cena')).toBe(mealOf(m, 2, 'cena'))
    sameExcept(m, next, 2)
  })

  it('añadir, mover y quitar recetas dentro de una comida', () => {
    let m = menuOf()
    m = addRecipe(m, 0, 'cena', recipe('Fruta', { simple: true, steps: [] }))
    m = addRecipe(m, 0, 'cena', recipe('Pan tostado'))
    expect(recipesOf(m, 0, 'cena').map((r) => r.title)).toEqual(['Cena 0', 'Fruta', 'Pan tostado'])
    m = moveRecipe(m, 0, 'cena', 2, -1)
    expect(recipesOf(m, 0, 'cena').map((r) => r.title)).toEqual(['Cena 0', 'Pan tostado', 'Fruta'])
    m = moveRecipe(m, 0, 'cena', 0, -1) // en el borde no hace nada
    expect(recipesOf(m, 0, 'cena')[0].title).toBe('Cena 0')
    m = removeRecipe(m, 0, 'cena', 1)
    expect(recipesOf(m, 0, 'cena').map((r) => r.title)).toEqual(['Cena 0', 'Fruta'])
  })

  it('no se puede quitar la única receta de una comida ni pasar de 6', () => {
    const m = menuOf()
    expect(removeRecipe(m, 3, 'comida', 0)).toBe(m)
    let x = m
    for (let i = 0; i < 8; i++) x = addRecipe(x, 3, 'comida', recipe(`Extra ${i}`))
    expect(recipesOf(x, 3, 'comida')).toHaveLength(6)
  })

  it('una comida que no existe no rompe nada', () => {
    const m = menuOf()
    expect(replaceRecipe(m, 9, 'cena', 0, recipe('X'))).toBe(m)
  })
})

describe('guardar: el contenido completo se conserva', () => {
  it('buildMenuPayload mantiene schedule, source y lo demás, y solo cambia menu', () => {
    const original = payloadOf()
    const menu = setMealFields(original.menu, 0, 'comida', { title: 'Otro' })
    const payload = buildMenuPayload(original, menu)
    expect(payload.schedule).toBe('saturday')
    expect(payload.source).toBe('Banco editorial')
    expect(payload.editorial).toEqual({ slot: 1 })
    expect(payload.menu).toBe(menu)
    expect(original.menu).not.toBe(menu)
  })
  it('menuChanged y changedMealTitles detectan los cambios', () => {
    const m = menuOf()
    expect(menuChanged(m, menuOf())).toBe(false)
    const next = setMealFields(m, 1, 'cena', { title: 'Sopa de letras' })
    expect(menuChanged(m, next)).toBe(true)
    expect(changedMealTitles(m, next)).toEqual(['martes (cena): «Cena 1» → «Sopa de letras»'])
    expect(changedMealTitles(m, replaceRecipe(m, 1, 'cena', 0, recipe('Otra')))).toEqual([])
  })
})

describe('formulario de receta', () => {
  it('ida y vuelta sin cambios conserva la receta tal cual (incluidos tiempos, congelación y claves ajenas)', () => {
    const r = recipe('Sopa', { freeze: { ideal: true, note: 'tres meses' }, key: 'abc', tags: ['sopa'] })
    expect(formToRecipe(r, recipeToForm(r))).toEqual(r)
  })
  it('una receta con congelación «no ideal» sin nota se conserva', () => {
    const r = recipe('Puré')
    expect(formToRecipe(r, recipeToForm(r)).freeze).toEqual({ ideal: false })
  })
  it('limpia lo opcional vacío: consejo, tiempos, congelación y etiquetas', () => {
    const r = recipe('Sopa', { tags: ['x'] })
    const f = { ...recipeToForm(r), tip: '  ', activeMin: '', totalMin: '', freezeIdeal: false, freezeNote: '', tags: [] }
    const out = formToRecipe({ ...r, freeze: { ideal: true } }, f)
    expect(out).not.toHaveProperty('tip')
    expect(out).not.toHaveProperty('time')
    expect(out).not.toHaveProperty('freeze')
    expect(out).not.toHaveProperty('tags')
  })
  it('un elemento sencillo no necesita pasos; una receta normal sí', () => {
    const f = { ...recipeToForm(recipe('Manzana')), steps: [] as string[] }
    expect(validateRecipeForm(null, f)).toMatch(/de 1 a 30 pasos/)
    expect(validateRecipeForm(null, { ...f, simple: true })).toBeNull()
  })
  it('reglas del servidor: nombre, raciones, ingredientes repetidos, cantidades y tiempos', () => {
    const ok = recipeToForm(recipe('Sopa'))
    expect(validateRecipeForm(null, ok)).toBeNull()
    expect(validateRecipeForm(null, { ...ok, title: ' ' })).toMatch(/necesita un nombre/)
    expect(validateRecipeForm(null, { ...ok, servings: 0 })).toMatch(/raciones/)
    expect(validateRecipeForm(null, { ...ok, servings: 2.5 })).toMatch(/raciones/)
    expect(validateRecipeForm(null, { ...ok, ingredients: [] })).toMatch(/1 a 60 ingredientes/)
    expect(validateRecipeForm(null, { ...ok, ingredients: [{ name: 'Sal', quantity: '1', unit: '' }, { name: 'sal', quantity: '2', unit: '' }] })).toMatch(/repetido/)
    expect(validateRecipeForm(null, { ...ok, ingredients: [{ name: 'Sal', quantity: 'x'.repeat(31), unit: '' }] })).toMatch(/cantidad/)
    expect(validateRecipeForm(null, { ...ok, activeMin: '20', totalMin: '' })).toMatch(/minutos enteros/)
    expect(validateRecipeForm(null, { ...ok, activeMin: '40', totalMin: '20' })).toMatch(/menor/)
    expect(validateRecipeForm(null, { ...ok, tip: 'x'.repeat(401) })).toMatch(/consejo/)
    expect(validateRecipeForm(null, { ...ok, freezeIdeal: true, freezeNote: 'x'.repeat(301) })).toMatch(/congelación/)
  })
  it('una receta nueva nace incompleta (hay que rellenarla antes de guardar el menú)', () => {
    expect(validateRecipeForm(null, recipeToForm(newRecipeRaw(4)))).not.toBeNull()
  })
})

describe('validación del menú completo (las reglas del servidor)', () => {
  it('un menú correcto es válido', () => expect(validateMenuLocal(menuOf())).toBeNull())
  it('la comida y la cena no pueden ser el mismo plato principal', () => {
    const m = setMealFields(menuOf(), 0, 'cena', { title: 'Comida 0' })
    expect(validateMenuLocal(m)).toMatch(/mismo plato principal/)
  })
  it('un plato no puede aparecer más de 2 veces en la semana', () => {
    let m = menuOf()
    for (const d of [0, 1, 2]) m = setMealFields(m, d, 'comida', { title: 'Lentejas' })
    expect(validateMenuLocal(m)).toMatch(/más de 2 veces/)
  })
  it('el título de la comida es obligatorio y una receta mala se señala con su día', () => {
    expect(validateMenuLocal(setMealFields(menuOf(), 4, 'comida', { title: '' }))).toMatch(/viernes \(comida\)/)
    expect(validateMenuLocal(replaceRecipe(menuOf(), 5, 'cena', 0, recipe('Mala', { steps: [] })))).toMatch(/^sábado \(cena\), .*pasos/)
  })
})

describe('comprobación editorial', () => {
  it('cuenta platos, recetas y completas; la falta de consejo es solo una recomendación', () => {
    let m = menuOf()
    m = replaceRecipe(m, 0, 'comida', 0, (() => { const r = recipe('Sin truco'); delete r.tip; return r })())
    m = addRecipe(m, 0, 'comida', recipe('Fruta', { simple: true, steps: [], tip: undefined }))
    const c = menuEditorialCheck(m)
    expect(c.dishes).toBe(14)
    expect(c.recipes).toBe(15)
    expect(c.simpleItems).toBe(1)
    expect(c.completeRecipes).toBe(15)
    expect(c.errors).toEqual([])
    expect(c.canApprove).toBe(true)
    expect(c.recommendations.some((r) => r.recipe === 'Sin truco' && /consejo/.test(r.message))).toBe(true)
    expect(c.recommendations.some((r) => r.recipe === 'Fruta')).toBe(false) // un sencillo no necesita consejo
    expect(checkSummaryLines(c)[0]).toMatch(/14 platos y 15 recetas/)
  })
  it('una receta incompleta impide aprobar y se localiza', () => {
    const m = replaceRecipe(menuOf(), 2, 'cena', 0, recipe('Rota', { ingredients: [] }))
    const c = menuEditorialCheck(m)
    expect(c.canApprove).toBe(false)
    expect(c.incomplete).toHaveLength(1)
    expect(c.incomplete[0]).toMatchObject({ day: 'miércoles', meal: 'cena', recipe: 'Rota' })
    expect(c.completeRecipes).toBe(c.recipes - 1)
    expect(c.errors[0]).toMatch(/Una receta tiene datos obligatorios pendientes/)
  })
  it('una cantidad vacía es una recomendación, no un error', () => {
    const m = replaceRecipe(menuOf(), 1, 'comida', 0, recipe('Sopa', { ingredients: [{ name: 'Sal', quantity: '', unit: '' }] }))
    const c = menuEditorialCheck(m)
    expect(c.canApprove).toBe(true)
    expect(c.recommendations.some((r) => /no tiene cantidad/.test(r.message))).toBe(true)
  })
  it('un menú sin siete días no es aprobable', () => {
    expect(menuEditorialCheck({ days: [] }).canApprove).toBe(false)
    expect(menuEditorialCheck(null).canApprove).toBe(false)
  })
})
