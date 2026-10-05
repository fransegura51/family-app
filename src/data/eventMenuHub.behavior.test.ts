import { beforeEach, describe, expect, it, vi } from 'vitest'

// «Menú del evento» — comportamiento REAL de la capa de datos contra una base en memoria. Lo importante: un plato
// puede ser solo un nombre (cero ingredientes inventados), nada llega a Compras sin que la familia lo elija, las
// secciones se guardan sin tocar los platos, y todo lo demás se LEE de donde ya vive (no se copia).
type Row = Record<string, unknown> & { id?: string }
const db: Record<string, Row[]> = {}
let idSeq = 0
const writes: { table: string; op: string }[] = []

function from(table: string) {
  const rows = () => (db[table] ??= [])
  let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  let payload: Row | Row[] = {}
  let conflict: string | undefined
  const filters: [string, unknown][] = []
  const matches = (r: Row) => filters.every(([c, v]) => r[c] === v)
  type Result = { data: Row[] | null; error: { message: string } | null }
  function exec(): Result {
    if (op !== 'select') writes.push({ table, op })
    if (op === 'select') return { data: rows().filter(matches).map((r) => ({ ...r })), error: null }
    if (op === 'insert') {
      const list = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: `${table}-${++idSeq}`, ...p }))
      rows().push(...list)
      return { data: list.map((r) => ({ ...r })), error: null }
    }
    if (op === 'upsert') {
      const p = payload as Row
      const existing = conflict ? rows().find((r) => r[conflict as string] === p[conflict as string]) : undefined
      if (existing) Object.assign(existing, p)
      else rows().push({ id: `${table}-${++idSeq}`, ...p })
      return { data: null, error: null }
    }
    if (op === 'update') {
      for (const r of rows().filter(matches)) Object.assign(r, payload)
      return { data: null, error: null }
    }
    db[table] = rows().filter((r) => !matches(r))
    return { data: null, error: null }
  }
  const builder = {
    select() {
      return builder
    },
    insert(p: Row | Row[]) {
      op = 'insert'
      payload = p
      return builder
    },
    upsert(p: Row, options?: { onConflict?: string }) {
      op = 'upsert'
      payload = p
      conflict = options?.onConflict
      return builder
    },
    update(p: Row) {
      op = 'update'
      payload = p
      return builder
    },
    delete() {
      op = 'delete'
      return builder
    },
    eq(c: string, v: unknown) {
      filters.push([c, v])
      return builder
    },
    order() {
      return builder
    },
    single() {
      const res = exec()
      const first = res.data?.[0]
      return Promise.resolve(first ? { data: first, error: null } : { data: null, error: { message: 'sin filas' } })
    },
    maybeSingle() {
      const res = exec()
      return Promise.resolve({ data: res.data?.[0] ?? null, error: res.error })
    },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      return Promise.resolve(exec()).then(resolve, reject)
    },
  }
  return builder
}

vi.mock('@/data/supabaseClient', () => ({
  supabase: { from, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } },
}))

const events = await import('@/data/events')
const food = await import('@/data/food')
const hub = await import('@/data/eventMenuHub')
const { addRecipeIngredientsToShoppingList } = food

const recipe = {
  id: 'r1',
  familyId: 'f1',
  title: 'Paella de la abuela',
  notes: null,
  imagePath: null,
  tags: [],
  ingredients: [
    { id: 'i1', name: 'Arroz', quantity: '400', unit: 'g' },
    { id: 'i2', name: 'Pollo', quantity: '1', unit: 'kg' },
    { id: 'i3', name: 'Azafrán', quantity: null, unit: null },
  ],
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  db.profiles = [{ id: 'u1', family_id: 'f1' }]
  idSeq = 0
  writes.length = 0
})

describe('Platos (5–8, 33)', () => {
  it('5/6. crear un menú manual: un plato es SOLO un nombre, sin receta, sin ingredientes y sin tocar Compras', async () => {
    await events.addEventMenuItem('e1', ' Gamba blanca ', 'Entrantes')
    expect(db.event_menu_items).toHaveLength(1)
    expect(db.event_menu_items[0]).toMatchObject({ name: 'Gamba blanca', category: 'Entrantes', recipe_id: null, prepared_by: null, notes: null })
    // 33. nada en Compras: ni el plato ni ingredientes inventados
    expect(db.shopping_items ?? []).toHaveLength(0)
    expect(writes.filter((w) => w.table === 'shopping_items')).toEqual([])
  })
  it('un plato con nota y origen (evento mixto) guarda ambos', async () => {
    await events.addEventMenuItem('e1', 'Paella', 'Plato principal', null, { notes: 'para 12', preparedBy: 'familia' })
    expect(db.event_menu_items[0]).toMatchObject({ notes: 'para 12', prepared_by: 'familia' })
  })
  it('7. editar un plato actualiza ESA fila (nombre, sección, nota, receta, quién lo prepara) sin duplicar', async () => {
    await events.addEventMenuItem('e1', 'Paella', 'Plato principal')
    const id = db.event_menu_items[0].id as string
    await events.updateEventMenuItem(id, { name: ' Paella valenciana ', category: 'Postres', notes: 'sin picante', recipeId: 'r1', preparedBy: 'proveedor' })
    expect(db.event_menu_items).toHaveLength(1)
    expect(db.event_menu_items[0]).toMatchObject({ name: 'Paella valenciana', category: 'Postres', notes: 'sin picante', recipe_id: 'r1', prepared_by: 'proveedor' })
    await events.updateEventMenuItem(id, { preparedBy: null })
    expect(db.event_menu_items[0].prepared_by).toBeNull()
  })
  it('8. eliminar un plato borra solo ese plato', async () => {
    await events.addEventMenuItem('e1', 'A', null)
    await events.addEventMenuItem('e1', 'B', null)
    await events.deleteEventMenuItem(db.event_menu_items[0].id as string)
    expect(db.event_menu_items.map((r) => r.name)).toEqual(['B'])
  })
  it('lo leído trae quién lo prepara (y un valor raro se trata como «sin indicar»)', async () => {
    db.event_menu_items = [
      { id: 'a', event_id: 'e1', family_id: 'f1', name: 'X', category: null, prepared_by: 'familia' },
      { id: 'b', event_id: 'e1', family_id: 'f1', name: 'Y', category: null, prepared_by: 'marciano' },
    ]
    const items = await events.listEventMenuItems('e1')
    expect(items.map((i) => i.preparedBy)).toEqual(['familia', null])
  })
})

describe('Secciones guardadas (9–14)', () => {
  it('sin configurar → null (se usan las de partida); guardar y releer; guardar dos veces = UNA fila', async () => {
    expect(await events.getEventMenuSections('e1')).toBeNull()
    const sections = [
      { key: 'entrantes', label: 'Entrantes', hidden: false },
      { key: 'bebidas', label: 'Bebidas', hidden: true },
    ]
    await events.saveEventMenuSections('e1', sections)
    await events.saveEventMenuSections('e1', sections)
    expect(db.event_menu_settings).toHaveLength(1)
    expect(db.event_menu_settings[0]).toMatchObject({ event_id: 'e1', family_id: 'f1' })
    expect(await events.getEventMenuSections('e1')).toEqual(sections)
  })
  it('12. guardar secciones NO toca ningún plato', async () => {
    await events.addEventMenuItem('e1', 'Gamba', 'Entrantes')
    const before = JSON.stringify(db.event_menu_items)
    await events.saveEventMenuSections('e1', [{ key: 'entrantes', label: 'Entrantes', hidden: true }])
    expect(JSON.stringify(db.event_menu_items)).toBe(before)
    expect(writes.filter((w) => w.table === 'event_menu_items' && w.op !== 'insert')).toEqual([])
  })
  it('un contenido corrupto en la base no rompe nada: se ignora', async () => {
    db.event_menu_settings = [{ event_id: 'e1', sections: 'basura' }]
    expect(await events.getEventMenuSections('e1')).toBeNull()
  })
})

describe('Recetas → Compras: el usuario elige y nada se envía solo (34–36)', () => {
  it('34/35. solo se añaden los ingredientes ELEGIDOS, ligados al evento, con tienda opcional', async () => {
    await addRecipeIngredientsToShoppingList(
      recipe,
      [
        { ingredientId: 'i1', store: 'Mercadona' },
        { ingredientId: 'i3', store: null },
      ],
      'e1',
    )
    expect(db.shopping_items.map((r) => [r.name, r.quantity, r.unit, r.store, r.event_id])).toEqual([
      ['Arroz', '400', 'g', 'Mercadona', 'e1'],
      ['Azafrán', null, null, null, 'e1'],
    ])
  })
  it('36. sin selección no se escribe nada; un id que no es de la receta se ignora (no se inventa nada)', async () => {
    await addRecipeIngredientsToShoppingList(recipe, [], 'e1')
    await addRecipeIngredientsToShoppingList(recipe, [{ ingredientId: 'inventado', store: null }], 'e1')
    expect(db.shopping_items ?? []).toHaveLength(0)
  })
  it('vincular una receta a un plato (o crear el plato) jamás añade nada a Compras', async () => {
    await events.addEventMenuItem('e1', 'Paella', 'Plato principal', null, { recipeId: 'r1', preparedBy: 'familia' })
    await events.updateEventMenuItem(db.event_menu_items[0].id as string, { recipeId: 'r1' })
    expect(db.shopping_items ?? []).toHaveLength(0)
  })
})

describe('Preguntas de invitados: clasificar y leer respuestas (39)', () => {
  it('marcar una pregunta como de comida es un cambio explícito de ESA fila (topic); desmarcar la devuelve a «sin clasificar»', async () => {
    db.event_guest_questions = [{ id: 'q1', event_id: 'e1', family_id: 'f1', prompt: 'Carne o pescado', scope: 'persona', required: false, active: true, sort_order: 1, created_at: '', topic: null }]
    await events.updateEventGuestQuestion('q1', { topic: 'comida' })
    expect((await events.listEventGuestQuestions('e1'))[0].topic).toBe('comida')
    await events.updateEventGuestQuestion('q1', { topic: null })
    expect((await events.listEventGuestQuestions('e1'))[0].topic).toBeNull()
  })
  it('las respuestas se LEEN de la tabla donde ya las guarda el RSVP (sin copias)', async () => {
    db.event_guest_question_answers = [{ id: 'a1', question_id: 'q1', event_id: 'e1', family_id: 'f1', guest_id: 'g1', member_id: 'm1', option_id: 'o1', created_at: 'c', updated_at: 'u' }]
    expect(await events.listEventGuestQuestionAnswers('e1')).toEqual([{ id: 'a1', questionId: 'q1', eventId: 'e1', familyId: 'f1', guestId: 'g1', memberId: 'm1', optionId: 'o1', createdAt: 'c', updatedAt: 'u' }])
    expect(writes.filter((w) => w.table === 'event_guest_question_answers')).toEqual([])
  })
})

describe('La pantalla solo LEE las fuentes existentes (39, 22)', () => {
  it('cargar el Menú del evento no escribe nada en ninguna tabla', async () => {
    const data = await hub.loadMenuHubData('e1')
    expect(data.items).toEqual([])
    expect(data.sections).toBeNull()
    expect(data.guests).toEqual([])
    expect(writes).toEqual([])
  })
})
