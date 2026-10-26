import { describe, expect, it } from 'vitest'
import { DEFAULT_CROP, FULL_CROP, MIN_CROP, moveRect, outputSize, pixelRect, resizeRect } from '@/ui/lists/cropMath'

describe('Mis listas — recorte de imagen', () => {
  it('mover el recuadro nunca lo saca de la imagen', () => {
    expect(moveRect(DEFAULT_CROP, 5, 5)).toMatchObject({ x: 1 - DEFAULT_CROP.w, y: 1 - DEFAULT_CROP.h })
    expect(moveRect(DEFAULT_CROP, -5, -5)).toMatchObject({ x: 0, y: 0 })
    expect(moveRect(FULL_CROP, 0.3, 0.3)).toEqual(FULL_CROP)
  })
  it('cambiar el tamaño con una esquina deja quieta la contraria', () => {
    const r = resizeRect({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'se', 0.1, 0.1)
    expect(r.x).toBeCloseTo(0.2)
    expect(r.y).toBeCloseTo(0.2)
    expect(r.w).toBeCloseTo(0.6)
    expect(r.h).toBeCloseTo(0.6)
    const n = resizeRect({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'nw', -0.1, -0.1)
    expect(n.x + n.w).toBeCloseTo(0.7)
    expect(n.y + n.h).toBeCloseTo(0.7)
  })
  it('no baja del tamaño mínimo ni se sale por los bordes', () => {
    const small = resizeRect({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'se', -5, -5)
    expect(small.w).toBeCloseTo(MIN_CROP)
    expect(small.h).toBeCloseTo(MIN_CROP)
    const big = resizeRect({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'se', 5, 5)
    expect(big.x + big.w).toBeCloseTo(1)
    expect(big.y + big.h).toBeCloseTo(1)
  })
  it('píxeles del recorte siempre dentro de la imagen', () => {
    expect(pixelRect(FULL_CROP, 1000, 500)).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 500 })
    expect(pixelRect({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 1000, 500)).toEqual({ sx: 500, sy: 250, sw: 500, sh: 250 })
    const edge = pixelRect({ x: 1, y: 1, w: 0.5, h: 0.5 }, 100, 100)
    expect(edge.sx + edge.sw).toBeLessThanOrEqual(100)
    expect(edge.sw).toBeGreaterThanOrEqual(1)
  })
  it('reduce lo grande y no amplía lo pequeño', () => {
    expect(outputSize(3200, 1600)).toEqual({ w: 1600, h: 800 })
    expect(outputSize(400, 300)).toEqual({ w: 400, h: 300 })
  })
})
