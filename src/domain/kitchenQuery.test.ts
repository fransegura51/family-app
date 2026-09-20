import { describe, expect, it } from 'vitest'
import { kitchenDateLabel, parseKitchenIntent } from './kitchenQuery'

// Domingo 20 de septiembre de 2026.
const TODAY = new Date(2026, 8, 20)

describe('kitchenQuery: consultas', () => {
  it('¿qué cenamos hoy?', () => {
    expect(parseKitchenIntent('¿Qué cenamos hoy?', TODAY)).toEqual({ kind: 'menu_query', date: '2026-09-20', meals: ['cena'] })
  })

  it('¿qué cocinamos hoy? -> comida y cena', () => {
    expect(parseKitchenIntent('¿Qué cocinamos hoy?', TODAY)).toEqual({ kind: 'menu_query', date: '2026-09-20', meals: ['comida', 'cena'] })
  })

  it('¿qué tengo mañana para comer?', () => {
    expect(parseKitchenIntent('¿Qué tengo mañana para comer?', TODAY)).toEqual({ kind: 'menu_query', date: '2026-09-21', meals: ['comida'] })
  })

  it('otras formas de preguntar', () => {
    expect(parseKitchenIntent('qué hay para cenar el viernes', TODAY)).toEqual({ kind: 'menu_query', date: '2026-09-25', meals: ['cena'] })
    expect(parseKitchenIntent('qué comemos el día 5 de octubre', TODAY)).toEqual({ kind: 'menu_query', date: '2026-10-05', meals: ['comida'] })
    expect(parseKitchenIntent('qué hay de cena esta noche', TODAY)).toEqual({ kind: 'menu_query', date: '2026-09-20', meals: ['cena'] })
    expect(parseKitchenIntent('cuál es el menú de pasado mañana', TODAY)).toEqual({ kind: 'menu_query', date: '2026-09-22', meals: ['comida', 'cena'] })
    expect(parseKitchenIntent('qué vamos a comer hoy', TODAY)).toEqual({ kind: 'menu_query', date: '2026-09-20', meals: ['comida'] })
  })

  it('sin fecha se entiende hoy', () => {
    expect(parseKitchenIntent('qué desayunamos', TODAY)).toEqual({ kind: 'menu_query', date: '2026-09-20', meals: ['desayuno'] })
  })

  it('al preguntar, un día de la semana que es hoy vale hoy', () => {
    expect(parseKitchenIntent('qué cenamos el domingo', TODAY)).toEqual({ kind: 'menu_query', date: '2026-09-20', meals: ['cena'] })
  })

  it('"por la mañana" no es el día de mañana', () => {
    expect(parseKitchenIntent('qué desayunamos por la mañana', TODAY)).toEqual({ kind: 'menu_query', date: '2026-09-20', meals: ['desayuno'] })
  })

  it('NO confunde preguntas del calendario ni de la compra', () => {
    expect(parseKitchenIntent('qué tengo mañana', TODAY)).toBeNull()
    expect(parseKitchenIntent('qué tengo que hacer hoy', TODAY)).toBeNull()
    expect(parseKitchenIntent('qué tengo que comprar para comer', TODAY)).toBeNull()
    expect(parseKitchenIntent('qué hay en la lista de la compra de Mercadona', TODAY)).toBeNull()
    expect(parseKitchenIntent('lo siguiente que tengo en el calendario', TODAY)).toBeNull()
  })
})

describe('kitchenQuery: apuntar un plato', () => {
  it('pon tortilla el viernes', () => {
    expect(parseKitchenIntent('pon tortilla el viernes', TODAY)).toEqual({
      kind: 'menu_set',
      date: '2026-09-25',
      meal: null,
      dish: 'tortilla',
      explicit: false,
    })
  })

  it('con comida indicada es explícito', () => {
    expect(parseKitchenIntent('pon lentejas el sábado para comer', TODAY)).toEqual({
      kind: 'menu_set',
      date: '2026-09-26',
      meal: 'comida',
      dish: 'lentejas',
      explicit: true,
    })
    expect(parseKitchenIntent('apunta pizza de cena mañana', TODAY)).toEqual({ kind: 'menu_set', date: '2026-09-21', meal: 'cena', dish: 'pizza', explicit: true })
  })

  it('conserva mayúsculas y acentos del plato', () => {
    expect(parseKitchenIntent('Pon Cocido Madrileño el jueves para comer', TODAY)).toMatchObject({ dish: 'Cocido Madrileño', date: '2026-09-24', meal: 'comida' })
    expect(parseKitchenIntent('pon merluza a la vizcaína el lunes para cenar', TODAY)).toMatchObject({ dish: 'merluza a la vizcaína', meal: 'cena' })
  })

  it('al escribir, un día de la semana que es hoy es el de la semana que viene', () => {
    expect(parseKitchenIntent('pon tortilla el domingo', TODAY)).toMatchObject({ date: '2026-09-27' })
  })

  it('con menú explícito', () => {
    expect(parseKitchenIntent('añade paella al menú del sábado', TODAY)).toMatchObject({ kind: 'menu_set', dish: 'paella', explicit: true, date: '2026-09-26' })
  })

  it('no toca lo que es del calendario o de la compra', () => {
    expect(parseKitchenIntent('pon cena con Ana el viernes a las 9', TODAY)).toBeNull()
    expect(parseKitchenIntent('apunta dentista de Eric el viernes a las 17:00', TODAY)).toBeNull()
    expect(parseKitchenIntent('apunta leche en la compra el viernes', TODAY)).toBeNull()
    expect(parseKitchenIntent('el viernes a las cinco dentista de Eric', TODAY)).toBeNull()
    expect(parseKitchenIntent('Mercadona, patatas, huevos', TODAY)).toBeNull()
  })

  it('sin fecha no es un apunte de menú', () => {
    expect(parseKitchenIntent('pon tortilla', TODAY)).toBeNull()
  })

  it('pon dentista el viernes se detecta como candidato NO explícito (la decisión final la toma quien conoce las recetas)', () => {
    expect(parseKitchenIntent('pon dentista el viernes', TODAY)).toMatchObject({ kind: 'menu_set', dish: 'dentista', explicit: false })
  })
})

describe('kitchenQuery: ingredientes', () => {
  it('añade ingredientes a la compra (sin receta)', () => {
    expect(parseKitchenIntent('añade ingredientes a la compra', TODAY)).toEqual({ kind: 'ingredients', recipeText: null, date: null, meal: null })
    expect(parseKitchenIntent('añade los ingredientes a la lista', TODAY)).toEqual({ kind: 'ingredients', recipeText: null, date: null, meal: null })
  })

  it('con el nombre de la receta', () => {
    expect(parseKitchenIntent('añade los ingredientes de la tortilla a la compra', TODAY)).toEqual({
      kind: 'ingredients',
      recipeText: 'tortilla',
      date: null,
      meal: null,
    })
    expect(parseKitchenIntent('apunta los ingredientes de la receta de lentejas con chorizo en la lista', TODAY)).toMatchObject({ recipeText: 'lentejas con chorizo' })
  })

  it('con una fecha y comida', () => {
    expect(parseKitchenIntent('añade los ingredientes de la cena de hoy a la compra', TODAY)).toEqual({
      kind: 'ingredients',
      recipeText: null,
      date: '2026-09-20',
      meal: 'cena',
    })
    expect(parseKitchenIntent('pon los ingredientes de lo de mañana en la lista', TODAY)).toMatchObject({ recipeText: null, date: '2026-09-21' })
  })

  it('sin verbo de acción no es un encargo', () => {
    expect(parseKitchenIntent('qué ingredientes lleva la tortilla', TODAY)).toBeNull()
  })
})

describe('kitchenDateLabel', () => {
  it('hoy, mañana y el resto con fecha completa', () => {
    expect(kitchenDateLabel('2026-09-20', TODAY)).toBe('hoy')
    expect(kitchenDateLabel('2026-09-21', TODAY)).toBe('mañana')
    expect(kitchenDateLabel('2026-09-25', TODAY)).toBe('el viernes, 25 de septiembre')
  })
})
