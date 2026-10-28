// Comparación de un menú antes/después de rectificarlo con Pepa (receta por receta), avisos y alcance de la rectificación.
import { describe, expect, it } from 'vitest'
import { reviseTargetText, reviseWire, type ReviseTarget } from '@/domain/communityEditorial'
import { checkMenuClaims, compareMenus, isSlotLabelTitle, mealLabel, mealsOfDay, menuChangeStats, readMealSnapshot, recipeTitlesOf, scopeTargetFor, statsText, type ScopeMenu } from '@/domain/communityMenuDiff'

const ing = (name: string, quantity: string, unit = 'g') => ({ name, quantity, unit })
const rec = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  servings: 4,
  ingredients: [ing('Pollo', '600'), ing('Limón', '2', 'unidades')],
  steps: ['Corta el pollo.', 'Cocínalo diez minutos.'],
  ...extra,
})
const meal = (title: string, recipes: unknown[], side = 'Pan') => ({ title, side, recipes })
const menu = (over: Record<number, { comida?: unknown; cena?: unknown }> = {}) => ({
  menu: {
    servings: 4,
    days: ['lunes', 'martes', 'miércoles'].map((day, i) => ({
      day,
      meals: { comida: over[i]?.comida ?? meal(`Comida ${i}`, [rec(`Plato ${i}`)]), cena: over[i]?.cena ?? meal(`Cena ${i}`, [rec(`Cena rica ${i}`)]) },
    })),
  },
})

describe('compareMenus', () => {
  it('menús iguales: ningún cambio', () => {
    expect(compareMenus(menu(), JSON.parse(JSON.stringify(menu())))).toEqual([])
    expect(statsText(menuChangeStats([]))).toBe('No cambia ningún plato.')
  })

  it('receta NUEVA, ELIMINADA y MODIFICADA en comidas distintas; lo demás no aparece', () => {
    const before = menu({ 0: { comida: meal('Pollo', [rec('Pollo al limón'), rec('Ensalada', { simple: true, steps: [] })]) }, 1: { cena: meal('Sopa', [rec('Sopa de fideos')]) } })
    const after = menu({
      0: { comida: meal('Pollo', [rec('Pollo al limón', { ingredients: [ing('Pollo', '800'), ing('Limón', '2', 'unidades')], tip: 'Mejor con limón fresco.' }), rec('Ensalada', { simple: true, steps: [] }), rec('Arroz blanco')]) },
      1: { cena: meal('Sopa', []) },
    })
    const changes = compareMenus(before, after)
    expect(changes.map((c) => mealLabel(c))).toEqual(['Lunes · Comida', 'Martes · Cena'])
    const lunes = changes[0]
    expect(lunes.recipes.map((r) => [r.kind, r.title])).toEqual([
      ['changed', 'Pollo al limón'],
      ['added', 'Arroz blanco'],
    ])
    const modified = lunes.recipes[0]
    expect(modified.diff?.ingredientsChanged.length).toBe(1) // 600 g → 800 g
    expect(modified.extras.join(' ')).toMatch(/consejo/i)
    expect(changes[1].recipes.map((r) => [r.kind, r.title])).toEqual([['removed', 'Sopa de fideos']])
    expect(menuChangeStats(changes)).toEqual({ meals: 2, added: 1, removed: 1, changed: 1 })
    expect(statsText(menuChangeStats(changes))).toBe('2 comidas cambian: 1 receta nueva, 1 modificada, 1 eliminada.')
  })

  it('quitar la primera receta no se confunde con un cambio de otra (se empareja por nombre)', () => {
    const before = menu({ 0: { comida: meal('Plato', [rec('A'), rec('B')]) } })
    const after = menu({ 0: { comida: meal('Plato', [rec('B')]) } })
    expect(compareMenus(before, after)[0].recipes.map((r) => [r.kind, r.title])).toEqual([['removed', 'A']])
  })

  it('cambiar solo el nombre del plato, el acompañamiento o el orden de las recetas también es un cambio', () => {
    const before = menu({ 0: { comida: meal('Plato', [rec('A'), rec('B')]) } })
    const renamed = compareMenus(before, menu({ 0: { comida: meal('Otro nombre', [rec('A'), rec('B')]) } }))
    expect(renamed[0]).toMatchObject({ titleChanged: true, sideChanged: false, orderChanged: false })
    expect(renamed[0].recipes).toEqual([])
    const side = compareMenus(before, menu({ 0: { comida: meal('Plato', [rec('A'), rec('B')], 'Ensalada') } }))
    expect(side[0]).toMatchObject({ titleChanged: false, sideChanged: true })
    const order = compareMenus(before, menu({ 0: { comida: meal('Plato', [rec('B'), rec('A')]) } }))
    expect(order[0]).toMatchObject({ orderChanged: true })
    expect(order[0].recipes).toEqual([])
  })

  it('una comida que aparece o desaparece del menú', () => {
    const before = menu()
    const after = JSON.parse(JSON.stringify(menu()))
    delete after.menu.days[2].meals.cena
    const changes = compareMenus(before, after)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ dayIndex: 2, meal: 'cena', after: null })
    expect(changes[0].recipes[0].kind).toBe('removed')
    const back = compareMenus(after, before)
    expect(back[0].before).toBeNull()
    expect(back[0].recipes[0].kind).toBe('added')
  })

  it('lectura tolerante: elementos sencillos, recetas raras y datos vacíos no rompen', () => {
    const s = readMealSnapshot(meal('Postre', [rec('Fruta', { simple: true, steps: [] }), 'basura', null]))
    expect(s?.recipes).toHaveLength(1)
    expect(s?.recipes[0].simple).toBe(true)
    expect(readMealSnapshot(null)).toBeNull()
    expect(readMealSnapshot({})).toBeNull()
    expect(compareMenus({}, {})).toEqual([])
  })
})

describe('checkMenuClaims', () => {
  it('avisa si el plato sigue llamándose «Martes, cena» o si la receta principal cambió y el nombre del plato no', () => {
    const before = menu({ 1: { cena: meal('Martes, cena', [rec('Crema de calabacín')]) } })
    const after = menu({ 1: { cena: meal('Martes, cena', [rec('Sopa de letras')]) } })
    const w = checkMenuClaims({ notes: 'Cambié la cena.', changes: compareMenus(before, after) })
    expect(w.map((x) => x.code)).toEqual(['slot-label-title'])

    const stale = checkMenuClaims({ notes: 'ok', changes: compareMenus(menu({ 1: { cena: meal('Crema', [rec('Crema de calabacín')]) } }), menu({ 1: { cena: meal('Crema', [rec('Sopa de letras')]) } })) })
    expect(stale.map((x) => x.code)).toEqual(['dish-name-stale'])
    expect(stale[0].message).toContain('Sopa de letras')
    expect(stale[0].message).toContain('Crema')

    const fine = checkMenuClaims({ notes: 'ok', changes: compareMenus(menu({ 1: { cena: meal('Crema', [rec('Crema de calabacín')]) } }), menu({ 1: { cena: meal('Sopa de letras', [rec('Sopa de letras')]) } })) })
    expect(fine).toEqual([])
  })

  it('avisa si Pepa dice haber añadido una receta y la propuesta no añade ninguna ficha', () => {
    const changes = compareMenus(menu(), menu({ 0: { comida: meal('Comida 0', [rec('Plato 0', { tip: 'Nuevo consejo.' })]) } }))
    expect(checkMenuClaims({ notes: 'He añadido la receta del arroz.', changes }).map((x) => x.code)).toEqual(['claims-new-recipe'])
    expect(checkMenuClaims({ notes: 'He cambiado el consejo.', changes })).toEqual([])
    const added = compareMenus(menu(), menu({ 0: { comida: meal('Comida 0', [rec('Plato 0'), rec('Arroz')]) } }))
    expect(checkMenuClaims({ notes: 'He añadido la receta del arroz.', changes: added })).toEqual([])
  })

  it('isSlotLabelTitle', () => {
    for (const t of ['Martes, cena', 'cena', 'Comida del lunes', 'Cena de domingo']) expect(isSlotLabelTitle(t), t).toBe(true)
    for (const t of ['Sopa de letras', 'Cena de Navidad con pavo', 'Lentejas']) expect(isSlotLabelTitle(t), t).toBe(false)
  })
})

describe('alcance de la rectificación', () => {
  const sm: ScopeMenu = {
    days: [
      { day: 'lunes', comida: { title: 'Pollo', recipes: [{ title: 'Pollo al limón' }, { title: 'Ensalada' }] }, cena: { title: 'Crema', recipes: [{ title: 'Crema' }] } },
      { day: 'martes', comida: null, cena: { title: 'Sopa', recipes: [{ title: 'Sopa' }, { title: 'Pan' }, { title: 'Fruta' }] } },
    ],
  }

  it('lo que se manda al servidor para cada alcance (los valores que ya existían no cambian de nombre)', () => {
    expect(reviseWire({ scope: 'week' })).toEqual({ scope: 'item' })
    expect(reviseWire({ scope: 'meal', day: 1, meal: 'cena' })).toEqual({ scope: 'dish', target: { day: 1, meal: 'cena' } })
    expect(reviseWire({ scope: 'day', day: 3 })).toEqual({ scope: 'day', target: { day: 3 } })
    expect(reviseWire({ scope: 'recipe', day: 0, meal: 'comida', recipe: 1 })).toEqual({ scope: 'recipe', target: { day: 0, meal: 'comida', recipe: 1 } })
  })

  it('texto del destino', () => {
    expect(reviseTargetText({ scope: 'week' })).toBe('Todo el menú')
    expect(reviseTargetText({ scope: 'day', day: 1 })).toBe('Martes')
    expect(reviseTargetText({ scope: 'meal', day: 1, meal: 'cena' })).toBe('Martes · Cena')
    expect(reviseTargetText({ scope: 'recipe', day: 0, meal: 'comida', recipe: 1 })).toBe('Lunes · Comida · receta 2')
  })

  it('al cambiar de alcance se conserva el día, la comida y la receta mientras sigan existiendo', () => {
    expect(mealsOfDay(sm, 1)).toEqual(['cena'])
    expect(recipeTitlesOf(sm, 1, 'cena')).toEqual(['Sopa', 'Pan', 'Fruta'])
    const recipe: ReviseTarget = { scope: 'recipe', day: 0, meal: 'comida', recipe: 1 }
    expect(scopeTargetFor(sm, 'meal', recipe)).toEqual({ scope: 'meal', day: 0, meal: 'comida' })
    expect(scopeTargetFor(sm, 'day', recipe)).toEqual({ scope: 'day', day: 0 })
    expect(scopeTargetFor(sm, 'week', recipe)).toEqual({ scope: 'week' })
    // Otro día sin esa comida: se pasa a la que exista y la receta se ajusta.
    expect(scopeTargetFor(sm, 'recipe', { scope: 'recipe', day: 1, meal: 'comida', recipe: 1 })).toEqual({ scope: 'recipe', day: 1, meal: 'cena', recipe: 1 })
    expect(scopeTargetFor(sm, 'recipe', { scope: 'recipe', day: 0, meal: 'cena', recipe: 5 })).toEqual({ scope: 'recipe', day: 0, meal: 'cena', recipe: 0 })
    expect(scopeTargetFor(sm, 'meal', null)).toEqual({ scope: 'meal', day: 0, meal: 'comida' })
  })
})
