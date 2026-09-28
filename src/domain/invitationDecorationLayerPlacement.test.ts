import { describe, expect, it } from 'vitest'
import { findFreeDecorationLayerPosition } from '@/domain/events'
import type { InvitationLayer } from '@/domain/types'

// Unificación Emoji+Forma → Decorar (2026-09-28) — mismo bug que findFreeDataLayerPosition (ver
// invitationDataLayerPlacement.test.ts) pero para emoji/forma: makeInvitationLayer los coloca siempre en
// (0.5, 0.5), así que insertar varios seguidos desde "🎨 Decorar" los dejaba exactamente apilados. NO
// reutiliza findFreeDataLayerPosition (esa está pensada para filas de texto casi tan anchas como la zona,
// x fijo) — es una función independiente, con su propia búsqueda en las dos direcciones.

function decorationLayer(type: 'emoji' | 'shape', x: number, y: number, fontSize = 48): InvitationLayer {
  return { id: 'l', type, x, y, rotation: 0, scale: 1, zIndex: 1, fontSize, text: type === 'emoji' ? '🎈' : undefined }
}

function newEmojiLayer(): InvitationLayer {
  return { id: 'new', type: 'emoji', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 1, fontSize: 48, text: '🎂' }
}

describe('findFreeDecorationLayerPosition', () => {
  it('con el lienzo vacío, la primera inserción cae en el centro de siempre (0.5, 0.5) — compatibilidad total', () => {
    const pos = findFreeDecorationLayerPosition(newEmojiLayer(), [])
    expect(pos.x).toBe(0.5)
    expect(pos.y).toBe(0.5)
  })

  it('varias inserciones seguidas nunca caen en la misma posición — bug real reproducido', () => {
    let layers: InvitationLayer[] = []
    const positions: { x: number; y: number }[] = []
    for (let i = 0; i < 5; i++) {
      const pos = findFreeDecorationLayerPosition(newEmojiLayer(), layers)
      positions.push(pos)
      layers = [...layers, decorationLayer('emoji', pos.x, pos.y)]
    }
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = Math.abs(positions[i].x - positions[j].x)
        const dy = Math.abs(positions[i].y - positions[j].y)
        expect(dx > 0.01 || dy > 0.01, `posición ${i} y ${j} demasiado cerca`).toBe(true)
      }
    }
  })

  it('nunca elige una posición que se solape con una capa de emoji/forma ya existente', () => {
    const existing = [decorationLayer('emoji', 0.5, 0.5), decorationLayer('shape', 0.58, 0.58)]
    const pos = findFreeDecorationLayerPosition(newEmojiLayer(), existing)
    for (const l of existing) {
      const tooClose = Math.abs(pos.x - l.x) < 0.1 && Math.abs(pos.y - l.y) < 0.1
      expect(tooClose, `nueva posición (${pos.x},${pos.y}) se solapa con capa existente (${l.x},${l.y})`).toBe(false)
    }
  })

  it('mezcla emoji y forma indistintamente al buscar hueco libre (ambas cuentan como "decoración")', () => {
    const existing = [decorationLayer('shape', 0.5, 0.5, 60)]
    const pos = findFreeDecorationLayerPosition(newEmojiLayer(), existing)
    expect(pos.x === 0.5 && pos.y === 0.5).toBe(false)
  })

  it('ignora capas de texto/foto/dato al buscar hueco — solo evita solaparse con otras decoraciones', () => {
    const existing: InvitationLayer[] = [{ id: 't', type: 'text', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 1, text: 'Cumpleaños', fontSize: 32 }]
    const pos = findFreeDecorationLayerPosition(newEmojiLayer(), existing)
    expect(pos.x).toBe(0.5)
    expect(pos.y).toBe(0.5)
  })

  it('un lienzo excepcionalmente lleno de decoraciones nunca lanza — último recurso, el centro', () => {
    let layers: InvitationLayer[] = []
    for (let i = 0; i < 20; i++) layers.push(decorationLayer('emoji', 0.5, 0.5))
    expect(() => findFreeDecorationLayerPosition(newEmojiLayer(), layers)).not.toThrow()
  })

  it('sigue siendo un objeto independiente: la función solo devuelve una posición, no ata ni fusiona nada', () => {
    const pos = findFreeDecorationLayerPosition(newEmojiLayer(), [decorationLayer('emoji', 0.3, 0.3)])
    expect(typeof pos.x).toBe('number')
    expect(typeof pos.y).toBe('number')
  })
})
