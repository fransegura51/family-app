// Selector de catálogo: búsqueda por nombre, sinónimo, abreviatura y errata; variantes; navegación por categorías.
import { describe, expect, it } from 'vitest'
import { identifyProduct } from './identify'
import { browseCategory, catalogCategories, catalogHitByKey, searchCatalog, searchWords } from './catalogSearch'
import { allVariants, resolveVariantKey, variantKey, variantsOf } from './variants'
import { readLine } from './lineReading'

const names = (q: string, n = 8) => searchCatalog(q, n).map((h) => h.name)

describe('búsqueda', () => {
  it('«bolsa», «bolsas» y «basura» encuentran las bolsas de basura (bolsa no se descarta al buscar)', () => {
    for (const q of ['bolsa', 'bolsas', 'basura', 'bolsas basura']) expect(names(q, 12), q).toContain('Bolsas de basura')
  })
  it('encuentra por sinónimo y abreviatura', () => {
    expect(names('cola')).toContain('Refresco de cola')
    expect(names('semi leche')[0]).toBe('Leche semidesnatada')
    expect(names('pat fritas')).toContain('Patatas fritas de bolsa')
  })
  it('tolera erratas pequeñas', () => {
    expect(names('lechee')).toContain('Leche')
    expect(names('semidesnatda leche')).toContain('Leche semidesnatada')
    expect(names('merluzza')).toContain('Merluza')
  })
  it('«Leche semidesnatada» existe como variante de Leche (caso LECHE ASTURIANA S)', () => {
    const hit = searchCatalog('leche semidesnatada')[0]
    expect(hit.name).toBe('Leche semidesnatada')
    expect(hit.variant).toBe(true)
    expect(hit.entryKey).toBe('lac.leche')
  })
  it('el producto principal sale antes que sus variantes cuando no se nombran', () => {
    const r = searchCatalog('leche')
    expect(r[0].name).toBe('Leche')
    expect(r[0].variant).toBe(false)
  })
  it('no sugiere productos solo por parecerse en letras sueltas', () => {
    expect(searchCatalog('xqzv')).toEqual([])
    expect(names('pan', 20)).not.toContain('Pañales')
  })
  it('palabras vacías no cuentan', () => expect(searchWords('bolsa de la basura')).toEqual(['bolsa', 'basura']))
})

describe('variantes', () => {
  it('leche: entera, semidesnatada, desnatada y combinaciones sin lactosa', () => {
    const labels = variantsOf('lac.leche').map((v) => v.label)
    expect(labels).toEqual(expect.arrayContaining(['Leche entera', 'Leche semidesnatada', 'Leche desnatada', 'Leche sin lactosa', 'Leche semidesnatada sin lactosa']))
  })
  it('pañales: una variante por talla', () => expect(variantsOf('beb.panal').map((v) => v.label)).toContain('Pañales talla 4'))
  it('queso conserva sus variedades y el kétchup sigue distinguiendo «zero» por el nombre', () => {
    expect(names('ketchup')).toContain('Ketchup')
    expect(identifyProduct('KÉTCHUP ZERO').leftover).toContain('zero')
    expect(names('queso gouda')).toContain('Queso gouda')
  })
  it('las claves son estables, únicas y caben en la columna', () => {
    const keys = allVariants().map((v) => v.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k, k).toMatch(/^[a-z0-9_.]{2,80}$/)
    expect(variantKey('lac.leche', { tipoLeche: 'semi' })).toBe('lac.leche.v_tipoleche_semi')
    expect(resolveVariantKey('lac.leche.v_tipoleche_semi')?.attrs).toEqual({ tipoLeche: 'semi' })
  })
  it('confirmar la variante hace que «LECHE ASTURIANA S» sea leche semidesnatada, segura y agrupable', () => {
    const before = identifyProduct('LECHE ASTURIANA S')
    expect(before.name).toBe('Leche')
    expect(before.identityKey).toBeNull() // falta el tipo de leche
    const key = 'lac.leche.v_tipoleche_semi'
    const after = identifyProduct('LECHE ASTURIANA S', null, key)
    expect(after.name).toBe('Leche semidesnatada')
    expect(after.identityKey).toBe(identifyProduct('LECHE SEMIDESNATADA ASTURIANA').identityKey)
    expect(readLine({ name: 'LECHE ASTURIANA S', catalogProductKey: key }).state).toBe('confirmado')
  })
  it('la variante elegida manda sobre lo que diga el nombre', () => {
    expect(identifyProduct('LECHE ENTERA', null, 'lac.leche.v_tipoleche_desnatada').attrs.tipoLeche).toBe('desnatada')
  })
  it('una clave de variante desconocida se ignora', () => expect(identifyProduct('PATATA 5 KG', null, 'x.v_y_z').name).toBe('Patata fresca'))
})

describe('explorar sin escribir', () => {
  it('lista categorías con productos y sus productos A–Z por subcategoría', () => {
    const cats = catalogCategories()
    expect(cats.map((c) => c.key)).toContain('food.lacteos_huevos')
    const groups = browseCategory('food.lacteos_huevos')
    expect(groups.length).toBeGreaterThan(0)
    const all = groups.flatMap((g) => g.items.map((i) => i.name))
    expect(all).toContain('Leche')
    for (const g of groups) expect(g.items.map((i) => i.name)).toEqual([...g.items.map((i) => i.name)].sort((a, b) => a.localeCompare(b, 'es')))
  })
  it('recupera un producto o una variante por su clave', () => {
    expect(catalogHitByKey('pes.merluza')?.name).toBe('Merluza')
    expect(catalogHitByKey('lac.leche.v_tipoleche_semi')?.name).toBe('Leche semidesnatada')
    expect(catalogHitByKey('nada')).toBeUndefined()
  })
})

describe('ampliación acotada del catálogo (NORM-3)', () => {
  it('las bolsas de la compra no se confunden con las de basura ni con un termo', () => {
    expect(identifyProduct('BOLSA SUPERMERCADO').name).toBe('Bolsa de compra')
    expect(identifyProduct('BOLSA REUTILIZABLE').name).toBe('Bolsa de compra')
    expect(identifyProduct('BOLSAS BASURA 30L').name).toBe('Bolsas de basura')
    expect(identifyProduct('BOLSA RAFIA').classKey).toBe('other.utensilios_cocina')
    expect(names('bolsa', 12)).toEqual(expect.arrayContaining(['Bolsa de compra', 'Bolsas de basura']))
  })
  it('«ROLLOS NARANJA» ya no es fruta: pide decir qué producto concreto es', () => {
    const r = identifyProduct('ROLLOS NARANJA')
    expect(r.classKey).toBe('food.panaderia_bolleria')
    expect(r.identityKey).toBeNull()
    expect(readLine({ name: 'ROLLOS NARANJA' }).missing).toContain('decir qué producto concreto es')
    expect(identifyProduct('NARANJAS 2 KG').classKey).toBe('food.fruta')
    expect(identifyProduct('ROLLO COCINA').name).toBe('Papel de cocina')
  })
  it('filtros de café son menaje, no café', () => expect(identifyProduct('FILTROS CAFE').name).toBe('Filtros de café'))
})
