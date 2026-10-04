import { beforeEach, describe, expect, it, vi } from 'vitest'

// Calendario ↔ fecha del evento — bug REPRODUCIDO EN VIVO (cumpleaños de prueba, 20 feb 2027 17:00): guardar la
// fecha como Provisional iba bien, pero al pasarla a Confirmada salía «No se pudo anotar la fecha en el calendario».
// CAUSA REAL: la hora llega de Postgres como «17:00:00» y linkEventToCalendar/updateLinkedCalendarEvent construían
// `${fecha}T${hora}:00` → «2027-02-20T17:00:00:00», una fecha-hora que Postgres RECHAZA. El evento ya estaba
// guardado (updateEvent escribe primero en `events`) y solo el Calendario fallaba.
//
// Estos tests ejecutan el código REAL de data/events.ts contra una base falsa en memoria que, como Postgres,
// rechaza una marca de tiempo inválida y devuelve `time` como «HH:MM:SS».
const { toasts } = vi.hoisted(() => ({ toasts: [] as string[] }))
vi.mock('@/state/toast', () => ({ showToast: (m: string) => void toasts.push(m) }))

type Row = Record<string, unknown> & { id?: string }
const db: Record<string, Row[]> = {}
let idSeq = 0
let failCalendarWrites = false

// Lo que Postgres acepta en una columna timestamptz (lo que NO acepta: «…17:00:00:00»).
const TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/

function normalizeRow(table: string, input: Row): Row {
  const row = { ...input }
  if (table === 'events' && typeof row.event_time === 'string' && /^\d{2}:\d{2}$/.test(row.event_time)) row.event_time = `${row.event_time}:00`
  return row
}

function validate(table: string, row: Row): string | null {
  if (table === 'calendar_events' && failCalendarWrites) return 'calendario no disponible'
  if (table === 'calendar_events' && row.start_at !== undefined && !TIMESTAMPTZ.test(String(row.start_at))) {
    return `invalid input syntax for type timestamp with time zone: "${row.start_at}"`
  }
  return null
}

function from(table: string) {
  const rows = () => (db[table] ??= [])
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row = {}
  const filters: [string, unknown][] = []
  const matches = (r: Row) => filters.every(([c, v]) => r[c] === v)
  function exec(): { data: Row[] | null; error: { message: string } | null } {
    if (op === 'select') return { data: rows().filter(matches).map((r) => ({ ...r })), error: null }
    if (op === 'insert') {
      const problem = validate(table, payload)
      if (problem) return { data: null, error: { message: problem } }
      const row = normalizeRow(table, { id: `${table}-${++idSeq}`, ...payload })
      rows().push(row)
      return { data: [{ ...row }], error: null }
    }
    if (op === 'update') {
      const problem = validate(table, payload)
      if (problem) return { data: null, error: { message: problem } }
      for (const r of rows().filter(matches)) Object.assign(r, normalizeRow(table, payload))
      return { data: null, error: null }
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
    order() {
      return builder
    },
    eq(c: string, v: unknown) {
      filters.push([c, v])
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

vi.mock('@/data/supabaseClient', () => ({
  supabase: {
    from,
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  },
}))

const { updateEvent, createEvent, syncOperationalDateFromMoments } = await import('@/data/events')

const calendarRows = () => db.calendar_events ?? []
const eventRow = (id = 'e1') => (db.events ?? []).find((r) => r.id === id) as Row
const toasted = (text: string) => toasts.some((t) => t.includes(text))
const failToast = () => toasts.some((t) => t.includes('No se pudo anotar'))

function seedEvent(over: Row = {}, id = 'e1') {
  db.events.push({
    id,
    family_id: 'f1',
    type: 'cumpleanos',
    subtype: null,
    title: 'ZZZ cumple prueba',
    date_status: 'pendiente',
    event_date: null,
    event_time: null,
    venue_label: null,
    status: 'planificacion',
    calendar_event_id: null,
    details: {},
    enabled_modules: [],
    ...over,
  })
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  db.events = []
  db.calendar_events = []
  db.profiles = [{ id: 'u1', family_id: 'f1' }]
  toasts.length = 0
  idSeq = 0
  failCalendarWrites = false
  seedEvent()
})

const instant = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString()

describe('Calendario — la causa real del aviso «No se pudo anotar la fecha» (hora «HH:MM:SS»)', () => {
  it('REPRODUCCIÓN: la base de datos falsa rechaza lo que construía el código antiguo («…17:00:00:00») igual que Postgres', () => {
    expect(TIMESTAMPTZ.test('2027-02-20T17:00:00:00')).toBe(false)
    expect(TIMESTAMPTZ.test('2027-02-20T17:00:00')).toBe(true)
  })

  it('1. primera fecha con hora, Provisional: se guarda, NO se apunta aún (provisional) y no hay aviso de error', async () => {
    await updateEvent('e1', { dateStatus: 'provisional', eventDate: '2027-02-20', eventTime: '17:00' })
    expect(eventRow().event_time).toBe('17:00:00') // Postgres devuelve «HH:MM:SS»
    expect(calendarRows()).toHaveLength(0)
    expect(failToast()).toBe(false)
  })

  it('2. Provisional → Confirmada con hora (el caso que fallaba): se apunta UNA vez, sin aviso de error', async () => {
    await updateEvent('e1', { dateStatus: 'provisional', eventDate: '2027-02-20', eventTime: '17:00' })
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    expect(failToast()).toBe(false)
    expect(calendarRows()).toHaveLength(1)
    expect(calendarRows()[0].start_at).toBe(instant('2027-02-20', '17:00'))
    expect(calendarRows()[0].all_day).toBe(false)
    expect(eventRow().calendar_event_id).toBe(calendarRows()[0].id)
    expect(eventRow().event_date).toBe('2027-02-20')
    expect(toasted('Fecha anotada en el calendario')).toBe(true)
  })

  it('3. Confirmada → Provisional (misma fecha y hora): sigue habiendo UNA sola entrada, sin error y sin escribir nada', async () => {
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    const entry = { ...calendarRows()[0] }
    toasts.length = 0
    await updateEvent('e1', { dateStatus: 'provisional', eventDate: '2027-02-20', eventTime: '17:00' })
    expect(failToast()).toBe(false)
    expect(calendarRows()).toHaveLength(1)
    expect(calendarRows()[0]).toEqual(entry)
    expect(toasts).toEqual([]) // cambio de estado sin cambio de fecha: nada que avisar
    expect(eventRow().calendar_event_id).toBe(entry.id)
  })

  it('Provisional ↔ Confirmada repetido muchas veces nunca duplica ni falla', async () => {
    for (const status of ['confirmada', 'provisional', 'confirmada', 'provisional', 'confirmada'] as const) {
      await updateEvent('e1', { dateStatus: status, eventDate: '2027-02-20', eventTime: '17:00' })
    }
    expect(calendarRows()).toHaveLength(1)
    expect(failToast()).toBe(false)
  })

  it('4. cambiar SOLO la hora: la misma entrada se actualiza (no se crea otra)', async () => {
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    const id = calendarRows()[0].id
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '19:30' })
    expect(calendarRows()).toHaveLength(1)
    expect(calendarRows()[0].id).toBe(id)
    expect(calendarRows()[0].start_at).toBe(instant('2027-02-20', '19:30'))
    expect(failToast()).toBe(false)
  })

  it('5. borrar la hora: la entrada pasa a «todo el día» (nunca 00:00 con hora) y la hora del evento queda null', async () => {
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: null })
    expect(eventRow().event_time).toBeNull()
    expect(calendarRows()).toHaveLength(1)
    expect(calendarRows()[0].all_day).toBe(true)
    expect(calendarRows()[0].start_at).toBe('2027-02-20T00:00:00.000Z')
    expect(failToast()).toBe(false)
  })

  it('6. cambiar el día: la MISMA entrada se recoloca, sin duplicar', async () => {
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    const id = calendarRows()[0].id
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-27', eventTime: '17:00' })
    expect(calendarRows()).toHaveLength(1)
    expect(calendarRows()[0].id).toBe(id)
    expect(calendarRows()[0].start_at).toBe(instant('2027-02-27', '17:00'))
    expect(toasted('Fecha actualizada en el calendario')).toBe(true)
  })

  it('7. guardar dos veces lo mismo: idempotente (sin segunda escritura, sin aviso, sin duplicado)', async () => {
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    const entry = { ...calendarRows()[0] }
    toasts.length = 0
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    expect(calendarRows()).toHaveLength(1)
    expect(calendarRows()[0]).toEqual(entry)
    expect(toasts).toEqual([])
  })

  it('8/9. Quitar fecha: el evento queda sin fecha ni hora, la entrada del Calendario desaparece y el enlace se limpia', async () => {
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    await updateEvent('e1', { dateStatus: 'pendiente', eventDate: null, eventTime: null })
    expect(eventRow()).toMatchObject({ date_status: 'pendiente', event_date: null, event_time: null, calendar_event_id: null })
    expect(calendarRows()).toHaveLength(0)
    expect(toasted('Fecha quitada del calendario')).toBe(true)
    expect(failToast()).toBe(false)
  })

  it('Quitar la fecha de un evento que estaba Provisional pero ya tenía entrada (antes fue Confirmada) también la retira', async () => {
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    await updateEvent('e1', { dateStatus: 'provisional', eventDate: '2027-02-20', eventTime: '17:00' })
    await updateEvent('e1', { dateStatus: 'pendiente', eventDate: null, eventTime: null })
    expect(calendarRows()).toHaveLength(0)
    expect(eventRow().calendar_event_id).toBeNull()
  })

  it('Quitar la fecha de un evento que nunca estuvo en el Calendario no toca nada ni avisa', async () => {
    await updateEvent('e1', { dateStatus: 'provisional', eventDate: '2027-02-20', eventTime: '17:00' })
    toasts.length = 0
    await updateEvent('e1', { dateStatus: 'pendiente', eventDate: null, eventTime: null })
    expect(calendarRows()).toHaveLength(0)
    expect(toasts).toEqual([])
  })

  it('10. volver a poner fecha tras quitarla: se apunta de nuevo UNA vez (sin restos de la anterior)', async () => {
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    await updateEvent('e1', { dateStatus: 'pendiente', eventDate: null, eventTime: null })
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-03-05', eventTime: '12:00' })
    expect(calendarRows()).toHaveLength(1)
    expect(calendarRows()[0].start_at).toBe(instant('2027-03-05', '12:00'))
    expect(eventRow().calendar_event_id).toBe(calendarRows()[0].id)
    expect(failToast()).toBe(false)
  })

  it('12. evento sencillo SIN hora (todo el día): sigue funcionando como siempre', async () => {
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: null })
    expect(calendarRows()).toHaveLength(1)
    expect(calendarRows()[0]).toMatchObject({ all_day: true, start_at: '2027-02-20T00:00:00.000Z', title: 'ZZZ cumple prueba', visibility: 'shared' })
    expect(failToast()).toBe(false)
  })

  it('un evento antiguo ya enlazado (entrada de todo el día como «2027-02-20 00:00:00+00») se reconoce como igual: no se reescribe', async () => {
    db.calendar_events.push({ id: 'old', title: 'ZZZ cumple prueba', start_at: '2027-02-20 00:00:00+00', all_day: true, location_label: null })
    eventRow().calendar_event_id = 'old'
    Object.assign(eventRow(), { date_status: 'confirmada', event_date: '2027-02-20' })
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: null })
    expect(calendarRows()).toHaveLength(1)
    expect(calendarRows()[0].id).toBe('old')
    expect(toasts).toEqual([])
  })

  it('un enlace colgando (la entrada se borró desde Calendario) se vuelve a crear al confirmar, sin duplicar', async () => {
    eventRow().calendar_event_id = 'borrada'
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    expect(calendarRows()).toHaveLength(1)
    expect(eventRow().calendar_event_id).toBe(calendarRows()[0].id)
    expect(failToast()).toBe(false)
  })

  it('un enlace colgando con la fecha quitada solo limpia el enlace', async () => {
    eventRow().calendar_event_id = 'borrada'
    await updateEvent('e1', { dateStatus: 'pendiente', eventDate: null, eventTime: null })
    expect(eventRow().calendar_event_id).toBeNull()
    expect(toasted('Fecha quitada')).toBe(false)
  })

  it('un evento archivado no toca el Calendario', async () => {
    eventRow().status = 'archivado'
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    expect(calendarRows()).toHaveLength(0)
  })

  it('14. evento con momentos (boda/comunión/bautizo): la fecha derivada del primer momento fechado se apunta y se mueve en la MISMA entrada', async () => {
    seedEvent({ type: 'boda', title: 'ZZZ boda prueba', event_time: '12:30:00' }, 'e2')
    db.event_moments = [
      { id: 'm1', event_id: 'e2', title: 'Ceremonia', moment_date: '2027-06-12', date_status: 'confirmada', sort_order: 1 },
      { id: 'm2', event_id: 'e2', title: 'Banquete', moment_date: '2027-06-13', date_status: 'provisional', sort_order: 2 },
    ]
    expect(await syncOperationalDateFromMoments('e2')).toBe(true)
    expect(failToast()).toBe(false)
    expect(calendarRows()).toHaveLength(1)
    expect(calendarRows()[0].start_at).toBe(instant('2027-06-12', '12:30'))
    // el primer momento se pasa al día 19: ahora el primero es el del 13 (provisional) → misma entrada, sin duplicar
    db.event_moments[0].moment_date = '2027-06-19'
    expect(await syncOperationalDateFromMoments('e2')).toBe(true)
    expect(calendarRows()).toHaveLength(1)
    expect(calendarRows()[0].start_at).toBe(instant('2027-06-13', '12:30'))
    expect(failToast()).toBe(false)
  })

  it('crear un evento ya Confirmado (el alta no lleva hora) se apunta bien como todo el día', async () => {
    const id = await createEvent({ type: 'cumpleanos', title: 'ZZZ nuevo', dateStatus: 'confirmada', eventDate: '2027-04-01', enabledModules: [] })
    expect(failToast()).toBe(false)
    expect(calendarRows().some((r) => r.title === 'ZZZ nuevo' && r.start_at === '2027-04-01T00:00:00.000Z' && r.all_day === true)).toBe(true)
    expect(id).toBeTruthy()
  })

  it('el error del Calendario sigue siendo visible (no se oculta): si el Calendario falla de verdad, el evento se guarda y se avisa', async () => {
    failCalendarWrites = true
    await updateEvent('e1', { dateStatus: 'confirmada', eventDate: '2027-02-20', eventTime: '17:00' })
    expect(eventRow().event_date).toBe('2027-02-20')
    expect(failToast()).toBe(true)
    expect(calendarRows()).toHaveLength(0)
  })

})
