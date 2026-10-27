import { describe, expect, it } from 'vitest'
import { changeClassSplitMode, classSharesOf, classSplitFromShares, mainClassOf, NO_CLASS, resolveClassSplit, startClassSplit, toggleClassSplit, totalsByClass } from './classShares'
import { movementFieldValues, type MovementDraft } from './movementForm'

// CLASIF-1 — reparto de un gasto entre varias clasificaciones. Caso real: Amazon 47,97 € = Ropa y calzado 40,98 € + pegatinas 6,99 €.
const ROPA = 'Ropa y calzado'
const PEGATINAS = 'Papelería y manualidades'
const VERDURA = 'Verdura'
const sum = (shares: { amount: number }[]) => Math.round(shares.reduce((s, x) => s + x.amount * 100, 0))

describe('reparto por importes (el caso real de Amazon)', () => {
  it('40,98 + 6,99 = 47,97 → válido y suma exacta', () => {
    const draft = { ids: [ROPA, PEGATINAS], mode: 'amount' as const, inputs: { [ROPA]: '40,98', [PEGATINAS]: '6.99' } }
    const r = resolveClassSplit(draft, 47.97)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.shares).toEqual([{ className: ROPA, amount: 40.98 }, { className: PEGATINAS, amount: 6.99 }])
      expect(sum(r.shares)).toBe(4797)
    }
  })

  it('exige que la suma coincida EXACTAMENTE con el gasto, con un mensaje que habla de clasificaciones', () => {
    const low = resolveClassSplit({ ids: [ROPA, PEGATINAS], mode: 'amount', inputs: { [ROPA]: '40.98', [PEGATINAS]: '6.98' } }, 47.97)
    expect(low).toEqual({ ok: false, error: 'Faltan 0,01 € por repartir.' })
    const high = resolveClassSplit({ ids: [ROPA, PEGATINAS], mode: 'amount', inputs: { [ROPA]: '41', [PEGATINAS]: '6.99' } }, 47.97)
    expect(high).toEqual({ ok: false, error: 'Te pasas 0,02 €.' })
    const zero = resolveClassSplit({ ids: [ROPA, PEGATINAS], mode: 'amount', inputs: { [ROPA]: '47.97', [PEGATINAS]: '' } }, 47.97)
    expect(zero).toEqual({ ok: false, error: 'Escribe un importe mayor que cero en cada clasificación.' })
  })
})

describe('reparto por porcentajes y a partes iguales', () => {
  it('porcentajes: 85 % / 15 % de 47,97 € suma exacto; si no suman 100 % se avisa', () => {
    const ok = resolveClassSplit({ ids: [ROPA, PEGATINAS], mode: 'percent', inputs: { [ROPA]: '85', [PEGATINAS]: '15' } }, 47.97)
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(sum(ok.shares)).toBe(4797)
    const bad = resolveClassSplit({ ids: [ROPA, PEGATINAS], mode: 'percent', inputs: { [ROPA]: '80', [PEGATINAS]: '15' } }, 47.97)
    expect(bad).toEqual({ ok: false, error: 'Los porcentajes suman 95,00 %: tienen que sumar 100 %.' })
    const none = resolveClassSplit({ ids: [ROPA, PEGATINAS], mode: 'percent', inputs: { [ROPA]: '100', [PEGATINAS]: '' } }, 47.97)
    expect(none).toEqual({ ok: false, error: 'Escribe un porcentaje mayor que cero en cada clasificación.' })
  })

  it('partes iguales: 100 € entre 3 = 33,34 · 33,33 · 33,33 (los céntimos que sobran, a las primeras)', () => {
    const r = resolveClassSplit(startClassSplit([ROPA, PEGATINAS, VERDURA], 100), 100)
    expect(r.ok && r.shares.map((s) => s.amount)).toEqual([33.34, 33.33, 33.33])
  })

  it('cambiar de modo conserva lo repartido (euros ↔ %) y la suma sigue siendo exacta', () => {
    const start = { ids: [ROPA, PEGATINAS], mode: 'amount' as const, inputs: { [ROPA]: '40.98', [PEGATINAS]: '6.99' } }
    const asPercent = changeClassSplitMode(start, 'percent', 47.97)
    const r = resolveClassSplit(asPercent, 47.97)
    expect(r.ok).toBe(true)
    if (r.ok) expect(sum(r.shares)).toBe(4797)
  })

  it('un importe 0 o sin escribir no se puede repartir todavía', () => {
    expect(resolveClassSplit(startClassSplit([ROPA, PEGATINAS], NaN), NaN)).toEqual({ ok: false, error: 'Escribe primero el importe del movimiento para poder repartirlo.' })
  })

  it('con menos de dos clasificaciones no hay reparto (una sola funciona como siempre)', () => {
    expect(resolveClassSplit(null, 10)).toEqual({ ok: true, shares: [] })
    expect(resolveClassSplit({ ids: [ROPA], mode: 'equal', inputs: {} }, 10)).toEqual({ ok: true, shares: [] })
    expect(toggleClassSplit({ ids: [ROPA, PEGATINAS], mode: 'equal', inputs: {} }, PEGATINAS, 10)).toBeNull()
  })
})

describe('lectura del reparto de un gasto', () => {
  const amazon = { id: 'amz', amount: 47.97, productClassification: ROPA }

  it('sin filas: la clasificación única recibe el 100 %; sin clasificación, «Sin clasificar»', () => {
    expect(classSharesOf(amazon, undefined)).toEqual([{ className: ROPA, amount: 47.97 }])
    expect(classSharesOf({ ...amazon, productClassification: null }, new Map())).toEqual([{ className: NO_CLASS, amount: 47.97 }])
  })

  it('con reparto: cada parte a su clasificación y lo no repartido a «Sin clasificar» (nunca se pierde ni inventa dinero)', () => {
    const full = new Map([['amz', [{ className: ROPA, amount: 40.98 }, { className: PEGATINAS, amount: 6.99 }]]])
    expect(sum(classSharesOf(amazon, full))).toBe(4797)
    const partial = new Map([['amz', [{ className: ROPA, amount: 30 }, { className: PEGATINAS, amount: 6.99 }]]])
    const out = classSharesOf(amazon, partial)
    expect(out).toContainEqual({ className: NO_CLASS, amount: 10.98 })
    expect(sum(out)).toBe(4797)
  })

  it('totales por clasificación: un gasto repartido cuenta una sola vez en el total y una vez en cada clasificación', () => {
    const byExpense = new Map([['amz', [{ className: ROPA, amount: 40.98 }, { className: PEGATINAS, amount: 6.99 }]]])
    const totals = totalsByClass([amazon, { id: 'otro', amount: 10, productClassification: ROPA }], byExpense)
    expect(totals.get(ROPA)).toEqual({ total: 50.98, count: 2 })
    expect(totals.get(PEGATINAS)).toEqual({ total: 6.99, count: 1 })
    const grand = [...totals.values()].reduce((s, t) => s + Math.round(t.total * 100), 0)
    expect(grand).toBe(4797 + 1000) // = suma de los gastos, sin duplicar
  })

  it('la clasificación principal es la de mayor parte (a igualdad, la primera)', () => {
    expect(mainClassOf([{ className: PEGATINAS, amount: 6.99 }, { className: ROPA, amount: 40.98 }])).toBe(ROPA)
    expect(mainClassOf([{ className: PEGATINAS, amount: 5 }, { className: ROPA, amount: 5 }])).toBe(PEGATINAS)
    expect(mainClassOf([])).toBeNull()
  })

  it('al abrir un gasto con reparto el editor parte de sus importes reales', () => {
    const d = classSplitFromShares([{ className: ROPA, amount: 40.98 }, { className: PEGATINAS, amount: 6.99 }])
    expect(d).toEqual({ ids: [ROPA, PEGATINAS], mode: 'amount', inputs: { [ROPA]: '40.98', [PEGATINAS]: '6.99' } })
    expect(classSplitFromShares([{ className: ROPA, amount: 47.97 }])).toBeNull()
  })
})

describe('formulario de movimiento: la clasificación repartida convive con categoría y etiquetas', () => {
  const base: MovementDraft = {
    isIncome: false,
    expenseCategory: 'Compras y familia',
    incomeCategory: null,
    date: '2026-10-16',
    amount: '47.97',
    store: 'Amazon',
    productClassification: ROPA,
    classSplit: { ids: [ROPA, PEGATINAS], mode: 'amount', inputs: { [ROPA]: '40.98', [PEGATINAS]: '6.99' } },
    tagId: 'tag-comun',
    tagSplit: null,
    notes: '',
    isFixedOverride: null,
  }

  it('guarda UN gasto con la clasificación principal y el reparto; la categoría y la etiqueta no cambian', () => {
    const v = movementFieldValues(base)
    expect(v.classSplitError).toBeNull()
    expect(v.classShares).toEqual([{ className: ROPA, amount: 40.98 }, { className: PEGATINAS, amount: 6.99 }])
    expect(v.productClassification).toBe(ROPA)
    expect(v.tagId).toBe('tag-comun')
    expect(v.amount).toBe(47.97)
  })

  it('si el reparto no suma el importe, no se debe guardar (error) y no se escribe ninguna clasificación parcial', () => {
    const v = movementFieldValues({ ...base, amount: '50' })
    expect(v.classSplitError).toContain('Faltan')
    expect(v.classShares).toEqual([])
  })

  it('sin reparto, lo de siempre: una sola clasificación y ningún reparto', () => {
    const v = movementFieldValues({ ...base, classSplit: null, productClassification: PEGATINAS })
    expect(v.classShares).toEqual([])
    expect(v.productClassification).toBe(PEGATINAS)
  })
})
