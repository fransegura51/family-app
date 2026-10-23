// @vitest-environment jsdom
// Corredor de tutoriales «Enséñame» sobre una pantalla de prueba con controles marcados (data-help-id): resalta el control real, espera la acción REAL de la persona, avanza solo
// cuando se comprueba, permite atrás/pausa/reinicio/salida, nunca pulsa ni escribe por la persona y no la deja bloqueada si el control falta. Servicios simulados (voz).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const speech = vi.hoisted(() => ({ spoken: [] as string[], stopped: 0 }))
vi.mock('@/services/voice', () => ({
  isSpeechSupported: () => true,
  primeSpeech: () => undefined,
  speakAsync: (t: string) => {
    speech.spoken.push(t)
    return new Promise<void>(() => undefined)
  },
  stopSpeech: () => {
    speech.stopped++
  },
}))

const { TourRunner } = await import('@/help/tours/TourRunner')
const { emitHelpEvent } = await import('@/help/tours/helpBus')
const { setTargetVisibilityForTests } = await import('@/help/tours/domTargets')
const { getTourProgress } = await import('@/help/prefs')
import type { TourDef } from '@/help/tours/types'

const TOUR: TourDef = {
  id: 'prueba',
  version: 3,
  title: 'Tutorial de prueba',
  cardId: 'ficha-prueba',
  durationSec: 30,
  startPath: '/pantalla',
  steps: [
    { id: 'abrir', text: 'Pulsa abrir.', target: 'test.open', completeOn: [{ type: 'click', target: 'test.open' }, { type: 'appear', target: 'test.field' }], skipIf: [{ type: 'appear', target: 'test.field' }] },
    { id: 'escribir', text: 'Escribe el nombre.', target: 'test.field', completeOn: [{ type: 'filled', target: 'test.field', min: 2 }] },
    { id: 'mirar', text: 'Mira esto y sigue.', target: 'test.field', completeOn: [], manualNext: true },
    { id: 'extra', text: 'Paso opcional.', target: 'test.extra', completeOn: [], manualNext: true, optional: true },
    { id: 'guardar', text: 'Pulsa guardar.', target: 'test.save', completeOn: [{ type: 'event', name: 'shopping.product-added' }], sensitive: true },
  ],
  finishText: 'Hecho, enhorabuena.',
  next: ['otra'],
}

const calls = { open: 0, save: 0 }
function Screen({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const [value, setValue] = useState('')
  const [showExtra, setShowExtra] = useState(false)
  return (
    <div id="root">
      <h1>Pantalla</h1>
      <button type="button" data-help-id="test.open" onClick={() => { calls.open++; setOpen(true) }}>Abrir</button>
      {open && (
        <form onSubmit={(e) => e.preventDefault()}>
          <input data-help-id="test.field" aria-label="nombre" value={value} onChange={(e) => setValue(e.target.value)} />
          <button type="button" onClick={() => setShowExtra(true)}>Mostrar extra</button>
          {showExtra && <span data-help-id="test.extra">extra</span>}
          <button type="button" data-help-id="test.save" onClick={() => { calls.save++ }}>Guardar</button>
        </form>
      )}
      <Link to="/otra">Ir a otra pantalla</Link>
    </div>
  )
}
function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function setup(over: Partial<Parameters<typeof TourRunner>[0]> = {}, props: { startOpen?: boolean; tour?: TourDef } = {}) {
  const onClose = vi.fn()
  const onPick = vi.fn()
  const utils = render(
    <MemoryRouter initialEntries={['/pantalla']}>
      <Routes>
        <Route path="/pantalla" element={<Screen startOpen={props.startOpen} />} />
        <Route path="/otra" element={<div><p>otra</p><Link to="/pantalla">volver</Link></div>} />
      </Routes>
      <Where />
      <TourRunner tour={props.tour ?? TOUR} voiceMode="text" nextOptions={[{ kind: 'card', id: 'otra', label: 'Otra cosa' }]} onClose={onClose} onPick={onPick} missingAfterMs={250} {...over} />
    </MemoryRouter>,
  )
  return { onClose, onPick, ...utils }
}
const panel = () => screen.getByRole('dialog', { name: /Tutorial: Tutorial de prueba/ })
const stepText = (t: RegExp | string) => waitFor(() => expect(within(panel()).getByText(t)).toBeTruthy())

beforeEach(() => {
  setTargetVisibilityForTests(() => true) // jsdom no calcula posiciones
  calls.open = 0
  calls.save = 0
  speech.spoken.length = 0
  speech.stopped = 0
  localStorage.clear()
})
afterEach(() => {
  setTargetVisibilityForTests(null)
  cleanup()
})

describe('resalta el control real y espera la acción REAL de la persona', () => {
  it('muestra el paso con su contador, resalta el control y NO intercepta toques ni es modal', async () => {
    setup()
    await stepText('Pulsa abrir.')
    expect(within(panel()).getByText('Paso 1 de 5')).toBeTruthy()
    expect(panel().getAttribute('aria-modal')).toBe('false')
    await waitFor(() => expect(document.querySelector('.tour-ring')).toBeTruthy())
    const ring = document.querySelector('.tour-ring') as HTMLElement
    expect(ring.getAttribute('aria-hidden')).toBe('true')
    // Fuera del #root de la app (portal) para no verse afectado por diálogos que lo marquen como inerte.
    expect(document.getElementById('root')!.contains(panel())).toBe(false)
  })

  it('avanza cuando la persona pulsa DE VERDAD el botón real (y ese botón hace lo suyo)', async () => {
    setup()
    await stepText('Pulsa abrir.')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(calls.open).toBe(1)
    await stepText('Escribe el nombre.')
  })

  it('avanza cuando la persona escribe lo suficiente en el campo real; con menos caracteres no', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }))
    await stepText('Escribe el nombre.')
    fireEvent.change(screen.getByLabelText('nombre'), { target: { value: 'A' } })
    await act(async () => {})
    expect(within(panel()).getByText('Escribe el nombre.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('nombre'), { target: { value: 'Ana' } })
    await stepText('Mira esto y sigue.')
  })

  it('NUNCA pulsa ni escribe por la persona: recorrido entero sin que se dispare ningún botón ni cambie ningún campo', async () => {
    setup(undefined, { startOpen: true })
    await stepText('Escribe el nombre.') // el primer paso se omitió: el formulario ya estaba abierto
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900))
    })
    expect(calls.open).toBe(0)
    expect(calls.save).toBe(0)
    expect((screen.getByLabelText('nombre') as HTMLInputElement).value).toBe('')
    expect(within(panel()).getByText('Escribe el nombre.')).toBeTruthy() // sigue esperando
  })

  it('un paso ya cumplido al llegar (el formulario ya está abierto) se omite solo', async () => {
    setup(undefined, { startOpen: true })
    await stepText('Escribe el nombre.')
    expect(within(panel()).getByText('Paso 2 de 5')).toBeTruthy()
  })

  it('un campo ya relleno al llegar cuenta como hecho', async () => {
    setup(undefined, { startOpen: true })
    await stepText('Escribe el nombre.')
    fireEvent.change(screen.getByLabelText('nombre'), { target: { value: 'Ana' } })
    await stepText('Mira esto y sigue.')
  })
})

describe('pasos informativos, opcionales y sensibles', () => {
  async function toInfo() {
    const r = setup(undefined, { startOpen: true })
    await stepText('Escribe el nombre.')
    fireEvent.change(screen.getByLabelText('nombre'), { target: { value: 'Ana' } })
    await stepText('Mira esto y sigue.')
    return r
  }

  it('«Siguiente» solo en pasos informativos u opcionales', async () => {
    await toInfo()
    expect(within(panel()).getByRole('button', { name: /Siguiente/ })).toBeTruthy()
  })

  it('un paso opcional sin control se omite solo y el tutorial sigue (sin dejar a nadie bloqueado)', async () => {
    await toInfo()
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ })) // → paso opcional (control inexistente)
    await stepText('Pulsa guardar.') // se omitió «extra»
    expect(within(panel()).getByText('Paso 5 de 5')).toBeTruthy()
  })

  it('SEGURIDAD: en el paso de guardar, pulsar el botón NO completa el tutorial; solo lo hace el aviso de que la aplicación guardó; y no hay «Siguiente»', async () => {
    const { onClose } = await toInfo()
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await stepText('Pulsa guardar.')
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull()
    expect(within(panel()).getByText(/Esta acción la haces tú/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' })) // la persona pulsa (su botón real hace lo suyo)
    expect(calls.save).toBe(1)
    await act(async () => {})
    expect(within(panel()).getByText('Pulsa guardar.')).toBeTruthy() // un clic no basta
    expect(onClose).not.toHaveBeenCalled()
    act(() => emitHelpEvent('shopping.product-added')) // la aplicación confirma el guardado
    await stepText('Hecho, enhorabuena.')
  })

  it('al terminar: mensaje final, sugerencias de qué conocer ahora (que se pueden elegir), repetir y cerrar', async () => {
    const { onClose, onPick } = await toInfo()
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await stepText('Pulsa guardar.')
    act(() => emitHelpEvent('shopping.product-added'))
    await stepText('Hecho, enhorabuena.')
    expect(within(panel()).getByText('¿Qué otra cosa quieres conocer?')).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: /Otra cosa/ }))
    expect(onPick).toHaveBeenCalledWith({ kind: 'card', id: 'otra', label: 'Otra cosa' })
    expect(onClose).toHaveBeenCalledWith('completed')
  })
})

describe('atrás, pausa, reinicio y salida', () => {
  it('Atrás vuelve al paso anterior', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }))
    await stepText('Escribe el nombre.')
    fireEvent.click(within(panel()).getByRole('button', { name: /Atrás/ }))
    await stepText('Pulsa abrir.')
  })

  it('Pausar muestra «Tutorial en pausa» y no avanza aunque la persona actúe; al seguir, reconoce lo que ya hizo mientras tanto', async () => {
    setup()
    await stepText('Pulsa abrir.')
    fireEvent.click(within(panel()).getByRole('button', { name: /Pausar/ }))
    expect(within(panel()).getByText('Tutorial en pausa.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' })) // la persona abre el formulario durante la pausa
    await act(async () => {})
    expect(within(panel()).getByText('Tutorial en pausa.')).toBeTruthy() // en pausa no se avanza
    fireEvent.click(within(panel()).getByRole('button', { name: /Seguir/ }))
    await stepText('Escribe el nombre.') // lo ya hecho se reconoce y se sigue
  })

  it('Pausar y seguir sin haber hecho nada vuelve al mismo paso', async () => {
    setup()
    await stepText('Pulsa abrir.')
    fireEvent.click(within(panel()).getByRole('button', { name: /Pausar/ }))
    fireEvent.click(within(panel()).getByRole('button', { name: /Seguir/ }))
    await stepText('Pulsa abrir.')
  })

  it('Reiniciar vuelve al primer paso', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }))
    await stepText('Escribe el nombre.')
    fireEvent.click(within(panel()).getByRole('button', { name: /Reiniciar/ }))
    await stepText('Escribe el nombre.') // el formulario sigue abierto: el primer paso se omite de nuevo
    expect(within(panel()).getByText('Paso 2 de 5')).toBeTruthy()
  })

  it('Salir cierra el tutorial, lo avisa y no deja ninguna capa en pantalla', async () => {
    const { onClose } = setup()
    await stepText('Pulsa abrir.')
    fireEvent.click(within(panel()).getByRole('button', { name: /Salir/ }))
    expect(onClose).toHaveBeenCalledWith('exited')
    expect(document.querySelector('[data-tour-layer]')).toBeNull()
    expect(document.querySelector('.tour-ring')).toBeNull()
    // Y la pantalla real sigue funcionando.
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(calls.open).toBe(1)
  })
})

describe('si la pantalla cambia o el control no existe: salida comprensible, sin bloqueos', () => {
  it('control necesario inexistente → mensaje claro con «Empezar de nuevo», «Ver los pasos escritos» y «Salir»', async () => {
    const t: TourDef = { ...TOUR, steps: [{ id: 'x', text: 'Pulsa el botón fantasma.', target: 'test.no-existe', completeOn: [{ type: 'click', target: 'test.no-existe' }] }] }
    const { onPick, onClose } = setup(undefined, { tour: t })
    await waitFor(() => expect(within(panel()).getByText(/No encuentro este control/)).toBeTruthy())
    fireEvent.click(within(panel()).getByRole('button', { name: /Ver los pasos escritos/ }))
    expect(onPick).toHaveBeenCalledWith({ kind: 'card', id: 'ficha-prueba', label: 'Tutorial de prueba' })
    fireEvent.click(within(panel()).getByRole('button', { name: /Salir/ }))
    expect(onClose).toHaveBeenCalledWith('exited')
  })

  it('si el control aparece después (se terminaba de cargar), el tutorial se recupera solo', async () => {
    const t: TourDef = { ...TOUR, steps: [{ id: 'x', text: 'Pulsa abrir.', target: 'test.field', completeOn: [{ type: 'click', target: 'test.field' }] }] }
    setup(undefined, { tour: t })
    await waitFor(() => expect(within(panel()).getByText(/No encuentro este control/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' })) // aparece el campo
    await waitFor(() => expect(within(panel()).getByText('Pulsa abrir.')).toBeTruthy())
  })

  it('si la persona se va a otra pantalla, el tutorial se pausa sin bloquear y «Seguir» la devuelve a la suya', async () => {
    setup()
    await stepText('Pulsa abrir.')
    fireEvent.click(screen.getByRole('link', { name: 'Ir a otra pantalla' }))
    await waitFor(() => expect(within(panel()).getByText(/Has salido de la pantalla del tutorial/)).toBeTruthy())
    expect(screen.getByTestId('where').textContent).toBe('/otra') // la app sigue siendo suya: no se la fuerza
    fireEvent.click(within(panel()).getByRole('button', { name: /Seguir/ }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/pantalla'))
    await stepText('Pulsa abrir.')
  })

  it('si la persona vuelve por su cuenta a la pantalla, se reanuda sola', async () => {
    setup()
    await stepText('Pulsa abrir.')
    fireEvent.click(screen.getByRole('link', { name: 'Ir a otra pantalla' }))
    await waitFor(() => expect(within(panel()).getByText(/Has salido de la pantalla/)).toBeTruthy())
    fireEvent.click(screen.getByRole('link', { name: 'volver' }))
    await stepText('Pulsa abrir.')
  })

  it('al empezar desde otra pantalla, lleva a la pantalla del tutorial', async () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter initialEntries={['/otra']}>
        <Routes>
          <Route path="/pantalla" element={<Screen />} />
          <Route path="/otra" element={<p>otra</p>} />
        </Routes>
        <Where />
        <TourRunner tour={TOUR} voiceMode="text" nextOptions={[]} onClose={onClose} onPick={() => undefined} missingAfterMs={250} />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/pantalla'))
    await stepText('Pulsa abrir.')
  })
})

describe('progreso y voz', () => {
  it('guarda el estado (empezado → completado / descartado) con la versión, sin guardar nada de lo escrito', async () => {
    const { unmount } = setup(undefined, { startOpen: true })
    await stepText('Escribe el nombre.')
    expect(getTourProgress('prueba')).toMatchObject({ status: 'started', version: 3 })
    fireEvent.change(screen.getByLabelText('nombre'), { target: { value: 'Ana Privada' } })
    await stepText('Mira esto y sigue.')
    expect(JSON.stringify({ ...localStorage })).not.toContain('Privada')
    fireEvent.click(within(panel()).getByRole('button', { name: /Salir/ }))
    expect(getTourProgress('prueba')?.status).toBe('dismissed')
    unmount()
  })

  it('completarlo lo marca como completado', async () => {
    setup(undefined, { startOpen: true })
    await stepText('Escribe el nombre.')
    fireEvent.change(screen.getByLabelText('nombre'), { target: { value: 'Ana' } })
    await stepText('Mira esto y sigue.')
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await stepText('Pulsa guardar.')
    act(() => emitHelpEvent('shopping.product-added'))
    await stepText('Hecho, enhorabuena.')
    expect(getTourProgress('prueba')?.status).toBe('completed')
  })

  it('«Hablando»: cada paso se lee en voz alta con el MISMO texto que se ve', async () => {
    setup({ voiceMode: 'voice' })
    await stepText('Pulsa abrir.')
    await waitFor(() => expect(speech.spoken).toEqual(['Pulsa abrir.']))
  })

  it('«Por escrito»: no se lee nada solo, pero «Escuchar» lo lee y «Detener» lo corta', async () => {
    setup({ voiceMode: 'text' })
    await stepText('Pulsa abrir.')
    expect(speech.spoken).toEqual([])
    fireEvent.click(within(panel()).getByRole('button', { name: /Escuchar este paso/ }))
    await waitFor(() => expect(speech.spoken).toEqual(['Pulsa abrir.']))
    const before = speech.stopped
    fireEvent.click(within(panel()).getByRole('button', { name: /Detener la voz/ }))
    expect(speech.stopped).toBeGreaterThan(before)
  })
})

describe('móvil y escritorio', () => {
  it('el panel va ARRIBA si el control está en la mitad de abajo y abajo si está arriba (para no taparlo)', async () => {
    const rectOf = (top: number) => ({ top, left: 10, width: 100, height: 40, right: 110, bottom: top + 40, x: 10, y: top, toJSON: () => ({}) }) as DOMRect
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    spy.mockImplementation(() => rectOf(window.innerHeight - 100)) // abajo
    setup()
    await waitFor(() => expect(panel().className).toContain('tour-panel-top'))
    cleanup()
    spy.mockImplementation(() => rectOf(60)) // arriba
    setup()
    await waitFor(() => expect(panel().className).toContain('tour-panel-bottom'))
    spy.mockRestore()
  })

  it('el CSS respeta zonas seguras, movimiento reducido y no bloquea toques', () => {
    const css = readFileSync('src/help/tours/tours.css', 'utf8')
    expect(css).toContain('env(safe-area-inset-bottom')
    expect(css).toContain('env(safe-area-inset-top')
    expect(css).toContain('prefers-reduced-motion')
    expect(css).toMatch(/\.tour-layer \{[^}]*pointer-events: none/s)
    expect(css).toMatch(/\.tour-ring \{[^}]*pointer-events: none/s)
    expect(css).toMatch(/@media \(min-width: 720px\)/)
  })
})
