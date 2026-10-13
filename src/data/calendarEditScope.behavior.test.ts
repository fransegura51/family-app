import { beforeEach, describe, expect, it, vi } from 'vitest'

// Encargo "tareas recurrentes" (Parte 6) — comportamiento REAL de updateEventOccurrenceOnly /
// updateEventFromOccurrenceForward contra una base en memoria que imita lo que importa de Postgres
// (calendar_events, calendar_event_members, calendar_event_reminders, calendar_event_completions,
// profiles). Mismo patrón que eventDayPlan.behavior.test.ts: se prueba el módulo real, no un doble.
type Row = Record<string, unknown> & { id?: string }
const db: Record<string, Row[]> = {}
let idSeq = 0

function from(table: string) {
  const rows = () => (db[table] ??= [])
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row = {}
  const filters: [string, '=' | '>=', unknown][] = []
  const matches = (r: Row) => filters.every(([c, kind, v]) => (kind === '=' ? r[c] === v : (r[c] as string) >= (v as string)))
  type Result = { data: Row[] | null; error: { message: string } | null }
  function exec(): Result {
    if (op === 'select') return { data: rows().filter(matches).map((r) => ({ ...r })), error: null }
    if (op === 'insert') {
      const row: Row = { id: `${table}-${++idSeq}`, ...payload }
      rows().push(row)
      return { data: [{ ...row }], error: null }
    }
    if (op === 'update') {
      const targets = rows().filter(matches)
      for (const r of targets) Object.assign(r, payload)
      return { data: targets.map((r) => ({ ...r })), error: null }
    }
    db[table] = rows().filter((r) => !matches(r))
    return { data: null, error: null }
  }
  const builder = {
    select() {
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
      filters.push([c, '=', v])
      return builder
    },
    gte(c: string, v: unknown) {
      filters.push([c, '>=', v])
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
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      return Promise.resolve(exec()).then(resolve, reject)
    },
  }
  return builder
}

vi.mock('@/data/supabaseClient', () => ({
  supabase: {
    from,
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  },
}))

const calendar = await import('@/data/calendar')
const { createEvent, updateEventOccurrenceOnly, updateEventFromOccurrenceForward } = calendar

const BASE_INPUT = {
  title: 'Piano',
  startAt: '2026-10-06T17:00:00.000Z', // un martes
  endAt: null,
  allDay: false,
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
  reminders: [],
  memberIds: ['member-1'],
  points: 5,
  kind: 'task' as const,
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  idSeq = 0
  db.profiles = [{ id: 'u1', family_id: 'fam-1' }]
})

describe('updateEventOccurrenceOnly — "solo esta repetición"', () => {
  it('excluye la fecha de la serie original (exception_dates) y crea un registro suelto (recurrenceRule: null) con los campos editados', async () => {
    const seriesId = await createEvent(BASE_INPUT)
    await updateEventOccurrenceOnly(seriesId, '2026-10-20', { ...BASE_INPUT, title: 'Piano (cambio de profesor)', recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU' })

    const series = db.calendar_events.find((r) => r.id === seriesId)!
    expect(series.exception_dates).toEqual(['2026-10-20'])
    // la serie original NUNCA pierde su propio patrón de repetición al desprender una ocurrencia
    expect(series.recurrence_rule).toBe('FREQ=WEEKLY;BYDAY=TU')

    const standalone = db.calendar_events.find((r) => r.id !== seriesId)!
    expect(standalone.title).toBe('Piano (cambio de profesor)')
    expect(standalone.recurrence_rule).toBeNull()
  })

  it('nunca toca otras fechas de la serie — solo la ocurrencia editada se desprende', async () => {
    const seriesId = await createEvent(BASE_INPUT)
    await updateEventOccurrenceOnly(seriesId, '2026-10-20', BASE_INPUT)
    const series = db.calendar_events.find((r) => r.id === seriesId)!
    expect(series.exception_dates).toEqual(['2026-10-20'])
    expect((series.exception_dates as string[]).length).toBe(1)
  })

  it('si la ocurrencia ya estaba completada (con puntos), el historial se reapunta al registro nuevo — nunca se pierde ni se duplica', async () => {
    const seriesId = await createEvent(BASE_INPUT)
    db.calendar_event_completions = [{ event_id: seriesId, occurrence_date: '2026-10-20', member_id: 'member-1', points_awarded: 5 }]
    await updateEventOccurrenceOnly(seriesId, '2026-10-20', BASE_INPUT)

    const completions = db.calendar_event_completions
    expect(completions).toHaveLength(1)
    expect(completions[0].event_id).not.toBe(seriesId)
    expect(completions[0].points_awarded).toBe(5)
  })
})

describe('updateEventFromOccurrenceForward — "esta y las siguientes"', () => {
  it('trunca la serie original con UNTIL el día antes, conservando su patrón de SIEMPRE (nunca el editado)', async () => {
    const seriesId = await createEvent(BASE_INPUT)
    await updateEventFromOccurrenceForward(seriesId, '2026-10-20', { ...BASE_INPUT, title: 'Piano (nuevo horario)', recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU,TH' })

    const series = db.calendar_events.find((r) => r.id === seriesId)!
    expect(series.recurrence_rule).toBe('FREQ=WEEKLY;BYDAY=TU;UNTIL=2026-10-19')
    expect(series.title).toBe('Piano') // el pasado NUNCA adopta el título editado

    const future = db.calendar_events.find((r) => r.id !== seriesId)!
    expect(future.title).toBe('Piano (nuevo horario)')
    expect(future.recurrence_rule).toBe('FREQ=WEEKLY;BYDAY=TU,TH')
  })

  it('reapunta al registro nuevo SOLO las ocurrencias completadas desde esa fecha en adelante — las anteriores se quedan en la serie original', async () => {
    const seriesId = await createEvent(BASE_INPUT)
    db.calendar_event_completions = [
      { event_id: seriesId, occurrence_date: '2026-10-13', member_id: 'member-1', points_awarded: 5 },
      { event_id: seriesId, occurrence_date: '2026-10-20', member_id: 'member-1', points_awarded: 5 },
      { event_id: seriesId, occurrence_date: '2026-10-27', member_id: 'member-1', points_awarded: 5 },
    ]
    await updateEventFromOccurrenceForward(seriesId, '2026-10-20', BASE_INPUT)

    const byDate = (d: string) => db.calendar_event_completions.find((r) => r.occurrence_date === d)!
    expect(byDate('2026-10-13').event_id).toBe(seriesId) // pasado: se queda en la serie original
    expect(byDate('2026-10-20').event_id).not.toBe(seriesId) // esta ocurrencia y las siguientes: al nuevo
    expect(byDate('2026-10-27').event_id).toBe(byDate('2026-10-20').event_id)
  })
})
