// Sincronización de Google → PEPA (sync-calendar-from-google-cron): se ejecuta el CÓDIGO REAL de la función (con una base de datos y un Google simulados, en memoria) para comprobar que
// sigue incorporando eventos nuevos, modificados y eliminados como siempre y que ya NO reescribe los que no han cambiado (la causa de las decenas de «Alguien modificó un evento»).
// Nada de esto toca producción.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  log: [] as string[],
  idSeq: 0,
}))

vi.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}))
vi.mock('npm:@supabase/supabase-js@2', () => {
  function builder(table: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
    let payload: Row | Row[] | null = null
    const filters: Array<(r: Row) => boolean> = []
    let single = false
    let wantRows = false
    const rows = () => (db.tables[table] ??= [])
    const exec = () => {
      const match = (r: Row) => filters.every((f) => f(r))
      if (op === 'select') return { data: rows().filter(match).map((r) => ({ ...r })), error: null }
      if (op === 'update') {
        db.log.push(`${table}.update`)
        for (const r of rows().filter(match)) Object.assign(r, payload as Row)
        return { data: null, error: null }
      }
      if (op === 'delete') {
        db.log.push(`${table}.delete`)
        db.tables[table] = rows().filter((r) => !match(r))
        return { data: null, error: null }
      }
      if (op === 'upsert') {
        db.log.push(`${table}.upsert`)
        const p = payload as Row
        if (!rows().some((r) => r.event_id === p.event_id && r.member_id === p.member_id)) rows().push({ ...p })
        return { data: null, error: null }
      }
      db.log.push(`${table}.insert`)
      const p = { id: `id${++db.idSeq}`, ...(payload as Row) }
      rows().push(p)
      return { data: single || wantRows ? (single ? { id: p.id } : [{ id: p.id }]) : null, error: null }
    }
    const api: Record<string, unknown> = {
      select: () => {
        wantRows = true
        return api
      },
      insert: (p: Row) => {
        op = 'insert'
        payload = p
        return api
      },
      update: (p: Row) => {
        op = 'update'
        payload = p
        return api
      },
      delete: () => {
        op = 'delete'
        return api
      },
      upsert: (p: Row) => {
        op = 'upsert'
        payload = p
        return api
      },
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v)
        return api
      },
      in: (k: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[k]))
        return api
      },
      single: () => {
        single = true
        return api
      },
      then: (resolve: (v: unknown) => unknown) => resolve(exec()),
    }
    return api
  }
  return {
    createClient: () => ({
      rpc: async (name: string, args: { p_name: string }) => ({ data: name === 'get_app_secret' ? { cron_shared_secret: 's3', google_oauth_client_id: 'cid', google_oauth_client_secret: 'cs' }[args.p_name] : null, error: null }),
      from: (t: string) => builder(t),
    }),
  }
})

let googleItems: Array<Record<string, unknown>> = []
const fetchMock = vi.fn(async (url: string | URL) => {
  const u = String(url)
  if (u.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
  if (u.includes('/calendars/primary/events')) return new Response(JSON.stringify({ items: googleItems }), { status: 200 })
  return new Response('{}', { status: 404 })
})

let handler: (req: Request) => Promise<Response>
beforeEach(async () => {
  db.tables = {
    google_calendar_credentials: [{ family_id: 'f1', member_id: 'm1', refresh_token: 'r' }],
    google_calendar_imported_events: [],
    calendar_events: [],
    calendar_event_members: [],
  }
  db.log = []
  db.idSeq = 0
  googleItems = []
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('Deno', {
    env: { get: (k: string) => ({ SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' })[k] },
    serve: (h: typeof handler) => {
      handler = h
    },
  })
  vi.resetModules()
  // Ruta en una variable: es código de Deno (no se revisa con los tipos de la web) y solo se ejecuta aquí.
  const functionPath = '../../supabase/functions/sync-calendar-from-google-cron/index'
  await import(/* @vite-ignore */ functionPath)
})

const run = async () => {
  const res = await handler(new Request('http://x/sync', { headers: { 'x-cron-secret': 's3' } }))
  return { status: res.status, body: res.status === 200 ? await res.json() : null }
}
const item = (id: string, over: Record<string, unknown> = {}) => ({ id, summary: `Evento ${id}`, start: { dateTime: '2026-11-05T09:00:00Z' }, end: { dateTime: '2026-11-05T10:00:00Z' }, ...over })
const writes = (table: string, kind: string) => db.log.filter((l) => l === `${table}.${kind}`).length

describe('sincronización de Google: eventos nuevos, modificados y eliminados (código real)', () => {
  it('sin el secreto del cron responde 401 y no toca nada', async () => {
    const res = await handler(new Request('http://x/sync', { headers: { 'x-cron-secret': 'malo' } }))
    expect(res.status).toBe(401)
    expect(db.log).toEqual([])
  })

  it('un evento NUEVO de Google se incorpora (evento + vínculo + miembro asignado)', async () => {
    googleItems = [item('g1')]
    const r = await run()
    expect(r.body).toMatchObject({ synced: 1, failed: 0 })
    expect(db.tables.calendar_events).toHaveLength(1)
    expect(db.tables.calendar_events[0]).toMatchObject({ title: 'Evento g1', family_id: 'f1', google_source_member_id: 'm1', all_day: false })
    expect(db.tables.google_calendar_imported_events).toHaveLength(1)
    expect(db.tables.calendar_event_members).toEqual([{ event_id: db.tables.calendar_events[0].id, member_id: 'm1' }])
  })

  it('un evento MODIFICADO en Google (título, hora, repetición) se actualiza', async () => {
    googleItems = [item('g1', { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'] })]
    await run()
    const id = db.tables.calendar_events[0].id
    db.log = []
    googleItems = [item('g1', { summary: 'Cambiado', start: { dateTime: '2026-11-05T09:30:00Z' }, recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'] })]
    await run()
    expect(db.tables.calendar_events).toHaveLength(1)
    expect(db.tables.calendar_events[0]).toMatchObject({ id, title: 'Cambiado', recurrence_rule: 'FREQ=WEEKLY;BYDAY=TU' })
    expect(new Date(db.tables.calendar_events[0].start_at as string).toISOString()).toBe('2026-11-05T09:30:00.000Z')
    expect(writes('calendar_events', 'update')).toBe(1)
  })

  it('una excepción nueva (EXDATE) o pasar a «todo el día» también cuenta como cambio', async () => {
    googleItems = [item('g1', { recurrence: ['RRULE:FREQ=DAILY'] })]
    await run()
    db.log = []
    googleItems = [item('g1', { recurrence: ['RRULE:FREQ=DAILY', 'EXDATE:20261110T090000Z'] })]
    await run()
    expect(writes('calendar_events', 'update')).toBe(1)
    expect(db.tables.calendar_events[0].exception_dates).toEqual(['2026-11-10'])
    db.log = []
    googleItems = [item('g1', { start: { date: '2026-11-05' }, end: { date: '2026-11-06' }, recurrence: ['RRULE:FREQ=DAILY', 'EXDATE:20261110T090000Z'] })]
    await run()
    expect(writes('calendar_events', 'update')).toBe(1)
    expect(db.tables.calendar_events[0].all_day).toBe(true)
  })

  it('un evento CANCELADO en Google se elimina', async () => {
    googleItems = [item('g1'), item('g2')]
    await run()
    expect(db.tables.calendar_events).toHaveLength(2)
    googleItems = [item('g1'), item('g2', { status: 'cancelled' })]
    await run()
    expect(db.tables.calendar_events.map((e) => e.title)).toEqual(['Evento g1'])
  })

  it('un evento que ya no aparece en Google (fuera de la ventana de cancelados) también se elimina', async () => {
    googleItems = [item('g1'), item('g2')]
    await run()
    googleItems = [item('g1')]
    await run()
    expect(db.tables.calendar_events.map((e) => e.title)).toEqual(['Evento g1'])
    expect(db.tables.google_calendar_imported_events.length).toBeGreaterThanOrEqual(1)
  })
})

describe('lo que arregla: los eventos que NO han cambiado ya no se reescriben', () => {
  it('49 eventos sin cambios en una vuelta nueva → 0 updates (antes: 49 updates y 49 anotaciones de actividad cada hora)', async () => {
    googleItems = Array.from({ length: 49 }, (_, i) => item(`g${i}`))
    await run()
    expect(db.tables.calendar_events).toHaveLength(49)
    db.log = []
    const r = await run()
    expect(r.body).toMatchObject({ synced: 1, failed: 0 })
    expect(writes('calendar_events', 'update')).toBe(0)
    expect(writes('calendar_events', 'insert')).toBe(0)
    expect(writes('calendar_events', 'delete')).toBe(0)
    expect(db.tables.calendar_events).toHaveLength(49)
  })

  it('mezcla en una misma vuelta: 1 nuevo + 1 modificado + 1 cancelado + 47 iguales → solo 3 escrituras', async () => {
    googleItems = Array.from({ length: 49 }, (_, i) => item(`g${i}`))
    await run()
    db.log = []
    googleItems = [...googleItems.slice(0, 47), item('g47', { summary: 'Otro título' }), item('g48', { status: 'cancelled' }), item('nuevo')]
    await run()
    expect(writes('calendar_events', 'insert')).toBe(1)
    expect(writes('calendar_events', 'update')).toBe(1)
    expect(writes('calendar_events', 'delete')).toBe(1)
    expect(db.tables.calendar_events).toHaveLength(49)
  })

  it('lo hecho DENTRO de la app sobre un evento importado (otros campos) no se pisa porque no se reescribe sin cambios', async () => {
    googleItems = [item('g1')]
    await run()
    db.tables.calendar_events[0].reminders_marker = 'puesto en la app'
    await run()
    expect(db.tables.calendar_events[0].reminders_marker).toBe('puesto en la app')
  })

  it('si la lectura de lo guardado no devuelve el evento, se escribe igual (nunca se queda sin actualizar por error)', async () => {
    googleItems = [item('g1')]
    await run()
    db.tables.calendar_events[0].title = 'Titulo viejo distinto'
    googleItems = [item('g1')]
    db.log = []
    await run()
    expect(db.tables.calendar_events[0].title).toBe('Evento g1')
    expect(writes('calendar_events', 'update')).toBe(1)
  })
})
