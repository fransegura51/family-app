import { describe, expect, it } from 'vitest'
import { planBankLinks } from './bankReconciliation'
import type { DupExpense } from './duplicateDetection'

const own = (o: Partial<DupExpense> & Pick<DupExpense, 'id'>): DupExpense => ({ expenseDate: '2026-08-14', amount: 48.75, store: 'Mercadona', source: 'ticket', isIncome: false, paymentMethod: null, hasPurchase: true, hasCashLink: false, ...o })
const bank = (o: Partial<DupExpense> & Pick<DupExpense, 'id'>): DupExpense => ({ expenseDate: '2026-08-14', amount: 48.75, store: 'MERCADONA CALLOSA DEL SEG-ALMAJAL (CAMI', source: 'banco', isIncome: false, paymentMethod: null, hasPurchase: false, hasCashLink: false, ...o })

// Los 15 avisos históricos de producción: tickets de Mercadona (jun-ago 2026) y su cargo del banco, mismo importe, 0-2 días de diferencia.
const REAL_15: [number, string, string][] = [
  [211.93, '2026-06-11', '2026-06-12'], [37.16, '2026-06-16', '2026-06-16'], [108.79, '2026-06-20', '2026-06-22'], [91.57, '2026-06-25', '2026-06-25'], [87.81, '2026-06-29', '2026-06-29'],
  [65.46, '2026-07-04', '2026-07-06'], [86.54, '2026-07-09', '2026-07-09'], [79.15, '2026-07-15', '2026-07-15'], [96.01, '2026-07-18', '2026-07-20'], [87.19, '2026-07-22', '2026-07-22'],
  [80.75, '2026-07-31', '2026-07-31'], [120.08, '2026-08-03', '2026-08-03'], [65.95, '2026-08-08', '2026-08-10'], [120.53, '2026-08-11', '2026-08-11'], [48.75, '2026-08-14', '2026-08-14'],
]

describe('conciliación automática compra ↔ banco', () => {
  it('los 15 casos históricos de producción son coincidencias seguras y únicas: se vinculan solos y no quedan avisos', () => {
    const expenses = REAL_15.flatMap(([amount, d1, d2], i) => [own({ id: `t${i}`, amount, expenseDate: d1, store: 'Mercadona' }), bank({ id: `b${i}`, amount, expenseDate: d2, store: 'MERCADONA ALMORADI-ALMORADI' })])
    const plan = planBankLinks(expenses)
    expect(plan.auto).toHaveLength(15)
    expect(plan.confirm).toHaveLength(0)
    expect(plan.auto.map((p) => p.own.id + p.bank.id)).toEqual(REAL_15.map((_, i) => `t${i}b${i}`))
  })

  it('la fotografía del ticket no cuenta: el plan solo mira importe, fecha y comercio (una compra a mano sin ticket se concilia igual)', () => {
    const plan = planBankLinks([own({ id: 'm', source: 'manual', paymentMethod: 'tarjeta', hasPurchase: true }), bank({ id: 'b' })])
    expect(plan.auto).toHaveLength(1)
  })

  it('una compra ya vinculada (origen ticket_banco) o un apunte del banco con compra propia no vuelven a aparecer', () => {
    expect(planBankLinks([own({ id: 'a', source: 'ticket_banco' }), bank({ id: 'b' })])).toEqual({ auto: [], confirm: [] })
    expect(planBankLinks([own({ id: 'a' }), bank({ id: 'b', hasPurchase: true })])).toEqual({ auto: [], confirm: [] })
  })

  it('fecha algo distinta (4 a 7 días): solo se sugiere, con la duda indicada', () => {
    const plan = planBankLinks([own({ id: 'a', expenseDate: '2026-08-10' }), bank({ id: 'b', expenseDate: '2026-08-14' })])
    expect(plan.auto).toHaveLength(0)
    expect(plan.confirm).toHaveLength(1)
    expect(plan.confirm[0]).toMatchObject({ days: 4, doubt: 'fecha' })
    // a más de 7 días ni se sugiere
    expect(planBankLinks([own({ id: 'a', expenseDate: '2026-08-05' }), bank({ id: 'b', expenseDate: '2026-08-14' })])).toEqual({ auto: [], confirm: [] })
  })

  it('comercio desconocido en uno de los dos: pide confirmación aunque el día y el importe coincidan', () => {
    const plan = planBankLinks([own({ id: 'a', store: null }), bank({ id: 'b' })])
    expect(plan.auto).toHaveLength(0)
    expect(plan.confirm[0].doubt).toBe('comercio_desconocido')
  })

  it('comercio distinto: no es ni sugerencia (dos compras diferentes del mismo importe)', () => {
    expect(planBankLinks([own({ id: 'a', store: 'Ferretería Pepe' }), bank({ id: 'b' })])).toEqual({ auto: [], confirm: [] })
  })

  it('varias coincidencias posibles: no se vincula nada solo (ni la compra ni el cargo) y se pide elegir', () => {
    const twoBanks = planBankLinks([own({ id: 'a' }), bank({ id: 'b1' }), bank({ id: 'b2', expenseDate: '2026-08-13' })])
    expect(twoBanks.auto).toHaveLength(0)
    expect(twoBanks.confirm).toHaveLength(2)
    expect(twoBanks.confirm.every((p) => p.doubt === 'varias_coincidencias')).toBe(true)
    const twoOwns = planBankLinks([own({ id: 'a1' }), own({ id: 'a2' }), bank({ id: 'b' })])
    expect(twoOwns.auto).toHaveLength(0)
    expect(twoOwns.confirm).toHaveLength(2)
  })

  it('efectivo y pagos mixtos NUNCA se emparejan con el banco por el total; tampoco una compra con cartera', () => {
    expect(planBankLinks([own({ id: 'a', paymentMethod: 'efectivo' }), bank({ id: 'b' })])).toEqual({ auto: [], confirm: [] })
    expect(planBankLinks([own({ id: 'a', paymentMethod: 'mixto' }), bank({ id: 'b' })])).toEqual({ auto: [], confirm: [] })
    expect(planBankLinks([own({ id: 'a', hasCashLink: true }), bank({ id: 'b' })])).toEqual({ auto: [], confirm: [] })
    expect(planBankLinks([own({ id: 'a' }), bank({ id: 'b', hasCashLink: true })])).toEqual({ auto: [], confirm: [] })
  })

  it('importe distinto al céntimo no empareja; ingresos y devoluciones no se tocan', () => {
    expect(planBankLinks([own({ id: 'a', amount: 48.74 }), bank({ id: 'b' })])).toEqual({ auto: [], confirm: [] })
    expect(planBankLinks([own({ id: 'a', isIncome: true }), bank({ id: 'b', isIncome: true })])).toEqual({ auto: [], confirm: [] })
  })

  it('«No, son distintas» se recuerda: esa pareja no vuelve y puede dejar a la otra como única', () => {
    const base = [own({ id: 'a' }), bank({ id: 'b1' }), bank({ id: 'b2', expenseDate: '2026-08-13' })]
    expect(planBankLinks(base).auto).toHaveLength(0)
    const plan = planBankLinks(base, [['a', 'b2']])
    expect(plan.auto).toHaveLength(1)
    expect(plan.auto[0].bank.id).toBe('b1')
  })

  it('dos compras iguales de días distintos con su propio cargo cada una se vinculan cada una a su pareja', () => {
    const plan = planBankLinks([
      own({ id: 'a1', expenseDate: '2026-08-01' }), bank({ id: 'b1', expenseDate: '2026-08-01' }),
      own({ id: 'a2', expenseDate: '2026-08-20' }), bank({ id: 'b2', expenseDate: '2026-08-20' }),
    ])
    expect(plan.auto.map((p) => p.own.id + p.bank.id).sort()).toEqual(['a1b1', 'a2b2'])
  })
})
