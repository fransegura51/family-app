import { describe, expect, it } from 'vitest'
import { findFreeDataLayerPosition } from '@/domain/events'
import type { InvitationLayer } from '@/domain/types'

// Corrección (2026-09-28) — bug real: insertar varios datos seguidos desde "📋 Datos" (fecha, lugar, hora,
// restaurante...) los dejaba todos apilados en la misma posición por defecto (0.5, 0.5). Cada capa nueva
// debe buscar una posición inicial libre — solo la posición INICIAL, siguen siendo objetos independientes
// que el usuario puede mover después con total libertad.

function layer(x: number, y: number): InvitationLayer {
  return { id: 'l', type: 'event_data', x, y, rotation: 0, scale: 1, zIndex: 1, text: 'x' }
}

describe('findFreeDataLayerPosition', () => {
  it('con el lienzo vacío, da una posición cerca de la parte superior (nunca inventa una posición aleatoria)', () => {
    const pos = findFreeDataLayerPosition([])
    expect(pos.x).toBe(0.5)
    expect(pos.y).toBeGreaterThan(0)
    expect(pos.y).toBeLessThan(0.5)
  })

  it('4 inserciones seguidas (fecha, lugar, hora, restaurante) nunca caen en la misma posición — bug real reproducido', () => {
    let layers: InvitationLayer[] = []
    const positions: { x: number; y: number }[] = []
    for (let i = 0; i < 4; i++) {
      const pos = findFreeDataLayerPosition(layers)
      positions.push(pos)
      layers = [...layers, layer(pos.x, pos.y)]
    }
    // Ninguna posición coincide con otra (ni siquiera muy cerca).
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = Math.abs(positions[i].x - positions[j].x)
        const dy = Math.abs(positions[i].y - positions[j].y)
        expect(dx > 0.01 || dy > 0.01, `posición ${i} y ${j} demasiado cerca`).toBe(true)
      }
    }
  })

  it('las posiciones sucesivas se desplazan verticalmente hacia abajo, no se dispersan al azar', () => {
    let layers: InvitationLayer[] = []
    let lastY = -1
    for (let i = 0; i < 3; i++) {
      const pos = findFreeDataLayerPosition(layers)
      expect(pos.y).toBeGreaterThan(lastY)
      lastY = pos.y
      layers = [...layers, layer(pos.x, pos.y)]
    }
  })

  it('nunca elige una posición que se solape con una capa ya existente (título centrado incluido)', () => {
    const existing = [layer(0.5, 0.22), layer(0.5, 0.29)]
    const pos = findFreeDataLayerPosition(existing)
    for (const l of existing) {
      const tooClose = Math.abs(pos.x - l.x) < 0.2 && Math.abs(pos.y - l.y) < 0.06
      expect(tooClose, `nueva posición (${pos.x},${pos.y}) se solapa con capa existente (${l.x},${l.y})`).toBe(false)
    }
  })

  it('un lienzo excepcionalmente lleno (más datos que huecos verticales) nunca lanza — último recurso, la fila final', () => {
    let layers: InvitationLayer[] = []
    for (let y = 0.22; y <= 0.9; y += 0.07) layers.push(layer(0.5, y))
    expect(() => findFreeDataLayerPosition(layers)).not.toThrow()
    const pos = findFreeDataLayerPosition(layers)
    expect(pos.x).toBe(0.5)
    expect(pos.y).toBeLessThanOrEqual(0.9)
  })

  it('sigue siendo un objeto independiente: la función solo devuelve una posición, no ata ni fusiona nada', () => {
    const pos = findFreeDataLayerPosition([layer(0.5, 0.3)])
    expect(typeof pos.x).toBe('number')
    expect(typeof pos.y).toBe('number')
  })
})
