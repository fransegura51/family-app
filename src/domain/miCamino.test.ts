import { describe, expect, it } from 'vitest'
import {
  MI_CAMINO_LAP_POINTS,
  MI_CAMINO_WORLD_POINTS,
  miCaminoFigureSlots,
  miCaminoPosition,
  miCaminoProgressText,
  miCaminoShareScene,
} from '@/domain/miCamino'
import { memberLifetimePoints, memberPointsBalance } from '@/domain/rewards'

describe('Mi Camino — mundo, vuelta y posición a partir del total de puntos', () => {
  it('constantes: tres mundos de 150, circuito de 450', () => {
    expect(MI_CAMINO_WORLD_POINTS).toBe(150)
    expect(MI_CAMINO_LAP_POINTS).toBe(450)
  })

  it.each([
    // total, mundo, vuelta, puntos en el mundo, desde el comienzo de la vuelta
    [0, 0, 1, 0, 0],
    [15, 0, 1, 15, 0],
    [149, 0, 1, 149, 0],
    [150, 1, 1, 0, 0],
    [299, 1, 1, 149, 0],
    [300, 2, 1, 0, 0],
    [449, 2, 1, 149, 0],
    [450, 0, 2, 0, 450],
    [599, 0, 2, 149, 450],
    [600, 1, 2, 0, 450],
    [749, 1, 2, 149, 450],
    [750, 2, 2, 0, 450],
    [899, 2, 2, 149, 450],
    [900, 0, 3, 0, 900],
    [1349, 2, 3, 149, 900],
    [1350, 0, 4, 0, 1350],
  ])('%i puntos → mundo %i, vuelta %i, %i en el mundo, base de vuelta %i (umbrales 149→150, 299→300, 449→450, 599→600, 749→750, 899→900)', (total, world, lap, inWorld, lapBase) => {
    const p = miCaminoPosition(total)
    expect(p.world).toBe(world)
    expect(p.lap).toBe(lap)
    expect(p.pointsInWorld).toBe(inWorld)
    expect(p.lapBase).toBe(lapBase)
    // Mismas fórmulas que el encargo: floor(total/150)%3, floor(total/450)+1, total%150.
    expect(p.world).toBe(Math.floor(total / 150) % 3)
    expect(p.lap).toBe(Math.floor(total / 450) + 1)
    expect(p.pointsInWorld).toBe(total % 150)
  })

  it('pointsToNextWorld nunca es 0: en el primer punto de un mundo faltan 150', () => {
    expect(miCaminoPosition(150).pointsToNextWorld).toBe(150)
    expect(miCaminoPosition(149).pointsToNextWorld).toBe(1)
    expect(miCaminoPosition(15).pointsToNextWorld).toBe(135)
  })

  it('el total nunca se reinicia ni se recorta: 1000 puntos siguen siendo 1000', () => {
    const p = miCaminoPosition(1000)
    expect(p.total).toBe(1000)
    expect(p.lap).toBe(3)
    expect(p.pointsInLap).toBe(100)
  })

  it('datos raros (negativos, NaN, decimales) no rompen nada', () => {
    expect(miCaminoPosition(-30).total).toBe(0)
    expect(miCaminoPosition(Number.NaN).total).toBe(0)
    expect(miCaminoPosition(Infinity).total).toBe(0)
    expect(miCaminoPosition(149.9).total).toBe(149)
  })

  it('texto de progreso con singular y plural', () => {
    expect(miCaminoProgressText(15)).toBe('135 puntos para el siguiente mundo · vuelta 1')
    expect(miCaminoProgressText(149)).toBe('1 punto para el siguiente mundo · vuelta 1')
    expect(miCaminoProgressText(460)).toBe('140 puntos para el siguiente mundo · vuelta 2')
  })
})

describe('Mi Camino — dos niños solo comparten escena si coinciden mundo Y vuelta', () => {
  it('mismo mundo y misma vuelta → juntos', () => {
    expect(miCaminoShareScene(20, 140)).toBe(true)
    expect(miCaminoShareScene(455, 590)).toBe(true)
  })
  it('mismo tipo de mundo pero vuelta distinta → NO juntos', () => {
    expect(miCaminoShareScene(20, 470)).toBe(false) // Golosinas vuelta 1 vs vuelta 2
    expect(miCaminoShareScene(160, 610)).toBe(false) // Submarino vuelta 1 vs vuelta 2
    expect(miCaminoShareScene(310, 760)).toBe(false) // Espacio vuelta 1 vs vuelta 2
  })
  it('distinto mundo → no juntos', () => {
    expect(miCaminoShareScene(149, 150)).toBe(false)
    expect(miCaminoShareScene(449, 450)).toBe(false)
  })
})

describe('Mi Camino — empates: nadie se dibuja encima de otro', () => {
  it('un niño solo: sin desplazamiento ni «empate»', () => {
    expect(miCaminoFigureSlots([40])).toEqual([{ dx: 0, dy: 0, tied: false }])
  })
  it('dos niños en el mismo punto: exactamente el desplazamiento aprobado del prototipo (−49/−24 y +49/+24)', () => {
    expect(miCaminoFigureSlots([15, 15])).toEqual([
      { dx: -49, dy: -24, tied: true },
      { dx: 49, dy: 24, tied: true },
    ])
  })
  it('a menos de 2 puntos cuenta como empate; a 2 o más, no', () => {
    expect(miCaminoFigureSlots([15, 16.5]).every((s) => s.tied)).toBe(true)
    expect(miCaminoFigureSlots([15, 17]).every((s) => !s.tied)).toBe(true)
  })
  it('el orden original se respeta dentro del empate, sea cual sea el orden de las posiciones', () => {
    const slots = miCaminoFigureSlots([30, 30.4])
    expect(slots[0].dx).toBeLessThan(slots[1].dx)
  })
  it('tres niños empatados se reparten en abanico sin coincidir', () => {
    const slots = miCaminoFigureSlots([15, 15, 15])
    expect(new Set(slots.map((s) => s.dx)).size).toBe(3)
    expect(slots.every((s) => s.tied)).toBe(true)
    expect(slots[1].dx).toBe(0)
  })
  it('un empate no afecta a quien va aparte', () => {
    const slots = miCaminoFigureSlots([15, 15, 100])
    expect(slots[0].tied && slots[1].tied).toBe(true)
    expect(slots[2]).toEqual({ dx: 0, dy: 0, tied: false })
  })
})

describe('Mi Camino — el recorrido sale de los puntos GANADOS, nunca del saldo (canjear no hace retroceder)', () => {
  const completions = [{ memberId: 'e', pointsAwarded: 100 }]
  const grants = [{ memberId: 'e', amount: 60 }]
  const redemptions = [{ memberId: 'e', pointsSpent: 120, status: 'aprobada' }]

  it('con puntos canjeados, el saldo baja pero el camino se queda donde estaba', () => {
    const lifetime = memberLifetimePoints('e', completions, grants)
    const balance = memberPointsBalance('e', completions, redemptions, grants)
    expect(lifetime).toBe(160)
    expect(balance).toBe(40)
    expect(miCaminoPosition(lifetime).world).toBe(1) // 160 puntos → ya en el Reino Submarino
    expect(miCaminoPosition(balance).world).toBe(0) // el saldo NO es lo que mide el camino
  })
})
