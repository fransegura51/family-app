// Normalización de artículos de ticket: los ejemplos del encargo, los niveles de confianza y que nunca se inventa un formato.
import { describe, expect, it } from 'vitest'
import { packTotalSize } from '../productSize'
import { catalogEntry, compareIdentities, identifyProduct } from './identify'

const id = identifyProduct

describe('ejemplos del encargo', () => {
  it.each([
    ['LECHE SEMI P-6', 'Leche semidesnatada', 'food.lacteos_huevos'],
    ['PATATA 5 KG', 'Patata fresca', 'food.verdura_hortalizas'],
    ['PATATA 3 KG', 'Patata fresca', 'food.verdura_hortalizas'],
    ['ACEITE O.V.E.', 'Aceite de oliva virgen extra', 'food.despensa'],
    ['PAÑALES T4', 'Pañales talla 4', 'other.cuidado_bebe'],
    ['LECHE INF 2', 'Leche infantil etapa 2', 'food.alimentacion_infantil'],
  ])('%s → %s', (text, name, classKey) => {
    const r = id(text)
    expect(r.name).toBe(name)
    expect(r.classKey).toBe(classKey)
    expect(r.raw).toBe(text) // el texto original del ticket no se toca
  })

  it('«LECHE INF 2» es una propuesta (probable), no una identificación segura: el contexto tiene que confirmarla', () => {
    const r = id('LECHE INF 2')
    expect(r.confidence).toBe('probable')
    expect(r.identityKey).toBeNull() // un probable nunca agrupa solo
    expect(r.reasons.join(' ')).toMatch(/abreviatura/)
  })
})

describe('ingredientes que no son el producto', () => {
  it('una quesadilla de pollo NO es pollo', () => {
    expect(id('QUESADILLA DE POLLO').entry?.key).toBe('pre.quesadilla')
    expect(id('QUESADILLA DE POLLO').entry?.key).not.toBe('carne.pollo')
    expect(id('PECHUGA DE POLLO').entry?.key).toBe('carne.pollo.pechuga')
  })
  it('croquetas, nuggets o pizza con pollo son platos preparados', () => {
    for (const t of ['CROQUETAS POLLO', 'NUGGETS DE POLLO', 'PIZZA POLLO BARBACOA']) expect(id(t).classKey, t).toBe('food.platos_preparados')
  })
  it('atún en aceite de girasol es atún, no aceite', () => {
    expect(id('ATUN CLARO ACEITE GIRASOL').entry?.key).toBe('desp.atun.lata')
  })
  it('patatas fritas de bolsa no son patata fresca', () => {
    expect(id('PATATAS FRITAS').entry?.key).toBe('snk.patatas.fritas')
    expect(id('PATATAS LAYS').entry?.key).toBe('snk.patatas.fritas')
    expect(id('PATATA 5 KG').entry?.key).toBe('verd.patata')
  })
  it('«FANTA NARANJA» es un refresco, no fruta', () => {
    expect(id('FANTA NARANJA ZERO').classKey).toBe('food.bebidas_no_alcoholicas')
    expect(id('NARANJAS 2 KG').classKey).toBe('food.fruta')
  })
})

describe('«zero» y otras palabras que no igualan productos', () => {
  it('cola zero y fanta naranja zero son productos distintos', () => {
    const a = id('COCA COLA ZERO 2L')
    const b = id('FANTA NARANJA ZERO 2L')
    expect(compareIdentities(a, b)?.relation).toBe('different')
  })
  it('refresco normal y zero son distintos', () => {
    expect(compareIdentities(id('REFRESCO COLA'), id('REFRESCO COLA ZERO'))?.relation).toBe('different')
  })
  it('cerveza con y sin alcohol son productos distintos y de clases distintas', () => {
    expect(id('CERVEZA').classKey).toBe('food.bebidas_alcoholicas')
    expect(id('CERVEZA SIN ALCOHOL').classKey).toBe('food.bebidas_no_alcoholicas')
    expect(id('CERVEZA 0,0').classKey).toBe('food.bebidas_no_alcoholicas')
  })
})

describe('productos que NO son equivalentes', () => {
  const rel = (a: string, b: string) => compareIdentities(id(a), id(b))?.relation
  it('leche entera ≠ semidesnatada', () => expect(rel('LECHE ENTERA', 'LECHE SEMI')).toBe('different'))
  it('leche infantil etapa 1 ≠ etapa 2', () => expect(rel('LECHE INFANTIL 1', 'LECHE INFANTIL 2')).toBe('different'))
  it('pañales talla 3 ≠ talla 4', () => expect(rel('PAÑALES T3', 'PAÑALES T4')).toBe('different'))
  it('pañal ≠ pañal-braguita', () => expect(rel('PAÑALES T4', 'BRAGUITAS T4')).toBe('different'))
  it('patata fresca ≠ patatas fritas', () => expect(rel('PATATA 3 KG', 'PATATAS FRITAS')).toBe('different'))
  it('patata de 3 kg y de 5 kg son comparables', () => expect(rel('PATATA 3 KG', 'PATATA 5 KG')).toBe('equivalent'))
  it('la misma leche con distinta marca y formato es equivalente', () => expect(rel('LECHE SEMIDESNATADA PASCUAL 1L', 'LECHE SEMI HACENDADO 6X1L')).toBe('equivalent'))
  it('una leche sin decir el tipo no se da por la misma que otra: solo una sugerencia', () => expect(rel('LECHE', 'LECHE SEMI')).toBe('possible'))
  it('el mismo producto con una variante sin reconocer solo se sugiere', () => expect(rel('YOGUR NATURAL', 'YOGUR NATURAL AZUCARADO')).toBe('possible'))
})

describe('formato: nunca se inventa', () => {
  it('«LECHE SEMI P-6» son 6 envases, pero NO se supone 1 litro cada uno', () => {
    const r = id('LECHE SEMI P-6')
    expect(r.pack).toEqual({ count: 6, amount: 1, unit: 'ud' })
    expect(r.size?.magnitude).toBe('unidades')
    expect(r.size?.amount).toBe(6)
  })
  it('lee el formato cuando el nombre lo dice', () => {
    const total = (t: string) => {
      const p = id(t).pack
      return p ? packTotalSize(p) : null
    }
    expect(total('PATATAS 5 KG')).toMatchObject({ magnitude: 'peso', amount: 5000 })
    expect(total('LECHE 6X1L')).toMatchObject({ magnitude: 'volumen', amount: 6000 })
    expect(total('YOGURES 4X125G')).toMatchObject({ magnitude: 'peso', amount: 500 })
    expect(total('PAÑALES 48 UDS')).toMatchObject({ magnitude: 'unidades', amount: 48 })
    expect(total('DETERGENTE 40 LAVADOS')).toMatchObject({ magnitude: 'unidades', amount: 40 })
    expect(total('HUEVOS DOCENA')).toMatchObject({ magnitude: 'unidades', amount: 12 })
  })
  it('sin información no hay formato', () => {
    expect(id('LECHE SEMIDESNATADA').pack).toBeNull()
    expect(id('ACEITE O.V.E.').pack).toBeNull()
  })
})

describe('niveles de confianza', () => {
  it('seguro: una entrada encaja con palabras completas y nada compite', () => {
    expect(id('PECHUGA POLLO').confidence).toBe('seguro')
  })
  it('dudoso: lo que no está en el catálogo no se identifica ni se agrupa', () => {
    for (const t of ['XILOFON AZUL', 'COSA RARA 77', 'REDONDEO', 'PARKING']) {
      const r = id(t)
      expect(r.entry, t).toBeNull()
      expect(r.confidence, t).toBe('dudoso')
      expect(r.identityKey, t).toBeNull()
    }
  })
  it('«lasaña» sola es el plato preparado; la pasta en placas lo dice (no se confunden las dos clases)', () => {
    expect(id('LASAÑA').classKey).toBe('food.platos_preparados')
    expect(id('PLACAS LASAÑA').classKey).toBe('food.despensa')
  })
  it('la palabra «gato» o «perro» fija la clase de mascotas: «LATA GATO ATUN» no es atún en lata', () => {
    expect(id('LATA GATO ATUN').classKey).toBe('other.mascotas')
    expect(id('ATUN CLARO').classKey).toBe('food.pescado_marisco')
  })
  it('una palabra cortada por el ticket es probable, no segura', () => {
    expect(id('MINI EMPAN PISTO').confidence).toBe('probable')
  })
  it('solo la marca sugiere el producto, con confianza probable', () => {
    expect(id('PATATAS LAYS').confidence).toBe('probable')
    expect(id('REFRESCO COCA COLA ZERO').confidence).toBe('seguro') // marca y tipo coinciden
  })
  it('una entrada de clase solo clasifica: nunca da identidad para agrupar', () => {
    const r = id('QUESO')
    expect(r.entry?.broad).toBe(true)
    expect(r.identityKey).toBeNull()
    expect(compareIdentities(id('QUESO'), id('QUESO'))).toBeNull()
  })
  it('sin identidad completa (falta el tipo de leche, la talla o la etapa) no se agrupa', () => {
    for (const t of ['LECHE', 'PAÑALES', 'LECHE INFANTIL']) {
      const r = id(t)
      expect(r.complete, t).toBe(false)
      expect(r.identityKey, t).toBeNull()
    }
  })
})

describe('marca y atributos', () => {
  it('extrae la marca conocida y no la mezcla con el producto', () => {
    expect(id('LECHE ENTERA PASCUAL 1L').brand).toBe('pascual')
    expect(id('TOMATE FRITO HACENDADO').brand).toBe('hacendado')
  })
  it('una palabra corriente nunca se toma por marca («gel», «estrella»)', () => {
    expect(id('GEL DUCHA').brand).toBeNull()
    expect(id('ESTRELLA').brand).toBeNull()
  })
  it('lee los atributos: tipo de leche, talla, etapa, sin lactosa', () => {
    expect(id('LECHE SIN LACTOSA SEMI').attrs).toMatchObject({ tipoLeche: 'semi', lactosa: 'sin' })
    expect(id('PAÑALES TALLA 5').attrs).toMatchObject({ talla: '5', tipoPanal: 'panal' })
    expect(id('LECHE CRECIMIENTO 3').attrs).toMatchObject({ etapa: '3' })
  })
})

describe('el motor es puro y estable', () => {
  it('mismo texto → mismo resultado (determinista) y distinto texto no se contamina', () => {
    const a = id('LECHE SEMI P-6')
    const b = id('LECHE SEMI P-6')
    expect(b).toEqual(a)
    expect(id('LECHE ENTERA').attrs.tipoLeche).toBe('entera')
    expect(id('LECHE SEMI P-6').attrs.tipoLeche).toBe('semi')
  })
  it('mayúsculas, tildes, plurales y signos no cambian la identidad', () => {
    expect(id('Leche semidesnatada').identityKey).toBe(id('LECHE SEMIDESNATADA').identityKey)
    expect(id('LIMÓN').identityKey).toBe(id('LIMONES').identityKey)
    expect(id('Yogures').entry?.key).toBe('lac.yogur')
  })
  it('el catálogo es consultable por clave estable', () => {
    expect(catalogEntry('lac.leche')?.name).toBe('Leche')
    expect(catalogEntry('no.existe')).toBeUndefined()
  })
  it('nombres vacíos o raros no rompen', () => {
    for (const t of ['', '   ', '%%%', '12345', 'A']) expect(() => id(t)).not.toThrow()
    expect(id('').entry).toBeNull()
  })
})
