import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Una "base de datos" en memoria: lo único que puede escribir Economía por voz son estas dos funciones.
const db = vi.hoisted(() => ({
  budgets: [] as Record<string, unknown>[],
  categories: [] as Record<string, unknown>[],
  mode: 'compartido' as 'compartido' | 'separado',
  calls: [] as string[],
  created: [] as Record<string, unknown>[],
}))

vi.mock('@/data/bank', () => ({ listBankConnections: vi.fn() }))
vi.mock('@/data/family', () => ({
  getAccountsMode: async () => db.mode,
  getFinanceMonthStartDay: async () => 1,
  listFamilyMembers: vi.fn(),
}))
vi.mock('@/data/finance', () => ({
  listBudgets: async () => db.budgets.map((b) => ({ ...b })),
  listBudgetCategories: async () => db.categories,
  listExpenses: async () => [],
  createBudget: async (input: Record<string, unknown>) => {
    db.calls.push('create')
    db.created.push(input)
    db.budgets.push({
      id: `b${db.budgets.length + 1}`,
      familyId: 'f',
      periodType: input.periodType,
      periodStart: input.periodStart,
      category: input.category || null,
      amount: input.amount,
      budgetGroup: input.budgetGroup,
      ownerMemberId: input.ownerMemberId === undefined ? 'me' : input.ownerMemberId,
    })
  },
  updateBudgetAmount: async (id: string, amount: number) => {
    db.calls.push('update')
    const b = db.budgets.find((x) => x.id === id)
    if (!b) throw new Error('no existe')
    b.amount = amount
  },
}))
vi.mock('@/data/products', () => ({ listAllProductPrices: vi.fn(), listProducts: vi.fn() }))
vi.mock('@/data/receipts', () => ({ listReceipts: vi.fn() }))
vi.mock('@/data/shoppingStores', () => ({ listShoppingStores: vi.fn() }))
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

import { baseQuery } from '@/domain/financeQuery'
import { CATEGORIES, REST, TODAY, cat, financeData, exp, EXPENSES } from '@/domain/financeTestData'
import { handleDialogReply, pendingBlockingCount, registerDialog, resetDialogRegistry } from '@/pepa/dialog'
import { FINANCE_WRITE_REFUSED, forgetFinanceContext, handleFinanceText, rememberFinanceQuery } from '@/pepa/finance'
import { forgetBudgetActions, handleBudgetAction, type BudgetActionDeps } from '@/pepa/financeActions'
import { createPepaOutput } from '@/pepa/output'
import type { ActionProposal, Selection } from '@/pepa/actions/types'
import { NOT_UNDERSTOOD, runTalk, type TalkDeps } from '@/pepa/talk'
import type { BudgetIntentOutput } from '../../supabase/functions/_shared/ai/purposes/financeBudgetIntentCore.ts'

const REST_CREATED = 'Presupuesto creado: Restaurantes, bares y cafeterías, 300,00 € al mes (septiembre de 2026).'

function resetDb(): void {
  db.budgets = []
  db.calls = []
  db.created = []
  db.mode = 'compartido'
  db.categories = [
    ...CATEGORIES,
    cat('inc', 'Nómina', null, { budgetGroup: 'ingresos' }),
    cat('o1', 'Ocio y cultura', null, { necessity: 'quiero', isFixed: false }),
    cat('o2', 'Ocio en casa', null, { necessity: 'quiero', isFixed: false }),
    cat('g1', 'Gimnasio', null, { necessity: 'quiero', isFixed: true }),
  ] as unknown as Record<string, unknown>[]
}

const budgetRow = (over: Record<string, unknown>) => ({ id: 'b0', familyId: 'f', periodType: 'mensual', periodStart: '2026-09-01', category: REST, amount: 400, budgetGroup: 'generales', ownerMemberId: 'me', ...over })

// Lo mismo que hace la pantalla de voz en cada turno, con la tarjeta de confirmación simulada (mismo registro
// de diálogos que ActionConfirmSheet).
function makeSession(opts: { interpret?: BudgetActionDeps['interpret'] } = {}) {
  let card: { proposal: ActionProposal; selection: Selection; unregister: () => void } | null = null
  const interpret = vi.fn(opts.interpret ?? (async () => null))
  const budgetDeps: BudgetActionDeps = {
    canAccess: async () => true,
    load: async () => ({ categories: db.categories as never, budgets: db.budgets as never, monthStartDay: 1, accountsMode: db.mode }),
    interpret,
    record: vi.fn(),
    onSaved: (category) => rememberFinanceQuery(baseQuery('budget_left', { target: category })),
  }
  const closeCard = () => {
    card?.unregister()
    card = null
  }
  const talkDeps: TalkDeps = {
    today: () => TODAY,
    kitchen: async () => null,
    financeAction: (text) => handleBudgetAction(text, TODAY, budgetDeps),
    finance: (text) =>
      handleFinanceText(text, TODAY, {
        canAccess: async () => true,
        load: async (_t, needBudgets) => financeData({ expenses: [...EXPENSES, exp('2026-09-15', 10, 'Gimnasio')], categories: db.categories as never, budgets: needBudgets ? (db.budgets as never) : undefined, accountsMode: db.mode }),
        ai: async () => null,
        record: () => {},
      }),
    forgetFinance: () => {
      forgetFinanceContext()
      forgetBudgetActions()
    },
    storeNames: async () => ['Mercadona'],
    members: async () => [],
    answerCalendar: async () => 'No hay nada en el calendario.',
    answerShopping: async () => 'En la lista de la compra hay: leche.',
    classifyWithAi: async () => ({ intent: 'none', explicitDate: null, when: 'today', memberHint: null, storeHint: null, nowOnly: false }),
    answerFromAi: async () => null,
    splitWithAi: async () => [],
  }
  return {
    interpret,
    get card() {
      return card
    },
    preview: () => (card ? card.proposal.preview(card.selection) : null),
    setField: (id: string, value: string) => {
      if (card) card.selection = { ...card.selection, values: { ...card.selection.values, [id]: value } }
    },
    choose: (id: string, key: string) => {
      if (card) card.selection = { ...card.selection, choices: { ...card.selection.choices, [id]: key } }
    },
    // Botón "Confirmar" de la tarjeta.
    async pressConfirm(): Promise<string> {
      if (!card) throw new Error('no hay tarjeta')
      const message = await card.proposal.confirm(card.selection)
      closeCard()
      return message
    },
    async turn(text: string): Promise<string> {
      const reply = await handleDialogReply(text)
      if (reply.handled) return reply.message ?? ''
      const hadPending = pendingBlockingCount() > 0
      const outcome = await runTalk(text, talkDeps)
      let spoken = outcome.text
      if (hadPending && outcome.kind === 'answer' && !outcome.keepPending && outcome.text !== NOT_UNDERSTOOD) {
        closeCard()
        spoken = `${outcome.text} He cerrado lo que tenía pendiente, sin guardar nada.`
      }
      if (outcome.kind === 'proposal') {
        closeCard()
        const proposal = outcome.proposal
        const selection = { ...proposal.initialSelection }
        const unregister = registerDialog(() => ({
          kind: 'action-card',
          actionId: proposal.actionId,
          confirm: async () => {
            const message = await proposal.confirm(card?.selection ?? selection)
            closeCard()
            return message
          },
          cancel: () => {
            closeCard()
            return 'Vale, no lo guardo.'
          },
        }))
        card = { proposal, selection, unregister }
      }
      return spoken
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  resetDialogRegistry()
  forgetFinanceContext()
  forgetBudgetActions()
  resetDb()
})
afterEach(() => {
  resetDialogRegistry()
  vi.useRealTimers()
})

describe('crear un presupuesto', () => {
  it('crear -> cancelar: la base de datos queda intacta', async () => {
    const s = makeSession()
    const text = await s.turn('Pepa, crea un presupuesto de 300 euros para restaurantes este mes.')
    expect(text).toContain('Preparo un presupuesto de 300,00 € al mes para Restaurantes, bares y cafeterías')
    expect(text).toContain('pulsa Confirmar')
    expect(s.preview()?.lines).toEqual(['Categoría: Restaurantes, bares y cafeterías', 'Mes: septiembre de 2026 (mes contable)'])
    // Tarjeta pendiente = una propuesta: todavía no hay nada guardado.
    expect(db.budgets).toHaveLength(0)
    expect(await s.turn('cancela')).toBe('Vale, no lo guardo.')
    expect(s.card).toBeNull()
    expect(db.budgets).toHaveLength(0)
    expect(db.calls).toEqual([])
  })

  it('crear -> confirmar: un solo registro, con lo que enseñaba la tarjeta', async () => {
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    expect(await s.turn('sí')).toBe(REST_CREATED)
    expect(db.budgets).toHaveLength(1)
    expect(db.created[0]).toEqual({ periodType: 'mensual', periodStart: '2026-09-01', category: REST, amount: 300, budgetGroup: 'generales' })
    // Un segundo "sí" no vuelve a guardar nada.
    expect(await s.turn('sí')).toBe('No tengo nada pendiente que confirmar.')
    expect(db.budgets).toHaveLength(1)
  })

  it.each(['sí', 'confirmar', 'hazlo', 'vale', 'adelante'])('la confirmación "%s" guarda', async (word) => {
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    expect(await s.turn(word)).toBe(REST_CREATED)
    expect(db.budgets).toHaveLength(1)
  })

  it('el botón Confirmar de la tarjeta hace lo mismo (y solo una vez aunque se repita)', async () => {
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    expect(await s.pressConfirm()).toBe(REST_CREATED)
    expect(db.budgets).toHaveLength(1)
  })

  it('el presupuesto general (sin categoría)', async () => {
    const s = makeSession()
    await s.turn('Crea un presupuesto general de 2000 euros este mes')
    expect(s.preview()?.lines[0]).toBe('Categoría: General (todo el gasto)')
    expect(await s.turn('confirmar')).toBe('Presupuesto creado: General, 2.000,00 € al mes (septiembre de 2026).')
    expect(db.created[0].category).toBe('')
  })

  it('el mes que viene usa el mes contable siguiente', async () => {
    const s = makeSession()
    await s.turn('Crea un presupuesto de 150 euros para ocio y cultura el mes que viene')
    expect(s.preview()?.lines[1]).toBe('Mes: octubre de 2026 (mes contable)')
    await s.turn('sí')
    expect(db.created[0].periodStart).toBe('2026-10-01')
  })
})

describe('modificar un presupuesto', () => {
  beforeEach(() => {
    db.budgets = [budgetRow({})]
  })

  it('modificar -> cancelar: intacto', async () => {
    const s = makeSession()
    const text = await s.turn('Cambia el presupuesto de restaurantes a 250 euros')
    // Sin decir el mes, primero pregunta; contestando, la tarjeta enseña el cambio.
    expect(text).toBe('¿Mensual, para este mes (septiembre de 2026)?')
    const ready = await s.turn('sí')
    expect(ready).toContain('Ya tienes un presupuesto de Restaurantes, bares y cafeterías de 400,00 € para septiembre de 2026. Preparo el cambio a 250,00 € al mes.')
    expect(s.preview()?.title).toBe('💶 Cambiar presupuesto')
    expect(s.preview()?.lines).toContain('Ahora: 400,00 € al mes')
    await s.turn('cancela')
    expect(db.budgets[0].amount).toBe(400)
    expect(db.calls).toEqual([])
  })

  it('modificar -> confirmar: el valor correcto, sin duplicar', async () => {
    const s = makeSession()
    await s.turn('Cambia el presupuesto de restaurantes a 250 euros este mes')
    expect(await s.turn('hazlo')).toBe('Presupuesto de Restaurantes, bares y cafeterías cambiado a 250,00 € al mes (antes 400,00 €) para septiembre de 2026.')
    expect(db.budgets).toHaveLength(1)
    expect(db.budgets[0].amount).toBe(250)
    expect(db.calls).toEqual(['update'])
  })

  it('el mismo importe no cambia nada ni abre tarjeta', async () => {
    const s = makeSession()
    const text = await s.turn('Pon el presupuesto de restaurantes a 400 euros este mes')
    expect(text).toContain('Ya tienes ese presupuesto')
    expect(s.card).toBeNull()
    expect(db.calls).toEqual([])
  })

  it('si el presupuesto aparece mientras se piensa, se cambia en vez de duplicarse', async () => {
    db.budgets = []
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    db.budgets.push(budgetRow({ amount: 500 }))
    await s.turn('sí')
    expect(db.budgets).toHaveLength(1)
    expect(db.budgets[0].amount).toBe(300)
    expect(db.calls).toEqual(['update'])
  })
})

describe('conversación', () => {
  it('"Pon 300 euros para restaurantes" -> "¿Mensual?" -> "Sí" -> tarjeta (nada guardado)', async () => {
    const s = makeSession()
    expect(await s.turn('Pon 300 euros para restaurantes.')).toBe('¿Mensual, para este mes (septiembre de 2026)?')
    expect(db.budgets).toHaveLength(0)
    const card = await s.turn('Sí')
    expect(card).toContain('Preparo un presupuesto de 300,00 € al mes')
    expect(s.card).not.toBeNull()
    expect(db.budgets).toHaveLength(0)
    await s.turn('confirmar')
    expect(db.budgets).toHaveLength(1)
  })

  it('"Mejor 250" actualiza la PROPUESTA (todavía no guarda); "Confirmar" guarda 250', async () => {
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    const text = await s.turn('Mejor 250')
    expect(text).toBe('Vale, lo dejo en 250,00 € al mes. Todavía no he guardado nada: revisa la tarjeta y pulsa Confirmar.')
    expect(s.preview()?.lines).toContain('Mes: septiembre de 2026 (mes contable)')
    expect(s.card?.selection.values?.amount).toBe('250')
    expect(db.budgets).toHaveLength(0)
    expect(await s.turn('Confirmar')).toBe('Presupuesto creado: Restaurantes, bares y cafeterías, 250,00 € al mes (septiembre de 2026).')
    expect(db.budgets).toHaveLength(1)
    expect(db.budgets[0].amount).toBe(250)
  })

  it('varios ajustes seguidos y una frase que no es un ajuste', async () => {
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    await s.turn('mejor 250')
    await s.turn('que sean 280 euros')
    expect(s.card?.selection.values?.amount).toBe('280')
    expect(await s.turn('mejor unos 250')).toContain('No me ha quedado claro el importe')
    expect(s.card?.selection.values?.amount).toBe('280')
    expect(db.budgets).toHaveLength(0)
  })

  it('el importe editado a mano en la tarjeta es el que se guarda; uno inválido no guarda nada', async () => {
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    s.setField('amount', '320,50')
    expect(await s.turn('sí')).toBe('Presupuesto creado: Restaurantes, bares y cafeterías, 320,50 € al mes (septiembre de 2026).')
    expect(db.budgets[0].amount).toBe(320.5)

    resetDb()
    const t = makeSession()
    await t.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    t.setField('amount', 'abc')
    expect(t.preview()?.warnings[0]).toContain('El importe no es válido')
    await expect(t.pressConfirm()).rejects.toThrow('El importe no es válido')
    t.setField('amount', '-5')
    await expect(t.pressConfirm()).rejects.toThrow('El importe no es válido')
    expect(db.budgets).toHaveLength(0)
  })

  it('nueva tarea con una propuesta abierta: se cierra sin guardar y un "sí" posterior no confirma nada', async () => {
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    const text = await s.turn('¿Qué tengo mañana?')
    expect(text).toBe('No hay nada en el calendario. He cerrado lo que tenía pendiente, sin guardar nada.')
    expect(s.card).toBeNull()
    expect(await s.turn('sí')).toBe('No tengo nada pendiente que confirmar.')
    expect(db.budgets).toHaveLength(0)
    // Y el borrador olvidado no se puede "ajustar".
    expect(await s.turn('mejor 250')).toBe(NOT_UNDERSTOOD)
  })

  it('"mejor 250" sin ninguna tarjeta de presupuesto abierta no hace nada', async () => {
    const s = makeSession()
    expect(await s.turn('mejor 250')).toBe(NOT_UNDERSTOOD)
    expect(db.budgets).toHaveLength(0)
  })

  it('una pregunta pendiente se abandona con otra tarea, sin guardar', async () => {
    const s = makeSession()
    expect(await s.turn('Pon 300 euros para restaurantes')).toBe('¿Mensual, para este mes (septiembre de 2026)?')
    expect(await s.turn('¿Qué tengo mañana?')).toBe('No hay nada en el calendario.')
    expect(await s.turn('sí')).toBe('No tengo nada pendiente que confirmar.')
    expect(db.budgets).toHaveLength(0)
  })

  it('preguntar el periodo y decir "no" cancela', async () => {
    const s = makeSession()
    await s.turn('Pon 300 euros para restaurantes')
    expect(await s.turn('no')).toBe('Vale, no preparo ningún presupuesto.')
    expect(db.budgets).toHaveLength(0)
    expect(await s.turn('sí')).toBe('No tengo nada pendiente que confirmar.')
  })

  it('falta el importe: lo pregunta y sigue', async () => {
    const s = makeSession()
    expect(await s.turn('Ponme un presupuesto para restaurantes este mes')).toBe('¿De cuántos euros?')
    expect(await s.turn('trescientos euros')).toContain('Preparo un presupuesto de 300,00 € al mes')
    expect(db.budgets).toHaveLength(0)
  })

  it('falta la categoría: la pregunta y sigue', async () => {
    const s = makeSession()
    expect(await s.turn('Crea un presupuesto de 300 euros este mes')).toBe('¿Para qué categoría es el presupuesto?')
    expect(await s.turn('restaurantes')).toContain('Preparo un presupuesto de 300,00 € al mes para Restaurantes')
  })

  it('después de guardar, "¿cuánto me queda?" usa el presupuesto nuevo', async () => {
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    await s.turn('confirmar')
    expect(await s.turn('¿Cuánto me queda?')).toBe('Os quedan 210,00 € del presupuesto de Restaurantes, bares y cafeterías (300,00 € al mes; lleváis 90,00 € en septiembre de 2026).')
    expect(await s.turn('¿Cuánto me queda del presupuesto de restaurantes?')).toContain('Os quedan 210,00 €')
  })

  it('consulta de presupuestos sin ninguno / pasado de presupuesto', async () => {
    const s = makeSession()
    expect(await s.turn('¿Cuánto me queda del presupuesto?')).toBe('Todavía no hay ningún presupuesto para septiembre de 2026.')
    db.budgets = [budgetRow({ amount: 60 }), budgetRow({ id: 'b9', category: 'Gimnasio', amount: 50 })]
    expect(await s.turn('¿Cuánto me queda del presupuesto de restaurantes?')).toContain('Os habéis pasado 30,00 € del presupuesto de Restaurantes, bares y cafeterías')
    const all = await s.turn('¿Cómo van los presupuestos?')
    expect(all).toContain('Presupuestos de septiembre de 2026:')
    expect(all).toContain('• Os quedan 40,00 € del presupuesto de Gimnasio')
  })
})

describe('validación contra lo real', () => {
  it('categoría inexistente: lo dice y no prepara nada', async () => {
    const s = makeSession()
    const text = await s.turn('Crea un presupuesto de 300 euros para veterinario este mes')
    expect(text).toBe('No tengo ninguna categoría de gasto llamada «veterinario». Si quieres, créala primero en Economía y luego te preparo el presupuesto.')
    expect(s.card).toBeNull()
    expect(db.budgets).toHaveLength(0)
    expect(await s.turn('sí')).toBe('No tengo nada pendiente que confirmar.')
  })

  it('categoría de ingresos o traspasos internos: no es de gasto', async () => {
    const s = makeSession()
    expect(await s.turn('Crea un presupuesto de 300 euros para nómina este mes')).toBe('«Nómina» no es una categoría de gasto: los presupuestos son de gasto.')
    expect(await s.turn('Crea un presupuesto de 300 euros para transferencias entre cuentas propias este mes')).toContain('No tengo ninguna categoría de gasto')
    expect(db.budgets).toHaveLength(0)
  })

  it('categoría equivalente existente: "restaurantes" es "Restaurantes, bares y cafeterías", no una nueva', async () => {
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para los restaurantes este mes')
    await s.turn('sí')
    expect(db.created[0].category).toBe(REST)
    expect(db.categories.filter((c) => c.name === REST)).toHaveLength(1)
  })

  it('categoría ambigua: pregunta cuál y solo sigue con una respuesta clara', async () => {
    const s = makeSession()
    expect(await s.turn('Crea un presupuesto de 100 euros para ocio este mes')).toBe('¿Cuál de estas categorías: Ocio y cultura, Ocio en casa?')
    expect(await s.turn('ocio')).not.toContain('Preparo')
    const card = await s.turn('la de cultura')
    expect(card).toContain('Preparo un presupuesto de 100,00 € al mes para Ocio y cultura')
  })

  it('importe ambiguo: no prepara hasta que se aclara', async () => {
    const s = makeSession()
    expect(await s.turn('Crea un presupuesto de 300 o 400 euros para restaurantes este mes')).toBe('No me ha quedado claro el importe. ¿De cuántos euros exactamente?')
    expect(await s.turn('unos 300')).toBe('No me ha quedado claro el importe. ¿De cuántos euros exactamente?')
    expect(await s.turn('300')).toContain('Preparo un presupuesto de 300,00 €')
    expect(db.budgets).toHaveLength(0)
  })

  it.each(['Crea un presupuesto de -50 euros para restaurantes este mes', 'Crea un presupuesto de cero euros para restaurantes este mes'])('importe inválido: "%s"', async (phrase) => {
    const s = makeSession()
    expect(await s.turn(phrase)).toBe('Ese importe no es válido. Dime una cantidad de euros mayor que cero.')
    expect(await s.turn('200')).toContain('Preparo un presupuesto de 200,00 €')
  })

  it('periodo no soportado: semanal pregunta si lo hace mensual; otros meses, no', async () => {
    const s = makeSession()
    expect(await s.turn('Crea un presupuesto semanal de 50 euros para restaurantes')).toBe('De momento solo preparo presupuestos mensuales, no semanales. ¿Lo hago mensual?')
    expect(await s.turn('sí')).toContain('Preparo un presupuesto de 50,00 € al mes')
    expect(await s.turn('cancela')).toBe('Vale, no lo guardo.')
    expect(await s.turn('Crea un presupuesto de 300 euros para restaurantes en octubre')).toBe('De momento solo preparo presupuestos de este mes o del mes que viene.')
    expect(db.budgets).toHaveLength(0)
  })

  it('modo Separado: la tarjeta deja elegir Individual o Común y Común guarda sin dueño', async () => {
    db.mode = 'separado'
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    expect(s.preview()?.choices[0].options.map((o) => o.label)).toEqual(['Individual (tuyo)', 'Común (de todos)'])
    s.choose('scope', 'comun')
    await s.turn('sí')
    expect(db.created[0]).toEqual({ periodType: 'mensual', periodStart: '2026-09-01', category: REST, amount: 300, budgetGroup: 'generales', ownerMemberId: null })
    // Y lo individual (con dueño) es otro presupuesto distinto, sin tocar el común.
    const t = makeSession()
    await t.turn('Crea un presupuesto de 100 euros para restaurantes este mes')
    await t.turn('sí')
    expect(db.budgets).toHaveLength(2)
    expect(db.budgets.map((b) => b.ownerMemberId)).toEqual([null, 'me'])
  })

  it('la categoría borrada mientras se pensaba: no se guarda', async () => {
    const s = makeSession()
    await s.turn('Crea un presupuesto de 300 euros para gimnasio este mes')
    db.categories = db.categories.filter((c) => c.name !== 'Gimnasio')
    await expect(s.pressConfirm()).rejects.toThrow('ya no existe')
    expect(db.budgets).toHaveLength(0)
  })
})

describe('lo que NO se hace', () => {
  it.each(['Transfiere 500 euros a Eric', 'Pepa, traspasa 200 euros a la cuenta de Lucía', 'Haz un bizum de 30 euros', 'Paga 100 euros de la luz', 'Retira 300 euros del banco'])('"%s" se rechaza', async (phrase) => {
    const s = makeSession()
    expect(await s.turn(phrase)).toBe('No puedo hacer transferencias, pagos ni ninguna operación bancaria: eso solo puedes hacerlo tú, desde tu banco.')
    expect(s.card).toBeNull()
    expect(db.calls).toEqual([])
  })

  it('reclasificar un gasto ("este gasto") no se ejecuta: no hay movimiento seleccionado y nunca se adivina', async () => {
    const s = makeSession()
    for (const phrase of ['Cambia este gasto a Restauración', 'Cambia el gasto de Mercadona a ocio', 'Etiqueta este gasto como trabajo']) {
      expect(await s.turn(phrase), phrase).toBe(FINANCE_WRITE_REFUSED)
    }
    expect(s.card).toBeNull()
    expect(db.calls).toEqual([])
  })

  it('crear una categoría, borrar o apuntar un gasto tampoco se hace desde aquí', async () => {
    const s = makeSession()
    for (const phrase of ['Crea una categoría que se llame Gimnasio', 'Borra el gasto de ayer', 'Apunta un gasto de 30 euros en restaurantes']) {
      expect(await s.turn(phrase), phrase).toBe(FINANCE_WRITE_REFUSED)
    }
    expect(db.calls).toEqual([])
  })
})

describe('IA: solo estructura', () => {
  it('con la categoría sin ubicar por reglas, la IA la estructura; el código la resuelve y sigue pidiendo confirmación', async () => {
    const out: BudgetIntentOutput = { intent: 'budget_set', category: 'restaurantes', general: false, amount: 200, period: 'this_month' }
    const s = makeSession({ interpret: async () => out })
    const text = await s.turn('Crea un presupuesto de 200 euros para comer fuera en restaurantes este mes')
    expect(s.interpret).toHaveBeenCalledTimes(1)
    expect(s.interpret.mock.calls[0]).toEqual(['Crea un presupuesto de 200 euros para comer fuera en restaurantes este mes', TODAY])
    expect(text).toContain('Preparo un presupuesto de 200,00 € al mes para Restaurantes')
    expect(db.budgets).toHaveLength(0)
    await s.turn('sí')
    expect(db.budgets).toHaveLength(1)
  })

  it('si las reglas bastan, no se llama a la IA', async () => {
    const s = makeSession({ interpret: async () => null })
    await s.turn('Crea un presupuesto de 300 euros para restaurantes este mes')
    expect(s.interpret).not.toHaveBeenCalled()
  })

  it('si la IA no sirve, se dice sin adivinar y no se prepara nada', async () => {
    const s = makeSession({ interpret: async () => null })
    const text = await s.turn('Crea un presupuesto de 200 euros para comer fuera de casa este mes')
    expect(text).toContain('No tengo ninguna categoría de gasto llamada')
    expect(s.card).toBeNull()
  })

  it('aunque la IA "resuelva" algo que no existe, el código lo rechaza', async () => {
    const out: BudgetIntentOutput = { intent: 'budget_set', category: 'viajes', general: false, amount: 200, period: 'this_month' }
    const s = makeSession({ interpret: async () => out })
    const text = await s.turn('Crea un presupuesto de 200 euros para viajes este mes')
    expect(text).toContain('No tengo ninguna categoría de gasto llamada «viajes»')
    expect(s.card).toBeNull()
    expect(db.budgets).toHaveLength(0)
  })
})

describe('respuesta final por la capa única (voz)', () => {
  it.each([
    ['Hablando', 'voice', 1],
    ['Por escrito', 'text', 0],
  ] as const)('%s: las preguntas, las tarjetas y las confirmaciones de presupuesto', async (_name, mode, spokenTimes) => {
    const spoken: string[] = []
    const shown: string[] = []
    const output = createPepaOutput({ getMode: () => mode, show: (t) => void shown.push(t), engine: { supported: () => true, speak: async (t) => void spoken.push(t), prime: () => {} } })
    const s = makeSession()
    const question = await s.turn('Pon 300 euros para restaurantes')
    await output.say(question)
    const card = await s.turn('sí')
    await output.say(card)
    const done = await s.turn('confirmar')
    await output.say(done)
    expect(shown).toEqual([question, card, done])
    expect(spoken).toEqual(spokenTimes ? [question, card, done] : [])
  })
})
