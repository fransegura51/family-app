import { describe, expect, it } from 'vitest'
import { placeMenu } from '@/domain/menuPlacement'

const VP = { width: 390, height: 780 }
const MENU = { width: 240, height: 200 }

describe('placeMenu', () => {
  it('con sitio debajo, se abre hacia abajo pegado al botón y alineado a su borde derecho', () => {
    const p = placeMenu({ top: 100, bottom: 144, left: 280, right: 370 }, MENU, VP)
    expect(p.openUp).toBe(false)
    expect(p.top).toBe(148)
    expect(p.left).toBe(130)
  })

  it('al final de la pantalla (botón abajo) se abre hacia arriba y queda entero a la vista', () => {
    const p = placeMenu({ top: 700, bottom: 744, left: 280, right: 370 }, MENU, VP)
    expect(p.openUp).toBe(true)
    expect(p.top + MENU.height).toBeLessThanOrEqual(700)
    expect(p.top).toBeGreaterThanOrEqual(8)
  })

  it('nunca se sale por la izquierda ni por la derecha', () => {
    const l = placeMenu({ top: 100, bottom: 144, left: 4, right: 60 }, MENU, VP)
    expect(l.left).toBe(8)
    const r = placeMenu({ top: 100, bottom: 144, left: 380, right: 440 }, MENU, VP)
    expect(r.left + MENU.width).toBeLessThanOrEqual(VP.width - 8)
  })

  it('si no cabe ni arriba ni abajo, limita el alto (se desplaza por dentro) y sigue dentro de la pantalla', () => {
    const tall = { width: 240, height: 900 }
    const p = placeMenu({ top: 400, bottom: 444, left: 280, right: 370 }, tall, VP)
    expect(p.maxHeight).toBeLessThan(900)
    expect(p.top).toBeGreaterThanOrEqual(0)
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(VP.height)
  })

  it('en una pantalla baja (teclado o apaisado) elige el lado con más espacio y siempre deja un mínimo visible', () => {
    const p = placeMenu({ top: 150, bottom: 194, left: 280, right: 370 }, MENU, { width: 390, height: 300 })
    expect(p.openUp).toBe(true)
    expect(p.top).toBeGreaterThanOrEqual(16)
    expect(p.maxHeight).toBeGreaterThanOrEqual(96)
  })
})
