import { describe, expect, it } from 'vitest'
import { ASSUMED_CANVAS_SIZE_PX, clampLayerCenterAccessible, MIN_ACCESSIBLE_TOUCH_PX, recoverInaccessibleLayerPositions } from '@/domain/events'
import type { InvitationLayer } from '@/domain/types'

// Corrección (2026-09-28) — bug real reproducido en iPhone: arrastrar una capa (probado con formas de
// corazón, pero el motor de arrastre es el MISMO para texto/datos/foto/emoji/forma — ver
// handleDragPointerMove en ui/InvitationDesigner.tsx, sin ninguna rama por `layer.type`) hasta el borde/
// esquina del lienzo dejaba su centro exactamente en el límite (0 o 1) sin tener en cuenta su propio
// tamaño — con el lienzo recortando lo que se sale, el resto visible podía ser un cuadrado de menos de
// 30×30px, en la práctica imposible de volver a tocar: una capa persistente pero inaccesible.

function shapeLayer(x: number, y: number, fontSize = 60): InvitationLayer {
  return { id: 'l', type: 'shape', x, y, rotation: 0, scale: 1, zIndex: 1, shapeKey: 'corazon', color: '#ffffff', fontSize }
}

describe('clampLayerCenterAccessible', () => {
  it('un centro ya cómodamente dentro no cambia', () => {
    expect(clampLayerCenterAccessible(0.5, 0.08, ASSUMED_CANVAS_SIZE_PX)).toBe(0.5)
  })

  it('en el borde derecho (1), se tira ligeramente hacia dentro para dejar el hueco táctil mínimo', () => {
    const halfW = 30 / ASSUMED_CANVAS_SIZE_PX // corazón por defecto, 60px de lado -> 30px de mitad
    const clamped = clampLayerCenterAccessible(1, halfW, ASSUMED_CANVAS_SIZE_PX)
    expect(clamped).toBeLessThan(1)
    // El hueco resultante (1 - clamped + halfW) debe alcanzar el mínimo pedido (en fracción).
    const resultingOverlap = 1 - clamped + halfW
    expect(resultingOverlap).toBeCloseTo(MIN_ACCESSIBLE_TOUCH_PX / ASSUMED_CANVAS_SIZE_PX, 5)
  })

  it('en el borde izquierdo (0), simétrico', () => {
    const halfW = 30 / ASSUMED_CANVAS_SIZE_PX
    const clamped = clampLayerCenterAccessible(0, halfW, ASSUMED_CANVAS_SIZE_PX)
    expect(clamped).toBeGreaterThan(0)
    const resultingOverlap = clamped + halfW
    expect(resultingOverlap).toBeCloseTo(MIN_ACCESSIBLE_TOUCH_PX / ASSUMED_CANVAS_SIZE_PX, 5)
  })

  it('nunca exige más hueco del que la propia capa puede dar (una capa más pequeña que el mínimo no queda encerrada sin poder tocar el borde)', () => {
    // Una capa minúscula (10px de lado) — 2×halfW (10px) es menor que MIN_ACCESSIBLE_TOUCH_PX (36px).
    const tinyHalfW = 5 / ASSUMED_CANVAS_SIZE_PX
    const clamped = clampLayerCenterAccessible(1, tinyHalfW, ASSUMED_CANVAS_SIZE_PX)
    // El máximo que puede dar es su lado entero (2×halfW) — el centro puede llegar hasta ahí, ni más ni menos.
    expect(clamped).toBeCloseTo(1 + tinyHalfW - 2 * tinyHalfW, 5)
  })

  it('una capa ya mayor que el doble del mínimo no necesita tirarse hacia dentro — en el borde ya deja de sobra el hueco mínimo', () => {
    const bigHalfW = 200 / ASSUMED_CANVAS_SIZE_PX // capa de 400px, mucho mayor que el mínimo (36px)
    const clamped = clampLayerCenterAccessible(1, bigHalfW, ASSUMED_CANVAS_SIZE_PX)
    expect(clamped).toBe(1) // sin cambios: el propio tamaño ya garantiza de sobra el hueco táctil mínimo
    const resultingOverlap = 1 - clamped + bigHalfW
    expect(resultingOverlap).toBeGreaterThan(MIN_ACCESSIBLE_TOUCH_PX / ASSUMED_CANVAS_SIZE_PX)
  })
})

describe('recoverInaccessibleLayerPositions — recuperación conservadora al abrir una invitación guardada', () => {
  it('un array sin ninguna capa inaccesible se devuelve TAL CUAL (misma referencia — no marca "cambios sin guardar" de la nada)', () => {
    const layers = [shapeLayer(0.5, 0.5), shapeLayer(0.3, 0.7)]
    expect(recoverInaccessibleLayerPositions(layers)).toBe(layers)
  })

  it('una capa en la esquina exacta (1,1) se recoloca lo mínimo — nunca al centro, nunca recentrada', () => {
    const layers = [shapeLayer(1, 1)]
    const result = recoverInaccessibleLayerPositions(layers)
    expect(result).not.toBe(layers)
    expect(result[0].x).toBeLessThan(1)
    expect(result[0].y).toBeLessThan(1)
    expect(result[0].x).toBeGreaterThan(0.9) // sigue cerca de la esquina, no recentrada
    expect(result[0].y).toBeGreaterThan(0.9)
  })

  it('reproduce el bug real: dos corazones en las dos esquinas inferiores, ambos se recuperan de forma independiente', () => {
    const layers = [shapeLayer(1, 1), shapeLayer(0, 1)]
    const result = recoverInaccessibleLayerPositions(layers)
    expect(result[0].x).toBeLessThan(1)
    expect(result[1].x).toBeGreaterThan(0)
    // Cada una se recupera hacia SU propio lado — no colapsan a la misma posición.
    expect(result[0].x).not.toBe(result[1].x)
  })

  it('una capa válida (aunque sobresalga parcialmente pero siga siendo accesible) NO se toca — misma referencia de objeto', () => {
    const validButOverhanging = shapeLayer(0.95, 0.5) // sobresale un poco, pero deja de sobra el mínimo táctil
    const broken = shapeLayer(1, 1)
    const layers = [validButOverhanging, broken]
    const result = recoverInaccessibleLayerPositions(layers)
    expect(result[0]).toBe(validButOverhanging) // idéntica referencia — ni recolocada ni clonada
    expect(result[1]).not.toBe(broken)
  })

  it('nunca recentra: la capa recuperada queda lo más cerca posible de donde el usuario la dejó, no en (0.5, 0.5)', () => {
    const layers = [shapeLayer(1, 1)]
    const result = recoverInaccessibleLayerPositions(layers)
    expect(result[0].x).not.toBe(0.5)
    expect(result[0].y).not.toBe(0.5)
  })

  it('funciona igual para las 5 capas (texto/datos/foto/emoji/forma) — sin ninguna rama especial por tipo', () => {
    // Emoji (48px) y "dato" (texto corto) son pequeños — tocar el borde crudo (0 o 1) sí se corrige.
    const emojiLayer: InvitationLayer = { id: 'e', type: 'emoji', x: 0, y: 0, rotation: 0, scale: 1, zIndex: 1, text: '🎈', fontSize: 48 }
    const dataLayer: InvitationLayer = { id: 'd', type: 'event_data', x: 0, y: 1, rotation: 0, scale: 1, zIndex: 1, text: 'Fecha', fontSize: 16 }
    const result = recoverInaccessibleLayerPositions([emojiLayer, dataLayer])
    for (const layer of result) {
      expect(layer.x).toBeGreaterThanOrEqual(0)
      expect(layer.x).toBeLessThanOrEqual(1)
      const original = [emojiLayer, dataLayer].find((l) => l.id === layer.id)!
      if (original.x === 0 || original.x === 1) expect(layer.x).not.toBe(original.x)
    }
    // Una foto (120px, bastante mayor que el mínimo de 36px) SÍ puede quedarse tocando el borde crudo — su
    // propio tamaño ya deja de sobra el hueco táctil mínimo, así que no hace falta tirar de ella hacia
    // dentro (mismo criterio que "una capa grande" en clampLayerCenterAccessible, arriba).
    const photoLayer: InvitationLayer = { id: 'p', type: 'photo', x: 1, y: 0.5, rotation: 0, scale: 1, zIndex: 1, photoPath: 'x.jpg', fontSize: 120 }
    expect(recoverInaccessibleLayerPositions([photoLayer])[0].x).toBe(1)
  })

  it('respeta layer.scale al estimar el tamaño real (una capa escalada hacia arriba recibe más margen, no menos)', () => {
    const small = shapeLayer(1, 0.5)
    const scaledUp = { ...shapeLayer(1, 0.5), id: 'scaled', scale: 3 }
    const resultSmall = recoverInaccessibleLayerPositions([small])[0]
    const resultScaled = recoverInaccessibleLayerPositions([scaledUp])[0]
    // La capa escalada 3x es mucho más grande, así que puede quedarse más cerca del borde crudo (más
    // solape absoluto disponible) que la pequeña — clampLayerCenterAccessible nunca pide más de lo que
    // hace falta, así que su x recuperado debe ser mayor o igual (más cerca de 1) que el de la pequeña.
    expect(resultScaled.x).toBeGreaterThanOrEqual(resultSmall.x)
  })
})
