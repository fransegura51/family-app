import { beforeEach, describe, expect, it, vi } from 'vitest'

// «Menú del evento» — el ORDEN del documento sobrevive a todo: guardar, cerrar y volver a abrir, editar, cambiar de
// sección, vincular receta, añadir nota y una segunda importación. Base en memoria que imita lo importante de
// Postgres: el disparador que coloca los nuevos al final y reorder_event_menu_items (todo el menú, atómico).
type Row = Record<string, unknown> & { id?: string }
const db: Record<string, Row[]> = {}
let idSeq = 0
let clock = 0

function from(table: string) {
  const rows = () => (db[table] ??= [])
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | Row[] = {}
  let returning = false
  let limit: number | null = null
  let orderBy: { col: string; asc: boolean } | null = null
  const filters: [string, unknown][] = []
  const matches = (r: Row) => filters.every(([c, v]) => r[c] === v)
  type Result = { data: Row[] | null; error: { message: string } | null }
  function exec(): Result {
    if (op === 'select') {
      let list = rows().filter(matches).map((r) => ({ ...r }))
      if (orderBy) list = list.sort((a, b) => (Number(a[orderBy!.col]) - Number(b[orderBy!.col])) * (orderBy!.asc ? 1 : -1))
      if (limit !== null) list = list.slice(0, limit)
      return { data: list, error: null }
    }
    if (op === 'insert') {
      const list = (Array.isArray(payload) ? payload : [payload]).map((p) => {
        const row: Row = { id: `${table}-${++idSeq}`, created_at: `2026-10-05T10:00:${String(++clock).padStart(2, '0')}Z`, ...p }
        if (table === 'event_menu_items') {
          // trigger trg_event_menu_items_sort_order: sort_order ausente/0 → al final (+1000)
          if (row.sort_order == null || row.sort_order === 0) {
            const max = Math.max(0, ...rows().filter((r) => r.event_id === row.event_id).map((r) => Number(r.sort_order)))
            row.sort_order = max + 1000
          }
          row.kind = row.kind ?? 'dish'
        }
        return row
      })
      rows().push(...list)
      return { data: list.map((r) => ({ ...r })), error: null }
    }
    if (op === 'update') {
      const targets = rows().filter(matches)
      for (const r of targets) Object.assign(r, payload)
      return { data: returning ? targets.map((r) => ({ ...r })) : null, error: null }
    }
    db[table] = rows().filter((r) => !matches(r))
    return { data: null, error: null }
  }
  const builder = {
    select() {
      if (op !== 'select') returning = true
      return builder
    },
    insert(p: Row | Row[]) {
      op = 'insert'
      payload = p
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
    order(col: string, o?: { ascending?: boolean }) {
      orderBy = { col, asc: o?.ascending !== false }
      return builder
    },
    limit(n: number) {
      limit = n
      return builder
    },
    single() {
      const res = exec()
      const first = res.data?.[0]
      return Promise.resolve(first ? { data: first, error: null } : { data: null, error: { message: 'sin filas' } })
    },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      return Promise.resolve(exec()).then(resolve, reject)
    },
  }
  return builder
}

// reorder_event_menu_items (0196), fiel al SQL: TODOS los elementos del evento, en el orden recibido, de 1000 en 1000.
// import_event_menu (0204), fiel al SQL: inserta todo con orden base+i*1000 y, si no es al final, reconstruye el
// orden completo dentro de la MISMA operación (todo o nada). Platos existentes solo cambian de posición.
function importRpc(args: Record<string, unknown>) {
  const eventId = args.p_event_id as string
  const rows = args.p_rows as { text: string; kind: string; category: string | null; notes: string | null }[]
  const placement = (args.p_placement ?? { type: 'end' }) as { type: string; itemId?: string }
  const table = (db.event_menu_items ??= [])
  const base = Math.max(0, ...table.filter((r) => r.event_id === eventId).map((r) => Number(r.sort_order)))
  const newIds: string[] = rows.map((row, i) => {
    const id = `event_menu_items-${++idSeq}`
    table.push({
      id,
      event_id: eventId,
      family_id: 'f1',
      name: row.text.trim(),
      category: row.kind === 'dish' ? row.category : null,
      notes: row.notes,
      sort_order: base + (i + 1) * 1000,
      source: 'importado',
      document_id: args.p_document_id ?? null,
      kind: row.kind,
    })
    return id
  })
  if (placement.type !== 'end') {
    const old = table
      .filter((r) => r.event_id === eventId && !newIds.includes(r.id as string))
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      .map((r) => r.id as string)
    const pos = placement.type === 'start' ? 0 : old.indexOf(placement.itemId as string) + 1
    const final = [...old.slice(0, pos), ...newIds, ...old.slice(pos)]
    final.forEach((id, i) => {
      ;(table.find((r) => r.id === id) as Row).sort_order = (i + 1) * 1000
    })
  }
  return Promise.resolve({ data: newIds, error: null })
}

function rpc(name: string, args: Record<string, unknown>) {
  if (name === 'import_event_menu') return importRpc(args)
  if (name !== 'reorder_event_menu_items') return Promise.resolve({ error: { message: 'función desconocida' } })
  const ids = args.p_ids as string[]
  const table = db.event_menu_items ?? []
  const found = table.filter((r) => ids.includes(r.id as string))
  if (found.length !== ids.length || new Set(found.map((r) => r.event_id)).size !== 1) return Promise.resolve({ error: { message: 'not found' } })
  if (table.filter((r) => r.event_id === found[0].event_id).length !== ids.length) return Promise.resolve({ error: { message: 'incomplete order' } })
  ids.forEach((id, i) => {
    ;(table.find((r) => r.id === id) as Row).sort_order = (i + 1) * 1000
  })
  return Promise.resolve({ error: null })
}

vi.mock('@/data/supabaseClient', () => ({
  supabase: { from, rpc, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } },
}))

const events = await import('@/data/events')
const { sanitizeImportProposal } = await import('@/domain/eventFoodMenu')
const { importRowsToSave } = await import('@/ui/EventMenuImporter')
const { menuSequence, placementForNewDish } = await import('@/domain/eventMenuSequence')
const { resolveMenuSections, defaultSections } = await import('@/domain/eventMenuHub')
const { REAL_MENU_IN_DOCUMENT_ORDER, realMenuAiResponse } = await import('@/domain/eventMenuRealFixture')

const names = async (eventId = 'e1') => menuSequence(await events.listEventMenuItems(eventId)).map((i) => i.name)
const row = (id: string) => (db.event_menu_items ?? []).find((r) => r.id === id) as Row
const byName = (name: string) => (db.event_menu_items ?? []).find((r) => r.name === name) as Row

function toRows(response: unknown) {
  return sanitizeImportProposal(response).items.map((item, i) => ({ id: `r${i}`, text: item.text, kind: item.kind, section: item.section, note: item.note, include: item.include }))
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  db.profiles = [{ id: 'u1', family_id: 'f1' }]
  idSeq = 0
  clock = 0
})

describe('El caso REAL: «Cambio de Tercio» y el orden del documento (24)', () => {
  it('ANTES y DESPUÉS de guardar, y tras volver a abrir, la secuencia es exactamente la del documento', async () => {
    // ANTES de guardar: la revisión
    const rows = toRows(realMenuAiResponse())
    expect(rows.map((r) => r.text)).toEqual(REAL_MENU_IN_DOCUMENT_ORDER)

    // GUARDAR (todas las filas marcadas, con las secciones que PEPA sugirió: Postres, Bebidas, Otro, Aperitivo…)
    const { count } = await events.importEventMenuItems('e1', importRowsToSave(rows, null), { documentId: 'doc1' })
    expect(count).toBe(16)

    // DESPUÉS de guardar y tras «cerrar y volver a abrir» (una consulta nueva)
    expect(await names()).toEqual(REAL_MENU_IN_DOCUMENT_ORDER)
    expect(await names()).toEqual(REAL_MENU_IN_DOCUMENT_ORDER)

    // «Cambio de Tercio» se conserva como encabezado, sin sección ni receta: no finge ser un plato
    const tercio = byName('Cambio de Tercio')
    expect(tercio).toMatchObject({ kind: 'heading', category: null, source: 'importado', document_id: 'doc1' })
    expect(tercio.recipe_id ?? null).toBeNull()
    expect(tercio.prepared_by ?? null).toBeNull()
    // y las secciones sugeridas quedaron como metadato
    expect(byName('Café con Dulces').category).toBe('Postres')
    expect(byName('Cubatas digestivos').category).toBe('Bebidas')
    expect(byName('Pulpo con patatas').category).toBe('Otro')
  })
  it('agruparlas por sección en pantalla NO altera el orden guardado (la sección es otra vista, no el orden)', async () => {
    await events.importEventMenuItems('e1', importRowsToSave(toRows(realMenuAiResponse()), null), { documentId: null })
    const items = await events.listEventMenuItems('e1')
    const resolved = resolveMenuSections(defaultSections(false), items, false)
    // la vista por secciones agrupa…
    expect(resolved.visible.map((v) => v.label)).toContain('Postres')
    // …pero la secuencia sigue intacta
    expect(menuSequence(items).map((i) => i.name)).toEqual(REAL_MENU_IN_DOCUMENT_ORDER)
  })
})

describe('Guardado y revisión (3, 4, 15, 16, 17)', () => {
  it('3/4. guardar conserva el orden y volver a abrir lo conserva (sort_order consecutivo y explícito)', async () => {
    await events.importEventMenuItems('e1', importRowsToSave(toRows({ items: ['A', 'B', 'C', 'D'].map((text) => ({ text })) }), null), { documentId: null })
    expect(await names()).toEqual(['A', 'B', 'C', 'D'])
    expect(db.event_menu_items.map((r) => r.sort_order)).toEqual([1000, 2000, 3000, 4000])
  })
  it('15. un elemento DESMARCADO en la revisión no se guarda', () => {
    const rows = toRows({ items: ['A', 'B', 'C'].map((text) => ({ text })) })
    rows[1].include = false
    expect(importRowsToSave(rows, null).map((r) => r.text)).toEqual(['A', 'C'])
    expect(importRowsToSave(rows.map((r) => ({ ...r, include: false })), null)).toEqual([])
    // un texto vaciado tampoco
    rows[0].text = '   '
    expect(importRowsToSave(rows, null).map((r) => r.text)).toEqual(['C'])
  })
  it('16. cancelar o descartar no guarda nada (no hay ninguna escritura hasta confirmar)', async () => {
    toRows(realMenuAiResponse()) // revisión en memoria
    expect(db.event_menu_items ?? []).toHaveLength(0)
    expect(db.event_food_documents ?? []).toHaveLength(0)
  })
  it('17. reordenar a mano la propuesta antes de guardar persiste ese orden', async () => {
    const rows = toRows({ items: ['A', 'B', 'C', 'D'].map((text) => ({ text })) })
    const reordered = [rows[2], rows[0], rows[1], rows[3]] // la persona corrige: C, A, B, D
    await events.importEventMenuItems('e1', importRowsToSave(reordered, null), { documentId: null })
    expect(await names()).toEqual(['C', 'A', 'B', 'D'])
  })
  it('un texto con tipo corregido por la persona se guarda con ese tipo (y solo los platos llevan sección)', async () => {
    const rows = toRows({ items: [{ text: 'Cena', kind: 'dish', section: 'Postres' }, { text: 'Tarta', kind: 'heading', section: null }] })
    rows[0].kind = 'heading' // la IA se equivocó: «Cena» no es un plato
    rows[1].kind = 'dish'
    rows[1].section = 'Tarta'
    await events.importEventMenuItems('e1', importRowsToSave(rows, null), { documentId: null })
    expect(byName('Cena')).toMatchObject({ kind: 'heading', category: null })
    expect(byName('Tarta')).toMatchObject({ kind: 'dish', category: 'Tarta' })
  })
  it('18. el mismo nombre en dos posiciones se guarda dos veces, sin deduplicar', async () => {
    await events.importEventMenuItems('e1', importRowsToSave(toRows({ items: [{ text: 'Café' }, { text: 'Cena', kind: 'heading' }, { text: 'Café' }] }), null), { documentId: null })
    expect(await names()).toEqual(['Café', 'Cena', 'Café'])
    expect(new Set(db.event_menu_items.map((r) => r.id)).size).toBe(3)
  })
})

describe('Editar no mueve nada (5–8)', () => {
  async function seeded() {
    await events.importEventMenuItems('e1', importRowsToSave(toRows(realMenuAiResponse()), null), { documentId: null })
    return (await events.listEventMenuItems('e1')).find((i) => i.name === 'Café con Dulces')!.id
  }
  it('5. cambiar una sección NO cambia su posición global', async () => {
    const id = await seeded()
    const before = row(id).sort_order
    await events.updateEventMenuItem(id, { category: 'Entrantes' })
    expect(row(id).sort_order).toBe(before)
    expect(await names()).toEqual(REAL_MENU_IN_DOCUMENT_ORDER)
  })
  it('6/7/8. editar el nombre, añadir una nota o vincular una receta tampoco', async () => {
    const id = await seeded()
    await events.updateEventMenuItem(id, { name: 'Café con dulces y leche' })
    await events.updateEventMenuItem(id, { notes: 'sin azúcar' })
    await events.updateEventMenuItem(id, { recipeId: 'r1' })
    expect((await names())[0]).toBe('Café con dulces y leche')
    expect((await names()).slice(1)).toEqual(REAL_MENU_IN_DOCUMENT_ORDER.slice(1))
  })
  it('convertir un plato en encabezado conserva su posición', async () => {
    const id = await seeded()
    await events.updateEventMenuItem(id, { kind: 'heading', category: null, recipeId: null })
    expect(row(id)).toMatchObject({ kind: 'heading', category: null })
    expect(await names()).toEqual(REAL_MENU_IN_DOCUMENT_ORDER)
  })
  it('un elemento tipo encabezado no admite sección, receta ni quién lo prepara aunque se intenten pasar', async () => {
    const id = await events.addEventMenuItem('e1', 'Segundo servicio', 'Postres', null, { kind: 'heading', recipeId: 'r1', preparedBy: 'familia' })
    expect(row(id)).toMatchObject({ kind: 'heading', category: null, recipe_id: null, prepared_by: null })
  })
})

describe('Segunda importación y reordenación (19)', () => {
  const first = ['A', 'B', 'C']
  beforeEach(async () => {
    await events.importEventMenuItems('e1', importRowsToSave(toRows({ items: first.map((text) => ({ text })) }), null), { documentId: null })
  })
  it('19. por defecto se añade AL FINAL sin tocar lo existente', async () => {
    const before = db.event_menu_items.map((r) => [r.id, r.sort_order])
    await events.importEventMenuItems('e1', importRowsToSave(toRows({ items: ['X', 'Y'].map((text) => ({ text })) }), null), { documentId: 'doc2' })
    expect(await names()).toEqual(['A', 'B', 'C', 'X', 'Y'])
    expect(db.event_menu_items.slice(0, 3).map((r) => [r.id, r.sort_order])).toEqual(before) // ni una posición existente cambió
  })
  it('al principio, o después de un elemento elegido: lo existente conserva su orden relativo', async () => {
    await events.importEventMenuItems('e1', importRowsToSave(toRows({ items: ['X', 'Y'].map((text) => ({ text })) }), null), { documentId: null, placement: { type: 'start' } })
    expect(await names()).toEqual(['X', 'Y', 'A', 'B', 'C'])
    const b = (await events.listEventMenuItems('e1')).find((i) => i.name === 'B')!
    await events.importEventMenuItems('e1', importRowsToSave(toRows({ items: ['P', 'Q'].map((text) => ({ text })) }), null), { documentId: null, placement: { type: 'after', itemId: b.id } })
    expect(await names()).toEqual(['X', 'Y', 'A', 'B', 'P', 'Q', 'C'])
  })
  it('reordenar a mano persiste (todo el menú, atómico) y una orden incompleta se rechaza', async () => {
    const ids = menuSequence(await events.listEventMenuItems('e1')).map((i) => i.id)
    await events.reorderEventMenuItems([ids[2], ids[0], ids[1]])
    expect(await names()).toEqual(['C', 'A', 'B'])
    await expect(events.reorderEventMenuItems([ids[0], ids[1]])).rejects.toBeTruthy()
    expect(await names()).toEqual(['C', 'A', 'B'])
  })
})

describe('Platos manuales: el flujo de siempre sigue (21, 22)', () => {
  it('21. crear un plato manual lo coloca al final (disparador) y devuelve su id; crear sin nombre vacío no se permite al guardar', async () => {
    await events.addEventMenuItem('e1', 'Gamba blanca', 'Entrantes')
    const id = await events.addEventMenuItem('e1', 'Paella', 'Plato principal')
    expect(await names()).toEqual(['Gamba blanca', 'Paella'])
    expect(row(id)).toMatchObject({ kind: 'dish', category: 'Plato principal' })
  })
  it('un plato manual nuevo nace junto a su sección y mover un plato de sección luego NO lo mueve (22)', async () => {
    await events.addEventMenuItem('e1', 'Croquetas', 'Entrantes')
    await events.addEventMenuItem('e1', 'Tarta', 'Postres')
    const items = await events.listEventMenuItems('e1')
    const resolved = resolveMenuSections(defaultSections(false), items, false)
    const keyOf = (i: { id: string }) => [...resolved.visible, ...resolved.hidden].find((v) => v.items.some((x) => x.id === i.id))?.key ?? null
    const entrantesKey = resolved.visible.find((v) => v.label === 'Entrantes')!.key
    const id = await events.addEventMenuItem('e1', 'Ensaladilla', 'Entrantes')
    const placement = placementForNewDish(items, keyOf, entrantesKey, resolved.config.map((c) => c.key))
    expect(placement).toMatchObject({ type: 'after' })
    const sequence = menuSequence(await events.listEventMenuItems('e1')).map((i) => i.id)
    const without = sequence.filter((x) => x !== id)
    const after = (placement as { itemId: string }).itemId
    const final = [...without.slice(0, without.indexOf(after) + 1), id, ...without.slice(without.indexOf(after) + 1)]
    await events.reorderEventMenuItems(final)
    expect(await names()).toEqual(['Croquetas', 'Ensaladilla', 'Tarta'])
    // luego se le cambia la sección: no se mueve
    await events.updateEventMenuItem(id, { category: 'Postres' })
    expect(await names()).toEqual(['Croquetas', 'Ensaladilla', 'Tarta'])
  })
})
