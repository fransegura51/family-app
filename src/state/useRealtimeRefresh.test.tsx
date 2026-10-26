// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// «Servidor» simulado: cada canal guarda sus callbacks; `emit` entrega un cambio a TODOS los suscriptores de la tabla (como haría Realtime con dos dispositivos de la misma familia).
const server = vi.hoisted(() => {
  const channels: { name: string; table: string; onChange: () => void; onStatus: (s: string) => void; removed: boolean }[] = []
  return {
    channels,
    emit(table: string) {
      channels.filter((c) => c.table === table && !c.removed).forEach((c) => c.onChange())
    },
    status(table: string, s: string) {
      channels.filter((c) => c.table === table && !c.removed).forEach((c) => c.onStatus(s))
    },
  }
})
vi.mock('@/data/supabaseClient', () => ({
  supabase: {
    channel(name: string) {
      const ch: { name: string; table: string; onChange: () => void; onStatus: (s: string) => void; removed: boolean } = { name, table: '', onChange: () => {}, onStatus: () => {}, removed: false }
      server.channels.push(ch)
      const api = {
        on(_type: string, filter: { table: string }, cb: () => void) {
          ch.table = filter.table
          ch.onChange = cb
          return api
        },
        subscribe(cb: (s: string) => void) {
          ch.onStatus = cb
          cb('SUBSCRIBED')
          return api
        },
        _ch: ch,
      }
      return api
    },
    removeChannel(api: { _ch: { removed: boolean } }) {
      api._ch.removed = true
      return Promise.resolve('ok')
    },
  },
}))

import { realtimeDebugState, useRealtimeRefresh } from '@/state/useRealtimeRefresh'

function Screen({ tables, reload, paused = false }: { tables: string[]; reload: () => void; paused?: boolean }) {
  useRealtimeRefresh(tables, reload, { debounceMs: 100, paused, focusThrottleMs: 0 })
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
  server.channels.length = 0
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const tick = (ms: number) => act(async () => void vi.advanceTimersByTime(ms))

describe('sincronización entre dispositivos (useRealtimeRefresh)', () => {
  it('un cambio en la tabla (hecho en OTRO dispositivo) recarga la pantalla sin tocar nada', async () => {
    const reload = vi.fn()
    render(<Screen tables={['menu_entries']} reload={reload} />)
    expect(reload).not.toHaveBeenCalled()
    server.emit('menu_entries')
    await tick(150)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('una ráfaga (reordenar 21 platos) da UNA sola recarga', async () => {
    const reload = vi.fn()
    render(<Screen tables={['menu_entries']} reload={reload} />)
    for (let i = 0; i < 21; i++) {
      server.emit('menu_entries')
      await tick(10)
    }
    await tick(200)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('dos dispositivos (dos pantallas) se enteran los dos del mismo cambio, en ambas direcciones', async () => {
    const pc = vi.fn()
    const movil = vi.fn()
    const a = render(<Screen tables={['menu_entries']} reload={pc} />)
    const b = render(<Screen tables={['menu_entries']} reload={movil} />)
    server.emit('menu_entries') // lo hace el ordenador
    await tick(150)
    expect(pc).toHaveBeenCalledTimes(1)
    expect(movil).toHaveBeenCalledTimes(1)
    server.emit('menu_entries') // lo hace el móvil
    await tick(150)
    expect(pc).toHaveBeenCalledTimes(2)
    expect(movil).toHaveBeenCalledTimes(2)
    a.unmount()
    b.unmount()
  })

  it('un cambio en otra tabla no recarga esta pantalla', async () => {
    const reload = vi.fn()
    render(<Screen tables={['menu_entries']} reload={reload} />)
    server.emit('shopping_items')
    await tick(300)
    expect(reload).not.toHaveBeenCalled()
  })

  it('con algo en edición NO se recarga (no se pisa lo que se teclea) y se recarga al terminar', async () => {
    const reload = vi.fn()
    const { rerender } = render(<Screen tables={['menu_entries']} reload={reload} paused />)
    server.emit('menu_entries')
    await tick(500)
    expect(reload).not.toHaveBeenCalled()
    rerender(<Screen tables={['menu_entries']} reload={reload} paused={false} />)
    await tick(300)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('al volver a la pestaña o recuperar la conexión se recarga (por si se perdió algún aviso)', async () => {
    const reload = vi.fn()
    render(<Screen tables={['menu_entries']} reload={reload} />)
    await act(async () => void window.dispatchEvent(new Event('online')))
    expect(reload).toHaveBeenCalledTimes(1)
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('tras una caída del canal, al reconectar se recarga una vez', async () => {
    const reload = vi.fn()
    render(<Screen tables={['menu_entries']} reload={reload} />)
    server.status('menu_entries', 'CHANNEL_ERROR')
    server.status('menu_entries', 'SUBSCRIBED')
    await tick(150)
    expect(reload).toHaveBeenCalledTimes(1)
    server.status('menu_entries', 'SUBSCRIBED') // ya estaba arriba: nada más
    await tick(150)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('un solo canal por tabla aunque la escuchen varias pantallas, y se libera al salir de todas', () => {
    const a = render(<Screen tables={['menu_entries', 'recipes']} reload={() => undefined} />)
    const b = render(<Screen tables={['menu_entries']} reload={() => undefined} />)
    expect(server.channels.filter((c) => c.table === 'menu_entries').length).toBe(1)
    expect(realtimeDebugState()).toEqual({ menu_entries: 2, recipes: 1 })
    a.unmount()
    expect(realtimeDebugState()).toEqual({ menu_entries: 1 })
    expect(server.channels.find((c) => c.table === 'recipes')?.removed).toBe(true)
    b.unmount()
    expect(realtimeDebugState()).toEqual({})
    expect(server.channels.every((c) => c.removed)).toBe(true)
  })

  it('tras salir de la pantalla ya no recarga nada', async () => {
    const reload = vi.fn()
    const { unmount } = render(<Screen tables={['menu_entries']} reload={reload} />)
    unmount()
    server.emit('menu_entries')
    window.dispatchEvent(new Event('online'))
    await tick(500)
    expect(reload).not.toHaveBeenCalled()
  })

  it('usa siempre la última versión de reload (sin cierres obsoletos al cambiar de semana)', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Screen tables={['menu_entries']} reload={first} />)
    rerender(<Screen tables={['menu_entries']} reload={second} />)
    server.emit('menu_entries')
    await tick(150)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('una recarga que falla no rompe nada y la siguiente se intenta', async () => {
    const reload = vi.fn().mockRejectedValueOnce(new Error('red')).mockResolvedValue(undefined)
    render(<Screen tables={['menu_entries']} reload={reload} />)
    server.emit('menu_entries')
    await tick(150)
    server.emit('menu_entries')
    await tick(150)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
