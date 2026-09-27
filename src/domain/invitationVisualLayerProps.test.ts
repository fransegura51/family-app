import { describe, expect, it } from 'vitest'
import { autoArrangeLayers, estimateLayerBoxFraction } from '@/domain/events'
import type { InvitationLayer } from '@/domain/types'

// Fase 3 Bloque 3 — nuevas propiedades opcionales de capa (opacity, photoMask) no deben desaparecer al
// recolocar con "Pepa, hazla bonita" (autoArrangeLayers ya las conserva por construcción — arranged.push
// hace spread del objeto completo y solo sobreescribe x/y/rotation/scale — este test lo deja verificado
// explícitamente para estas dos propiedades concretas, igual que ya se hizo para textAlign/bold/italic en
// el Bloque 2, invitationTextDataFields.test.ts).

function layer(type: InvitationLayer['type'], overrides: Partial<InvitationLayer> = {}): InvitationLayer {
  return { id: 'l1', type, x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 1, ...overrides }
}

describe('autoArrangeLayers conserva opacity/photoMask/shapeKey — "Pepa, hazla bonita" no toca estilo visual', () => {
  const zone = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }

  it('una forma con opacity y color explícitos los conserva tras recolocarse', () => {
    const layers: InvitationLayer[] = [layer('shape', { shapeKey: 'corazon', color: '#ff0000', opacity: 0.4, fontSize: 60 })]
    const result = autoArrangeLayers(layers, zone)
    const out = result.layers.find((l) => l.id === 'l1')!
    expect(out.opacity).toBe(0.4)
    expect(out.shapeKey).toBe('corazon')
    expect(out.color).toBe('#ff0000')
  })

  it('una foto con photoMask="circle" la conserva tras recolocarse', () => {
    const layers: InvitationLayer[] = [layer('photo', { photoPath: 'a/b.jpg', photoMask: 'circle', fontSize: 130 })]
    const result = autoArrangeLayers(layers, zone)
    const out = result.layers.find((l) => l.id === 'l1')!
    expect(out.photoMask).toBe('circle')
    expect(out.photoPath).toBe('a/b.jpg')
  })

  it('una forma/foto SIN opacity/photoMask (capas antiguas) sigue sin tenerlos tras recolocarse — no se inventan', () => {
    const layers: InvitationLayer[] = [layer('shape', { shapeKey: 'estrella' }), layer('photo', { id: 'l2', photoPath: 'x.jpg' })]
    const result = autoArrangeLayers(layers, zone)
    expect(result.layers.find((l) => l.id === 'l1')!.opacity).toBeUndefined()
    expect(result.layers.find((l) => l.id === 'l2')!.photoMask).toBeUndefined()
  })
})

describe('estimateLayerBoxFraction no cambia de tamaño por opacity/photoMask (son puramente visuales, no de layout)', () => {
  it('una forma con y sin opacity mide exactamente igual', () => {
    const opaca = estimateLayerBoxFraction(layer('shape', { fontSize: 60 }), 0.8)
    const transparente = estimateLayerBoxFraction(layer('shape', { fontSize: 60, opacity: 0.3 }), 0.8)
    expect(transparente).toEqual(opaca)
  })

  it('una foto con y sin máscara de círculo mide exactamente igual (la máscara no cambia el tamaño, solo el recorte visual)', () => {
    const normal = estimateLayerBoxFraction(layer('photo', { fontSize: 130 }), 0.8)
    const circular = estimateLayerBoxFraction(layer('photo', { fontSize: 130, photoMask: 'circle' }), 0.8)
    expect(circular).toEqual(normal)
  })
})
