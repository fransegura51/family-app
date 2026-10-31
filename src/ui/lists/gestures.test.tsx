// @vitest-environment jsdom
// Corrección 3 — arrastrar listas a carpetas en iPhone: pulsación prolongada o asa, destino bajo el dedo, sin romper el desplazamiento.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_PRESS_MS, findDropTarget, useDragSort, type DropTarget } from '@/ui/lists/gestures'

function rect(el: Element, r: { left: number; top: number; width: number; height: number }) {
  el.getBoundingClientRect = () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) }) as DOMRect
}

function Harness({ onDrop }: { onDrop: (id: string, t: DropTarget | null) => void }) {
  const drag = useDragSort(onDrop)
  return (
    <div>
      <div data-testid="folder" data-drop-id="F1" data-drop-kind="folder" className={drag.over?.id === 'F1' ? 'over' : ''}>
        Carpeta
      </div>
      <div data-testid="row" data-drop-id="L1" data-drop-kind="list" {...drag.rowProps('L1')}>
        <a href="#x" data-testid="link">
          Lista
        </a>
        <span data-testid="handle" {...drag.handleProps('L1')}>
          ⠿
        </span>
        <button type="button">⋯</button>
      </div>
      <div data-testid="state">{drag.dragId ?? 'idle'}</div>
    </div>
  )
}

// jsdom no trae PointerEvent: sin él los eventos pierden clientX/clientY y el destino saldría siempre «dentro» de todo.
class FakePointerEvent extends MouseEvent {
  pointerId: number
  pointerType: string
  constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}

beforeEach(() => {
  ;(window as unknown as { PointerEvent: unknown }).PointerEvent = FakePointerEvent
  vi.useFakeTimers()
  // jsdom no tiene captura de puntero ni elementsFromPoint: se simulan (en Safari iOS la captura sí existe).
  Element.prototype.setPointerCapture = vi.fn()
  document.elementsFromPoint = vi.fn(() => [])
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup(onDrop = vi.fn()) {
  render(<Harness onDrop={onDrop} />)
  rect(screen.getByTestId('folder'), { left: 0, top: 0, width: 300, height: 60 })
  rect(screen.getByTestId('row'), { left: 0, top: 100, width: 300, height: 56 })
  return onDrop
}
const touch = (clientX: number, clientY: number) => ({ pointerType: 'touch', pointerId: 1, clientX, clientY })

describe('destino bajo el dedo', () => {
  it('sin pila de elementos (Safari iOS con el puntero capturado) se resuelve por rectángulos y gana el más pequeño', () => {
    setup()
    expect(findDropTarget(20, 20, 'L1')).toEqual({ id: 'F1', kind: 'folder', after: false })
    expect(findDropTarget(20, 50, 'L1')).toEqual({ id: 'F1', kind: 'folder', after: true })
    expect(findDropTarget(20, 120, 'X')?.id).toBe('L1')
    expect(findDropTarget(20, 120, 'L1')).toBeNull() // nunca sobre sí misma
    expect(findDropTarget(500, 500, 'L1')).toBeNull()
  })
})

describe('arrastre con el asa', () => {
  it('arrastra y suelta sobre una carpeta: avisa del destino, con indicador mientras se arrastra', () => {
    const onDrop = setup()
    fireEvent.pointerDown(screen.getByTestId('handle'), touch(10, 120))
    expect(screen.getByTestId('state').textContent).toBe('L1')
    fireEvent.pointerMove(screen.getByTestId('handle'), touch(30, 30))
    expect(screen.getByTestId('folder').className).toBe('over') // indicador visual de destino
    fireEvent.pointerUp(screen.getByTestId('handle'), touch(30, 30))
    expect(onDrop).toHaveBeenCalledWith('L1', { id: 'F1', kind: 'folder', after: false })
    expect(screen.getByTestId('state').textContent).toBe('idle')
  })

  it('si el último movimiento no llega, se vuelve a mirar dónde está el dedo al soltar', () => {
    const onDrop = setup()
    fireEvent.pointerDown(screen.getByTestId('handle'), touch(10, 120))
    fireEvent.pointerUp(screen.getByTestId('handle'), touch(30, 30))
    expect(onDrop).toHaveBeenCalledWith('L1', expect.objectContaining({ id: 'F1', kind: 'folder' }))
  })

  it('soltar fuera de cualquier destino no mueve nada', () => {
    const onDrop = setup()
    fireEvent.pointerDown(screen.getByTestId('handle'), touch(10, 120))
    fireEvent.pointerMove(screen.getByTestId('handle'), touch(900, 900))
    fireEvent.pointerUp(screen.getByTestId('handle'), touch(900, 900))
    expect(onDrop).toHaveBeenCalledWith('L1', null)
  })

  it('mientras se arrastra el desplazamiento táctil de la página se bloquea; al acabar, vuelve a funcionar', () => {
    setup()
    const blocked = () => {
      const ev = new Event('touchmove', { cancelable: true, bubbles: true })
      document.dispatchEvent(ev)
      return ev.defaultPrevented
    }
    expect(blocked()).toBe(false)
    fireEvent.pointerDown(screen.getByTestId('handle'), touch(10, 120))
    expect(blocked()).toBe(true)
    fireEvent.pointerUp(screen.getByTestId('handle'), touch(10, 120))
    expect(blocked()).toBe(false)
  })

  it('cancelar el gesto (pointercancel) termina el arrastre sin dejar nada a medias', () => {
    const onDrop = setup()
    fireEvent.pointerDown(screen.getByTestId('handle'), touch(10, 120))
    fireEvent.pointerCancel(screen.getByTestId('handle'), touch(10, 120))
    expect(screen.getByTestId('state').textContent).toBe('idle')
    expect(onDrop).toHaveBeenCalledWith('L1', null)
  })
})

describe('pulsación prolongada sobre la fila', () => {
  it('el dedo quieto ~0,45 s empieza el arrastre; luego se suelta sobre la carpeta', () => {
    const onDrop = setup()
    const row = screen.getByTestId('row')
    fireEvent.pointerDown(row, touch(100, 120))
    expect(screen.getByTestId('state').textContent).toBe('idle')
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10)
    })
    expect(screen.getByTestId('state').textContent).toBe('L1')
    fireEvent.pointerMove(row, touch(100, 30))
    fireEvent.pointerUp(row, touch(100, 30))
    expect(onDrop).toHaveBeenCalledWith('L1', expect.objectContaining({ id: 'F1', kind: 'folder' }))
  })

  it('si el dedo se mueve antes, es un desplazamiento normal de la pantalla: no se arrastra nada', () => {
    const onDrop = setup()
    const row = screen.getByTestId('row')
    fireEvent.pointerDown(row, touch(100, 120))
    fireEvent.pointerMove(row, touch(100, 160))
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    })
    expect(screen.getByTestId('state').textContent).toBe('idle')
    fireEvent.pointerUp(row, touch(100, 160))
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('un toque corto no arranca nada', () => {
    const onDrop = setup()
    const row = screen.getByTestId('row')
    fireEvent.pointerDown(row, touch(100, 120))
    act(() => {
      vi.advanceTimersByTime(100)
    })
    fireEvent.pointerUp(row, touch(100, 120))
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    })
    expect(screen.getByTestId('state').textContent).toBe('idle')
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('los botones y el ratón no activan la pulsación prolongada', () => {
    setup()
    const row = screen.getByTestId('row')
    fireEvent.pointerDown(screen.getByRole('button', { name: '⋯' }), touch(100, 120))
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    })
    expect(screen.getByTestId('state').textContent).toBe('idle')
    fireEvent.pointerDown(row, { pointerType: 'mouse', pointerId: 2, clientX: 1, clientY: 120 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    })
    expect(screen.getByTestId('state').textContent).toBe('idle')
  })

  it('tras arrastrar, el clic que genera soltar no abre la lista; pasado un momento el enlace vuelve a funcionar', () => {
    setup()
    const row = screen.getByTestId('row')
    const link = screen.getByTestId('link')
    fireEvent.pointerDown(row, touch(100, 120))
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10)
    })
    fireEvent.pointerUp(row, touch(100, 120))
    const clicked = vi.fn((e: Event) => e.preventDefault())
    link.addEventListener('click', clicked)
    fireEvent.click(link)
    expect(clicked).not.toHaveBeenCalled() // el clic se corta en la captura de la fila
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.click(link)
    expect(clicked).toHaveBeenCalledTimes(1)
  })
})
