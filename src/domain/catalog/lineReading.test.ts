// «Qué ha entendido PEPA» en la revisión del ticket: los casos de la primera prueba real, el formato sin inventar y la identidad confirmada por la familia.
import { describe, expect, it } from 'vitest'
import { compareProducts } from '../productIdentity'
import { resolveProductClass } from '../productClass'
import { normalizeForGrouping } from '../autoGrouping'
import { identifyProduct } from './identify'
import { readLine, searchCatalogEntries } from './lineReading'

const read = (name: string, extra: Partial<Parameters<typeof readLine>[0]> = {}) => readLine({ name, ...extra })

describe('casos de la primera prueba real', () => {
  it('PATATA 5 KG es patata fresca (verdura) y lee 5 kg', () => {
    const r = read('PATATA 5 KG')
    expect(r.productName).toBe('Patata fresca')
    expect(r.classKey).toBe('food.verdura_hortalizas')
    expect(r.format).toBe('5 kg')
    expect(r.formatKnown).toBe(true)
    expect(r.readyToCompare).toBe(true)
  })
  it('LECHE SEMI P-6: semidesnatada y pack de seis, sin inventar la capacidad de cada envase', () => {
    const r = read('LECHE SEMI P-6')
    expect(r.productName).toBe('Leche semidesnatada')
    expect(r.classKey).toBe('food.lacteos_huevos')
    expect(r.format).toBe('6 envases · capacidad pendiente')
    expect(r.formatKnown).toBe(false)
    expect(r.readyToCompare).toBe(false) // no se compara sin datos fiables
    expect(r.missing).toContain('indicar el formato del envase')
  })
  it('FTE MERLUZA AL HUEVO es un plato preparado de pescado, no un huevo ni pescado fresco', () => {
    const r = read('FTE MERLUZA AL HUEVO')
    expect(r.classKey).toBe('food.platos_preparados')
    expect(r.productName).toBe('Pescado rebozado o empanado')
    expect(read('FILETE DE MERLUZA').classKey).toBe('food.pescado_marisco') // la merluza fresca sigue siendo pescado
  })
  it('TUBOS FRESA es una golosina (con la variante fresa), no fruta; las fresas siguen siendo fruta', () => {
    const r = read('TUBOS FRESA')
    expect(r.classKey).toBe('food.snacks_dulces')
    expect(r.variant).toBe('fresa')
    expect(read('FRESAS 500 G').classKey).toBe('food.fruta')
  })
  it('CRUNCHY CHICKEN es pollo preparado (platos preparados)', () => {
    expect(read('CRUNCHY CHICKEN').classKey).toBe('food.platos_preparados')
    expect(read('PECHUGA DE POLLO').classKey).toBe('food.carne')
  })
  it('ACEITE VIRGEN EX es aceite de oliva virgen extra', () => {
    expect(read('ACEITE VIRGEN EX').productName).toBe('Aceite de oliva virgen extra')
    expect(read('ACEITE OLIVA VIRGEN EX 1L').productName).toBe('Aceite de oliva virgen extra')
  })
  it('conserva las variantes relevantes: gouda, mozzarella fresca, kétchup zero, pañales T4', () => {
    expect(read('QUESO GOUDA LONCHAS')).toMatchObject({ productName: 'Queso en lonchas', variant: 'gouda' })
    expect(read('MOZZARELLA FRESCA').productName).toBe('Mozzarella')
    expect(read('MOZZARELLA FRESCA').variant).toMatch(/fresc/)
    expect(read('KÉTCHUP ZERO')).toMatchObject({ productName: 'Ketchup', variant: 'zero' })
    expect(read('PAÑALES T4').productName).toBe('Pañales talla 4')
    // distintas variantes no son el mismo producto
    expect(identifyProduct('KÉTCHUP ZERO').identityKey).not.toBe(identifyProduct('KÉTCHUP').identityKey)
  })
})

describe('estados y qué falta', () => {
  it('el texto original nunca se toca', () => expect(read('LECHE SEMI P-6').raw).toBe('LECHE SEMI P-6'))
  it('seguro / probable / dudoso / vacío', () => {
    expect(read('PATATA 5 KG').state).toBe('seguro')
    expect(read('LECHE INF 2').state).toBe('probable')
    expect(read('LECHE INF 2').missing).toContain('confirmar el producto')
    expect(read('XILOFON AZUL').state).toBe('dudoso')
    expect(read('XILOFON AZUL').productName).toBeNull()
    expect(read('  ').state).toBe('vacio')
  })
  it('sin la talla no está listo para comparar, y lo dice', () => {
    const r = read('PAÑALES')
    expect(r.readyToCompare).toBe(false)
    expect(r.missing).toContain('indicar la talla')
  })
  it('un formato ya decidido (a mano, del nombre o recordado) completa lo que faltaba', () => {
    const r = read('LECHE SEMI P-6', { effectivePack: { count: 6, amount: 1, unit: 'l' } })
    expect(r.formatKnown).toBe(true)
    expect(r.readyToCompare).toBe(true)
  })
  it('una línea al peso no necesita formato', () => {
    const r = read('PATATA', { soldByWeight: true })
    expect(r.format).toBe('al peso')
    expect(r.formatKnown).toBe(true)
  })
  it('una entrada solo de clase (QUESO) no está lista: falta decir el producto concreto', () => {
    const r = read('QUESO', { effectivePack: { count: 1, amount: 200, unit: 'g' } })
    expect(r.readyToCompare).toBe(false)
    expect(r.missing).toContain('decir qué producto concreto es')
  })
})

describe('producto confirmado o corregido por la familia', () => {
  it('confirmar una propuesta probable la vuelve segura y agrupable', () => {
    const before = read('LECHE INF 2')
    expect(before.state).toBe('probable')
    const after = read('LECHE INF 2', { catalogProductKey: before.entryKey })
    expect(after.state).toBe('confirmado')
    expect(identifyProduct('LECHE INF 2', null, before.entryKey).identityKey).not.toBeNull()
  })
  it('corregir el producto manda sobre lo que lea el catálogo, y la clase lo sigue', () => {
    const r = read('FTE MERLUZA AL HUEVO', { catalogProductKey: 'pes.merluza' })
    expect(r.state).toBe('confirmado')
    expect(r.productName).toBe('Merluza')
    expect(r.classKey).toBe('food.pescado_marisco')
    expect(r.variant).toBe('huevo') // lo que sobra sigue distinguiendo el producto
  })
  it('una clave que no existe se ignora (no rompe nada)', () => {
    expect(read('PATATA 5 KG', { catalogProductKey: 'no.existe' }).productName).toBe('Patata fresca')
  })
  it('el comparador usa la identidad confirmada: otro producto confirmado nunca se empareja', () => {
    const a = { name: 'FTE MERLUZA AL HUEVO', catalogProductKey: 'pre.pescado.rebozado' }
    const b = { name: 'MERLUZA EMPANADA 400G', catalogProductKey: 'pre.pescado.rebozado' }
    expect(['identical', 'equivalent', 'possible']).toContain(compareProducts(a, b).relation)
    const c = { name: 'FTE MERLUZA AL HUEVO', catalogProductKey: 'pes.merluza' }
    expect(compareProducts(a, c).relation).toBe('different')
  })
  it('la agrupación automática lee la identidad confirmada', () => {
    const before = normalizeForGrouping({ id: 'p', displayName: 'LECHE INF 2', brand: null })
    const n = normalizeForGrouping({ id: 'p', displayName: 'LECHE INF 2', brand: null, catalogProductKey: before.cat.entry?.key ?? null })
    expect(n.cat.confidence).toBe('seguro')
  })
  it('la clase de un producto nuevo sale del producto confirmado en esta revisión', () => {
    const r = resolveProductClass({ name: 'FTE MERLUZA AL HUEVO', product: null, kind: 'alimentacion', kindIsDefault: true, familyClasses: [], catalogProductKey: 'pes.merluza' })
    expect(r.source).toBe('catalog')
    expect(r.className).toBe('Pescado y marisco')
  })
})

describe('buscador de producto de la ficha', () => {
  it('encuentra por nombre o sinónimo y solo ofrece productos concretos', () => {
    const hits = searchCatalogEntries('merluza')
    expect(hits.map((h) => h.key)).toContain('pes.merluza')
    expect(searchCatalogEntries('')).toEqual([])
    expect(searchCatalogEntries('zzzzqq')).toEqual([])
    for (const h of searchCatalogEntries('queso', 20)) expect(h.name).not.toBe('Queso') // la entrada de clase «Queso» no se ofrece
  })
})

describe('Compras, Economía y Comparador leen la misma identidad confirmada', () => {
  const product = (id: string, displayName: string, catalogProductKey: string | null = null) => ({ id, familyId: 'f', normalizedName: displayName.toLowerCase(), displayName, category: null, brand: null, nonFood: false, classConfirmedAt: null, photoPath: null, catalogProductKey })
  it('el mismo producto confirmado da la misma clase y la misma identidad en el clasificador común y en la agrupación', () => {
    const p = product('a', 'FTE MERLUZA AL HUEVO', 'pes.merluza')
    const clase = resolveProductClass({ name: p.displayName, product: p, kind: 'alimentacion', kindIsDefault: true, familyClasses: [] })
    expect(clase.className).toBe('Pescado y marisco')
    const sinConfirmar = resolveProductClass({ name: p.displayName, product: { ...p, catalogProductKey: null }, kind: 'alimentacion', kindIsDefault: true, familyClasses: [] })
    expect(sinConfirmar.className).toBe('Platos preparados') // sin confirmar manda la lectura automática
    expect(normalizeForGrouping({ id: p.id, displayName: p.displayName, brand: null, catalogProductKey: p.catalogProductKey }).cat.entry?.key).toBe('pes.merluza')
  })
  it('lo confirmado nunca se empareja con lo que el catálogo distingue', () => {
    const rebozada = normalizeForGrouping({ id: 'a', displayName: 'FTE MERLUZA AL HUEVO', brand: null })
    const fresca = normalizeForGrouping({ id: 'b', displayName: 'MERLUZA FILETES', brand: null })
    expect(rebozada.cat.entry?.key).not.toBe(fresca.cat.entry?.key)
  })
})
