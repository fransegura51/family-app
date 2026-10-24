import { describe, expect, it } from 'vitest'
import { basisLabel, comparableNormalized, normalizePrice, parseProductSize, stripSize } from './productSize'

describe('tamaño del envase en el nombre', () => {
  it.each([
    ['ARROZ 500 G', 'peso', 500],
    ['Arroz 1kg', 'peso', 1000],
    ['LECHE ENTERA 1L', 'volumen', 1000],
    ['Leche 1,5 litros', 'volumen', 1500],
    ['Agua 33cl', 'volumen', 330],
    ['COLA 6X330 ML', 'volumen', 1980],
    ['Yogur 4x125g', 'peso', 500],
    ['HUEVOS 12 UD', 'unidades', 12],
    ['Huevos docena', 'unidades', 12],
    ['Huevos media docena', 'unidades', 6],
    ['Pañales pack 40', 'unidades', 40],
    ['Cervezas P-6', 'unidades', 6],
  ])('%s → %s %d', (name, magnitude, amount) => {
    expect(parseProductSize(name)).toMatchObject({ magnitude, amount })
  })

  it('sin tamaño claro no se adivina', () => {
    expect(parseProductSize('Leche entera')).toBeNull()
    expect(parseProductSize('Plátano')).toBeNull()
  })
  it('dos tamaños distintos en el mismo nombre → ambiguo, no se adivina', () => {
    expect(parseProductSize('Crema 200g 250ml')).toBeNull()
  })
  it('un número suelto no es un tamaño (talla, modelo, año)', () => {
    expect(parseProductSize('Pañal talla 3')).toBeNull()
    expect(parseProductSize('Pan 2020')).toBeNull()
  })
  it('stripSize quita solo la parte del tamaño', () => {
    expect(stripSize('Leche entera 1 L')).toBe('Leche entera')
  })
})

describe('precio normalizado', () => {
  it('arroz 500 g a 0,90 € frente a arroz 1 kg a 1,60 €: 1,80 €/kg frente a 1,60 €/kg', () => {
    const a = normalizePrice({ price: 0.9, unit: 'ud' }, 'Arroz 500 g')
    const b = normalizePrice({ price: 1.6, unit: 'ud' }, 'Arroz 1 kg')
    expect(a).toMatchObject({ value: 1.8, basis: 'kg', exact: true, packagePrice: 0.9 })
    expect(b).toMatchObject({ value: 1.6, basis: 'kg', exact: true })
    expect(comparableNormalized(a, b)).toBe(true)
  })
  it('leche 1 l a 0,95 € frente a 1,5 l a 1,35 €: 0,95 €/l frente a 0,90 €/l', () => {
    expect(normalizePrice({ price: 0.95, unit: 'ud' }, 'Leche entera 1 L')).toMatchObject({ value: 0.95, basis: 'l' })
    expect(normalizePrice({ price: 1.35, unit: 'ud' }, 'Leche entera 1,5 L')).toMatchObject({ value: 0.9, basis: 'l' })
  })
  it('huevos de 6 frente a huevos de 12: precio por huevo', () => {
    expect(normalizePrice({ price: 1.5, unit: 'ud' }, 'Huevos 6 ud')).toMatchObject({ value: 0.25, basis: 'ud' })
    expect(normalizePrice({ price: 2.4, unit: 'ud' }, 'Huevos 12 ud')).toMatchObject({ value: 0.2, basis: 'ud' })
  })
  it('lo vendido por peso ya es €/kg y no se vuelve a dividir', () => {
    expect(normalizePrice({ price: 3.2, unit: 'kg' }, 'Manzana Fuji')).toMatchObject({ value: 3.2, basis: 'kg', exact: true, packagePrice: null })
  })
  it('sin tamaño fiable: precio de envase, NO comparable de forma exacta', () => {
    const a = normalizePrice({ price: 1.1, unit: 'ud' }, 'Leche entera')
    expect(a).toMatchObject({ value: 1.1, basis: 'envase', exact: false })
    expect(comparableNormalized(a, a)).toBe(false)
  })
  it('un precio por kg y uno por litro no son comparables', () => {
    expect(comparableNormalized(normalizePrice({ price: 2, unit: 'ud' }, 'Aceite 1 L'), normalizePrice({ price: 2, unit: 'ud' }, 'Azúcar 1 kg'))).toBe(false)
  })
  it('las unidades compradas (quantity) no cambian el precio normalizado: se compra el mismo envase 3 veces', () => {
    expect(normalizePrice({ price: 0.9, unit: 'ud' }, 'Arroz 500 g').value).toBe(1.8)
  })
  it('etiquetas', () => {
    expect([basisLabel('kg'), basisLabel('l'), basisLabel('ud'), basisLabel('envase')]).toEqual(['€/kg', '€/l', '€/ud', '€/envase'])
  })
})
