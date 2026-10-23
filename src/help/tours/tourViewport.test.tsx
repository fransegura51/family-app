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
    if (this.dataset?.tourLayer) return box(vv.offsetTop, vv.height, 0, 390) // la capa sigue al área visible
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
// El marcador es el propio control señalado (atributo data-tour-active), sin coordenadas propias.
const ring = () => document.querySelector('[data-tour-active="true"]') as HTMLElement
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
    expect(ring().tagName).toBe('LABEL') // rodea «Título» + el cuadro, no solo el cuadro
    expect(ring().querySelector('[data-help-id="test.title"]')).toBeTruthy()
    expect(document.querySelectorAll('[data-tour-active]').length).toBe(1)
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

  it('el marcador viaja CON el control: aunque iOS desplace el viewport visual, siga siendo el mismo control y no hay coordenadas viejas que se queden atrás', async () => {
    setup()
    await waitFor(() => expect(ring()).toBeTruthy())
    const before = ring()
    act(() => vv.set({ height: 420, offsetTop: 120 }))
    await waitFor(() => expect(layer().style.top).toBe('120px'))
    expect(ring()).toBe(before)
    act(() => vv.set({ offsetTop: 200 }))
    expect(ring()).toBe(before)
    act(() => vv.set({ height: 768, offsetTop: 0 }))
    expect(ring()).toBe(before)
    expect(document.querySelectorAll('[data-tour-active]').length).toBe(1)
  })

  describe('la tarjeta se recoloca (sin esperar al sondeo) cuando cambia dónde está el control', () => {
    // Con el teclado abierto (área de 420 px) un campo en la parte baja choca con la tarjeta de abajo y uno arriba con la de arriba.
    const trigger: Array<[string, () => void]> = [
      ['un cambio de foco', () => screen.getByLabelText('titulo').dispatchEvent(new FocusEvent('focusin', { bubbles: true }))],
      ['el desplazamiento del formulario', () => document.getElementById('form')!.dispatchEvent(new Event('scroll'))],
      ['girar o redimensionar la ventana', () => window.dispatchEvent(new Event('resize'))],
      ['abrirse o cambiar el viewport visual', () => vv.set({ height: 421 })],
    ]
    for (const [name, fire] of trigger) {
      it(name, async () => {
        labelTop = 20
        setup()
        act(() => vv.set({ height: 420 }))
        await waitFor(() => expect(panel().className).toContain('tour-panel-bottom'))
        labelTop = 330
        act(() => fire())
        await waitFor(() => expect(panel().className).toContain('tour-panel-top'), { timeout: 300 })
        labelTop = 20
        act(() => fire())
        await waitFor(() => expect(panel().className).toContain('tour-panel-bottom'), { timeout: 300 })
        expect(ring().tagName).toBe('LABEL') // el marcador nunca cambió de control
      })
    }
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

  it('el marco es un estilo del propio control (no intercepta toques ni cambia su tamaño) y la capa tampoco bloquea nada', () => {
    const css = readFileSync('src/help/tours/tours.css', 'utf8')
    expect(css).toMatch(/\.tour-layer \{[^}]*pointer-events: none/s)
    expect(css).toMatch(/\[data-tour-active='true'\] \{[^}]*box-shadow/s)
    expect(css).not.toMatch(/\[data-tour-active='true'\] \{[^}]*(width|height|position|transform):/s)
    expect(css).toContain('var(--tour-bottom')
  })

  it('el marcador se quita al salir: ningún control se queda marcado', async () => {
    setup()
    await waitFor(() => expect(ring()).toBeTruthy())
    fireEvent.click(within(panel()).getByRole('button', { name: /Salir del tutorial/ }))
    await waitFor(() => expect(document.querySelectorAll('[data-tour-active]').length).toBe(0))
  })

  it('los controles esenciales (Salir, Atrás/Siguiente) están a la vista y los secundarios (Pausar, Reiniciar, Escuchar) a un toque en «⋯ Más» con la tarjeta compacta', async () => {
    setup()
    await waitFor(() => expect(panel().querySelector('details.tour-more')).toBeTruthy())
    // con espacio: los secundarios están desplegados
    expect((panel().querySelector('details.tour-more') as HTMLDetailsElement).open).toBe(true)
    act(() => vv.set({ height: 420 }))
    await waitFor(() => expect(panel().className).toContain('compact'))
    expect(within(panel()).getByRole('button', { name: /Salir del tutorial/ })).toBeTruthy()
    const more = panel().querySelector('details.tour-more') as HTMLDetailsElement
    expect(more.open).toBe(false)
    expect(within(more).getByRole('button', { name: /Pausar/ })).toBeTruthy()
    expect(within(more).getByRole('button', { name: /Reiniciar/ })).toBeTruthy()
    expect(within(more).getByRole('button', { name: /Escuchar/ })).toBeTruthy()
    expect(more.querySelector('summary')?.textContent).toContain('Más')
  })
})
