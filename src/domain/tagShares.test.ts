import { describe, expect, it } from 'vitest'
import { changeSplitMode, hasTag, NO_TAG, resolveTagSplit, sharesOf, splitByAmounts, splitByPercent, splitEqual, splitFromShares, startSplit, tagAmount, toCents, toggleSplitTag, totalsByTag, type SharesByExpense } from './tagShares'

const sumCents = (xs: { amount: number }[]) => xs.reduce((s, x) => s + toCents(x.amount), 0)

describe('a partes iguales', () => {
  it('100 € entre 3: los céntimos sueltos van a las primeras y la suma es exacta', () => {
    const r = splitEqual(100, ['a', 'b', 'c'])
    expect(r.map((x) => x.amount)).toEqual([33.34, 33.33, 33.33])
    expect(sumCents(r)).toBe(10000)
  })
  it('0,05 € entre 2 y 0,01 € entre 3 no inventan ni pierden céntimos', () => {
    expect(sumCents(splitEqual(0.05, ['a', 'b']))).toBe(5)
    expect(sumCents(splitEqual(0.01, ['a', 'b', 'c']))).toBe(1)
  })
  it('para cualquier importe y número de etiquetas, siempre suma exacto', () => {
    for (const total of [0.01, 0.99, 1, 7.77, 13.5, 99.99, 1234.56]) for (let n = 1; n <= 12; n++) expect(sumCents(splitEqual(total, Array.from({ length: n }, (_, i) => `t${i}`)))).toBe(toCents(total))
  })
})

describe('por importes en euros', () => {
  it('el ejemplo: 100 € = 60 + 30 + 10', () => {
    const r = splitByAmounts(100, [{ tagId: 'comun', amount: '60' }, { tagId: 'eric', amount: '30' }, { tagId: 'vac', amount: '10' }])
    expect(r).toEqual({ ok: true, shares: [{ tagId: 'comun', amount: 60 }, { tagId: 'eric', amount: 30 }, { tagId: 'vac', amount: 10 }] })
  })
  it('admite coma decimal', () => {
    expect(splitByAmounts(10, [{ tagId: 'a', amount: '2,5' }, { tagId: 'b', amount: '7,50' }]).ok).toBe(true)
  })
  it('si no suma, dice cuánto falta o cuánto sobra', () => {
    expect(splitByAmounts(100, [{ tagId: 'a', amount: '60' }, { tagId: 'b', amount: '30' }])).toEqual({ ok: false, error: 'Faltan 10,00 € por repartir.' })
    expect(splitByAmounts(100, [{ tagId: 'a', amount: '60' }, { tagId: 'b', amount: '45' }])).toEqual({ ok: false, error: 'Te pasas 5,00 €.' })
  })
  it('rechaza importes vacíos, cero o negativos', () => {
    for (const bad of ['', '0', '-3', 'abc']) expect(splitByAmounts(10, [{ tagId: 'a', amount: bad }, { tagId: 'b', amount: '10' }]).ok).toBe(false)
  })
  it('un céntimo de diferencia no se acepta (nada de tolerancias)', () => {
    expect(splitByAmounts(100, [{ tagId: 'a', amount: '60' }, { tagId: 'b', amount: '39.99' }]).ok).toBe(false)
  })
})

describe('por porcentajes', () => {
  it('60 / 30 / 10 % de 100 € = 60 / 30 / 10 €', () => {
    const r = splitByPercent(100, [{ tagId: 'a', percent: '60' }, { tagId: 'b', percent: '30' }, { tagId: 'c', percent: '10' }])
    expect(r).toEqual({ ok: true, shares: [{ tagId: 'a', amount: 60 }, { tagId: 'b', amount: 30 }, { tagId: 'c', amount: 10 }] })
  })
  it('redondeos: 33,33 / 33,33 / 33,34 % de 100 € suman 100 € exactos', () => {
    const r = splitByPercent(100, [{ tagId: 'a', percent: '33.33' }, { tagId: 'b', percent: '33.33' }, { tagId: 'c', percent: '33.34' }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(sumCents(r.shares)).toBe(10000)
  })
  it('un importe con muchos decimales (47,63 €) repartido 70/30 suma exacto', () => {
    const r = splitByPercent(47.63, [{ tagId: 'a', percent: '70' }, { tagId: 'b', percent: '30' }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(sumCents(r.shares)).toBe(4763)
  })
  it('los porcentajes deben sumar 100', () => {
    expect(splitByPercent(100, [{ tagId: 'a', percent: '60' }, { tagId: 'b', percent: '30' }])).toEqual({ ok: false, error: 'Los porcentajes suman 90,00 %: tienen que sumar 100 %.' })
  })
})

describe('el borrador del formulario', () => {
  it('con una sola etiqueta no hay reparto', () => {
    expect(resolveTagSplit(null, 50)).toEqual({ ok: true, shares: [] })
    expect(resolveTagSplit({ ids: ['a'], mode: 'equal', inputs: {} }, 50)).toEqual({ ok: true, shares: [] })
  })
  it('al añadir la segunda etiqueta parte de un reparto igualitario que se puede cambiar', () => {
    const s = startSplit(['a', 'b'], 100)
    expect(s.mode).toBe('equal')
    expect(resolveTagSplit(s, 100)).toEqual({ ok: true, shares: [{ tagId: 'a', amount: 50 }, { tagId: 'b', amount: 50 }] })
  })
  it('sin importe todavía no se puede repartir y lo dice', () => {
    expect(resolveTagSplit(startSplit(['a', 'b'], NaN), NaN).ok).toBe(false)
  })
  it('euros ↔ porcentajes conservan lo repartido', () => {
    const euros = { ids: ['a', 'b'], mode: 'amount' as const, inputs: { a: '75', b: '25' } }
    const pct = changeSplitMode(euros, 'percent', 100)
    expect(pct.inputs).toEqual({ a: '75.00', b: '25.00' })
    const back = changeSplitMode(pct, 'amount', 200)
    expect(back.inputs).toEqual({ a: '150.00', b: '50.00' })
  })
  it('quitar etiquetas hasta quedar una vuelve al modo sencillo (null)', () => {
    const s = startSplit(['a', 'b', 'c'], 90)
    const two = toggleSplitTag(s, 'c', 90)
    expect(two?.ids).toEqual(['a', 'b'])
    expect(toggleSplitTag(two!, 'b', 90)).toBeNull()
  })
  it('un movimiento ya repartido se abre en «en euros» con sus importes reales', () => {
    const s = splitFromShares([{ tagId: 'a', amount: 60 }, { tagId: 'b', amount: 40 }])
    expect(s).toEqual({ ids: ['a', 'b'], mode: 'amount', inputs: { a: '60.00', b: '40.00' } })
    expect(splitFromShares([{ tagId: 'a', amount: 100 }])).toBeNull()
  })
})

describe('estadísticas por etiqueta sin duplicar', () => {
  const byExpense: SharesByExpense = new Map([
    ['e1', [{ tagId: 'comun', amount: 60 }, { tagId: 'eric', amount: 30 }, { tagId: 'vac', amount: 10 }]],
  ])
  const e1 = { id: 'e1', amount: 100, tagId: 'comun' }
  const e2 = { id: 'e2', amount: 50, tagId: 'eric' }
  const e3 = { id: 'e3', amount: 20, tagId: null }

  it('un movimiento sin reparto da el 100 % a su etiqueta (o a «Sin etiqueta»), igual que antes', () => {
    expect(sharesOf(e2, byExpense)).toEqual([{ tagId: 'eric', amount: 50 }])
    expect(sharesOf(e3, byExpense)).toEqual([{ tagId: NO_TAG, amount: 20 }])
  })
  it('cada etiqueta recibe solo su parte', () => {
    expect(tagAmount(e1, byExpense, 'comun')).toBe(60)
    expect(tagAmount(e1, byExpense, 'eric')).toBe(30)
    expect(tagAmount(e1, byExpense, 'otra')).toBe(0)
    expect(hasTag(e1, byExpense, 'vac')).toBe(true)
    expect(hasTag(e1, byExpense, 'otra')).toBe(false)
  })
  it('la suma de todas las etiquetas es el total de los movimientos: el movimiento repartido no se cuenta dos veces', () => {
    const totals = totalsByTag([e1, e2, e3], byExpense)
    expect([...totals].reduce((s, [, v]) => s + toCents(v.total), 0)).toBe(toCents(170))
    expect(totals.get('comun')).toEqual({ total: 60, count: 1 })
    expect(totals.get('eric')).toEqual({ total: 80, count: 2 })
    expect(totals.get(NO_TAG)).toEqual({ total: 20, count: 1 })
  })
  it('si falta parte del reparto (una etiqueta borrada), el resto cuenta como «Sin etiqueta»: no se pierde dinero', () => {
    const partial: SharesByExpense = new Map([['e1', [{ tagId: 'comun', amount: 60 }, { tagId: 'eric', amount: 30 }]]])
    expect(sharesOf(e1, partial)).toEqual([{ tagId: 'comun', amount: 60 }, { tagId: 'eric', amount: 30 }, { tagId: NO_TAG, amount: 10 }])
  })
})
