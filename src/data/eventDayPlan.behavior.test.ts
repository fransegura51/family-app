import { beforeEach, describe, expect, it, vi } from 'vitest'

// Plan del día editable — comportamiento REAL de data/events.ts contra una base en memoria que imita lo que
// importa de Postgres: columnas 'time' devueltas como HH:MM:SS, el trigger que coloca sort_order al final, el
// ÍNDICE ÚNICO parcial (event_id, decision_id, source_key) con su código 23505 y la función reorder_event_day_plan.
// (El SQL real se comprueba aparte contra la base, con rollback; ver eventDayPlanMigration.test.ts.)
type Row = Record<string, unknown> & { id?: string }
const db: Record<string, Row[]> = {}
let idSeq = 0
let clock = 0
let rpcCalls: { name: string; args: Record<string, unknown> }[] = []
let uniqueViolations = 0

function normalizeRow(table: string, row: Row): Row {
  const out = { ...row }
  if (table === 'event_day_plan_items') {
    for (const col of ['item_time', 'coincide_ok_time']) {
      const v = out[col]
      if (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)) out[col] = `${v}:00`
    }
  }
  return out
}

function violatesUnique(table: string, candidate: Row, ignoreId?: string): boolean {
  if (table !== 'event_day_plan_items') return false
  if (candidate.decision_id == null || candidate.source_key == null) return false
  return (db[table] ?? []).some((r) => r.id !== ignoreId && r.event_id === candidate.event_id && r.decision_id === candidate.decision_id && r.source_key === candidate.source_key)
}

function from(table: string) {
  const rows = () => (db[table] ??= [])
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row = {}
  let returning = false
  const filters: [string, unknown][] = []
  const matches = (r: Row) => filters.every(([c, v]) => r[c] === v)
  type Result = { data: Row[] | null; error: { message: string; code?: string } | null }
  function exec(): Result {
    if (op === 'select') return { data: rows().filter(matches).map((r) => ({ ...r })), error: null }
    if (op === 'insert') {
      let row = normalizeRow(table, { id: `${table}-${++idSeq}`, created_at: `2026-10-04T10:00:${String(++clock).padStart(2, '0')}Z`, ...payload })
      if (table === 'event_day_plan_items') {
        // trigger trg_event_day_plan_items_sort_order: al final (+1000)
        if (row.sort_order == null || row.sort_order === 0) {
          const max = Math.max(0, ...rows().filter((r) => r.event_id === row.event_id).map((r) => Number(r.sort_order)))
          row = { ...row, sort_order: max + 1000 }
        }
        row = { show_on_share: true, source_key: null, decision_id: null, coincide_ok_time: null, note: null, item_time: null, ...row }
      }
      if (violatesUnique(table, row)) uniqueViolations += 1
      if (violatesUnique(table, row)) return { data: null, error: { message: 'duplicate key value violates unique constraint "uq_event_day_plan_items_source"', code: '23505' } }
      rows().push(row)
      return { data: [{ ...row }], error: null }
    }
    if (op === 'update') {
      const targets = rows().filter(matches)
      for (const r of targets) {
        const next = { ...r, ...normalizeRow(table, payload) }
        if (violatesUnique(table, next, r.id)) return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }
        Object.assign(r, next)
      }
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
    insert(p: Row) {
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
    order() {
      return builder
    },
    single() {
      const res = exec()
      if (res.error) return Promise.resolve({ data: null, error: res.error })
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

// reorder_event_day_plan (0194), fiel al SQL: mismas posiciones desde la más baja, en el orden recibido.
function rpc(name: string, args: Record<string, unknown>) {
  rpcCalls.push({ name, args })
  if (name !== 'reorder_event_day_plan') return Promise.resolve({ error: { message: 'función desconocida' } })
  const idsArg = args.p_ids as string[]
  const table = db.event_day_plan_items ?? []
  const found = table.filter((r) => idsArg.includes(r.id as string))
  if (found.length !== idsArg.length || new Set(found.map((r) => r.event_id)).size !== 1) return Promise.resolve({ error: { message: 'not found' } })
  const base = Math.min(...found.map((r) => Number(r.sort_order)))
  idsArg.forEach((id, i) => {
    const r = table.find((x) => x.id === id) as Row
    r.sort_order = base + i
    if (args.p_confirm_coincidence && r.item_time != null) r.coincide_ok_time = r.item_time
  })
  return Promise.resolve({ error: null })
}

vi.mock('@/data/supabaseClient', () => ({
  supabase: { from, rpc, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } },
}))

const events = await import('@/data/events')
const { addEventDayPlanItem, applyFoodDayPlan, deleteEventDayPlanItem, listEventDayPlan, reorderEventDayPlan, resolveGeneratedDayPlanItem, updateEventDayPlanItem } = events
const { MOMENTOS_COMIDA_CATALOG, FOOD_MOMENTOS_KEY } = await import('@/domain/eventFood')
const { splitDayPlan, pendingCoincidenceFor, foodMomentSourceKey } = await import('@/domain/eventDayPlan')

const rows = () => db.event_day_plan_items ?? []
const row = (id: string) => rows().find((r) => r.id === id) as Row
const byTitle = (title: string) => rows().find((r) => r.title === title) as Row
const DECISION_ID = 'decision-momentos'
const wanted = (...keys: string[]) => MOMENTOS_COMIDA_CATALOG.cumpleanos.filter((m) => keys.includes(m.key))
const apply = (...keys: string[]) => applyFoodDayPlan('e1', 'cumpleanos', DECISION_ID, wanted(...keys))

function seedDecision(selected: string[], choice = 'seleccionar') {
  db.event_decisions = [
    {
      id: DECISION_ID,
      event_id: 'e1',
      family_id: 'f1',
      block_key: 'comida',
      question_key: FOOD_MOMENTOS_KEY,
      answer: { choice, selected, customItems: [] },
      is_custom_option: false,
      created_by: 'u1',
      created_at: '2026-10-04T09:00:00Z',
      updated_at: '2026-10-04T09:00:00Z',
    },
  ]
}
const decisionSelected = () => ((db.event_decisions[0].answer as { selected: string[] }).selected)

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  db.event_day_plan_items = []
  db.profiles = [{ id: 'u1', family_id: 'f1' }]
  idSeq = 0
  clock = 0
  rpcCalls = []
  uniqueViolations = 0
  seedDecision(['comida'])
})

describe('Crear momentos (1, 2, 19, 32, 33)', () => {
  it('1. manual SIN hora: item_time null (nunca 00:00), visible al compartir por defecto, sin relación con ninguna decisión', async () => {
    const id = await addEventDayPlanItem('e1', '  Baile ', null)
    expect(row(id)).toMatchObject({ title: 'Baile', item_time: null, note: null, decision_id: null, source_key: null, show_on_share: true })
  })
  it('también si la hora llega vacía o en blanco', async () => {
    const id = await addEventDayPlanItem('e1', 'Fotos', '')
    expect(row(id).item_time).toBeNull()
  })
  it('2/33. manual CON hora: HH:MM se guarda y vuelve como HH:MM:SS', async () => {
    const id = await addEventDayPlanItem('e1', 'Tarta', '17:00', 'David la trae')
    expect(row(id)).toMatchObject({ item_time: '17:00:00', note: 'David la trae' })
    const [loaded] = await listEventDayPlan('e1')
    expect(loaded.itemTime).toBe('17:00:00')
    expect(loaded.showOnShare).toBe(true)
    expect(loaded.sourceKey).toBeNull()
  })
  it('los nuevos van al final y sin depender de Date.now() (sort_order consecutivo de 1000 en 1000)', async () => {
    await addEventDayPlanItem('e1', 'A', null)
    await addEventDayPlanItem('e1', 'B', null)
    await addEventDayPlanItem('e1', 'C', '10:00')
    expect(rows().map((r) => r.sort_order)).toEqual([1000, 2000, 3000])
  })
  it('20. un momento generado por el configurador también nace visible al compartir', async () => {
    await apply('comida')
    expect(byTitle('Comida')).toMatchObject({ show_on_share: true, item_time: null, decision_id: DECISION_ID, source_key: 'comida.momentos:comida' })
  })
})

describe('Editar (3, 4, 5, 6, 21)', () => {
  it('3/4. título y nota se editan en la MISMA fila (sin duplicar) y no tocan la hora', async () => {
    const id = await addEventDayPlanItem('e1', 'Tarta', '17:00')
    await updateEventDayPlanItem(id, { title: ' Tarta de chocolate ', note: 'David la trae al restaurante.' })
    expect(rows()).toHaveLength(1)
    expect(row(id)).toMatchObject({ title: 'Tarta de chocolate', note: 'David la trae al restaurante.', item_time: '17:00:00' })
  })
  it('5/6. añadir hora a uno sin hora y quitársela (null, no 00:00)', async () => {
    const id = await addEventDayPlanItem('e1', 'Fotos', null)
    await updateEventDayPlanItem(id, { itemTime: '12:15' })
    expect(row(id).item_time).toBe('12:15:00')
    await updateEventDayPlanItem(id, { itemTime: null })
    expect(row(id).item_time).toBeNull()
  })
  it('cambiar la hora invalida la confirmación de coincidencia; editar solo la nota NO', async () => {
    const id = await addEventDayPlanItem('e1', 'Comida', '14:30')
    row(id).coincide_ok_time = '14:30:00'
    await updateEventDayPlanItem(id, { note: 'x' })
    expect(row(id).coincide_ok_time).toBe('14:30:00')
    await updateEventDayPlanItem(id, { itemTime: '15:00' })
    expect(row(id).coincide_ok_time).toBeNull()
  })
  it('21. desactivar y volver a activar «Mostrar al compartir»', async () => {
    const id = await addEventDayPlanItem('e1', 'Paco recoge la tarta', '12:30')
    await updateEventDayPlanItem(id, { showOnShare: false })
    expect(row(id).show_on_share).toBe(false)
    await updateEventDayPlanItem(id, { showOnShare: true })
    expect(row(id).show_on_share).toBe(true)
  })
  it('un nombre vacío se rechaza y no escribe nada', async () => {
    const id = await addEventDayPlanItem('e1', 'Tarta', null)
    await expect(updateEventDayPlanItem(id, { title: '   ' })).rejects.toThrow()
    expect(row(id).title).toBe('Tarta')
  })
  it('un patch vacío no escribe', async () => {
    const id = await addEventDayPlanItem('e1', 'Tarta', null)
    await updateEventDayPlanItem(id, {})
    expect(row(id).title).toBe('Tarta')
  })
  it('editar jamás toca la relación con la decisión (decision_id y source_key)', async () => {
    await apply('comida')
    const id = byTitle('Comida').id as string
    await updateEventDayPlanItem(id, { title: 'Almuerzo familiar', itemTime: '14:30', note: 'terraza', showOnShare: false })
    expect(row(id)).toMatchObject({ decision_id: DECISION_ID, source_key: 'comida.momentos:comida' })
  })
})

describe('Borrar un manual (22, 23)', () => {
  it('22. borra la fila', async () => {
    const id = await addEventDayPlanItem('e1', 'Baile', null)
    await deleteEventDayPlanItem(id)
    expect(rows()).toHaveLength(0)
  })
  it('23. cancelar = no llamar a nada: la fila sigue (la confirmación vive en la interfaz)', async () => {
    const id = await addEventDayPlanItem('e1', 'Baile', null)
    expect(row(id)).toBeDefined()
  })
})

describe('Orden manual y desempate (RPC reorder_event_day_plan) (8, 9, 12, 16, 34)', () => {
  it('8/9. reordenar «Sin hora»: reparte las mismas posiciones en el nuevo orden, y persiste tras recargar', async () => {
    const a = await addEventDayPlanItem('e1', 'Ceremonia', null)
    const b = await addEventDayPlanItem('e1', 'Fotos', null)
    const c = await addEventDayPlanItem('e1', 'Comida', null)
    await reorderEventDayPlan([c, a, b])
    const view = splitDayPlan(await listEventDayPlan('e1'))
    expect(view.untimed.map((i) => i.title)).toEqual(['Comida', 'Ceremonia', 'Fotos'])
    // recargar de nuevo da lo mismo
    expect(splitDayPlan(await listEventDayPlan('e1')).untimed.map((i) => i.title)).toEqual(['Comida', 'Ceremonia', 'Fotos'])
  })
  it('12/16. sí, coinciden: el orden elegido se guarda como desempate y el grupo queda confirmado', async () => {
    const ap = await addEventDayPlanItem('e1', 'Aperitivo', '14:30')
    const co = await addEventDayPlanItem('e1', 'Comida', '14:30')
    const fo = await addEventDayPlanItem('e1', 'Fotos', '14:30')
    expect(pendingCoincidenceFor(await listEventDayPlan('e1'), co)?.items).toHaveLength(3)
    await reorderEventDayPlan([fo, co, ap], true)
    const list = await listEventDayPlan('e1')
    expect(splitDayPlan(list).timed.map((i) => i.title)).toEqual(['Fotos', 'Comida', 'Aperitivo'])
    expect(pendingCoincidenceFor(list, co)).toBeNull()
    expect(rpcCalls[0]).toEqual({ name: 'reorder_event_day_plan', args: { p_ids: [fo, co, ap], p_confirm_coincidence: true } })
  })
  it('13. cambiar después una de esas horas rompe el grupo y borra su confirmación', async () => {
    const ap = await addEventDayPlanItem('e1', 'Aperitivo', '14:30')
    const co = await addEventDayPlanItem('e1', 'Comida', '14:30')
    await reorderEventDayPlan([ap, co], true)
    await updateEventDayPlanItem(co, { itemTime: '15:00' })
    const list = await listEventDayPlan('e1')
    expect(pendingCoincidenceFor(list, co)).toBeNull()
    expect(row(co).coincide_ok_time).toBeNull()
    expect(splitDayPlan(list).timed.map((i) => i.title)).toEqual(['Aperitivo', 'Comida'])
  })
  it('14. un tercero que entra en un grupo confirmado reabre la pregunta para el grupo completo', async () => {
    const ap = await addEventDayPlanItem('e1', 'Aperitivo', '14:30')
    const co = await addEventDayPlanItem('e1', 'Comida', '14:30')
    await reorderEventDayPlan([ap, co], true)
    const fo = await addEventDayPlanItem('e1', 'Fotos', '14:30')
    const group = pendingCoincidenceFor(await listEventDayPlan('e1'), fo)
    expect(group?.items.map((i) => i.title)).toEqual(['Aperitivo', 'Comida', 'Fotos'])
  })
  it('18. cambiar la hora desde el diálogo de coincidencia resuelve el grupo sin preguntar de nuevo', async () => {
    await addEventDayPlanItem('e1', 'Aperitivo', '14:30')
    const co = await addEventDayPlanItem('e1', 'Comida', '14:30')
    await updateEventDayPlanItem(co, { itemTime: '15:00' })
    expect(pendingCoincidenceFor(await listEventDayPlan('e1'), co)).toBeNull()
  })
  it('17. cancelar el diálogo (no llamar a nada) deja el grupo pendiente y no cambia ninguna fila', async () => {
    const ap = await addEventDayPlanItem('e1', 'Aperitivo', '14:30')
    const co = await addEventDayPlanItem('e1', 'Comida', '14:30')
    const before = JSON.stringify(rows())
    expect(pendingCoincidenceFor(await listEventDayPlan('e1'), co)).not.toBeNull()
    expect(JSON.stringify(rows())).toBe(before)
    expect(rpcCalls).toEqual([])
    expect(ap).toBeTruthy()
  })
  it('reordenar ids de eventos distintos o inexistentes se rechaza sin tocar nada', async () => {
    const a = await addEventDayPlanItem('e1', 'A', null)
    await expect(reorderEventDayPlan([a, 'no-existe'])).rejects.toBeTruthy()
    expect(row(a).sort_order).toBe(1000)
  })
  it('una lista vacía no llama a la base', async () => {
    await reorderEventDayPlan([])
    expect(rpcCalls).toEqual([])
  })
})

describe('Elementos generados por «Comida y bebida» — identidad estable (27–31, 39)', () => {
  it('39. marcar momentos crea sus filas sin hora, con clave estable, una por momento', async () => {
    await apply('aperitivo', 'comida')
    expect(rows().map((r) => [r.title, r.source_key, r.item_time])).toEqual([
      ['Aperitivo / picoteo', 'comida.momentos:aperitivo', null],
      ['Comida', 'comida.momentos:comida', null],
    ])
  })
  it('repetir la misma reconciliación (guardar dos veces) no duplica nada', async () => {
    await apply('aperitivo', 'comida')
    await apply('aperitivo', 'comida')
    expect(rows()).toHaveLength(2)
  })
  it('27. renombrar el generado y volver a reconciliar NO crea otro «Comida»', async () => {
    await apply('comida')
    await updateEventDayPlanItem(byTitle('Comida').id as string, { title: 'Almuerzo familiar' })
    const result = await apply('comida')
    expect(result).toEqual({ created: 0, removed: 0 })
    expect(rows().map((r) => r.title)).toEqual(['Almuerzo familiar'])
  })
  it('28/29. caso obligatorio: Comida → «Almuerzo familiar» + 14:30 + nota → se desmarca → se vuelve a marcar: UNA sola fila, la misma', async () => {
    await apply('comida')
    const id = byTitle('Comida').id as string
    await updateEventDayPlanItem(id, { title: 'Almuerzo familiar', itemTime: '14:30', note: 'En la terraza' })

    // se desmarca en Comida y bebida: la información NO se destruye; se desvincula conservando su clave
    await apply()
    expect(rows()).toHaveLength(1)
    expect(row(id)).toMatchObject({ title: 'Almuerzo familiar', item_time: '14:30:00', note: 'En la terraza', decision_id: null, source_key: 'comida.momentos:comida' })

    // se vuelve a marcar: READOPTA la misma fila (no aparece «Comida» aparte)
    const result = await apply('comida')
    expect(result.created).toBe(0)
    expect(rows()).toHaveLength(1)
    expect(row(id)).toMatchObject({ title: 'Almuerzo familiar', item_time: '14:30:00', note: 'En la terraza', decision_id: DECISION_ID })
    expect(rows().filter((r) => r.title === 'Comida')).toHaveLength(0)
  })
  it('desmarcar un generado intacto lo retira; volver a marcarlo lo crea de nuevo (una vez)', async () => {
    await apply('comida')
    expect((await apply()).removed).toBe(1)
    expect(rows()).toHaveLength(0)
    expect((await apply('comida')).created).toBe(1)
    expect(rows()).toHaveLength(1)
  })
  it('un generado al que solo se le ocultó «Mostrar al compartir» también cuenta como enriquecido y no se destruye', async () => {
    await apply('comida')
    await updateEventDayPlanItem(byTitle('Comida').id as string, { showOnShare: false })
    await apply()
    expect(rows()).toHaveLength(1)
    expect(rows()[0].decision_id).toBeNull()
  })
  it('30. dos momentos con el mismo título conviven si son independientes (10:00 Fotos y 18:00 Fotos)', async () => {
    await addEventDayPlanItem('e1', 'Fotos', '10:00')
    await addEventDayPlanItem('e1', 'Fotos', '18:00')
    expect(rows()).toHaveLength(2)
  })
  it('15. un momento manual llamado «Comida» es independiente: no impide ni se funde con el generado', async () => {
    await addEventDayPlanItem('e1', 'Comida', '14:00')
    await apply('comida')
    expect(rows().filter((r) => r.title === 'Comida')).toHaveLength(2)
    expect(rows().filter((r) => r.source_key === 'comida.momentos:comida')).toHaveLength(1)
  })
  it('31. concurrencia: dos reconciliaciones SIMULTÁNEAS no duplican (índice único + 23505 absorbido)', async () => {
    const [r1, r2] = await Promise.all([apply('comida'), apply('comida')])
    expect(rows().filter((r) => r.source_key === 'comida.momentos:comida')).toHaveLength(1)
    expect(r1.created + r2.created).toBe(1)
    // La carrera es REAL (ambas leyeron antes de insertar): quien llegó segundo chocó con el índice único y lo absorbió.
    expect(uniqueViolations).toBe(1)
  })
  it('37. los elementos antiguos (manuales, sin clave) no se tocan nunca', async () => {
    db.event_day_plan_items.push({ id: 'old1', event_id: 'e1', family_id: 'f1', title: 'Recoger regalo', item_time: '08:00:00', note: null, sort_order: 3, decision_id: null, source_key: null, show_on_share: true, coincide_ok_time: null, created_at: '2026-09-23T00:00:00Z' })
    await apply('comida')
    await apply()
    expect(row('old1')).toMatchObject({ title: 'Recoger regalo', item_time: '08:00:00', sort_order: 3 })
  })
})

describe('× sobre un momento generado (24, 25, 26)', () => {
  async function generatedComida() {
    await apply('comida')
    const [item] = (await listEventDayPlan('e1')).filter((i) => i.sourceKey === 'comida.momentos:comida')
    return item
  }
  it('24. «Quitar de ambos»: se desmarca en la decisión y se quita del Plan; NO se regenera', async () => {
    const item = await generatedComida()
    await resolveGeneratedDayPlanItem(item, 'both')
    expect(decisionSelected()).toEqual([])
    expect(rows()).toHaveLength(0)
    // la siguiente reconciliación, con la decisión ya actualizada, no lo vuelve a crear
    expect(await apply(...decisionSelected())).toEqual({ created: 0, removed: 0 })
    expect(rows()).toHaveLength(0)
  })
  it('24b. solo se quita el momento pulsado: los demás marcados siguen intactos', async () => {
    seedDecision(['aperitivo', 'comida'])
    await apply('aperitivo', 'comida')
    const comida = (await listEventDayPlan('e1')).find((i) => i.sourceKey === 'comida.momentos:comida')!
    await resolveGeneratedDayPlanItem(comida, 'both')
    expect(decisionSelected()).toEqual(['aperitivo'])
    expect(rows().map((r) => r.title)).toEqual(['Aperitivo / picoteo'])
  })
  it('25. «Mantener como independiente»: conserva nombre, hora, nota, visibilidad y orden; se desvincula y la decisión se desmarca', async () => {
    const item = await generatedComida()
    await updateEventDayPlanItem(item.id, { title: 'Almuerzo familiar', itemTime: '14:30', note: 'terraza', showOnShare: false })
    const sortBefore = row(item.id).sort_order
    const fresh = (await listEventDayPlan('e1'))[0]
    await resolveGeneratedDayPlanItem(fresh, 'independent')
    expect(row(item.id)).toMatchObject({ title: 'Almuerzo familiar', item_time: '14:30:00', note: 'terraza', show_on_share: false, sort_order: sortBefore, decision_id: null, source_key: null })
    expect(decisionSelected()).toEqual([])
    // el configurador ya no lo controla: reconciliar no lo toca ni crea nada
    expect(await apply()).toEqual({ created: 0, removed: 0 })
    expect(rows()).toHaveLength(1)
  })
  it('independiente + volver a marcar el momento crea uno nuevo, deliberadamente (el independiente no se readopta)', async () => {
    const item = await generatedComida()
    await resolveGeneratedDayPlanItem(item, 'independent')
    seedDecision(['comida'])
    expect((await apply('comida')).created).toBe(1)
    expect(rows()).toHaveLength(2)
  })
  it('26. cancelar = no llamar a nada: la fila y la decisión quedan igual', async () => {
    await generatedComida()
    const before = JSON.stringify([rows(), db.event_decisions])
    expect(JSON.stringify([rows(), db.event_decisions])).toBe(before)
    expect(decisionSelected()).toEqual(['comida'])
  })
  it('un elemento manual no se puede resolver como generado', async () => {
    const id = await addEventDayPlanItem('e1', 'Baile', null)
    const [item] = await listEventDayPlan('e1')
    await expect(resolveGeneratedDayPlanItem(item, 'both')).rejects.toThrow()
    expect(row(id)).toBeDefined()
  })
  it('si la decisión de origen ya no marca ese momento, resolver no la altera', async () => {
    const item = await generatedComida()
    seedDecision([])
    await resolveGeneratedDayPlanItem(item, 'both')
    expect(decisionSelected()).toEqual([])
    expect(rows()).toHaveLength(0)
  })
})

describe('Clave de origen', () => {
  it('foodMomentSourceKey es la que escribe el ejecutor', () => {
    expect(foodMomentSourceKey('comida')).toBe('comida.momentos:comida')
  })
})
