// @vitest-environment jsdom
// CONFIG-01.1 · prueba de interfaz de extremo a extremo con SERVICIOS SIMULADOS: el menú inferior REAL (NavShell), el motor REAL de preferencias y la red REAL de
// preferencias (prefsTransport) contra un servidor y un canal de tiempo real falsos, con un segundo «dispositivo» que cambia el orden. No sustituye la comprobación
// final en dispositivos reales.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeServer, FakeStorage, makeDevice, settle } from '@/state/prefs/prefsSimulation'

const USER = 'persona-1'
const NAV = 'familyapp:tab-order:bottom-nav'

const hoisted = vi.hoisted(() => ({
  server: null as unknown as FakeServer,
  channelStatus: null as null | ((s: string) => void),
  connected: { value: true },
  // Forma en que el tiempo real entrega el valor (en los dispositivos reales NO llegaba como texto): se prueba con varias.
  shape: { fn: (v: string | null) => v as unknown },
}))

vi.mock('@/data/supabaseClient', () => {
  const supabase = {
    from: () => {
      let after = 0
      const q = {
        select: () => q,
        gt: (_c: string, v: number) => {
          after = v
          return q
        },
        order: () => q,
        limit: async () => {
          if (!hoisted.connected.value) return { data: null, error: new Error('Failed to fetch') }
          return { data: hoisted.server.fetchSince(USER, after), error: null }
        },
      }
      return q
    },
    rpc: async (_name: string, args: { p_key: string; p_value: string | null; p_base_rev: number }) => {
      if (!hoisted.connected.value) return { data: null, error: new Error('Failed to fetch') }
      return { data: [hoisted.server.set(USER, args.p_key, args.p_value, args.p_base_rev)], error: null }
    },
    channel: () => {
      let cb: ((p: { new: unknown }) => void) | null = null
      const ch = {
        on: (_t: string, _o: unknown, handler: (p: { new: unknown }) => void) => {
          cb = handler
          return ch
        },
        subscribe: (status: (s: string) => void) => {
          hoisted.channelStatus = status
          status('SUBSCRIBED')
          hoisted.server.subscribe(USER, (row) => cb?.({ new: { ...row, value: hoisted.shape.fn(row.value) } }), () => hoisted.connected.value)
          return ch
        },
      }
      return ch
    },
    removeChannel: async () => {},
  }
  return { supabase }
})
vi.mock('@/data/errorReports', () => ({ reportClientError: async () => {} }))
vi.mock('@/data/events', () => ({ loadAllEventAlerts: async () => [] }))
vi.mock('@/ui/VoiceCapture', () => ({ VoiceCapture: () => null }))
vi.mock('@/ui/SocialMenuFab', () => ({ SocialMenuFab: () => null }))
vi.mock('@/ui/ScrollToTopFab', () => ({ ScrollToTopFab: () => null }))
vi.mock('@/ui/community/CommunityMenuItem', () => ({ CommunityMenuItem: () => null }))

import { NavShell } from '@/ui/NavShell'
import { setPrefsV2ForTests } from '@/state/prefs/flags'
import { startPrefsSync } from '@/state/prefsSync'
import { saveTabOrder } from '@/state/tabOrder'
import { NAV_TAB_BY_PATH, NAV_TAB_PATHS } from '@/domain/navTabs'

const profile = { id: USER, familyId: 'f', role: 'admin', displayName: 'Ana', allowedSections: null } as never

function bottomLabels(): string[] {
  const nav = document.querySelector('nav.bottom-nav') as HTMLElement
  return [...nav.querySelectorAll('.nav-item-label')].map((n) => n.textContent ?? '')
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<NavShell profile={profile} />}>
          <Route path="/" element={<div>inicio</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('CONFIG-01.1 · el orden del menú se sincroniza entre dispositivos (servicios simulados)', () => {
  let stop: () => void
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    hoisted.server = new FakeServer()
    hoisted.connected.value = true
    hoisted.channelStatus = null
    hoisted.shape.fn = (v) => v
    setPrefsV2ForTests(true)
  })
  afterEach(() => {
    stop?.()
    cleanup()
    setPrefsV2ForTests(null)
    vi.useRealTimers()
  })

  async function boot() {
    stop = startPrefsSync(USER)
    renderShell()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
  }

  it('ordenador → móvil: otro dispositivo reordena el menú y este (ya abierto) lo repinta SIN recargar ni cerrar sesión', async () => {
    await boot()
    const before = bottomLabels()
    expect(before.slice(0, 2)).toEqual(['Menú', 'Inicio'])
    const reordered = [...NAV_TAB_PATHS].reverse() // el orden del otro dispositivo
    const other = makeDevice(hoisted.server, USER, new FakeStorage())
    await other.engine.start()
    await settle()
    other.engine.set(NAV, JSON.stringify(reordered))
    await act(async () => {
      await other.clock.advance(1000)
      await vi.advanceTimersByTimeAsync(600) // el aviso de tiempo real despierta la descarga (150 ms) y la pantalla se repinta
    })
    // El menú muestra ahora, tras «Menú», los cuatro primeros del nuevo orden.
    const expected = reordered.slice(0, 4).map((to) => NAV_TAB_BY_PATH.get(to)?.label)
    const labels = bottomLabels().slice(1)
    expect(labels).toEqual(expected)
    expect(labels).not.toEqual(before.slice(1))
    expect(JSON.parse(localStorage.getItem(NAV) as string)).toEqual(reordered)
  })

  it('móvil → ordenador: reordenar aquí (como hace «Organizar menú») llega al otro dispositivo', async () => {
    await boot()
    const other = makeDevice(hoisted.server, USER, new FakeStorage())
    await other.engine.start()
    await settle()
    const mine = [...NAV_TAB_PATHS].reverse()
    act(() => saveTabOrder('bottom-nav', mine))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(hoisted.server.get(USER, NAV)?.value).toBe(JSON.stringify(mine))
    await other.clock.advance(600)
    expect(other.storage.getItem(NAV)).toBe(JSON.stringify(mine))
  })

  it('el menú propio también se repinta con SU cambio, y un cambio que otro dispositivo hizo antes mientras estaba sin red no se pierde', async () => {
    await boot()
    hoisted.connected.value = false // este dispositivo pierde la conexión
    const mine = [...NAV_TAB_PATHS].reverse()
    act(() => saveTabOrder('bottom-nav', mine))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(hoisted.server.get(USER, NAV)).toBeUndefined() // sin red: queda pendiente, no se pierde
    hoisted.connected.value = true
    await act(async () => {
      window.dispatchEvent(new Event('online')) // al recuperar la red se sube lo pendiente
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(hoisted.server.get(USER, NAV)?.value).toBe(JSON.stringify(mine))
  })

  it('conflicto: se avisa con discreción, prevalece lo confirmado antes y «Recuperar el mío» vuelve a aplicar el valor rechazado', async () => {
    await boot()
    hoisted.connected.value = false
    const mine = JSON.stringify([...NAV_TAB_PATHS].reverse())
    act(() => saveTabOrder('bottom-nav', [...NAV_TAB_PATHS].reverse()))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    const theirs = JSON.stringify(NAV_TAB_PATHS.slice(0, 3))
    hoisted.server.set(USER, NAV, theirs, 0) // otro dispositivo se adelantó mientras éste no tenía red
    hoisted.connected.value = true
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(screen.getByText(/Se aplicó un cambio más reciente hecho en otro dispositivo en el orden del menú/)).toBeTruthy()
    expect(localStorage.getItem(NAV)).toBe(theirs)
    expect(hoisted.server.get(USER, NAV)?.value).toBe(theirs)
    await act(async () => {
      fireEvent.click(screen.getByText('Recuperar el mío'))
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(hoisted.server.get(USER, NAV)?.value).toBe(mine)
    expect(localStorage.getItem(NAV)).toBe(mine)
    expect(screen.queryByText(/Se aplicó un cambio más reciente/)).toBeNull()
  })

  it('un fallo persistente al guardar se muestra (no se pierde en silencio) y «Reintentar ahora» lo sube cuando vuelve la red', async () => {
    await boot()
    hoisted.connected.value = false
    act(() => saveTabOrder('bottom-nav', [...NAV_TAB_PATHS].reverse()))
    await act(async () => {
      // el aviso de red caída se acumula tras varios reintentos fallidos
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(1000)
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(10_000)
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(screen.getByText(/No se están pudiendo guardar algunos cambios/)).toBeTruthy()
    hoisted.connected.value = true
    await act(async () => {
      fireEvent.click(screen.getByText('Reintentar ahora'))
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(hoisted.server.get(USER, NAV)?.value).toBe(JSON.stringify([...NAV_TAB_PATHS].reverse()))
  })

  for (const [nombre, forma] of [
    ['una lista en vez de texto', (v: string | null) => (v ? JSON.parse(v) : v)],
    ['un texto con otra capa de comillas', (v: string | null) => JSON.stringify(v)],
    ['sin valor', () => undefined],
  ] as Array<[string, (v: string | null) => unknown]>) {
    it(`el aviso de tiempo real trae el valor como ${nombre}: el menú del móvil igualmente muestra el orden nuevo, y también tras cerrar y volver a abrir`, async () => {
      hoisted.shape.fn = forma
      await boot()
      const reordered = [...NAV_TAB_PATHS].reverse()
      const other = makeDevice(hoisted.server, USER, new FakeStorage())
      await other.engine.start()
      await settle()
      other.engine.set(NAV, JSON.stringify(reordered))
      await act(async () => {
        await other.clock.advance(1000)
        await vi.advanceTimersByTimeAsync(600)
      })
      const expected = reordered.slice(0, 4).map((to) => NAV_TAB_BY_PATH.get(to)?.label)
      expect(bottomLabels().slice(1)).toEqual(expected)
      expect(JSON.parse(localStorage.getItem(NAV) as string)).toEqual(reordered)
      // «Cerrar PEPA del todo y volver a abrirla»: se desmonta todo y se arranca de nuevo con lo guardado en el dispositivo.
      stop()
      cleanup()
      stop = startPrefsSync(USER)
      renderShell()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(bottomLabels().slice(1)).toEqual(expected)
    })
  }

  it('FALLO REAL (iPhone → ordenador): otra ventana del mismo navegador ya dejó el valor nuevo en el almacenamiento compartido; esta ventana igualmente repinta su menú', async () => {
    await boot()
    const before = bottomLabels()
    const reordered = [...NAV_TAB_PATHS].reverse()
    const other = makeDevice(hoisted.server, USER, new FakeStorage())
    await other.engine.start()
    await settle()
    // La otra ventana escribió el valor en el almacenamiento COMPARTIDO antes de que esta ventana descargara nada.
    localStorage.setItem(NAV, JSON.stringify(reordered))
    other.engine.set(NAV, JSON.stringify(reordered))
    await act(async () => {
      await other.clock.advance(1000)
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(bottomLabels().slice(1)).toEqual(reordered.slice(0, 4).map((to) => NAV_TAB_BY_PATH.get(to)?.label))
    expect(bottomLabels()).not.toEqual(before)
  })

  it('el aviso de almacenamiento de otra ventana repinta el menú y esta ventana (la que habla con el servidor) sube el cambio', async () => {
    await boot()
    const reordered = [...NAV_TAB_PATHS].reverse()
    localStorage.setItem(NAV, JSON.stringify(reordered)) // lo que haría la otra ventana
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: NAV, newValue: JSON.stringify(reordered), storageArea: localStorage }))
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(bottomLabels().slice(1)).toEqual(reordered.slice(0, 4).map((to) => NAV_TAB_BY_PATH.get(to)?.label))
    expect(hoisted.server.get(USER, NAV)?.value).toBe(JSON.stringify(reordered))
  })

  it('persona distinta: el orden de otra persona de la misma familia no cambia el de esta', async () => {
    await boot()
    const before = bottomLabels()
    hoisted.server.set('otra-persona', NAV, JSON.stringify([...NAV_TAB_PATHS].reverse()), 0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(bottomLabels()).toEqual(before)
    expect(localStorage.getItem(NAV)).toBeNull()
  })

  it('con el interruptor APAGADO (estado actual en producción) no se usa la sincronización nueva', async () => {
    setPrefsV2ForTests(false)
    stop = startPrefsSync(USER) // mecanismo anterior: ni tabla nueva ni canal
    expect(hoisted.channelStatus).toBeNull()
  })
})
