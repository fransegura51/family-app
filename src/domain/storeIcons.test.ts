import { describe, expect, it } from 'vitest'
import { getStoreIcon } from './storeIcons'
import { storeBadge } from './storeBadge'

const img = { kind: 'image', src: expect.any(String) }

describe('getStoreIcon — logotipos empaquetados con fallback al criterio por nombre de siempre', () => {
  it('las cadenas conocidas usan su logotipo EMPAQUETADO en la app (sin depender de servicios externos)', () => {
    for (const n of ['Mercadona', 'Aldi', 'Hiperber', 'Lidl', 'Eroski', 'Consum', 'Alcampo', 'Dia', 'Spar', 'El Corte Inglés', 'Amazon', 'Covirán', 'Manper', 'Charter', 'Superdumbo']) {
      expect(getStoreIcon(n), n).toEqual(img)
    }
  })

  it('cada cadena tiene SU logotipo: dos cadenas distintas nunca comparten imagen (nada de logos por parecido de nombre)', () => {
    const names = ['Mercadona', 'Aldi', 'Hiperber', 'Lidl', 'Eroski', 'Consum', 'Alcampo', 'Dia', 'Spar', 'El Corte Inglés', 'Amazon', 'Covirán', 'Manper', 'Charter', 'Superdumbo']
    const srcs = names.map((n) => (getStoreIcon(n) as { src: string }).src)
    expect(new Set(srcs).size).toBe(names.length)
  })

  it('Hipervel (cómo se dicta HiperBer) es la misma cadena: mismo logotipo', () => {
    expect(getStoreIcon('Hipervel')).toEqual(getStoreIcon('Hiperber'))
  })

  it('las cadenas sin logotipo empaquetado en buena calidad (Carrefour, Caprabo, Hipercor) usan la insignia de texto, nunca la imagen de otra cadena ni un favicon borroso', () => {
    for (const n of ['Carrefour', 'Caprabo', 'Hipercor']) expect(getStoreIcon(n), n).toEqual({ kind: 'emoji', icon: '🏬' })
  })

  it('logoAsset null o undefined: idéntico a no pasar el parámetro', () => {
    expect(getStoreIcon('Lidl', null)).toEqual(getStoreIcon('Lidl'))
    expect(getStoreIcon('Lidl', undefined)).toEqual(getStoreIcon('Lidl'))
  })

  it('una tienda sin marca reconocible sigue cayendo al icono por defecto (que se pinta como insignia de texto), con o sin logoAsset', () => {
    expect(getStoreIcon('Frutería de la esquina')).toEqual({ kind: 'emoji', icon: '🏬' })
    expect(getStoreIcon('Frutería de la esquina', 'inexistente')).toEqual({ kind: 'emoji', icon: '🏬' })
    expect(getStoreIcon('Carnicería Manolo', 'carrefour')).toEqual({ kind: 'emoji', icon: '🏬' })
  })
})

describe('reconoce la cadena como palabra completa dentro de un nombre más largo (texto de banco)', () => {
  it('Hiperber y Consum con el texto del banco', () => {
    expect(getStoreIcon('HIPERBER DISTRIBUCION Y L-RAFAL')).toEqual(getStoreIcon('Hiperber'))
    expect(getStoreIcon('SUPERMERCADO CONSUM RAFAL-RAFAL')).toEqual(getStoreIcon('Consum'))
    expect(getStoreIcon('Supermercado Consum Rafal-Rafal')).toEqual(getStoreIcon('Consum'))
  })
  it('Amazon, Covirán, Manper', () => {
    expect(getStoreIcon('WWW.AMAZON-LUXEMBOURG')).toEqual(getStoreIcon('Amazon'))
    expect(getStoreIcon('SUPERMERCADO COVIRAN-ALMORADI')).toEqual(getStoreIcon('Covirán'))
    expect(getStoreIcon('Supermercados Manper')).toEqual(getStoreIcon('Manper'))
  })
  it('Charter usa su propio logotipo, nunca el de Consum', () => {
    expect(getStoreIcon('SUPERMERCADO CHARTER RAFAL')).toEqual(getStoreIcon('Charter'))
    expect(getStoreIcon('Charter')).not.toEqual(getStoreIcon('Consum'))
  })
  it('nunca coincidencia parcial de una palabra', () => {
    expect(getStoreIcon('Consumibles de Oficina SL')).toEqual({ kind: 'emoji', icon: '🏬' })
    expect(getStoreIcon('Aldilandia Juguetería')).toEqual({ kind: 'emoji', icon: '🏬' })
  })
})

describe('insignia de texto (tienda sin logotipo o con la imagen sin cargar)', () => {
  it('iniciales de las dos primeras palabras que dicen algo, sin «Supermercado» ni artículos', () => {
    expect(storeBadge('Frutería de la esquina').text).toBe('Fe')
    expect(storeBadge('SUPERMERCADO LA DESPENSA').text).toBe('De')
    expect(storeBadge('Bazar').text).toBe('Ba')
  })
  it('el mismo nombre siempre da el mismo color y todos llevan texto blanco', () => {
    expect(storeBadge('Bazar Lola').background).toBe(storeBadge('Bazar Lola').background)
    expect(storeBadge('Bazar Lola').color).toBe('#ffffff')
  })
  it('nunca devuelve un texto vacío', () => {
    expect(storeBadge('???').text.length).toBeGreaterThan(0)
    expect(storeBadge('').text.length).toBeGreaterThan(0)
  })
})
