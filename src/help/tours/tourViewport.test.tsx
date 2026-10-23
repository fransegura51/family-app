// @vitest-environment jsdom
// B4-UX01: el marco y la tarjeta del tutorial frente al teclado del iPhone. En iOS el teclado reduce el viewport VISUAL (visualViewport) pero no el de diseño (innerHeight): lo que va
// «fixed» abajo queda detrás del teclado y un marco medido una sola vez queda desalineado. Estas pruebas simulan visualViewport (apertura/cierre del teclado, desplazamiento del viewport
// visual, cambios de foco y desplazamientos) sobre el motor general. NO sustituyen la prueba en un iPhone real.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('@/services/voice', () => ({ isSpeechSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))

const { TourRunner } = await import('@/help/tours/TourRunner')
const { setTargetVisibilityForTests } = await import('@/help/tours/domTargets')
const { choosePanelSide, freeZone, readVisibleArea, scrollContentBy, scrollDeltaToReveal } = await import('@/help/tours/viewport')
import type { TourDef } from '@/help/tours/types'

const TOUR: TourDef = {
  id: 'vp',
  version: 1,
  title: 'Prueba de teclado',
  cardId: 'x',
  durationSec: 30,
  startPath: '/p',
  steps: [
    { id: 'titulo', text: 'Escribe el título.', target: 'test.title', completeOn: [{ type: 'filled', target: 'test.title', min: 2 }] },
    { id: 'fin', text: 'Ya está.', target: 'test.title', completeOn: [], manualNext: true },
  ],
  finishText: 'Listo.',
}

// ---- visualViewport simulado
class FakeVV extends EventTarget {
  offsetTop = 0
  offsetLeft = 0
  width = 390
  height = 768
  scale = 1
  set(p: Partial<Pick<FakeVV, 'offsetTop' | 'offsetLeft' | 'width' | 'height' | 'scale'>>, ev: 'resize' | 'scroll' = 'resize') {
    Object.assign(this, p)
    this.dispatchEvent(new Event(ev))
  }
}
let vv: FakeVV
// Dónde está «de verdad» cada elemento (coordenadas del viewport de diseño). Se cambia en las pruebas para simular que el formulario se desplaza.
let labelTop = 300
let panelHeight = 150

const box = (top: number, height: number, left = 20, width = 300) => ({ top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

function mockGeometry() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.tagName === 'LABEL') return box(labelTop, 70)
    if (this.tagName === 'INPUT') return box(labelTop + 28, 40)
    return box(0, 10)
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return (this as HTMLElement).classList?.contains('tour-panel') ? panelHeight : 0
    },
  })
}

function Screen() {
  return (
    <form id="form" style={{ overflowY: 'auto' }}>
      <label>
        Título
        <input type="text" data-help-id="test.title" aria-label="titulo" />
      </label>
    </form>
  )
}

function setup() {
  return render(
    <MemoryRouter initialEntries={['/p']}>
      <Screen />
      <TourRunner tour={TOUR} voiceMode="text" nextOptions={[]} onClose={() => undefined} onPick={() => undefined} />
    </MemoryRouter>,
  )
}
const layer = () => document.querySelector('[data-tour-layer]') as HTMLElement
const ring = () => document.querySelector('.tour-ring') as HTMLElement
const panel = () => screen.getByRole('dialog', { name: /Tutorial:/ })
const px = (v: string) => parseFloat(v)

beforeEach(() => {
  vv = new FakeVV()
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
  setTargetVisibilityForTests(() => true)
  labelTop = 300
  panelHeight = 150
  mockGeometry()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setTargetVisibilityForTests(null)
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  delete (HTMLElement.prototype as unknown as { offsetHeight?: number }).offsetHeight
})

describe('funciones de geometría (puras)', () => {
  it('readVisibleArea: teclado = viewport visual mucho más bajo que el de diseño; el zoom de pellizco no cuenta como teclado', () => {
    expect(readVisibleArea()).toMatchObject({ keyboard: false, compact: false, height: 768 })
    vv.height = 420
    expect(readVisibleArea()).toMatchObject({ keyboard: true, compact: true, height: 420 })
    vv.height = 700 // la barra de Safari: no es un teclado
    expect(readVisibleArea().keyboard).toBe(false)
    vv.height = 420
    vv.scale = 2
    expect(readVisibleArea().keyboard).toBe(false)
  })

  it('readVisibleArea sin visualViewport usa la pantalla entera', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    expect(readVisibleArea()).toMatchObject({ top: 0, left: 0, height: 768, keyboard: false })
  })

  it('choosePanelSide: elige el lado donde no tapa el control y no salta si el actual ya está libre', () => {
    const field = { top: 296, bottom: 344 }
    expect(choosePanelSide(field, 420, 150, 8, 'bottom')).toBe('top') // abajo taparía el campo
    expect(choosePanelSide({ top: 20, bottom: 70 }, 420, 150, 8, 'top')).toBe('bottom') // arriba lo taparía
    expect(choosePanelSide({ top: 200, bottom: 240 }, 420, 150, 8, 'bottom')).toBe('bottom') // ya libre: se queda
    expect(choosePanelSide(null, 420, 150, 8, 'top')).toBe('top')
  })

  it('scrollDeltaToReveal / freeZone: solo propone desplazar cuando el control no cabe en la zona libre', () => {
    const zone = freeZone('bottom', 420, 150, 8) // libre: 0..254
    expect(scrollDeltaToReveal({ top: 100, bottom: 150 }, zone.top, zone.bottom)).toBe(0)
    expect(scrollDeltaToReveal({ top: 300, bottom: 350 }, zone.top, zone.bottom)).toBeGreaterThan(0) // hay que subir el contenido
    expect(scrollDeltaToReveal({ top: -30, bottom: 20 }, zone.top, zone.bottom)).toBeLessThan(0)
  })

  it('scrollContentBy desplaza el contenedor con scroll más cercano o, si no lo hay, la página', () => {
    const wrap = document.createElement('div')
    wrap.style.overflowY = 'auto'
    Object.defineProperty(wrap, 'scrollHeight', { value: 900 })
    Object.defineProperty(wrap, 'clientHeight', { value: 300 })
    const inner = document.createElement('input')
    wrap.appendChild(inner)
    document.body.appendChild(wrap)
    scrollContentBy(inner, 40)
    expect(wrap.scrollTop).toBe(40)
    const lone = document.createElement('input')
    document.body.appendChild(lone)
    window.scrollBy = vi.fn() as never
    scrollContentBy(lone, 25)
    expect(window.scrollBy).toHaveBeenCalledWith(0, 25)
    wrap.remove()
    lone.remove()
  })
})

describe('marco y tarjeta frente al teclado (motor general)', () => {
  it('sin teclado: capa del tamaño de la pantalla, marco sobre la etiqueta y el campo juntos, tarjeta normal', async () => {
    setup()
    await waitFor(() => expect(ring()).toBeTruthy())
    expect(layer().style.height).toBe('768px')
    expect(layer().dataset.keyboard).toBe('false')
    expect(px(ring().style.top)).toBe(labelTop - 4) // rodea «Título» + el cuadro, no solo el cuadro
    expect(px(ring().style.height)).toBe(70 + 8)
    expect(panel().className).not.toContain('compact')
  })

  it('al abrirse el teclado la capa se ajusta al área visible, la tarjeta se compacta y queda por encima del teclado', async () => {
    setup()
    await waitFor(() => expect(ring()).toBeTruthy())
    act(() => vv.set({ height: 420 }))
    await waitFor(() => expect(layer().dataset.keyboard).toBe('true'))
    expect(layer().style.height).toBe('420px')
    expect(panel().className).toContain('tour-panel-compact')
    expect(panel().style.getPropertyValue('--tour-bottom')).toBe('8px') // pegada al teclado, no a la barra de navegación que queda debajo
    expect(px(panel().style.maxHeight)).toBeLessThanOrEqual(0.4 * 420)
  })

  it('con el teclado abierto la tarjeta se coloca en el lado que NO tapa el campo', async () => {
    labelTop = 300 // en un área de 420 px el campo queda abajo: la tarjeta de abajo lo taparía
    setup()
    act(() => vv.set({ height: 420 }))
    await waitFor(() => expect(panel().className).toContain('tour-panel-top'))
    labelTop = 20
    act(() => vv.set({ height: 421 }))
    await waitFor(() => expect(panel().className).toContain('tour-panel-bottom'))
  })

  it('al cerrarse el teclado todo vuelve: capa completa, tarjeta normal, botones secundarios', async () => {
    setup()
    act(() => vv.set({ height: 420 }))
    await waitFor(() => expect(layer().dataset.keyboard).toBe('true'))
    act(() => vv.set({ height: 768 }))
    await waitFor(() => expect(layer().dataset.keyboard).toBe('false'))
    expect(layer().style.height).toBe('768px')
    expect(panel().className).not.toContain('compact')
    expect(panel().style.getPropertyValue('--tour-bottom')).toBe('')
  })

  it('iOS desplaza el viewport visual (offsetTop): el marco se mide respecto a él y sigue alineado con el campo real', async () => {
    setup()
    await waitFor(() => expect(ring()).toBeTruthy())
    act(() => vv.set({ height: 420, offsetTop: 120 }))
    await waitFor(() => expect(layer().style.top).toBe('120px'))
    // el campo real sigue en 300 (coordenadas de diseño): dentro de la capa está a 300 − 120
    expect(px(ring().style.top)).toBe(300 - 120 - 4)
    // y el viewport visual se vuelve a desplazar (Safari recoloca la página al enfocar)
    act(() => vv.set({ offsetTop: 200 }, 'scroll'))
    await waitFor(() => expect(px(ring().style.top)).toBe(300 - 200 - 4), { timeout: 300 }) // sin esperar al sondeo de 400 ms
  })

  it('si el formulario se desplaza al abrirse el teclado, el marco lo sigue (sin esperar al sondeo)', async () => {
    setup()
    await waitFor(() => expect(ring()).toBeTruthy())
    labelTop = 140 // Safari sube el formulario
    act(() => vv.set({ height: 420 }))
    await waitFor(() => expect(px(ring().style.top)).toBe(140 - 4), { timeout: 300 })
  })

  it('un cambio de foco recoloca el marco', async () => {
    setup()
    await waitFor(() => expect(ring()).toBeTruthy())
    labelTop = 180
    act(() => {
      screen.getByLabelText('titulo').dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    await waitFor(() => expect(px(ring().style.top)).toBe(180 - 4), { timeout: 300 })
    labelTop = 330
    act(() => {
      screen.getByLabelText('titulo').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    await waitFor(() => expect(px(ring().style.top)).toBe(330 - 4), { timeout: 300 })
  })

  it('el desplazamiento de cualquier contenedor del formulario recoloca el marco', async () => {
    setup()
    await waitFor(() => expect(ring()).toBeTruthy())
    labelTop = 250
    act(() => {
      document.getElementById('form')!.dispatchEvent(new Event('scroll'))
    })
    await waitFor(() => expect(px(ring().style.top)).toBe(250 - 4), { timeout: 300 })
  })

  it('el cambio de tamaño de la ventana (girar el iPhone) también recoloca', async () => {
    setup()
    await waitFor(() => expect(ring()).toBeTruthy())
    labelTop = 90
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await waitFor(() => expect(px(ring().style.top)).toBe(90 - 4), { timeout: 300 })
  })

  it('si el campo queda bajo el teclado/tarjeta, se desplaza el CONTENIDO (no el formulario ni el foco) para verlo', async () => {
    window.scrollBy = vi.fn() as never
    labelTop = 380 // dentro de un área de 420: bajo la zona libre
    setup()
    act(() => vv.set({ height: 420 }))
    await waitFor(() => expect((window.scrollBy as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0), { timeout: 2500 })
    const [x, dy] = (window.scrollBy as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [number, number]
    expect(x).toBe(0)
    expect(dy).toBeGreaterThan(0)
  })

  it('no bloquea la escritura: con el teclado abierto se puede escribir y el paso avanza igual', async () => {
    setup()
    act(() => vv.set({ height: 420 }))
    await waitFor(() => expect(layer().dataset.keyboard).toBe('true'))
    expect(within(panel()).getByText('Escribe el título.')).toBeTruthy()
    const input = screen.getByLabelText('titulo') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'Dentista' } })
    await waitFor(() => expect(within(panel()).getByText('Ya está.')).toBeTruthy())
    expect(input.value).toBe('Dentista') // el tutorial no tocó lo escrito
    expect(document.activeElement).toBe(input) // ni quitó el foco (el teclado sigue abierto)
  })

  it('el marco y la capa no interceptan toques (CSS) y los botones secundarios solo se ocultan en modo compacto', () => {
    const css = readFileSync('src/help/tours/tours.css', 'utf8')
    expect(css).toMatch(/\.tour-layer \{[^}]*pointer-events: none/s)
    expect(css).toMatch(/\.tour-ring \{[^}]*pointer-events: none/s)
    expect(css).toMatch(/\.tour-panel-compact \.tour-btn-extra \{\s*display: none/)
    expect(css).toContain('var(--tour-bottom')
  })

  it('los botones esenciales (Atrás/Siguiente/Salir) siguen disponibles con la tarjeta compacta', async () => {
    setup()
    act(() => vv.set({ height: 420 }))
    await waitFor(() => expect(panel().className).toContain('compact'))
    expect(within(panel()).getByRole('button', { name: /Salir/ })).toBeTruthy()
    // los secundarios llevan la clase que el CSS oculta
    expect(within(panel()).getByRole('button', { name: /Pausar/ }).className).toContain('tour-btn-extra')
  })
})
