// community-editorial: rectificar un MENÚ con alcance elegido (una receta, una comida, un día o el menú entero). La IA solo puede tocar esos huecos y el servidor
// comprueba que todo lo demás queda idéntico byte a byte. Nunca publica ni aprueba.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleEditorial } from '../../supabase/functions/community-editorial/editorial'
import { isSlotLabelTitle, onlyRecipeChanged, outsideUnchanged, parseReviseRequest } from '../../supabase/functions/community-editorial/revise'
import { ADMIN_ID, adminRequest, harness, menuOf, recipe, text, type HarnessOptions } from './communityEditorialFakes'

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => vi.restoreAllMocks())

const ITEM = '99999999-9999-4999-8999-999999999999'
const menuItem = () => ({
  id: ITEM, kind: 'menu', section: 'recetas', topic_id: 'menus-planificacion', topic_label: 'Menús', status: 'proposed', version: 1,
  title: 'Menú semanal de Pepa: semana del 2 al 8 de noviembre', body: 'Ideas para la semana.', payload: { menu: menuOf(), schedule: 'saturday', source: 'Pepa (IA), revisado por una persona' },
})
const articleItem = () => ({
  id: ITEM, kind: 'article', section: 'recetas', topic_id: 'recetas-faciles', topic_label: 'Recetas fáciles', status: 'proposed', version: 1,
  title: 'Tortillas', body: 'Texto', payload: { editorial: true },
})

function setup(item: unknown, revise: HarnessOptions['revise'], extra: HarnessOptions = {}) {
  return harness({ ...extra, revise, rpc: { community_service_editorial_get_item: () => item as never, community_service_editorial_save_revision: () => 'rev-1', ...extra.rpc } })
}
const revise = async (h: ReturnType<typeof harness>, body: Record<string, unknown>) => {
  const res = await handleEditorial(adminRequest({ action: 'revise', item_id: ITEM, instruction: 'Cámbialo por pescado', ...body }, 'Bearer admin'), h.deps)
  return { res, json: (await res.json()) as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
}
const noMutation = (h: ReturnType<typeof harness>) => {
  expect(h.rpcNames().some((n) => /approve|publish|schedule|update_item|decide/.test(n))).toBe(false)
  expect(h.client.inserted).toHaveLength(0)
}
const dish = (title: string) => ({ title, side: 'Pan', recipes: [recipe(`${title} (receta)`)] })
const sameExcept = (before: any, after: any, slots: [number, string][]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let d = 0; d < 7; d++) {
    expect(after.days[d].day).toBe(before.days[d].day)
    for (const m of ['comida', 'cena']) {
      if (slots.some(([sd, sm]) => sd === d && sm === m)) continue
      expect(JSON.stringify(after.days[d].meals[m]), `${d} ${m}`).toBe(JSON.stringify(before.days[d].meals[m]))
    }
  }
}

describe('rectificar un menú: alcance «un día»', () => {
  it('revisa las dos comidas de ese día (una llamada por comida) y el resto del menú queda idéntico byte a byte', async () => {
    const item = menuItem()
    const before = JSON.parse(JSON.stringify(item.payload.menu))
    const h = setup(item, (_n, p) => JSON.stringify({ ...dish(p.includes('martes, comida') ? 'Merluza al horno' : 'Sopa de letras'), notes: p.includes('martes, comida') ? 'Comida de pescado.' : 'Cena de sopa.' }))
    const { json } = await revise(h, { scope: 'day', target: { day: 1 } })
    expect(json.ok).toBe(true)
    expect(h.provider.requests).toHaveLength(2)
    const after = json.result.payload.menu
    expect(after.days[1].meals.comida.title).toBe('Merluza al horno')
    expect(after.days[1].meals.cena.title).toBe('Sopa de letras')
    sameExcept(before, after, [[1, 'comida'], [1, 'cena']])
    expect(json.notes).toContain('Comida de pescado.')
    expect(json.notes).toContain('Cena de sopa.')
    expect(json.result.title).toBe(item.title)
    expect(json.result.body).toBe(item.body)
    expect(json.result.payload.schedule).toBe('saturday')
    expect(h.client.argsOf('community_service_editorial_save_revision')[0]).toMatchObject({ p_scope: 'day', p_target: { day: 1 } })
    // A la IA se le dice que el alcance es un día entero y que solo cambie lo que se pida.
    expect(text(h.provider.requests[0])).toContain('afecta a un día entero')
    noMutation(h)
  })

  it('una comida que la IA devuelve igual conserva el original TAL CUAL (sin cambios colaterales)', async () => {
    const item = menuItem()
    const original = (item.payload.menu as any).days[1].meals.comida // eslint-disable-line @typescript-eslint/no-explicit-any
    const h = setup(item, (_n, p) => JSON.stringify(p.includes('martes, comida') ? { ...original, notes: 'Esta comida no cambia.' } : { ...dish('Tortilla francesa'), notes: 'Cena nueva.' }))
    const { json } = await revise(h, { scope: 'day', target: { day: 1 }, instruction: 'Cambia solo la cena del martes' })
    expect(json.ok).toBe(true)
    expect(JSON.stringify(json.result.payload.menu.days[1].meals.comida)).toBe(JSON.stringify(original))
    expect(json.result.payload.menu.days[1].meals.cena.title).toBe('Tortilla francesa')
    expect(json.notes).toBe('Cena nueva.') // la comida que no cambia no aporta nota
  })

  it('un nombre de plato que es la etiqueta del hueco («Martes, cena») se rechaza y se reintenta con el motivo', async () => {
    let calls = 0
    const h = setup(menuItem(), (_n, p) => {
      if (p.includes('martes, comida')) return JSON.stringify({ ...dish('Merluza'), notes: 'ok' })
      return JSON.stringify({ ...dish(calls++ === 0 ? 'Martes, cena' : 'Sopa de letras'), notes: 'ok' })
    })
    const { json } = await revise(h, { scope: 'day', target: { day: 1 } })
    expect(json.ok).toBe(true)
    expect(json.result.payload.menu.days[1].meals.cena.title).toBe('Sopa de letras')
  })
})

describe('rectificar un menú: alcance «una receta»', () => {
  it('cambia SOLO esa receta: título, acompañamiento y demás recetas del plato quedan idénticos', async () => {
    const item = menuItem()
    const before = JSON.parse(JSON.stringify(item.payload.menu))
    const newRecipe = recipe('Ensalada de tomate y orégano', { simple: true, steps: [] })
    const h = setup(item, () => JSON.stringify({ recipe: newRecipe, notes: 'Cambié la ensalada.' }))
    const { json } = await revise(h, { scope: 'recipe', target: { day: 0, meal: 'comida', recipe: 1 }, instruction: 'Cambia la ensalada por una de tomate' })
    expect(json.ok).toBe(true)
    expect(h.provider.requests).toHaveLength(1)
    const after = json.result.payload.menu
    const meal = after.days[0].meals.comida
    expect(meal.recipes[1].title).toBe('Ensalada de tomate y orégano')
    expect(JSON.stringify(meal.recipes[0])).toBe(JSON.stringify(before.days[0].meals.comida.recipes[0]))
    expect(meal.title).toBe(before.days[0].meals.comida.title)
    expect(meal.side).toBe(before.days[0].meals.comida.side)
    sameExcept(before, after, [[0, 'comida']])
    expect(h.client.argsOf('community_service_editorial_save_revision')[0]).toMatchObject({ p_scope: 'recipe', p_target: { day: 0, meal: 'comida', recipe: 1 } })
    // El modelo solo recibe esa receta y el nombre del plato como contexto.
    expect(text(h.provider.requests[0])).toContain('receta 2 de 2')
    noMutation(h)
  })

  it('la primera receta (plato principal) no puede pasar a ser un elemento sencillo; se reintenta y, si persiste, invalid_output', async () => {
    const h = setup(menuItem(), () => JSON.stringify({ recipe: recipe('Fruta', { simple: true, steps: [] }), notes: 'ok' }))
    const { json } = await revise(h, { scope: 'recipe', target: { day: 0, meal: 'comida', recipe: 0 } })
    expect(json).toEqual({ ok: false, error: 'invalid_output' })
    expect(h.client.count('community_service_editorial_save_revision')).toBe(0)
  })

  it('una receta que no existe en esa comida → bad_request sin llamar a la IA', async () => {
    const h = setup(menuItem(), () => 'x')
    const { res, json } = await revise(h, { scope: 'recipe', target: { day: 0, meal: 'cena', recipe: 3 } })
    expect(res.status).toBe(400)
    expect(json).toEqual({ ok: false, error: 'bad_request' })
    expect(h.provider.requests).toHaveLength(0)
  })

  it('una receta con raciones distintas de las del menú se rechaza (mismas reglas que al generar)', async () => {
    const h = setup(menuItem(), () => JSON.stringify({ recipe: recipe('Arroz', { servings: 6 }), notes: 'ok' }))
    const { json } = await revise(h, { scope: 'recipe', target: { day: 0, meal: 'cena', recipe: 0 } })
    expect(json).toEqual({ ok: false, error: 'invalid_output' })
  })
})

describe('alcances: petición y garantía de «solo lo pedido»', () => {
  const body = (extra: Record<string, unknown>) => ({ item_id: ITEM, instruction: 'Cambia algo', ...extra })
  it('acepta los cuatro alcances y rechaza peticiones mal formadas', () => {
    expect(parseReviseRequest(body({ scope: 'item' }))).toMatchObject({ scope: 'item', target: null })
    expect(parseReviseRequest(body({ scope: 'dish', target: { day: 2, meal: 'cena' } }))).toMatchObject({ scope: 'dish', target: { day: 2, meal: 'cena' } })
    expect(parseReviseRequest(body({ scope: 'day', target: { day: 6 } }))).toMatchObject({ scope: 'day', target: { day: 6 } })
    expect(parseReviseRequest(body({ scope: 'recipe', target: { day: 0, meal: 'comida', recipe: 5 } }))).toMatchObject({ scope: 'recipe', target: { day: 0, meal: 'comida', recipe: 5 } })
    const bad = [
      { scope: 'day' }, { scope: 'day', target: { day: 7 } }, { scope: 'day', target: { day: -1 } }, { scope: 'day', target: { day: 1.5 } },
      { scope: 'recipe', target: { day: 0, meal: 'comida' } }, { scope: 'recipe', target: { day: 0, meal: 'comida', recipe: -1 } }, { scope: 'recipe', target: { day: 0, meal: 'comida', recipe: 6 } },
      { scope: 'recipe', target: { day: 0, meal: 'merienda', recipe: 0 } }, { scope: 'dish', target: { day: 0 } }, { scope: 'semana' }, {},
    ]
    for (const b of bad) expect(parseReviseRequest(body(b)), JSON.stringify(b)).toBeNull()
  })

  it('un día o una receta solo existen en menús: en un artículo → bad_request', async () => {
    for (const extra of [{ scope: 'day', target: { day: 0 } }, { scope: 'recipe', target: { day: 0, meal: 'cena', recipe: 0 } }]) {
      const h = setup(articleItem(), () => 'x')
      const { res, json } = await revise(h, extra)
      expect(res.status).toBe(400)
      expect(json).toEqual({ ok: false, error: 'bad_request' })
      expect(h.provider.requests).toHaveLength(0)
    }
  })

  it('outsideUnchanged detecta cualquier cambio fuera de los huecos permitidos', () => {
    const a = { menu: menuOf(), schedule: 'saturday' }
    const b = JSON.parse(JSON.stringify(a))
    b.menu.days[1].meals.cena.title = 'Otro'
    expect(outsideUnchanged(a, b, [{ day: 1, meal: 'cena' }])).toBe(true)
    expect(outsideUnchanged(a, b, [{ day: 1, meal: 'comida' }])).toBe(false)
    expect(outsideUnchanged(a, b, [])).toBe(false)
    const c = JSON.parse(JSON.stringify(a))
    c.schedule = 'otro'
    expect(outsideUnchanged(a, c, [{ day: 1, meal: 'cena' }])).toBe(false)
    const d = JSON.parse(JSON.stringify(a))
    d.menu.days[3].meals.comida.recipes[0].steps.push('paso extra')
    expect(outsideUnchanged(a, d, [{ day: 1, meal: 'cena' }])).toBe(false)
  })

  it('onlyRecipeChanged: el título, el acompañamiento y las demás recetas no pueden cambiar', () => {
    const meal = { title: 'Plato', side: 'Pan', recipes: [recipe('A'), recipe('B')] }
    expect(onlyRecipeChanged(meal, { ...meal, recipes: [meal.recipes[0], recipe('C')] }, 1)).toBe(true)
    expect(onlyRecipeChanged(meal, { ...meal, title: 'Otro', recipes: [meal.recipes[0], recipe('C')] }, 1)).toBe(false)
    expect(onlyRecipeChanged(meal, { ...meal, recipes: [recipe('X'), recipe('C')] }, 1)).toBe(false)
    expect(onlyRecipeChanged(meal, { ...meal, recipes: [meal.recipes[0]] }, 1)).toBe(false)
  })

  it('isSlotLabelTitle: etiquetas de hueco sí, nombres de plato no', () => {
    for (const t of ['Martes, cena', 'cena', 'Comida del lunes', 'Miércoles comida', 'Cena de domingo']) expect(isSlotLabelTitle(t), t).toBe(true)
    for (const t of ['Sopa de letras', 'Cena de Navidad con pavo', 'Lentejas con chorizo']) expect(isSlotLabelTitle(t), t).toBe(false)
  })

  it('el alcance «menú completo» sigue funcionando como siempre (scope item)', async () => {
    const item = menuItem()
    const h = setup(item, () => JSON.stringify({ changes: [], notes: 'Nada que cambiar.', body: 'Ideas nuevas para tu semana.' }))
    const { json } = await revise(h, { scope: 'item', instruction: 'Cambia la introducción' })
    expect(json.ok).toBe(true)
    expect(json.result.body).toBe('Ideas nuevas para tu semana.')
    expect(JSON.stringify(json.result.payload)).toBe(JSON.stringify(item.payload))
    expect(h.client.argsOf('community_service_editorial_save_revision')[0]).toMatchObject({ p_scope: 'item', p_user: ADMIN_ID })
  })
})
