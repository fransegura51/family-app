import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/food', () => ({
  setMenuEntry: vi.fn(),
  updateMenuEntry: vi.fn(),
  addRecipeIngredientsToShoppingList: vi.fn(),
}))
vi.mock('@/data/shopping', () => ({ addShoppingItem: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/data/calendar', () => ({ createEvent: vi.fn().mockResolvedValue(undefined) }))

import { createEvent } from '@/data/calendar'
import { addShoppingItem } from '@/data/shopping'
import { NOT_UNDERSTOOD, runTalk, type TalkDeps } from '@/pepa/talk'

const TODAY = new Date(2026, 8, 20) // domingo 20 de septiembre de 2026

function makeDeps(overrides: Partial<TalkDeps> = {}): TalkDeps {
  return {
    today: () => TODAY,
    kitchen: vi.fn().mockResolvedValue(null),
    storeNames: vi.fn().mockResolvedValue(['Mercadona', 'Aldi']),
    members: vi.fn().mockResolvedValue([
      { id: 'm-eric', name: 'Eric' },
      { id: 'm-jen', name: 'Jennifer' },
    ]),
    answerCalendar: vi.fn().mockResolvedValue('Hoy no tienes nada.'),
    answerShopping: vi.fn().mockResolvedValue('En la lista: leche.'),
    classifyWithAi: vi.fn().mockResolvedValue({ intent: 'none', explicitDate: null, when: 'today', memberHint: null, storeHint: null, nowOnly: false }),
    answerFromAi: vi.fn().mockResolvedValue('Respuesta de la IA.'),
    splitWithAi: vi.fn().mockRejectedValue(new Error('sin IA')),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
})

describe('runTalk: primero reglas', () => {
  it('Cocina va antes que nada', async () => {
    const deps = makeDeps({ kitchen: vi.fn().mockResolvedValue({ kind: 'answer', text: 'Para la cena de hoy: Tortilla.' }) })
    expect(await runTalk('¿qué cenamos hoy?', deps)).toEqual({ kind: 'answer', text: 'Para la cena de hoy: Tortilla.' })
    expect(deps.answerCalendar).not.toHaveBeenCalled()
    expect(deps.classifyWithAi).not.toHaveBeenCalled()
  })

  it('preguntar por el calendario usa las reglas y no la IA', async () => {
    const deps = makeDeps()
    expect(await runTalk('¿qué tengo mañana?', deps)).toEqual({ kind: 'answer', text: 'Hoy no tienes nada.' })
    expect(deps.answerCalendar).toHaveBeenCalledWith('¿qué tengo mañana?')
    expect(deps.classifyWithAi).not.toHaveBeenCalled()
  })

  it('preguntar por la compra', async () => {
    const deps = makeDeps()
    expect(await runTalk('qué hay en la lista de la compra de Mercadona', deps)).toEqual({ kind: 'answer', text: 'En la lista: leche.' })
    expect(deps.answerShopping).toHaveBeenCalledWith('qué hay en la lista de la compra de Mercadona', ['Mercadona', 'Aldi'])
  })

  it('borrar no está soportado', async () => {
    const outcome = await runTalk('borra la cita del nueve de septiembre', makeDeps())
    expect(outcome).toMatchObject({ kind: 'answer' })
    expect((outcome as { text: string }).text).toContain('Borrar')
  })
})

describe('runTalk: escribir siempre con tarjeta', () => {
  it('añadir a la compra propone y no guarda nada', async () => {
    const outcome = await runTalk('añade leche, huevos y pan a Mercadona', makeDeps())
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(outcome.text).toContain('leche, huevos, pan')
    expect(addShoppingItem).not.toHaveBeenCalled()

    const view = outcome.proposal.preview(outcome.proposal.initialSelection)
    expect(view.lines).toEqual(['Tienda: Mercadona'])
    await outcome.proposal.confirm(outcome.proposal.initialSelection)
    expect(addShoppingItem).toHaveBeenCalledTimes(3)
    expect(addShoppingItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'huevos', store: 'Mercadona' }))
  })

  it('una tienda que no está dada de alta, dicha al final, también se reconoce', async () => {
    const deps = makeDeps({ storeNames: vi.fn().mockResolvedValue([]) })
    const outcome = await runTalk('Añade leche, huevos y pan a Mercadona', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(outcome.text).toContain('de Mercadona: leche, huevos, pan')
    expect(outcome.proposal.preview(outcome.proposal.initialSelection).lines).toEqual(['Tienda: Mercadona'])
    expect(deps.classifyWithAi).not.toHaveBeenCalled()
    expect(addShoppingItem).not.toHaveBeenCalled()
  })

  it('una lista dictada de un tirón se separa con IA si hace falta', async () => {
    const deps = makeDeps({ splitWithAi: vi.fn().mockResolvedValue(['patata', 'lechuga', 'lentejas']) })
    const outcome = await runTalk('apunta patata lechuga lentejas en la lista de la compra', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(deps.splitWithAi).toHaveBeenCalledWith('patata lechuga lentejas')
    expect(outcome.text).toContain('patata, lechuga, lentejas')
  })

  it('si la IA falla al separar, se deja como un producto y sigue con tarjeta', async () => {
    const outcome = await runTalk('apunta patata lechuga en la lista de la compra', makeDeps())
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(outcome.text).toContain('patata lechuga')
  })

  it('solo la tienda abre su lista, sin escribir', async () => {
    expect(await runTalk('Mercadona', makeDeps())).toEqual({ kind: 'focus-store', store: 'Mercadona', text: 'Aquí tienes la lista de la compra de Mercadona.' })
    expect(addShoppingItem).not.toHaveBeenCalled()
  })

  it('apuntar en el calendario propone y no guarda nada', async () => {
    const outcome = await runTalk('el viernes a las cinco dentista de Eric', makeDeps())
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(outcome.text).toContain('«Dentista»')
    expect(outcome.text).toContain('17:00')
    expect(outcome.text).toContain('Eric')
    expect(createEvent).not.toHaveBeenCalled()

    const view = outcome.proposal.preview(outcome.proposal.initialSelection)
    expect(view.lines).toContain('Día: el viernes, 25 de septiembre')
    await outcome.proposal.confirm(outcome.proposal.initialSelection)
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dentista', allDay: false, memberIds: ['m-eric'] }))
  })

  it('cancelar la tarjeta (no confirmar) no escribe nada', async () => {
    await runTalk('mañana a las 10:30 reunión del cole', makeDeps())
    await runTalk('añade pan a la compra', makeDeps())
    expect(createEvent).not.toHaveBeenCalled()
    expect(addShoppingItem).not.toHaveBeenCalled()
  })
})

describe('runTalk: IA solo si las reglas no bastan, y solo para preguntas', () => {
  it('una frase que las reglas no entienden se prueba con la IA', async () => {
    const deps = makeDeps({
      classifyWithAi: vi.fn().mockResolvedValue({ intent: 'tasks_today', explicitDate: '2027-09-09', when: 'today', memberHint: null, storeHint: null, nowOnly: false }),
    })
    expect(await runTalk('cómo lo tengo para esa fecha rara', deps)).toEqual({ kind: 'answer', text: 'Respuesta de la IA.' })
    expect(deps.classifyWithAi).toHaveBeenCalledWith('cómo lo tengo para esa fecha rara', '2026-09-20')
    expect(deps.answerFromAi).toHaveBeenCalled()
  })

  it('si la IA no entiende, Pepa lo dice', async () => {
    expect(await runTalk('hola pepa', makeDeps())).toEqual({ kind: 'answer', text: NOT_UNDERSTOOD })
  })

  it('si la IA falla (apagada, cuenta no adulta, sin red), Pepa sigue funcionando', async () => {
    const deps = makeDeps({ classifyWithAi: vi.fn().mockRejectedValue(new Error('IA no disponible')) })
    expect(await runTalk('hola pepa', deps)).toEqual({ kind: 'answer', text: NOT_UNDERSTOOD })
  })

  it('la IA nunca produce una escritura', async () => {
    const deps = makeDeps({
      classifyWithAi: vi.fn().mockResolvedValue({ intent: 'shopping_list', explicitDate: null, when: 'today', memberHint: null, storeHint: null, nowOnly: false }),
      answerFromAi: vi.fn().mockResolvedValue('En la lista: leche.'),
    })
    const outcome = await runTalk('borrar todo y apuntar cosas raras', deps)
    expect(outcome.kind).not.toBe('proposal')
    expect(addShoppingItem).not.toHaveBeenCalled()
    expect(createEvent).not.toHaveBeenCalled()
  })
})
