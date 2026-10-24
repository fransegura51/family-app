import { describe, expect, it } from 'vitest'
import {
  adjustmentWouldMakeBalanceNegative,
  canAdjustGrant,
  grantEffectiveAmount,
  grantStatus,
  isOriginalGrant,
  memberLifetimePoints,
  memberMonthlyRacePoints,
  memberPointsBalance,
} from '@/domain/rewards'
import { miCaminoPosition } from '@/domain/miCamino'

type Kind = 'concesion' | 'correccion' | 'anulacion'
const g = (id: string, amount: number, kind: Kind = 'concesion', reversesGrantId: string | null = null, createdAt = '2026-10-23T10:00:00Z', memberId = 'e') => ({
  id,
  memberId,
  amount,
  kind,
  reversesGrantId,
  createdAt,
})

describe('Corregir y anular puntos — cantidad vigente de una concesión', () => {
  it('sin correcciones, lo vigente es la cantidad original', () => {
    const all = [g('a', 10)]
    expect(grantEffectiveAmount(all[0], all)).toBe(10)
    expect(grantStatus(all[0], all)).toBe('vigente')
  })
  it('una corrección suma su diferencia: 10 → 7 deja 7 y «corregida»', () => {
    const all = [g('a', 10), g('c1', -3, 'correccion', 'a')]
    expect(grantEffectiveAmount(all[0], all)).toBe(7)
    expect(grantStatus(all[0], all)).toBe('corregida')
  })
  it('varias correcciones encadenadas: 10 → 7 → 12', () => {
    const all = [g('a', 10), g('c1', -3, 'correccion', 'a'), g('c2', 5, 'correccion', 'a')]
    expect(grantEffectiveAmount(all[0], all)).toBe(12)
  })
  it('volver a la cantidad original cuenta como vigente, no como corregida', () => {
    const all = [g('a', 10), g('c1', -3, 'correccion', 'a'), g('c2', 3, 'correccion', 'a')]
    expect(grantStatus(all[0], all)).toBe('vigente')
  })
  it('una anulación deja 0 y «anulada»; entonces ya no se puede corregir ni anular otra vez', () => {
    const all = [g('a', 10), g('c1', -3, 'correccion', 'a'), g('n1', -7, 'anulacion', 'a')]
    expect(grantEffectiveAmount(all[0], all)).toBe(0)
    expect(grantStatus(all[0], all)).toBe('anulada')
    expect(canAdjustGrant(all[0], all)).toBe(false)
  })
  it('las correcciones de una concesión no afectan a otra', () => {
    const all = [g('a', 10), g('b', 4), g('n1', -10, 'anulacion', 'a')]
    expect(grantEffectiveAmount(all[1], all)).toBe(4)
    expect(canAdjustGrant(all[1], all)).toBe(true)
  })
})

describe('Corregir y anular puntos — qué admite «Corregir puntos» / «Anular concesión»', () => {
  it('solo una concesión original positiva: nunca una corrección ni una anulación', () => {
    expect(isOriginalGrant(g('a', 10))).toBe(true)
    expect(isOriginalGrant(g('c', -3, 'correccion', 'a'))).toBe(false)
    expect(isOriginalGrant(g('n', -10, 'anulacion', 'a'))).toBe(false)
    expect(canAdjustGrant(g('c', 3, 'correccion', 'a'), [])).toBe(false)
  })
})

describe('Corregir y anular puntos — saldo coherente', () => {
  it('descontar más de lo que queda de saldo lo deja en negativo (bloqueado); subir o igualar, no', () => {
    expect(adjustmentWouldMakeBalanceNegative(2, -3)).toBe(true)
    expect(adjustmentWouldMakeBalanceNegative(3, -3)).toBe(false)
    expect(adjustmentWouldMakeBalanceNegative(0, 5)).toBe(false)
    expect(adjustmentWouldMakeBalanceNegative(0, 0)).toBe(false)
  })
})

describe('Corregir y anular puntos — saldo, Mi Camino y canjes', () => {
  const completions = [{ memberId: 'e', pointsAwarded: 20 }]
  const redemptions = [{ memberId: 'e', pointsSpent: 15, status: 'aprobada' }]

  it('anular una concesión por error baja el saldo Y el recorrido de Mi Camino', () => {
    const before = [g('a', 140)] // concesión por error de 140 → 160 puntos en total → Reino Submarino
    const after = [...before, g('n1', -140, 'anulacion', 'a')]
    expect(memberLifetimePoints('e', completions, before)).toBe(160)
    expect(miCaminoPosition(memberLifetimePoints('e', completions, before)).world).toBe(1)
    expect(memberLifetimePoints('e', completions, after)).toBe(20)
    expect(miCaminoPosition(memberLifetimePoints('e', completions, after))).toMatchObject({ world: 0, lap: 1, pointsInWorld: 20 })
    expect(memberPointsBalance('e', completions, [], after)).toBe(20)
  })

  it('corregir 140 → 100 hace retroceder el muñeco a su sitio correcto (de Submarino a Golosinas)', () => {
    const all = [g('a', 140), g('c1', -40, 'correccion', 'a')]
    expect(memberLifetimePoints('e', completions, all)).toBe(120)
    expect(miCaminoPosition(120).world).toBe(0)
  })

  it('los canjes bajan el saldo pero NUNCA el recorrido de Mi Camino, con o sin correcciones', () => {
    const all = [g('a', 140), g('c1', -40, 'correccion', 'a')]
    expect(memberLifetimePoints('e', completions, all)).toBe(120)
    expect(memberPointsBalance('e', completions, redemptions, all)).toBe(105)
    // El recorrido sigue sumando solo lo ganado: es igual al saldo SIN canjes.
    expect(memberLifetimePoints('e', completions, all)).toBe(memberPointsBalance('e', completions, [], all))
  })

  it('un canje rechazado no cuenta; uno pendiente reserva puntos (saldo) sin tocar el recorrido', () => {
    const all = [g('a', 10)]
    expect(memberPointsBalance('e', completions, [{ memberId: 'e', pointsSpent: 30, status: 'pendiente' }], all)).toBe(0)
    expect(memberPointsBalance('e', completions, [{ memberId: 'e', pointsSpent: 30, status: 'rechazada' }], all)).toBe(30)
    expect(memberLifetimePoints('e', completions, all)).toBe(30)
  })

  it('las correcciones de un niño no tocan los puntos de otro', () => {
    const all = [g('a', 10), g('b', 10, 'concesion', null, '2026-10-23T10:00:00Z', 'f'), g('n1', -10, 'anulacion', 'a')]
    expect(memberLifetimePoints('e', [], all)).toBe(0)
    expect(memberLifetimePoints('f', [], all)).toBe(10)
  })
})

describe('Corregir y anular puntos — Carrera mensual: la corrección cuenta en el mes de la concesión original', () => {
  it('anular en noviembre una concesión de octubre baja octubre, no deja negativo noviembre', () => {
    const all = [g('a', 10, 'concesion', null, '2026-10-30T10:00:00Z'), g('n1', -10, 'anulacion', 'a', '2026-11-02T09:00:00Z')]
    expect(memberMonthlyRacePoints('e', '2026-10', [], all)).toBe(0)
    expect(memberMonthlyRacePoints('e', '2026-11', [], all)).toBe(0)
  })
  it('la concesión sin corregir sigue contando en su mes, y un mes sin movimientos no cambia', () => {
    const all = [g('a', 10, 'concesion', null, '2026-10-30T10:00:00Z'), g('b', 5, 'concesion', null, '2026-11-01T10:00:00Z')]
    expect(memberMonthlyRacePoints('e', '2026-10', [], all)).toBe(10)
    expect(memberMonthlyRacePoints('e', '2026-11', [], all)).toBe(5)
  })
  it('filas antiguas sin id ni referencia (formato previo) siguen sumando por su propia fecha', () => {
    expect(memberMonthlyRacePoints('e', '2026-10', [], [{ memberId: 'e', amount: 7, createdAt: '2026-10-05T00:00:00Z' }])).toBe(7)
  })
  it('una corrección cuyo original no se encuentra cuenta por su propia fecha (nunca se pierde)', () => {
    const all = [g('c1', -3, 'correccion', 'desconocida', '2026-11-02T09:00:00Z')]
    expect(memberMonthlyRacePoints('e', '2026-11', [], all)).toBe(-3)
  })
})
