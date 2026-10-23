// @vitest-environment jsdom
// B3: el avatar flotante de Pepa y el botón de redes/compartir se superponían arriba en el iPhone. La separación calcula un desplazamiento visual solo para el que estorba.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveFabOverlaps, separateFloatingButtons } from '@/ui/fabSeparation'
import { FabSeparator } from '@/ui/FabSeparator'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const box = (left: number, top = 8, size = 42) => ({ left, top, size })

describe('resolveFabOverlaps (puro)', () => {
  it('sin superposición no mueve nada', () => {
    expect(resolveFabOverlaps([box(8), box(57), box(106)], 390, 800)).toEqual([
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
    ])
  })

  it('si dos botones coinciden, el primero se queda y el segundo se aparta al hueco libre más cercano', () => {
    const s = resolveFabOverlaps([box(253), box(253)], 390, 800)
    expect(s[0]).toEqual({ dx: 0, dy: 0 })
    expect(Math.abs(s[1].dx)).toBe(49) // un botón de ancho + separación
    expect(s[1].dy).toBe(0)
  })

  it('parcialmente solapados (el avatar sobre la mitad del botón de redes) también se separan', () => {
    const s = resolveFabOverlaps([box(253), box(280)], 390, 800)
    expect(s[1].dx !== 0 || s[1].dy !== 0).toBe(true)
  })

  it('no se sale de la pantalla: sin hueco a la derecha, busca a la izquierda; si la fila está llena, baja una fila', () => {
    const right = resolveFabOverlaps([box(330), box(330)], 390, 800) // pegados al borde derecho
    expect(right[1].dx).toBeLessThan(0)
    const full = resolveFabOverlaps([box(8), box(57), box(106), box(8)], 190, 800) // fila de 190 px llena
    expect(full[3].dy).toBeGreaterThan(0)
  })

  it('un roce de unos píxeles no cuenta como superposición', () => {
    expect(resolveFabOverlaps([box(8), box(48)], 390, 800)[1]).toEqual({ dx: 0, dy: 0 })
  })
})

function mount(rects: Array<[number, number]>) {
  const els = rects.map((_r, i) => {
    const el = document.createElement('button')
    el.className = 'voice-fab-round'
    el.dataset.n = String(i)
    document.body.appendChild(el)
    return el
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const i = Number(this.dataset.n)
    const [left, top] = rects[i]
    const ml = parseFloat(this.style.marginLeft || '0')
    const mt = parseFloat(this.style.marginTop || '0')
    return { left: left + ml, top: top + mt, width: 42, height: 42, right: left + ml + 42, bottom: top + mt + 42, x: left + ml, y: top + mt, toJSON: () => ({}) } as DOMRect
  })
  return els
}

describe('separateFloatingButtons (pantalla)', () => {
  it('aparta el botón que estorba con un margen visual y lo hace idempotente', () => {
    const [pepa, share] = mount([
      [253, 8],
      [253, 8],
    ])
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    separateFloatingButtons()
    expect(pepa.style.marginLeft).toBe('')
    const first = share.style.marginLeft
    expect(first).not.toBe('')
    separateFloatingButtons()
    expect(share.style.marginLeft).toBe(first) // no sigue moviéndose
    pepa.remove()
    share.remove()
  })

  it('si ya no se superponen (se movió uno), el desplazamiento desaparece', () => {
    const rects: Array<[number, number]> = [
      [253, 8],
      [253, 8],
    ]
    const els = mount(rects)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    separateFloatingButtons()
    expect(els[1].style.marginLeft).not.toBe('')
    rects[1] = [302, 8]
    separateFloatingButtons()
    expect(els[1].style.marginLeft).toBe('')
    els.forEach((e) => e.remove())
  })

  it('no toca el botón que se está arrastrando', () => {
    const els = mount([
      [253, 8],
      [253, 8],
    ])
    els[1].classList.add('voice-fab-dragging')
    separateFloatingButtons()
    expect(els[1].style.marginLeft).toBe('')
    els.forEach((e) => e.remove())
  })

  it('el componente se monta sin pintar nada y la barra principal lo incluye', () => {
    const { container } = render(<FabSeparator />)
    expect(container.innerHTML).toBe('')
    act(() => undefined)
    expect(readFileSync('src/ui/NavShell.tsx', 'utf8')).toContain('<FabSeparator />')
  })
})
