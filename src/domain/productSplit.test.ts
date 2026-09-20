import { describe, expect, it } from 'vitest'
import { splitEntries } from './quickCapture'
import { analyzeEntry, expandEntries, shouldAskAi } from './productSplit'

describe('analyzeEntry', () => {
  it('una sola palabra o un producto con su adjetivo es uno solo', () => {
    expect(analyzeEntry('leche')).toEqual({ kind: 'single' })
    expect(analyzeEntry('leche entera')).toEqual({ kind: 'single' })
    expect(analyzeEntry('pan de molde')).toEqual({ kind: 'single' })
    expect(analyzeEntry('aceite de oliva virgen')).toEqual({ kind: 'single' })
    expect(analyzeEntry('papel higiénico')).toEqual({ kind: 'single' })
    expect(analyzeEntry('pasta de dientes')).toEqual({ kind: 'single' })
    expect(analyzeEntry('yogur natural')).toEqual({ kind: 'single' })
    expect(analyzeEntry('agua con gas')).toEqual({ kind: 'ambiguous' })
  })

  it('leche huevo -> dos productos (la incidencia real)', () => {
    expect(analyzeEntry('leche huevo')).toEqual({ kind: 'split', parts: ['leche', 'huevo'] })
    expect(analyzeEntry('leche huevos')).toEqual({ kind: 'split', parts: ['leche', 'huevos'] })
    expect(analyzeEntry('Leche Huevos')).toEqual({ kind: 'split', parts: ['Leche', 'Huevos'] })
  })

  it('listas largas sin puntuación', () => {
    expect(analyzeEntry('patata lechuga lentejas agua vino')).toEqual({ kind: 'split', parts: ['patata', 'lechuga', 'lentejas', 'agua', 'vino'] })
  })

  it('cada producto conserva sus adjetivos', () => {
    expect(analyzeEntry('leche entera pan integral huevos')).toEqual({ kind: 'split', parts: ['leche entera', 'pan integral', 'huevos'] })
    expect(analyzeEntry('yogur natural zanahorias')).toEqual({ kind: 'split', parts: ['yogur natural', 'zanahorias'] })
    expect(analyzeEntry('pan de molde leche')).toEqual({ kind: 'split', parts: ['pan de molde', 'leche'] })
  })

  it('cantidades y envases se quedan con su producto', () => {
    expect(analyzeEntry('dos litros de leche')).toEqual({ kind: 'single' })
    expect(analyzeEntry('2 leche 3 huevos')).toEqual({ kind: 'split', parts: ['2 leche', '3 huevos'] })
    expect(analyzeEntry('un paquete de pasta arroz')).toEqual({ kind: 'split', parts: ['un paquete de pasta', 'arroz'] })
  })

  it('con una palabra desconocida no se decide (marcas, productos raros)', () => {
    expect(analyzeEntry('pan Bimbo')).toEqual({ kind: 'ambiguous' })
    expect(analyzeEntry('leche Puleva pan')).toEqual({ kind: 'ambiguous' })
    expect(analyzeEntry('cepillo dental')).toEqual({ kind: 'ambiguous' })
    expect(analyzeEntry('leche dos')).toEqual({ kind: 'ambiguous' })
  })
})

describe('expandEntries: la frase entera', () => {
  const run = (text: string) => expandEntries(splitEntries(text))

  it('leche, huevo, pan (bien dictado) no cambia', () => {
    expect(run('leche, huevo, pan')).toEqual({ entries: ['leche', 'huevo', 'pan'], ambiguous: [] })
  })

  it('"leche huevo, pan": se recupera la coma perdida', () => {
    expect(run('leche huevo, pan')).toEqual({ entries: ['leche', 'huevo', 'pan'], ambiguous: [] })
  })

  it('sin comas y con "y": leche huevos y pan', () => {
    expect(run('leche huevos y pan')).toEqual({ entries: ['leche', 'huevos', 'pan'], ambiguous: [] })
  })

  it('mezcla de conocidos y desconocidos: solo se marca lo dudoso', () => {
    expect(run('leche, pan Bimbo')).toEqual({ entries: ['leche', 'pan Bimbo'], ambiguous: ['pan Bimbo'] })
  })

  it('lo que ya iba bien no se toca', () => {
    expect(run('patatas, yogur natural, fruta')).toEqual({ entries: ['patatas', 'yogur natural', 'fruta'], ambiguous: [] })
    expect(run('leche entera')).toEqual({ entries: ['leche entera'], ambiguous: [] })
  })
})

describe('shouldAskAi', () => {
  it('solo cuando aporta', () => {
    expect(shouldAskAi('pan Bimbo', 2)).toBe(false)
    expect(shouldAskAi('pan Bimbo', 1)).toBe(true)
    expect(shouldAskAi('patata lechuga Puleva', 2)).toBe(true)
    expect(shouldAskAi('leche', 1)).toBe(false)
  })
})

describe('analyzeEntry: "sin" y productos que también son adjetivo', () => {
  it('sin lactosa / sin gluten se quedan con su producto', () => {
    expect(analyzeEntry('leche sin lactosa huevos')).toEqual({ kind: 'split', parts: ['leche sin lactosa', 'huevos'] })
    expect(analyzeEntry('pan sin gluten')).toEqual({ kind: 'single' })
  })

  it('pan sal son dos productos', () => {
    expect(analyzeEntry('pan sal')).toEqual({ kind: 'split', parts: ['pan', 'sal'] })
    expect(analyzeEntry('sal azucar')).toEqual({ kind: 'split', parts: ['sal', 'azucar'] })
  })
})
