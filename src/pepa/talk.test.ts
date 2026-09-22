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

  it('productos habituales pegados se separan SIN IA', async () => {
    const deps = makeDeps()
    const outcome = await runTalk('apunta patata lechuga lentejas en la lista de la compra', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(deps.splitWithAi).not.toHaveBeenCalled()
    expect(outcome.text).toContain('patata, lechuga, lentejas')
  })

  it('"leche huevos y pan" (sin comas) son tres productos, sin IA', async () => {
    const deps = makeDeps()
    const outcome = await runTalk('Añade leche huevos y pan a Mercadona', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(outcome.text).toContain('de Mercadona: leche, huevos, pan')
    expect(deps.splitWithAi).not.toHaveBeenCalled()
    expect(deps.classifyWithAi).not.toHaveBeenCalled()
  })

  it('"leche huevo, pan" (la incidencia real) también son tres productos', async () => {
    const deps = makeDeps()
    const outcome = await runTalk('Añade leche huevo, pan a Mercadona', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(outcome.text).toContain('de Mercadona: leche, huevo, pan')
    expect(deps.splitWithAi).not.toHaveBeenCalled()
  })

  it('con palabras desconocidas, una lista dictada de un tirón se separa con IA', async () => {
    const deps = makeDeps({ splitWithAi: vi.fn().mockResolvedValue(['pan Bimbo', 'Puleva']) })
    const outcome = await runTalk('apunta pan Bimbo Puleva en la lista de la compra', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(deps.splitWithAi).toHaveBeenCalledWith('pan Bimbo Puleva')
    expect(outcome.text).toContain('pan Bimbo, Puleva')
  })

  it('una entrada dudosa entre varias no gasta IA', async () => {
    const deps = makeDeps()
    const outcome = await runTalk('apunta leche, pan Bimbo en la lista de la compra', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(deps.splitWithAi).not.toHaveBeenCalled()
    expect(outcome.text).toContain('leche, pan Bimbo')
  })

  it('si la IA falla al separar, se deja como un producto y sigue con tarjeta', async () => {
    const outcome = await runTalk('apunta cepillo dental en la lista de la compra', makeDeps())
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(outcome.text).toContain('cepillo dental')
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

describe('runTalk: posibles duplicados/conflictos de calendario (aviso, nunca bloqueo)', () => {
  it('sin nada parecido en el calendario: comportamiento normal, sin avisos', async () => {
    const deps = makeDeps({ calendarEvents: vi.fn().mockResolvedValue([]) })
    const outcome = await runTalk('el viernes a las 17:00 dentista de Eric', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    const view = outcome.proposal.preview(outcome.proposal.initialSelection)
    expect(view.warnings).toEqual([])
    expect(view.confirmLabel).toBe('Guardar en el calendario')
    await outcome.proposal.confirm(outcome.proposal.initialSelection)
    expect(createEvent).toHaveBeenCalledTimes(1)
  })

  it('sin deps.calendarEvents (no disponible): no hay aviso, nunca bloquea', async () => {
    const deps = makeDeps() // makeDeps() no pone calendarEvents por defecto
    const outcome = await runTalk('el viernes a las 17:00 dentista de Eric', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(outcome.proposal.preview(outcome.proposal.initialSelection).warnings).toEqual([])
  })

  it('posible duplicado: avisa en la tarjeta pero Guardar sigue disponible y escribe una sola vez', async () => {
    const existingEvent = {
      id: 'ev-1',
      title: 'Dentista',
      startAt: new Date(2026, 8, 25, 17, 0).toISOString(),
      endAt: null,
      allDay: false,
      recurrenceRule: null,
      exceptionDates: [],
      memberIds: ['m-eric'],
    }
    const deps = makeDeps({ calendarEvents: vi.fn().mockResolvedValue([existingEvent]) })
    const outcome = await runTalk('el viernes a las 17:00 dentista de Eric', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')

    const view = outcome.proposal.preview(outcome.proposal.initialSelection)
    expect(view.warnings).toHaveLength(1)
    expect(view.warnings[0]).toContain('Dentista')
    expect(view.warnings[0]).toContain('Eric')
    expect(view.confirmLabel).toBe('Guardar en el calendario') // el botón sigue ahí, nunca se bloquea

    await outcome.proposal.confirm(outcome.proposal.initialSelection)
    expect(createEvent).toHaveBeenCalledTimes(1)
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dentista', memberIds: ['m-eric'] }))
  })

  it('conflicto horario (título distinto, misma hora y destinatarios): avisa pero Guardar sigue disponible', async () => {
    const existingEvent = {
      id: 'ev-2',
      title: 'Reunión del cole',
      startAt: new Date(2026, 8, 25, 17, 0).toISOString(),
      endAt: null,
      allDay: false,
      recurrenceRule: null,
      exceptionDates: [],
      memberIds: ['m-eric'],
    }
    const deps = makeDeps({ calendarEvents: vi.fn().mockResolvedValue([existingEvent]) })
    const outcome = await runTalk('el viernes a las 17:00 dentista de Eric', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')

    const view = outcome.proposal.preview(outcome.proposal.initialSelection)
    expect(view.warnings).toEqual(['Ya tienes «Reunión del cole» a esa misma hora.'])
    expect(view.confirmLabel).toBe('Guardar en el calendario')

    await outcome.proposal.confirm(outcome.proposal.initialSelection)
    expect(createEvent).toHaveBeenCalledTimes(1)
  })

  it('si deps.calendarEvents falla, no hay aviso pero la propuesta sigue funcionando (nunca bloquea)', async () => {
    const deps = makeDeps({ calendarEvents: vi.fn().mockRejectedValue(new Error('sin red')) })
    const outcome = await runTalk('el viernes a las 17:00 dentista de Eric', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    expect(outcome.proposal.preview(outcome.proposal.initialSelection).warnings).toEqual([])
    await outcome.proposal.confirm(outcome.proposal.initialSelection)
    expect(createEvent).toHaveBeenCalledTimes(1)
  })
})

// El aviso no puede quedarse obsoleto si el usuario cambia el destinatario ("Para") DESPUÉS de que la
// tarjeta ya se enseñó — se recalcula en cada `preview`/`confirm` (present() vuelve a llamar a
// findScheduleWarnings con la selección actual), sin ninguna consulta nueva: los eventos ya están en
// ctx.calendarEvents desde que se construyó la propuesta.
describe('runTalk: el aviso de duplicado/conflicto se recalcula si cambia el destinatario en la tarjeta', () => {
  // Evento existente de Jennifer — ni duplicado ni conflicto con algo de Eric, pero SÍ conflicto con
  // "toda la familia" (Jennifer forma parte de toda la familia).
  const jenniferEvent = {
    id: 'ev-jen',
    title: 'Reunión del cole',
    startAt: new Date(2026, 8, 25, 17, 0).toISOString(),
    endAt: null,
    allDay: false,
    recurrenceRule: null,
    exceptionDates: [],
    memberIds: ['m-jen'],
  }

  it('1. toda la familia tiene conflicto → cambiar el destinatario a un miembro sin conflicto hace desaparecer el aviso', async () => {
    const deps = makeDeps({ calendarEvents: vi.fn().mockResolvedValue([jenniferEvent]) })
    // Sin nombrar a nadie: "toda la familia".
    const outcome = await runTalk('el viernes a las 17:00 dentista', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')

    expect(outcome.proposal.preview(outcome.proposal.initialSelection).warnings).toEqual(['Ya tienes «Reunión del cole» a esa misma hora.'])

    const toEric = { ...outcome.proposal.initialSelection, choices: { member: 'm-eric' } }
    expect(outcome.proposal.preview(toEric).warnings).toEqual([]) // Eric no forma parte del evento de Jennifer
  })

  it('2. miembro sin conflicto → cambiar a toda la familia hace aparecer el aviso', async () => {
    const deps = makeDeps({ calendarEvents: vi.fn().mockResolvedValue([jenniferEvent]) })
    const outcome = await runTalk('el viernes a las 17:00 dentista de Eric', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')

    expect(outcome.proposal.preview(outcome.proposal.initialSelection).warnings).toEqual([]) // Eric ≠ Jennifer

    const toWholeFamily = { ...outcome.proposal.initialSelection, choices: { member: 'none' } }
    expect(outcome.proposal.preview(toWholeFamily).warnings).toEqual(['Ya tienes «Reunión del cole» a esa misma hora.'])
  })

  it('3. duplicado → cambiar a un destinatario distinto deja de clasificarse como duplicado', async () => {
    const duplicateOfEric = { ...jenniferEvent, title: 'Dentista', memberIds: ['m-eric'] }
    const deps = makeDeps({ calendarEvents: vi.fn().mockResolvedValue([duplicateOfEric]) })
    const outcome = await runTalk('el viernes a las 17:00 dentista de Eric', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')

    const initial = outcome.proposal.preview(outcome.proposal.initialSelection)
    expect(initial.warnings).toHaveLength(1)
    expect(initial.warnings[0]).toContain('Parece que ya tienes')

    const toJennifer = { ...outcome.proposal.initialSelection, choices: { member: 'm-jen' } }
    expect(outcome.proposal.preview(toJennifer).warnings).toEqual([]) // ya no coinciden los destinatarios: ni duplicado ni conflicto
  })

  it('4. tras cambiar el destinatario y confirmar con el botón: una sola escritura, con el destinatario nuevo', async () => {
    const deps = makeDeps({ calendarEvents: vi.fn().mockResolvedValue([jenniferEvent]) })
    const outcome = await runTalk('el viernes a las 17:00 dentista', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')

    const toEric = { ...outcome.proposal.initialSelection, choices: { member: 'm-eric' } }
    expect(outcome.proposal.preview(toEric).warnings).toEqual([]) // el aviso ya no está antes de guardar
    await outcome.proposal.confirm(toEric) // mismo confirm() que llama el botón "Guardar" (ActionConfirmSheet.confirmNow)
    expect(createEvent).toHaveBeenCalledTimes(1)
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ memberIds: ['m-eric'] }))
  })

  it('5. tras cambiar el destinatario y confirmar por voz "Sí": una sola escritura, con el destinatario nuevo', async () => {
    // La voz "Sí" y el botón "Guardar" convergen en el mismo proposal.confirm(selection) — ver
    // ActionConfirmSheet.confirmNow (F7-003, sin tocar aquí): el botón llama confirmNow() directo, y el
    // registro de diálogo por voz llama exactamente esa misma función. No hay un segundo camino de
    // escritura que probar aparte: confirmar aquí con la selección ya cambiada cubre los dos casos.
    const deps = makeDeps({ calendarEvents: vi.fn().mockResolvedValue([jenniferEvent]) })
    const outcome = await runTalk('el viernes a las 17:00 dentista', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')

    const toEric = { ...outcome.proposal.initialSelection, choices: { member: 'm-eric' } }
    await outcome.proposal.confirm(toEric) // equivalente a decir "sí" con la tarjeta ya en "Eric"
    expect(createEvent).toHaveBeenCalledTimes(1)
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ memberIds: ['m-eric'] }))
  })

  it('la tarjeta de calendario no permite editar fecha/hora (solo "Para"): no hace falta recalcular el aviso por eso', async () => {
    const deps = makeDeps({ calendarEvents: vi.fn().mockResolvedValue([jenniferEvent]) })
    const outcome = await runTalk('el viernes a las 17:00 dentista de Eric', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')
    const view = outcome.proposal.preview(outcome.proposal.initialSelection)
    expect(view.fields).toBeUndefined()
    expect(view.choices.map((c) => c.id)).toEqual(['member'])
  })
})

// Caso real de producción (despliegue d27effa): "Mañana a las siete de la tarde sacar la basura" (aquí,
// con la variante de dictado real "se saca basura") cuando ya existían "Saca basura", "Sacar basura" y
// "Dentista empaste" mañana a las 19:00 para toda la familia. La detección de horario ya funcionaba
// (avisaba 3 veces); lo que faltaba era reconocer que las dos primeras son la MISMA acción.
describe('runTalk: caso real de producción — variantes casi iguales se agrupan en un solo aviso de duplicado', () => {
  const TOMORROW_19H = new Date(2026, 8, 21, 19, 0).toISOString() // 2026-09-21, mañana respecto a TODAY (domingo 20)
  const sacaBasura = { id: 'e-saca', title: 'Saca basura', startAt: TOMORROW_19H, endAt: null, allDay: false, recurrenceRule: null, exceptionDates: [], memberIds: [] }
  const sacarBasura = { ...sacaBasura, id: 'e-sacar', title: 'Sacar basura' }
  const dentistaEmpaste = { ...sacaBasura, id: 'e-dentista', title: 'Dentista empaste' }

  it('un solo aviso de "ya tienes X" para las dos variantes de basura, y uno aparte para el conflicto real', async () => {
    const deps = makeDeps({ calendarEvents: vi.fn().mockResolvedValue([sacaBasura, sacarBasura, dentistaEmpaste]) })
    // Deterministamente, esta frase entera (sin "la") produce el título "Se saca basura" a través del
    // parser real — no hace falta forzar el candidato a mano para reproducir el caso.
    const outcome = await runTalk('Mañana a las 19:00 se saca basura', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')

    const view = outcome.proposal.preview(outcome.proposal.initialSelection)
    expect(view.warnings).toHaveLength(2) // no 3: las dos variantes de basura cuentan como un solo aviso
    expect(view.warnings[0]).toContain('Parece que ya tienes')
    expect(view.warnings[0]).toMatch(/«Saca basura»|«Sacar basura»/)
    expect(view.warnings[1]).toBe('Además tienes «Dentista empaste» a esa misma hora.')
    expect(view.confirmLabel).toBe('Guardar en el calendario') // nunca bloquea

    await outcome.proposal.confirm(outcome.proposal.initialSelection)
    expect(createEvent).toHaveBeenCalledTimes(1) // ninguno de los 3 eventos existentes se toca
  })

  it('cambiar "Para" sigue recalculando bien incluso con el aviso agrupado', async () => {
    const deps = makeDeps({ calendarEvents: vi.fn().mockResolvedValue([sacaBasura, sacarBasura, dentistaEmpaste]) })
    const outcome = await runTalk('Mañana a las 19:00 se saca basura', deps)
    if (outcome.kind !== 'proposal') throw new Error('debería proponer')

    // Los 3 existentes son "toda la familia" ([]): un miembro concreto (Eric) SIGUE formando parte de
    // "toda la familia", así que el horario sigue chocando con los 3 — pero al dejar de ser
    // exactamente el mismo conjunto de destinatarios ([m-eric] ≠ []), ya no cuentan como duplicado
    // exacto: los 3 pasan de "1 aviso agrupado + 1 conflicto" a "3 conflictos sueltos". Recalculado de
    // verdad, no el aviso congelado de antes.
    const toEric = { ...outcome.proposal.initialSelection, choices: { member: 'm-eric' } }
    expect(outcome.proposal.preview(toEric).warnings).toEqual([
      'Ya tienes «Saca basura» a esa misma hora.',
      'Ya tienes «Sacar basura» a esa misma hora.',
      'Ya tienes «Dentista empaste» a esa misma hora.',
    ])

    // Y volver a "toda la familia" recupera el aviso agrupado de siempre.
    const backToWholeFamily = { ...outcome.proposal.initialSelection, choices: { member: 'none' } }
    expect(outcome.proposal.preview(backToWholeFamily).warnings).toHaveLength(2)
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
