import { describe, expect, it } from 'vitest'
import { classifyFoodType } from '@/domain/foodTypes'

function key(name: string): string {
  return classifyFoodType(name).key
}

describe('classifyFoodType', () => {
  it('carne', () => {
    expect(key('SOLOMILLO CERDO')).toBe('carne')
    expect(key('BURGER M VA/CE 1000G')).toBe('carne')
    expect(key('SALCHICHA BRATWURST')).toBe('carne')
    expect(key('ROTI DE POLLO')).toBe('carne')
  })

  it('pescado', () => {
    expect(key('FILETE MERLUZA CABO')).toBe('pescado')
    expect(key('GAMBA BLANCA MEDIANA')).toBe('pescado')
    expect(key('PULPO')).toBe('pescado')
  })

  it('fruta', () => {
    expect(key('MANZANA GRANNY')).toBe('fruta')
    expect(key('SANDÍA PARTIDA B/S')).toBe('fruta')
  })

  it('verdura, sin confundir "patata" con "patatas fritas"', () => {
    expect(key('PATATA 5 KG')).toBe('verdura')
    expect(key('CALABACIN VERDE')).toBe('verdura')
    expect(key('PEPINO')).toBe('verdura')
    expect(key('PATATAS LAYS SAL/')).toBe('snacks')
  })

  it('lácteos', () => {
    expect(key('QUESO GOUDA LONCHAS')).toBe('lacteos')
    expect(key('24 HUEVOS FRESCOS')).toBe('lacteos')
  })

  it('panadería, sin confundir "panceta" con "pan"', () => {
    expect(key('PAN DE PUEBLO')).toBe('panaderia')
    expect(key('BIZCOCHO NUEZ')).toBe('panaderia')
    expect(key('PANCETA IBÉRICA')).toBe('carne')
  })

  it('bebidas, incluido un refresco de sabor a fruta', () => {
    expect(key('CERVEZA ESTRELLA')).toBe('bebidas')
    expect(key('NARANJA ZERO')).toBe('bebidas')
    expect(key('REFRES COCA-COLA')).toBe('bebidas')
  })

  it('congelados', () => {
    expect(key('HELADO CAPUCCINO')).toBe('congelados')
  })

  it('despensa', () => {
    expect(key('ACEITE VIRGEN EX')).toBe('despensa')
    expect(key('ARROZ FALLERA')).toBe('despensa')
  })

  it('sin coincidencia cae en Otros alimentos', () => {
    expect(key('COSA RARA XYZ')).toBe('otros')
  })
})
