// @vitest-environment jsdom
// Pantalla «Actividad»: con 1 anotación de Jennifer y 49 «modificó un evento» sin persona del mismo minuto (el caso real) se ven 2 líneas claras; los nombres solo salen si la consulta
// los devuelve (las reglas de acceso de siempre); «Ver más antiguas» sigue la lista sin perder nada.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  pages: [] as Array<Array<Record<string, unknown>>>,
  titles: {} as Record<string, string>,
  calls: [] as string[],
}))

vi.mock('@/data/supabaseClient', () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    const self = new Proxy(q, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown) => {
            if (table === 'activity_log') return resolve({ data: state.pages.shift() ?? [], error: null })
            return resolve({ data: Object.entries(state.titles).map(([id, title]) => ({ id, title, name: title })), error: null })
          }
        }
        return (...args: unknown[]) => {
          state.calls.push(`${table}.${String(prop)}(${args.map((a) => (typeof a === 'string' ? a : Array.isArray(a) ? `[${a.length}]` : '')).join(',')})`)
          return self
        }
      },
    })
    return self
  }
  return { supabase: { from: (table: string) => chain(table) } }
})

const { ActivityScreen } = await import('@/ui/ActivityScreen')

afterEach(() => {
  cleanup()
  state.pages = []
  state.titles = {}
  state.calls = []
})

const row = (i: number, over: Record<string, unknown> = {}) => ({
  id: `a${i}`,
  table_name: 'calendar_events',
  action: 'update',
  created_at: `2026-10-23T15:06:${String(i % 60).padStart(2, '0')}.000Z`,
  actor_id: null,
  record_id: `ev${i}`,
  profiles: null,
  ...over,
})

describe('pantalla Actividad', () => {
  it('el caso reportado: 50 anotaciones = 2 líneas (la de Jennifer y la del proceso automático con su número)', async () => {
    state.pages = [[row(100, { id: 'prod', table_name: 'shopping_items', action: 'insert', created_at: '2026-10-23T15:08:00.000Z', actor_id: 'p1', record_id: 'prod1', profiles: { display_name: 'Jennifer' } }), ...Array.from({ length: 49 }, (_, i) => row(i))]]
    render(<ActivityScreen />)
    expect(await screen.findByText('Jennifer creó un producto de la lista')).toBeTruthy()
    expect(screen.getByText('Un proceso automático de PEPA modificó 49 eventos')).toBeTruthy()
    expect(screen.queryByText(/Alguien modificó un evento/)).toBeNull()
  })

  it('con nombres legibles (la consulta los devuelve) los enseña; si no, texto genérico sin inventar', async () => {
    state.pages = [[row(1, { actor_id: 'p1', profiles: { display_name: 'Ana' }, record_id: 'evA' })]]
    state.titles = { evA: 'Dentista' }
    render(<ActivityScreen />)
    expect(await screen.findByText('Ana modificó un evento: «Dentista»')).toBeTruthy()
    cleanup()
    state.pages = [[row(2, { actor_id: 'p1', profiles: { display_name: 'Ana' }, record_id: 'evPrivado' })]]
    state.titles = {} // un evento privado de otra persona no se puede leer: no hay título
    render(<ActivityScreen />)
    expect(await screen.findByText('Ana modificó un evento')).toBeTruthy()
  })

  it('«Ver más antiguas» pide solo las anteriores y añade sin duplicar ni perder', async () => {
    const full = Array.from({ length: 200 }, (_, i) => row(i, { actor_id: 'p1', profiles: { display_name: 'Ana' }, created_at: new Date(Date.UTC(2026, 9, 23, 15, 0, 0) - i * 10 * 60 * 1000).toISOString(), record_id: `ev${i}` }))
    state.pages = [full, [row(500, { actor_id: 'p2', profiles: { display_name: 'Beto' }, created_at: '2026-10-22T10:00:00.000Z', record_id: 'evOld' })]]
    render(<ActivityScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ver más antiguas' }))
    await waitFor(() => expect(screen.getByText('Beto modificó un evento')).toBeTruthy())
    expect(state.calls.some((c) => c.startsWith('activity_log.lt(created_at'))).toBe(true)
    expect(screen.queryByRole('button', { name: 'Ver más antiguas' })).toBeNull() // la última página venía incompleta: no hay más
  })

  it('solo pide los nombres con consultas pequeñas y de lectura (nunca escribe nada)', async () => {
    state.pages = [[row(1, { actor_id: 'p1', profiles: { display_name: 'Ana' } })]]
    render(<ActivityScreen />)
    await screen.findByText(/Ana modificó/)
    expect(state.calls.some((c) => /\.(insert|update|delete|upsert)\(/.test(c))).toBe(false)
  })

  it('sin actividad, lo dice', async () => {
    state.pages = [[]]
    render(<ActivityScreen />)
    expect(await screen.findByText('Todavía no hay actividad registrada.')).toBeTruthy()
  })
})
