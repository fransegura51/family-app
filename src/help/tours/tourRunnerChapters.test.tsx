// @vitest-environment jsdom
// Corredor de capítulos: espera a que carguen los datos antes de evaluar, datos que faltan (`needs` → solo leyendo), el control que desaparece al pulsarlo, «píldora» con selectores del
// sistema, volver al principio y navegación entre capítulos con parada explícita (nunca se encadenan solos).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/voice', () => ({
  isSpeechSupported: () => true,
  primeSpeech: () => undefined,
  speakAsync: () => new Promise<void>(() => undefined),
  stopSpeech: () => undefined,
}))

const { TourRunner } = await import('@/help/tours/TourRunner')
const { setTargetVisibilityForTests } = await import('@/help/tours/domTargets')
const { SERIES, chaptersOf } = await import('@/help/tours/series')
import type { TourDef } from '@/help/tours/types'

const base: Omit<TourDef, 'id' | 'steps'> = { version: 1, title: 'Capítulo de prueba', cardId: 'ficha', durationSec: 60, startPath: '/p', finishText: 'Capítulo terminado.' }
const panel = (title = 'Capítulo de prueba') => screen.getByRole('dialog', { name: new RegExp(`Tutorial: ${title}`) })

function Screen({ loadAfterMs = 0, hideOnClick = false }: { loadAfterMs?: number; hideOnClick?: boolean }) {
  const [loaded, setLoaded] = useState(loadAfterMs === 0)
  const [hidden, setHidden] = useState(false)
  const [picked, setPicked] = useState(false)
  if (!loaded && loadAfterMs > 0) window.setTimeout(() => setLoaded(true), loadAfterMs)
  return (
    <div id="root">
      {!loaded && <p>Cargando…</p>}
      {loaded && <ul data-help-id="test.lista"><li>Pan</li></ul>}
      {loaded && !hidden && (
        <button type="button" data-help-id="test.boton" onClick={() => hideOnClick && setHidden(true)}>
          Botón
        </button>
      )}
      <button type="button" data-help-id="test.foto" onClick={() => setPicked(false)}>
        Subir foto
      </button>
      <input type="file" aria-label="archivo" data-help-id="test.archivo" onChange={() => setPicked(true)} />
      {picked && <p>Elegida</p>}
    </div>
  )
}

function setup(tour: TourDef, screenProps: Parameters<typeof Screen>[0] = {}, over: Partial<Parameters<typeof TourRunner>[0]> = {}) {
  const onClose = vi.fn()
  const onPick = vi.fn()
  render(
    <MemoryRouter initialEntries={['/p']}>
      <Routes>
        <Route path="/p" element={<Screen {...screenProps} />} />
      </Routes>
      <TourRunner tour={tour} voiceMode="text" nextOptions={[]} onClose={onClose} onPick={onPick} missingAfterMs={250} readyMaxMs={4000} {...over} />
    </MemoryRouter>,
  )
  return { onClose, onPick }
}

beforeEach(() => {
  setTargetVisibilityForTests(() => true)
  localStorage.clear()
})
afterEach(() => {
  setTargetVisibilityForTests(null)
  cleanup()
})

describe('datos listos antes del primer paso', () => {
  it('mientras la pantalla pone «Cargando…» no da el control por ausente ni salta pasos; al cargar, empieza en el paso 1', async () => {
    const t: TourDef = {
      ...base,
      id: 'cap-carga',
      readyOn: ['test.lista'],
      steps: [
        { id: 'a', text: 'Mira la lista.', target: 'test.lista', completeOn: [], manualNext: true },
        { id: 'b', text: 'Pulsa el botón.', target: 'test.boton', completeOn: [{ type: 'click', target: 'test.boton' }] },
      ],
    }
    setup(t, { loadAfterMs: 700 })
    // Pasa de sobra el tiempo de espera de un control ausente (250 ms): sigue sin romperse.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500))
    })
    expect(within(panel()).queryByText(/no veo en tu pantalla/)).toBeNull()
    expect(within(panel()).queryByText('Mira la lista.')).toBeNull()
    await waitFor(() => expect(within(panel()).getByText('Mira la lista.')).toBeTruthy())
    expect(within(panel()).getByText('Paso 1 de 2')).toBeTruthy()
  })
})

describe('datos que faltan (needs)', () => {
  const t: TourDef = {
    ...base,
    id: 'cap-needs',
    needs: [{ target: 'test.no-hay', message: 'Para este capítulo necesitas un producto en la lista.' }],
    steps: [
      { id: 'a', text: 'Mira el botón.', target: 'test.boton', completeOn: [{ type: 'click', target: 'test.boton' }] },
      { id: 'b', text: 'Fin del recorrido.', completeOn: [], manualNext: true },
    ],
  }

  it('lo explica y ofrece verlo solo leyendo (sin hacer ni guardar nada)', async () => {
    setup(t)
    await waitFor(() => expect(within(panel()).getByText(/necesitas un producto en la lista/)).toBeTruthy())
    fireEvent.click(within(panel()).getByRole('button', { name: 'Verlo solo leyendo' }))
    await waitFor(() => expect(within(panel()).getByText('Mira el botón.')).toBeTruthy())
    expect(within(panel()).getByText(/Solo leyendo/)).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ })) // se puede pasar aunque el paso espere una acción
    await waitFor(() => expect(within(panel()).getByText('Fin del recorrido.')).toBeTruthy())
  })

  it('«Salir» cierra sin tocar nada', async () => {
    const { onClose } = setup(t)
    await waitFor(() => expect(within(panel()).getByText(/necesitas un producto/)).toBeTruthy())
    fireEvent.click(within(panel()).getByRole('button', { name: '✕ Salir' }))
    expect(onClose).toHaveBeenCalledWith('exited')
  })
})

describe('controles que desaparecen y tarjetas que se apartan', () => {
  it('si el control desaparece justo al pulsarlo no se da el paso por roto (se espera el aviso de la aplicación)', async () => {
    const t: TourDef = {
      ...base,
      id: 'cap-click',
      steps: [{ id: 'a', text: 'Pulsa el botón.', target: 'test.boton', completeOn: [{ type: 'event', name: 'test.hecho' }] }],
    }
    setup(t, { hideOnClick: true })
    await waitFor(() => expect(within(panel()).getByText('Pulsa el botón.')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Botón' }))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700))
    })
    expect(within(panel()).queryByText(/no veo en tu pantalla/)).toBeNull()
    expect(within(panel()).getByText('Pulsa el botón.')).toBeTruthy()
  })

  it('un control que abre un selector del sistema recoge la tarjeta en una píldora y vuelve al elegir', async () => {
    const t: TourDef = {
      ...base,
      id: 'cap-nativo',
      steps: [
        { id: 'a', text: 'Elige el archivo.', target: 'test.archivo', native: true, skipLabel: 'Continuar sin archivo', completeOn: [{ type: 'change', target: 'test.archivo' }] },
        { id: 'b', text: 'Ya está.', completeOn: [], manualNext: true },
      ],
    }
    setup(t)
    await waitFor(() => expect(within(panel()).getByText('Elige el archivo.')).toBeTruthy())
    expect(within(panel()).getByRole('button', { name: 'Continuar sin archivo' })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('archivo'))
    await waitFor(() => expect(panel().getAttribute('data-tour-mode')).toBe('pill'))
    fireEvent.change(screen.getByLabelText('archivo'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    await waitFor(() => expect(within(panel()).getByText('Ya está.')).toBeTruthy())
    expect(panel().getAttribute('data-tour-mode')).not.toBe('pill')
  })

  it('«↕ Mover» cambia la tarjeta de lado', async () => {
    const t: TourDef = { ...base, id: 'cap-mover', steps: [{ id: 'a', text: 'Mira.', target: 'test.lista', completeOn: [], manualNext: true }] }
    setup(t)
    await waitFor(() => expect(within(panel()).getByText('Mira.')).toBeTruthy())
    const before = panel().className.includes('tour-panel-top')
    fireEvent.click(within(panel()).getByRole('button', { name: /Mover la tarjeta/ }))
    await waitFor(() => expect(panel().className.includes('tour-panel-top')).toBe(!before))
  })
})

describe('volver al principio', () => {
  it('si no hay paso anterior mostrado, «Volver al principio» devuelve al primero aunque ya estuviera cumplido', async () => {
    const t: TourDef = {
      ...base,
      id: 'cap-inicio',
      steps: [
        { id: 'a', text: 'Mira la lista.', target: 'test.lista', completeOn: [{ type: 'appear', target: 'test.lista' }], skipIf: [{ type: 'appear', target: 'test.lista' }] },
        { id: 'b', text: 'Pulsa el botón.', target: 'test.boton', completeOn: [{ type: 'click', target: 'test.boton' }] },
      ],
    }
    setup(t)
    await waitFor(() => expect(within(panel()).getByText('Pulsa el botón.')).toBeTruthy()) // el paso 1 ya estaba cumplido
    fireEvent.click(within(panel()).getByRole('button', { name: /Volver al principio/ }))
    await waitFor(() => expect(within(panel()).getByText('Mira la lista.')).toBeTruthy())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500))
    })
    expect(within(panel()).getByText('Mira la lista.')).toBeTruthy() // no se vuelve a omitir
  })
})

describe('capítulos de una serie', () => {
  const series = SERIES.find((s) => chaptersOf(s).length >= 3) ?? SERIES.find((s) => chaptersOf(s).length >= 2)
  const chapters = series ? chaptersOf(series) : []
  const mid = chapters.length >= 3 ? 1 : 0

  // Se usa el capítulo REAL (para la posición en su serie) con un único paso informativo: lo que se prueba es la navegación, no los pasos.
  const asInfo = (c: TourDef): TourDef => ({ ...c, finishText: 'Capítulo terminado.', startDest: undefined, startPath: '/p', paths: ['/p'], readyOn: undefined, needs: undefined, steps: [{ id: 'info', text: 'Paso informativo.', completeOn: [], manualNext: true }] })

  it.skipIf(chapters.length < 2)('el primer paso de un capítulo con anterior ofrece «Capítulo anterior» y, al terminar, «Siguiente capítulo» con parada: no encadena solo', async () => {
    const c = chapters[mid]
    const { onClose, onPick } = setup(asInfo(c))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Paso informativo.')).toBeTruthy())
    expect(within(screen.getByRole('dialog')).getByText(new RegExp(`Capítulo ${mid + 1} de ${chapters.length}`))).toBeTruthy()
    if (mid > 0) expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Capítulo anterior/ })).toBeTruthy()
    else expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Capítulo anterior/ })).toBeNull()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Siguiente →/ }))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Capítulo terminado.')).toBeTruthy())
    // Parada: no se ha empezado ningún otro capítulo ni cerrado nada por su cuenta.
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    const next = chapters[mid + 1]
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: new RegExp(`Siguiente capítulo: ${next.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }))
    expect(onPick).toHaveBeenCalledWith({ kind: 'tour', id: next.id, label: next.title })
    expect(onClose).toHaveBeenCalledWith('completed')
  })

  it.skipIf(chapters.length < 2)('el último capítulo no ofrece «Siguiente capítulo», solo cerrar', async () => {
    const c = chapters[chapters.length - 1]
    setup(asInfo(c))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Paso informativo.')).toBeTruthy())
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Siguiente →/ }))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Capítulo terminado.')).toBeTruthy())
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Siguiente capítulo/ })).toBeNull()
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' })).toBeTruthy()
  })
})
