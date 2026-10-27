// @vitest-environment jsdom
// «Llévame» hasta el destino EXACTO (pestañas, temas, formularios) y no solo hasta la portada del módulo. Causa raíz del fallo observado en el iPhone: las pestañas de Cocina, Compras,
// Economía y Familia son estado interno, no rutas; navegar a /alimentacion solo abre su portada y la pestaña pedida se leía únicamente al montarse. Aquí: el mecanismo reutilizable
// (pantallas simuladas con vistas internas), el «Llévame» de la Ayuda de punta a punta y la auditoría de TODAS las fichas contra el código real de las pantallas.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/domain/types'

vi.mock('@/services/voice', () => ({ isSpeechSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: () => () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }) }) }))
vi.mock('@/data/communityStatusCache', () => ({ communityStatusCache: { peek: () => null, get: async () => null, prime: () => undefined, clear: () => undefined } }))

const dest = await import('@/help/destinations')
const { HelpDestMark } = await import('@/help/ui/HelpDest')
const { HelpProvider } = await import('@/help/ui/HelpProvider')
const { HelpPanel } = await import('@/help/ui/HelpPanel')
const { useHelp } = await import('@/help/ui/helpContext')
const { HELP_CARDS } = await import('@/help/catalog')
const { KNOWN_APP_ROUTES } = await import('@/help/routes')

afterEach(() => {
  cleanup()
  dest.clearDestination()
  dest.setDestinationTimeoutForTests(null)
})

const ADULT: Pick<Profile, 'role' | 'allowedSections'> = { role: 'adult', allowedSections: null }

// Pantalla de prueba con vistas internas que NO son rutas (como Cocina): se abre en 'Inicio'.
function KitchenStub() {
  const [tab, setTab] = useState<'Inicio' | 'Menú' | 'Recetas' | 'Cocinar'>('Inicio')
  const [menuOpen, setMenuOpen] = useState(true)
  dest.useCloseMenusOnHelp(() => setMenuOpen(false))
  dest.useHelpDestinations({
    'cocina.menu': () => setTab('Menú'),
    'cocina.recetas': () => setTab('Recetas'),
    'cocina.cocinar': () => setTab('Cocinar'),
  })
  return (
    <div>
      <p data-testid="tab">{tab}</p>
      <p data-testid="menu">{menuOpen ? 'abierto' : 'cerrado'}</p>
      {tab === 'Menú' && <HelpDestMark id="cocina.menu" />}
      {tab === 'Recetas' && <HelpDestMark id="cocina.recetas" />}
      {tab === 'Cocinar' && <HelpDestMark id="cocina.cocinar" />}
      <button type="button" onClick={() => setTab('Inicio')}>
        volver a inicio
      </button>
    </div>
  )
}

function AskCard({ id }: { id: string }) {
  const help = useHelp()
  return (
    <button type="button" onClick={() => help.openHelp({ cardId: id })}>
      abrir ficha
    </button>
  )
}

function renderApp(initial: string, extra: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <HelpProvider profile={ADULT}>
        <Routes>
          <Route path="/alimentacion" element={<KitchenStub />} />
          <Route path="/calendario" element={<p>calendario</p>} />
          <Route path="/" element={<p>inicio</p>} />
        </Routes>
        {extra}
        <HelpPanel />
      </HelpProvider>
    </MemoryRouter>,
  )
}

describe('mecanismo reutilizable de destinos', () => {
  it('una pantalla ya montada cambia de vista cuando se pide el destino, y la llegada se comprueba por la marca', async () => {
    function Screen() {
      return <KitchenStub />
    }
    render(<Screen />)
    expect(screen.getByTestId('tab').textContent).toBe('Inicio')
    const arrival = dest.waitForDestination('cocina.menu')
    act(() => void dest.requestDestination('cocina.menu'))
    await expect(arrival).resolves.toBe('reached')
    expect(screen.getByTestId('tab').textContent).toBe('Menú')
  })

  it('una pantalla que aún NO estaba montada (carga perezosa) recoge el destino pendiente al montarse', async () => {
    act(() => void dest.requestDestination('cocina.recetas'))
    render(<KitchenStub />)
    expect(screen.getByTestId('tab').textContent).toBe('Recetas')
    await expect(dest.waitForDestination('cocina.recetas')).resolves.toBe('reached')
  })

  it('espera observando el DOM, no con una pausa fija: se resuelve en cuanto aparece la marca', async () => {
    const t0 = Date.now()
    const p = dest.waitForDestination('x.y', 5000)
    setTimeout(() => {
      const m = document.createElement('span')
      m.setAttribute('data-help-dest', 'x.y')
      document.body.appendChild(m)
    }, 20)
    await expect(p).resolves.toBe('reached')
    expect(Date.now() - t0).toBeLessThan(1000)
    document.querySelector('[data-help-dest="x.y"]')?.remove()
  })

  it('si el destino nunca llega (sin acceso, no existe) termina en "timeout" en vez de esperar para siempre ni fingir', async () => {
    await expect(dest.waitForDestination('no.existe', 60)).resolves.toBe('timeout')
  })

  it('una marca oculta (hidden) no cuenta como llegada', async () => {
    const wrap = document.createElement('div')
    wrap.hidden = true
    wrap.innerHTML = '<span data-help-dest="oculto"></span>'
    document.body.appendChild(wrap)
    await expect(dest.waitForDestination('oculto', 40)).resolves.toBe('timeout')
    wrap.remove()
  })

  it('un destino sin gestor en la pantalla actual se ignora (no rompe nada)', () => {
    render(<KitchenStub />)
    act(() => void dest.requestDestination('otra.cosa'))
    expect(screen.getByTestId('tab').textContent).toBe('Inicio')
  })

  it('cerrar menús abiertos llega a quien los escucha', () => {
    render(<KitchenStub />)
    expect(screen.getByTestId('menu').textContent).toBe('abierto')
    act(() => dest.closeOpenMenus())
    expect(screen.getByTestId('menu').textContent).toBe('cerrado')
  })
})

describe('«Llévame» de la Ayuda hasta el destino exacto', () => {
  it('Menú semanal: desde otra pantalla abre Cocina Y la pestaña Menú (no se queda en la portada de La cocina de Pepa)', async () => {
    renderApp('/calendario', <AskCard id="coc-menu-semanal" />)
    fireEvent.click(screen.getByText('abrir ficha'))
    fireEvent.click(await screen.findByRole('button', { name: 'Llévame' }))
    await waitFor(() => expect(screen.getByTestId('tab').textContent).toBe('Menú'))
    expect(screen.queryByRole('complementary')).toBeNull() // la Ayuda se minimiza
  })

  it('estando YA en la pantalla del módulo (portada), también cambia a la pestaña pedida', async () => {
    renderApp('/alimentacion', <AskCard id="coc-receta" />)
    expect(screen.getByTestId('tab').textContent).toBe('Inicio')
    fireEvent.click(screen.getByText('abrir ficha'))
    fireEvent.click(await screen.findByRole('button', { name: 'Llévame' }))
    await waitFor(() => expect(screen.getByTestId('tab').textContent).toBe('Recetas'))
  })

  it('cierra los menús abiertos al llevar a otra parte', async () => {
    renderApp('/alimentacion', <AskCard id="coc-que-cocino-hoy" />)
    expect(screen.getByTestId('menu').textContent).toBe('abierto')
    fireEvent.click(screen.getByText('abrir ficha'))
    fireEvent.click(await screen.findByRole('button', { name: 'Llévame' }))
    await waitFor(() => expect(screen.getByTestId('tab').textContent).toBe('Cocinar'))
    expect(screen.getByTestId('menu').textContent).toBe('cerrado')
  })

  it('si el destino no se alcanza lo dice con claridad (no simula haber llegado) y reabre la Ayuda', async () => {
    dest.setDestinationTimeoutForTests(80)
    renderApp('/calendario', <AskCard id="coc-menu-semanal" />) // aquí /alimentacion existe, pero probamos un destino sin gestor:
    fireEvent.click(screen.getByText('abrir ficha'))
    // Se sustituye la ficha por una cuyo destino no tiene gestor en la pantalla de prueba:
    const card = HELP_CARDS.find((c) => c.id === 'coc-menu-semanal')!
    const original = card.go!.dest
    card.go!.dest = 'cocina.no-existe'
    fireEvent.click(await screen.findByRole('button', { name: 'Llévame' }))
    expect(await screen.findByText(/No he podido llegar a «Planificar el menú de la semana»/)).toBeTruthy()
    expect(screen.getByRole('complementary')).toBeTruthy() // la Ayuda vuelve a abrirse con la explicación
    card.go!.dest = original
  })

  it('una ficha sin destino interno sigue llevando a la pantalla del módulo', async () => {
    renderApp('/alimentacion', <AskCard id="ini-que-veo" />)
    fireEvent.click(screen.getByText('abrir ficha'))
    fireEvent.click(await screen.findByRole('button', { name: 'Llévame' }))
    await waitFor(() => expect(screen.getByText('inicio')).toBeTruthy())
  })
})

// ---- Auditoría de TODAS las fichas contra el código real
const SOURCES = import.meta.glob(['/src/ui/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const CORPUS = Object.values(SOURCES).join('\n')

describe('auditoría de «Llévame»: cada destino de cada ficha existe en el código', () => {
  const withDest = HELP_CARDS.filter((c) => c.go?.dest)

  it('hay destinos internos para las pestañas de Cocina, Compras, Economía y Familia, los temas de Configuración y los formularios de Calendario', () => {
    const all = new Set(withDest.map((c) => c.go!.dest))
    for (const d of ['cocina.menu', 'cocina.recetas', 'cocina.cocinar', 'compras.lista', 'compras.tickets', 'compras.historial', 'economia.movimientos', 'familia.anadir-miembro', 'calendario.nuevo-evento', 'calendario.nueva-tarea', 'config.seguridad', 'config.pepa'])
      expect(all, d).toContain(d)
  })

  for (const c of withDest) {
    it(`${c.id} → ${c.go!.dest}: lo atiende alguna pantalla y la pantalla pinta su marca de llegada`, () => {
      const d = c.go!.dest!
      expect(KNOWN_APP_ROUTES, `${c.id}: ruta ${c.go!.path}`).toContain(c.go!.path)
      const [family, name] = d.split('.')
      // Gestor: clave literal en un useHelpDestinations, o (Configuración) generado para todos los temas.
      const handled = CORPUS.includes(`'${d}':`) || (family === 'config' && CORPUS.includes('SETTINGS_GROUP_IDS.map') && CORPUS.includes(`'${name}'`)) || CORPUS.includes(`'${d}'`)
      expect(handled, `${c.id}: nadie atiende el destino ${d}`).toBe(true)
      // Marca de llegada: literal (id="…" / data-help-dest="…") o, en Configuración, la marca por tema abierto.
      const marked = CORPUS.includes(`id="${d}"`) || CORPUS.includes(`data-help-dest="${d}"`) || (family === 'config' && CORPUS.includes('id={`config.${openGroup}`}'))
      expect(marked, `${c.id}: ninguna pantalla pinta la marca ${d}`).toBe(true)
    })
  }

  it('los destinos de una misma ficha están en la pantalla (ruta) de la ficha', () => {
    const prefixToPath: Record<string, string> = {
      cocina: '/alimentacion',
      compras: '/compras',
      economia: '/dinero',
      familia: '/familia',
      calendario: '/calendario',
      config: '/menu-organizar',
      admin: '/administracion',
    }
    for (const c of withDest) expect(prefixToPath[c.go!.dest!.split('.')[0]], c.id).toBe(c.go!.path)
  })
})
