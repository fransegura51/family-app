import { describe, expect, it } from 'vitest'
import { describePack, formatStatus, needsAnswer, otherStorePrices, parsePackInput, resolveLinePack, samePack, unitPriceText, type PackFormat } from './packFormat'
import { normalizePrice, packTotalSize, parseProductPack } from './productSize'

const pack = (count: number, amount: number, unit: PackFormat['unit'], source: PackFormat['source'] = 'manual'): PackFormat => ({ count, amount, unit, source })

describe('formato estructurado desde el nombre', () => {
  it.each([
    ['Cerveza 6x330 ml', { count: 6, amount: 330, unit: 'ml' }],
    ['Cerveza lata 12 x 33 cl', { count: 12, amount: 330, unit: 'ml' }],
    ['Leche entera 1 L', { count: 1, amount: 1, unit: 'l' }],
    ['Arroz 500 g', { count: 1, amount: 500, unit: 'g' }],
    ['Aceite 1,5 l', { count: 1, amount: 1.5, unit: 'l' }],
    ['Huevos docena', { count: 12, amount: 1, unit: 'ud' }],
    ['Yogur pack 4', { count: 4, amount: 1, unit: 'ud' }],
  ])('«%s»', (name, expected) => expect(parseProductPack(name)).toEqual(expected))
  it.each(['Pepino', 'Leche', 'Crema 200 g 250 ml', ''])('«%s» no se adivina', (name) => expect(parseProductPack(name)).toBeNull())
})

describe('contenido total y precio normalizado con el formato guardado', () => {
  it('6 latas × 330 ml = 1,98 l; a 4,95 € son 2,50 €/l (el ejemplo del encargo)', () => {
    const total = packTotalSize({ count: 6, amount: 330, unit: 'ml' })
    expect(total?.amount).toBe(1980)
    const n = normalizePrice({ price: 4.95, unit: 'ud', pack: { count: 6, amount: 330, unit: 'ml' } }, 'Cerveza')
    expect(n).toMatchObject({ basis: 'l', exact: true })
    expect(n.value).toBe(2.5)
  })
  it('el formato guardado manda sobre el nombre', () => {
    const n = normalizePrice({ price: 3, unit: 'ud', pack: { count: 1, amount: 1.5, unit: 'l' } }, 'Agua 1 L')
    expect(n.value).toBe(2)
  })
  it('un pack de 12 y uno de 6 del mismo producto dan el mismo €/ud si el precio es proporcional, y no se mezclan por envase', () => {
    expect(normalizePrice({ price: 6, unit: 'ud', pack: { count: 12, amount: 1, unit: 'ud' } }, 'Huevos').value).toBe(0.5)
    expect(normalizePrice({ price: 3, unit: 'ud', pack: { count: 6, amount: 1, unit: 'ud' } }, 'Huevos').value).toBe(0.5)
  })
  it('vendido por kg ignora el formato; sin formato ni tamaño en el nombre, no hay comparación exacta (como hasta ahora)', () => {
    expect(normalizePrice({ price: 1.7, unit: 'kg', pack: { count: 6, amount: 1, unit: 'ud' } }, 'Pepino')).toMatchObject({ basis: 'kg', value: 1.7 })
    expect(normalizePrice({ price: 1.7, unit: 'ud', pack: null }, 'Pepino')).toMatchObject({ basis: 'envase', exact: false })
  })
  it('un formato no válido se ignora en vez de romper', () => {
    expect(normalizePrice({ price: 2, unit: 'ud', pack: { count: 0, amount: 5, unit: 'g' } }, 'Cosa').exact).toBe(false)
  })
})

describe('describir el formato', () => {
  it.each([
    [pack(6, 330, 'ml'), '6 × 330 ml = 1,98 l'],
    [pack(1, 1, 'l'), '1 l'],
    [pack(12, 1, 'ud'), '12 ud'],
    [pack(1, 500, 'g'), '500 g'],
    [pack(4, 250, 'g'), '4 × 250 g = 1 kg'],
  ])('%j', (p, text) => expect(describePack(p)).toBe(text))
  it('precio por unidad al lado del formato', () => {
    expect(unitPriceText(4.95, pack(6, 330, 'ml'))).toBe('2,50 €/l')
    expect(unitPriceText(2.4, pack(12, 1, 'ud'))).toBe('0,20 €/ud')
    expect(unitPriceText(1.2, pack(1, 500, 'g'))).toBe('2,40 €/kg')
  })
})

describe('qué hay que preguntar', () => {
  const past = (price: number, p: PackFormat | null, recordedDate: string) => ({ price, pack: p, recordedDate })

  it('vendido por peso: nada', () => {
    expect(formatStatus({ name: 'Pepino', unit: 'kg', price: 1.7 }, [])).toEqual({ kind: 'peso' })
  })
  it('el nombre lo dice claro: se reconoce solo, sin preguntar', () => {
    const s = formatStatus({ name: 'Cerveza 6x330 ml', unit: 'ud', price: 4.95 }, [])
    expect(s).toMatchObject({ kind: 'nombre', pack: { count: 6, amount: 330, unit: 'ml', source: 'nombre' } })
    expect(needsAnswer(s)).toBe(false)
  })
  it('dos compras anteriores con el mismo formato y precio parecido: se recuerda solo', () => {
    const s = formatStatus({ name: 'Cerveza Estrella', unit: 'ud', price: 5.1 }, [past(4.95, pack(6, 330, 'ml'), '2026-09-01'), past(4.8, pack(6, 330, 'ml'), '2026-08-01')])
    expect(s).toMatchObject({ kind: 'recordado', pack: { count: 6, source: 'recordado' } })
    expect(needsAnswer(s)).toBe(false)
  })
  it('una sola compra anterior: se propone y hay que confirmar', () => {
    const s = formatStatus({ name: 'Cerveza Estrella', unit: 'ud', price: 5 }, [past(4.95, pack(6, 330, 'ml'), '2026-09-01')])
    expect(s).toMatchObject({ kind: 'confirmar', reason: 'La última vez indicaste 6 × 330 ml = 1,98 l. ¿Es el mismo?' })
    expect(needsAnswer(s)).toBe(true)
  })
  it('un precio muy distinto sugiere otro formato (pack de 12): no se arrastra el anterior', () => {
    expect(formatStatus({ name: 'Cerveza Estrella', unit: 'ud', price: 9.9 }, [past(4.95, pack(6, 330, 'ml'), '2026-09-01'), past(4.95, pack(6, 330, 'ml'), '2026-08-01')])).toEqual({ kind: 'falta' })
  })
  it('lo que salió del nombre en compras anteriores no cuenta como «recordado» (se vuelve a leer del nombre)', () => {
    expect(formatStatus({ name: 'Cerveza', unit: 'ud', price: 5 }, [past(5, pack(6, 330, 'ml', 'nombre'), '2026-09-01')])).toEqual({ kind: 'falta' })
  })
  it('sin ningún dato: falta, y se pregunta (opcional)', () => {
    const s = formatStatus({ name: 'Cerveza', unit: 'ud', price: 5 }, [])
    expect(s).toEqual({ kind: 'falta' })
    expect(needsAnswer(s)).toBe(true)
  })
})

describe('entrada escrita a mano', () => {
  it('acepta coma decimal y devuelve source manual', () => {
    expect(parsePackInput('6', '33,0', 'ml')).toEqual({ count: 6, amount: 33, unit: 'ml', source: 'manual' })
  })
  it.each([['', '1', 'l'], ['0', '1', 'l'], ['1', '-2', 'l'], ['1', '1', 'oz'], ['a', '1', 'l']])('«%s» «%s» «%s» no vale', (c, a, u) => expect(parsePackInput(c, a, u)).toBeNull())
  it('dos presentaciones iguales se reconocen aunque se expresen distinto (1 l = 1000 ml)', () => {
    expect(samePack(pack(1, 1, 'l'), pack(1, 1000, 'ml'))).toBe(true)
    expect(samePack(pack(6, 330, 'ml'), pack(1, 1980, 'ml'))).toBe(false)
  })
})

describe('lo que se guarda con cada línea del ticket', () => {
  it('lo reconocido solo se guarda sin tocar nada; lo que la persona decide manda; «Ahora no» deja la línea sin formato', () => {
    const line = { name: 'Cerveza 6x330 ml', unit: 'ud', unitPrice: '4.95' }
    expect(resolveLinePack(line, []).pack).toMatchObject({ count: 6, amount: 330, source: 'nombre' })
    expect(resolveLinePack({ ...line, pack: pack(1, 330, 'ml') }, []).pack).toMatchObject({ count: 1, source: 'manual' })
    expect(resolveLinePack({ ...line, pack: null }, []).pack).toBeNull()
  })
  it('sin información y sin respuesta no se inventa nada', () => {
    expect(resolveLinePack({ name: 'Cerveza', unit: 'ud', unitPrice: '4.95' }, []).pack).toBeNull()
  })
  it('por kg el formato se ignora aunque se hubiera escrito antes de cambiar la unidad', () => {
    expect(resolveLinePack({ name: 'Pepino', unit: 'kg', unitPrice: '1.7', pack: pack(6, 1, 'ud') }, []).pack).toBeNull()
  })
})

describe('¿hay con qué comparar?', () => {
  const products = [
    { id: 'p1', displayName: 'Cerveza Estrella 6x330 ml' },
    { id: 'p2', displayName: 'Pepino' },
  ]
  const prices = [
    { id: 'a', productId: 'p1', price: 4.5, store: 'Lidl', unit: 'ud', recordedDate: '2026-09-10' },
    { id: 'b', productId: 'p1', price: 5, store: 'Mercadona', unit: 'ud', recordedDate: '2026-10-01' },
    { id: 'c', productId: 'p2', price: 1.7, store: 'Mercadona', unit: 'kg', recordedDate: '2026-10-01' },
  ]
  it('solo salen precios de OTRAS tiendas, el último de cada una', () => {
    const r = otherStorePrices(products[0], 'Mercadona', products, prices)
    expect(r.map((x) => x.store)).toEqual(['Lidl'])
    expect(r[0].normalized).toMatchObject({ basis: 'l', exact: true })
  })
  it('un producto que solo se compró en esta tienda no tiene con qué compararse todavía: no se pregunta', () => {
    expect(otherStorePrices(products[1], 'Mercadona', products, prices)).toEqual([])
    expect(otherStorePrices(null, 'Mercadona', products, prices)).toEqual([])
  })
})
