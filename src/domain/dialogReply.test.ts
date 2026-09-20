import { describe, expect, it } from 'vitest'
import { interpretReply, isBareYesNo } from './dialogReply'

const STORES = ['Mercadona', 'Aldi', 'Carnicería López']
const reply = (text: string, kind: Parameters<typeof interpretReply>[1]['kind'] = 'recipe-draft', stores = STORES) => interpretReply(text, { kind, stores })

describe('guardar / confirmar', () => {
  it('guárdala y variantes', () => {
    for (const t of ['Guárdala.', 'Guarda esta receta.', 'Añádela a mis recetas.', 'Sí, guárdala.', 'guarda', 'Guárdala por favor', 'guardar receta']) {
      expect(reply(t), t).toEqual({ type: 'save' })
    }
  })

  it('sí, hazlo, confirmar', () => {
    for (const t of ['Sí.', 'sí', 'Hazlo', 'Confirmar', 'Confirma', 'Vale', 'ok', 'Sí, hazlo', 'de acuerdo', 'Adelante']) {
      expect(reply(t), t).toEqual({ type: 'yes' })
    }
  })

  it('solo guardar la receta (sin ingredientes)', () => {
    expect(reply('No, solo guarda la receta')).toEqual({ type: 'only-save' })
    expect(reply('solo guárdala')).toEqual({ type: 'only-save' })
    expect(reply('solo la receta')).toEqual({ type: 'only-save' })
  })
})

describe('cancelar', () => {
  it('no, cancela, déjalo, no la guardes', () => {
    for (const t of ['No.', 'no', 'Cancela', 'Cancelar', 'Déjalo', 'No la guardes', 'No lo guardes', 'No lo hagas', 'olvídalo', 'no gracias', 'mejor no']) {
      expect(reply(t), t).toEqual({ type: 'no' })
    }
  })
})

describe('raciones', () => {
  it('cambia a seis raciones / hazla para dos / somos cuatro', () => {
    expect(reply('Cambia a seis raciones')).toEqual({ type: 'servings', servings: 6 })
    expect(reply('Hazla para dos')).toEqual({ type: 'servings', servings: 2 })
    expect(reply('Hazla para 4 personas')).toEqual({ type: 'servings', servings: 4 })
    expect(reply('Somos cuatro')).toEqual({ type: 'servings', servings: 4 })
    expect(reply('para seis')).toEqual({ type: 'servings', servings: 6 })
    expect(reply('ponla para ocho')).toEqual({ type: 'servings', servings: 8 })
    expect(reply('6 raciones')).toEqual({ type: 'servings', servings: 6 })
  })
})

describe('ingredientes a la compra', () => {
  it('sin tienda dicha', () => {
    expect(reply('Añade los ingredientes a la compra', 'recipe-saved')).toEqual({ type: 'add-ingredients', store: undefined })
    expect(reply('añádelos', 'recipe-saved')).toEqual({ type: 'add-ingredients', store: undefined })
  })

  it('con tienda real dentro', () => {
    expect(reply('Añade los ingredientes a Mercadona', 'recipe-saved')).toEqual({ type: 'add-ingredients', store: 'Mercadona' })
    expect(reply('añade los ingredientes a aldi', 'recipe-saved')).toEqual({ type: 'add-ingredients', store: 'Aldi' })
  })

  it('"sin tienda" dentro de la frase', () => {
    expect(reply('añade los ingredientes sin tienda', 'recipe-saved')).toEqual({ type: 'add-ingredients', store: null })
  })
})

describe('respuesta a la pregunta de tienda', () => {
  const ask = (t: string) => reply(t, 'store-question')

  it('una tienda real', () => {
    expect(ask('Mercadona')).toEqual({ type: 'store', store: 'Mercadona' })
    expect(ask('en Aldi')).toEqual({ type: 'store', store: 'Aldi' })
    expect(ask('mercadona por favor')).toEqual({ type: 'store', store: 'Mercadona' })
    expect(ask('Carnicería López')).toEqual({ type: 'store', store: 'Carnicería López' })
  })

  it('sin tienda', () => {
    expect(ask('Sin tienda')).toEqual({ type: 'store', store: null })
    expect(ask('ninguna')).toEqual({ type: 'store', store: null })
    expect(ask('da igual')).toEqual({ type: 'store', store: null })
  })

  it('una tienda que no existe no se inventa', () => {
    expect(ask('Carrefour')).toEqual({ type: 'store-unknown', said: 'Carrefour' })
  })

  it('un "no" a secas es ambiguo; "cancela" cancela', () => {
    expect(ask('No')).toEqual({ type: 'store-ambiguous-no' })
    expect(ask('Cancela')).toEqual({ type: 'no' })
  })

  it('una frase larga no relacionada no se toma por tienda', () => {
    expect(ask('qué tengo mañana en el calendario por favor')).toBeNull()
  })
})

describe('lo que NO es una respuesta', () => {
  it('frases normales no se interpretan', () => {
    expect(reply('¿Qué tenemos mañana en el calendario?')).toBeNull()
    expect(reply('Pon tortilla de patatas para cenar el viernes')).toBeNull()
    expect(reply('Añade leche, huevos y pan a Mercadona')).toBeNull()
    expect(reply('quiero hacer una paella para seis')).toBeNull()
    expect(reply('')).toBeNull()
  })
})

describe('isBareYesNo', () => {
  it('detecta sí/no sueltos', () => {
    expect(isBareYesNo('Sí')).toBe(true)
    expect(isBareYesNo('cancela')).toBe(true)
    expect(isBareYesNo('guárdala')).toBe(true)
    expect(isBareYesNo('qué tengo mañana')).toBe(false)
  })
})

describe('confirmación + tienda en una sola frase', () => {
  const saved = (t: string) => reply(t, 'recipe-saved')
  const question = (t: string) => reply(t, 'store-question')

  it('a la oferta de ingredientes: "Sí, a Mercadona" y variantes -> ingredientes CON tienda', () => {
    for (const t of [
      'Sí, a la lista de la compra de Mercadona.',
      'Sí, a Mercadona',
      'Sí, ponlo en Mercadona',
      'Sí, a la lista de Mercadona',
      'sí, ponlos en la lista de Mercadona por favor',
      'Vale, a Mercadona',
    ]) {
      expect(saved(t), t).toEqual({ type: 'add-ingredients', store: 'Mercadona' })
    }
  })

  it('"Sí, pero sin tienda" -> ingredientes sin tienda', () => {
    for (const t of ['Sí, pero sin tienda.', 'Sí, sin tienda', 'sí, a la lista de la compra sin tienda']) {
      expect(saved(t), t).toEqual({ type: 'add-ingredients', store: null })
    }
  })

  it('"Sí, a la lista de la compra" sin tienda dicha -> solo sí (se preguntará la tienda)', () => {
    expect(saved('Sí, a la lista de la compra')).toEqual({ type: 'yes' })
    expect(saved('Sí, añádelos')).toEqual({ type: 'add-ingredients', store: undefined })
  })

  it('una tienda que la familia no tiene no se inventa', () => {
    expect(saved('Sí, a Carrefour')).toEqual({ type: 'store-unknown', said: 'carrefour' })
  })

  it('las mismas frases a la pregunta de tienda eligen la tienda', () => {
    expect(question('Sí, a Mercadona')).toEqual({ type: 'store', store: 'Mercadona' })
    expect(question('a la lista de la compra de Aldi')).toEqual({ type: 'store', store: 'Aldi' })
    expect(question('Sí, pero sin tienda')).toEqual({ type: 'store', store: null })
    expect(question('en Carnicería López')).toEqual({ type: 'store', store: 'Carnicería López' })
  })

  it('no confunde negaciones ni otras peticiones', () => {
    expect(saved('No, a Mercadona no')).not.toEqual({ type: 'add-ingredients', store: 'Mercadona' })
    expect(saved('Añade leche y pan a Mercadona')).toBeNull()
    expect(saved('Sí, pon tortilla el viernes para cenar')).toBeNull()
  })
})
