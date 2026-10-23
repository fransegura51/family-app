import { describe, expect, it } from 'vitest'
import { compareProducts, isAutomatic, productSignature } from './productIdentity'

const rel = (a: string, b: string, classes = {}) => compareProducts({ name: a }, { name: b }, classes).relation

describe('A. producto idéntico (mismo producto aunque el ticket abrevie distinto)', () => {
  it('mayúsculas, tildes, signos y espacios no cambian nada', () => {
    expect(rel('LECHE ENTERA HACENDADO 1L', 'Leche entera Hacendado 1 L')).toBe('identical')
    expect(rel('Rúcula bolsa', 'RUCULA  BOLSA')).toBe('identical')
  })
  it('abreviaturas habituales de ticket', () => {
    expect(rel('LECHE ENT. PASCUAL 1L', 'Leche entera Pascual 1 l')).toBe('identical')
    expect(rel('LECHE DESN HACENDADO 1L', 'Leche desnatada Hacendado 1 L')).toBe('identical')
  })
  it('plurales', () => {
    expect(rel('Pepinillos', 'Pepinillo')).toBe('identical')
  })
})

describe('B. producto equivalente (distinta marca o presentación)', () => {
  it('leche entera de distintos supermercados', () => {
    expect(rel('LECHE ENTERA HACENDADO 1L', 'Leche entera Milbona 1 L')).toBe('equivalent')
    expect(rel('Leche entera Dia 1L', 'Leche entera Carrefour 1,5 L')).toBe('equivalent')
  })
  it('misma marca y producto en otro tamaño', () => {
    expect(rel('Arroz redondo SOS 500 g', 'Arroz redondo SOS 1 kg')).toBe('equivalent')
    expect(rel('Huevos camperos 6 ud', 'Huevos camperos 12 ud')).toBe('equivalent')
  })
  it('es automático solo lo identical/equivalent', () => {
    expect(isAutomatic('identical') && isAutomatic('equivalent')).toBe(true)
    expect(isAutomatic('possible') || isAutomatic('different')).toBe(false)
  })
})

describe('C. producto diferente aunque sea de la misma categoría', () => {
  it('leche entera ≠ desnatada ≠ semidesnatada ≠ sin lactosa', () => {
    expect(rel('Leche entera 1L', 'Leche desnatada 1L')).toBe('different')
    expect(rel('Leche entera 1L', 'Leche semidesnatada 1L')).toBe('different')
    expect(rel('Leche entera 1L', 'Leche entera sin lactosa 1L')).toBe('different')
  })
  it('arroz redondo ≠ arroz integral; aceite de oliva ≠ aceite de girasol', () => {
    expect(rel('Arroz redondo 1kg', 'Arroz integral 1kg')).toBe('different')
    expect(rel('Aceite de oliva 1L', 'Aceite de girasol 1L')).toBe('different')
  })
  it('refresco normal ≠ zero ≠ light', () => {
    expect(rel('Coca Cola 2L', 'Coca Cola Zero 2L')).toBe('different')
  })
  it('un producto por peso/volumen no es uno por unidades', () => {
    expect(rel('Yogur natural 500 g', 'Yogur natural 4 ud')).toBe('different')
  })
  it('la clase conocida y distinta descarta, aunque los nombres se parezcan', () => {
    expect(rel('Crema de cacao', 'Crema de cacao', { a: 'food.snacks_dulces', b: 'other.limpieza' })).toBe('different')
  })
  it('nombres sin ninguna palabra útil no se comparan', () => {
    expect(rel('1 L', '500 g')).toBe('different')
  })
  it('productos parecidos que no deben confundirse', () => {
    expect(rel('Pepinillos', 'Pepino')).toBe('different')
    expect(rel('Lasaña precocida', 'Lasaña de verduras congelada')).not.toBe('identical')
  })
})

describe('dudas → sugerencia, nunca coincidencia inventada', () => {
  it('«Leche» a secas frente a «Leche entera»: falta la variante', () => {
    expect(rel('Leche', 'Leche entera 1 L')).toBe('possible')
  })
  it('una sola palabra genérica coincidente con distinta marca no basta', () => {
    expect(rel('Leche Pascual', 'Leche Hacendado')).toBe('possible')
  })
  it('una palabra que sobra y no se reconoce (¿marca?) → posible', () => {
    expect(rel('Arroz largo Brillante 1 kg', 'Arroz largo Fortuna 1 kg')).toBe('possible')
  })
})

describe('firma', () => {
  it('separa marca, núcleo, variantes y tamaño', () => {
    const s = productSignature('LECHE ENT. HACENDADO 1,5L')
    expect(s.brand).toBe('hacendado')
    expect(s.core).toEqual(['entera', 'leche'])
    expect(s.variants).toEqual(['entera'])
    expect(s.size).toMatchObject({ magnitude: 'volumen', amount: 1500 })
  })
  it('usa la marca guardada del producto si existe', () => {
    expect(productSignature('Galletas Maria Artiach', 'Artiach').brand).toBe('artiach')
  })
})
