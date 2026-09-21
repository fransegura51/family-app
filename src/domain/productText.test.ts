import { describe, expect, it } from 'vitest'
import { checkCommercialText, findTextKeyCollisions, productTextKey } from './productText'

describe('productTextKey', () => {
  it('casos conocidos de la auditoría: la coma y el punto decimal dan la misma clave', () => {
    expect(productTextKey('C 0,0 TOSTADA P-6')).toBe('c 0 0 tostada p 6')
    expect(productTextKey('C 0.0 TOSTADA P-6')).toBe(productTextKey('C 0,0 TOSTADA P-6'))
  })

  it('con o sin tilde da la misma clave', () => {
    expect(productTextKey('PAPEL HIGIENICO 4 CA')).toBe('papel higienico 4 ca')
    expect(productTextKey('PAPEL HIGIÉNICO 4 CA')).toBe(productTextKey('PAPEL HIGIENICO 4 CA'))
    expect(productTextKey('+ PROTEÍNAS FRESA')).toBe('proteinas fresa')
    expect(productTextKey('PIÑA')).toBe('pina')
  })

  it('mayúsculas y minúsculas, espacios repetidos y bordes', () => {
    expect(productTextKey('  Leche   Entera  ')).toBe('leche entera')
    expect(productTextKey('leche entera')).toBe(productTextKey('LECHE ENTERA'))
    expect(productTextKey('LECHE\tENTERA\n')).toBe('leche entera')
  })

  it('signos frecuentes de los tickets reales', () => {
    expect(productTextKey('100% INTEGRAL')).toBe('100 integral')
    expect(productTextKey('MAYONESA HELLMANN¿S')).toBe('mayonesa hellmann s')
    expect(productTextKey("TINTO VERANO LIM 0'0")).toBe('tinto verano lim 0 0')
    expect(productTextKey('10 S.JARDÍN C. FÁCIL')).toBe('10 s jardin c facil')
    expect(productTextKey('C. TOSTADO AHUMADO')).toBe('c tostado ahumado')
  })

  it('conserva números, tallas, variantes y palabras: no funde productos distintos', () => {
    expect(productTextKey('PAPEL HIGIENICO 4 CA')).not.toBe(productTextKey('PAPEL HIGIENICO 6 CA'))
    expect(productTextKey('LECHE 1L')).not.toBe(productTextKey('LECHE 6L'))
    expect(productTextKey('YOGUR NATURAL')).not.toBe(productTextKey('YOGUR NATURAL AZUCARADO'))
    expect(productTextKey('AGUA 1,5L')).not.toBe(productTextKey('AGUA 15L'))
    expect(productTextKey('COCA COLA ZERO')).not.toBe(productTextKey('COCA COLA'))
    expect(productTextKey('P6')).not.toBe(productTextKey('P 6'))
  })

  it('Unicode: formas de compatibilidad y otros alfabetos no se pierden ni rompen', () => {
    expect(productTextKey('ＬＥＣＨＥ １Ｌ')).toBe('leche 1l') // ancho completo
    expect(productTextKey('café')).toBe(productTextKey('CAFE'))
    expect(productTextKey('é')).toBe('e') // e + tilde combinada
    expect(productTextKey('豆腐 200g')).toBe('豆腐 200g') // otros alfabetos se conservan
    expect(productTextKey('🍎 MANZANA')).toBe('manzana')
  })

  it('es estable: aplicarla dos veces no cambia nada', () => {
    for (const text of ['C 0,0 TOSTADA P-6', 'MAYONESA HELLMANN¿S', '100% INTEGRAL', 'ＬＥＣＨＥ']) {
      expect(productTextKey(productTextKey(text))).toBe(productTextKey(text))
    }
  })

  it('vacío o solo signos → clave vacía', () => {
    expect(productTextKey('')).toBe('')
    expect(productTextKey(' -- ')).toBe('')
  })
})

describe('findTextKeyCollisions', () => {
  it('detecta los dos choques conocidos y solo esos', () => {
    const collisions = findTextKeyCollisions(['C 0,0 TOSTADA P-6', 'C 0.0 TOSTADA P-6', 'PAPEL HIGIENICO 4 CA', 'PAPEL HIGIÉNICO 4 CA', 'LECHE ENTERA', 'AGUA 1L'])
    expect([...collisions.keys()].sort()).toEqual(['c 0 0 tostada p 6', 'papel higienico 4 ca'])
    expect(collisions.get('c 0 0 tostada p 6')).toEqual(['C 0,0 TOSTADA P-6', 'C 0.0 TOSTADA P-6'])
  })

  it('el mismo texto repetido no es una colisión', () => {
    expect(findTextKeyCollisions(['LECHE', 'LECHE']).size).toBe(0)
  })
})

describe('checkCommercialText: privacidad', () => {
  it.each([
    '+ PROTEÍNAS FRESA',
    '100% INTEGRAL',
    'MAYONESA HELLMANN¿S',
    "TINTO VERANO LIM 0'0",
    '10 S.JARDÍN C. FÁCIL',
    'C 0,0 TOSTADA P-6',
    'PAPEL HIGIÉNICO 4 CA',
    'C. TOSTADO AHUMADO',
    'AGUA 1,5L',
    'Bombona butano 12,5 kg',
  ])('descripción comercial normal: %s', (text) => {
    expect(checkCommercialText(text)).toEqual({ ok: true })
  })

  it.each([
    ['jennifer@example.com', 'email'],
    ['PEDIDO paco.segura+pepa@live.es', 'email'],
    ['https://www.ejemplo.com/pedido/123', 'url'],
    ['www.tienda-rara.es', 'url'],
    ['mitienda.com oferta', 'url'],
    ['ES91 2100 0418 4502 0005 1332', 'iban'],
    ['ES9121000418450200051332', 'iban'],
    ['600123456', 'long_number'],
    ['TEL 600 123 456', 'long_number'],
    ['8410188012345', 'long_number'],
    ['4111-1111-1111-1111', 'long_number'],
  ])('rechaza %s (%s)', (text, issue) => {
    const result = checkCommercialText(text)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContain(issue)
  })

  it('rechaza lo claramente incompatible con una descripción corta', () => {
    expect(checkCommercialText('')).toEqual({ ok: false, issues: ['empty'] })
    expect(checkCommercialText('   ')).toEqual({ ok: false, issues: ['empty'] })
    expect(checkCommercialText('12,50')).toMatchObject({ ok: false, issues: expect.arrayContaining(['no_letters']) })
    expect(checkCommercialText('---')).toMatchObject({ ok: false })
    expect(checkCommercialText('A')).toMatchObject({ ok: false, issues: ['too_short'] })
    expect(checkCommercialText('línea uno\nlínea dos')).toMatchObject({ ok: false, issues: expect.arrayContaining(['multiline']) })
    expect(checkCommercialText('esto es una frase completa que alguien ha escrito a mano en el ticket')).toMatchObject({
      ok: false,
      issues: expect.arrayContaining(['too_long', 'too_many_words']),
    })
    expect(checkCommercialText('uno dos tres cuatro cinco seis siete ocho nueve')).toMatchObject({ ok: false, issues: ['too_many_words'] })
  })

  it('los números con sentido se conservan: cantidades, tallas y fechas cortas no son secuencias largas', () => {
    expect(checkCommercialText('PACK 12 X 33 CL')).toEqual({ ok: true })
    expect(checkCommercialText('CAJA 24 UD 500 G')).toEqual({ ok: true })
    expect(checkCommercialText('LECHE 1 2 3 4')).toEqual({ ok: true })
  })

  it('NO detecta nombres propios (limitación documentada): por eso la Fase 4 solo usará el conjunto revisado', () => {
    expect(checkCommercialText('TARTA PARA MARIA')).toEqual({ ok: true })
  })
})
