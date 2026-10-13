import { describe, expect, it } from 'vitest'
import { getStoreIcon } from './storeIcons'

describe('getStoreIcon — resolución por logoAsset (cadenas) con fallback al criterio por nombre de siempre', () => {
  it('sin logoAsset: se comporta exactamente igual que antes (favicon por nombre conocido)', () => {
    expect(getStoreIcon('Mercadona')).toEqual({ kind: 'logo', domain: 'mercadona.es' })
  })

  it('con logoAsset pero sin ningún asset empaquetado todavía (fase actual): cae al mismo criterio por nombre, nunca rompe', () => {
    expect(getStoreIcon('Mercadona', 'mercadona')).toEqual({ kind: 'logo', domain: 'mercadona.es' })
    expect(getStoreIcon('Carnicería Manolo', 'carrefour')).toEqual({ kind: 'emoji', icon: '🏬' })
  })

  it('logoAsset null o undefined: idéntico a no pasar el parámetro', () => {
    expect(getStoreIcon('Lidl', null)).toEqual(getStoreIcon('Lidl'))
    expect(getStoreIcon('Lidl', undefined)).toEqual(getStoreIcon('Lidl'))
  })

  it('una tienda sin marca reconocible sigue cayendo al emoji por defecto, con o sin logoAsset', () => {
    expect(getStoreIcon('Frutería de la esquina')).toEqual({ kind: 'emoji', icon: '🏬' })
    expect(getStoreIcon('Frutería de la esquina', 'inexistente')).toEqual({ kind: 'emoji', icon: '🏬' })
  })

  it('cadenas del catálogo base añadidas en la Fase 2 (Carrefour/Eroski/Dia/Alcampo ya existían; El Corte Inglés/Hipercor son nuevas) resuelven a su propio favicon, nunca al de la otra', () => {
    expect(getStoreIcon('Carrefour')).toEqual({ kind: 'logo', domain: 'carrefour.es' })
    expect(getStoreIcon('Eroski')).toEqual({ kind: 'logo', domain: 'eroski.es' })
    expect(getStoreIcon('Dia')).toEqual({ kind: 'logo', domain: 'dia.es' })
    expect(getStoreIcon('Alcampo')).toEqual({ kind: 'logo', domain: 'alcampo.es' })
    expect(getStoreIcon('El Corte Inglés')).toEqual({ kind: 'logo', domain: 'elcorteingles.es' })
    expect(getStoreIcon('Hipercor')).toEqual({ kind: 'logo', domain: 'hipercor.es' })
  })
})

// Encargo "COM-02 — recuperar los logotipos de las tiendas". Causa real (ver comentario en
// domain/storeIcons.ts): el emparejamiento solo comparaba el nombre COMPLETO, así que un establecimiento
// guardado con el texto más largo que trae el banco nunca encontraba su logo — nunca una ruta rota, un
// asset perdido ni un problema de Safari/GitHub Pages. Nunca fue una regresión para Amazon/Charter
// (jamás tuvieron entrada) ni para Covirán/Manper (nunca estuvieron en el catálogo de cadenas).
describe('COM-02 — reconoce la cadena como palabra completa dentro de un nombre más largo (texto de banco)', () => {
  it('Hiperber y Consum: ya tenían su dominio en el diccionario, pero el nombre exacto del banco nunca lo encontraba — ahora sí', () => {
    expect(getStoreIcon('HIPERBER DISTRIBUCION Y L-RAFAL')).toEqual({ kind: 'logo', domain: 'hiperber.es' })
    expect(getStoreIcon('SUPERMERCADO CONSUM RAFAL-RAFAL')).toEqual({ kind: 'logo', domain: 'consum.es' })
    expect(getStoreIcon('Supermercado Consum Rafal-Rafal')).toEqual({ kind: 'logo', domain: 'consum.es' })
  })

  it('Amazon: dominio nuevo (amazon.es, comprobado), reconoce tanto el ticket como el texto de banco', () => {
    expect(getStoreIcon('Amazon')).toEqual({ kind: 'logo', domain: 'amazon.es' })
    expect(getStoreIcon('WWW.AMAZON-LUXEMBOURG')).toEqual({ kind: 'logo', domain: 'amazon.es' })
  })

  it('Covirán: dominio nuevo (coviran.es, comprobado), reconoce la variante con tilde y la del banco sin tilde', () => {
    expect(getStoreIcon('Covirán')).toEqual({ kind: 'logo', domain: 'coviran.es' })
    expect(getStoreIcon('SUPERMERCADO COVIRAN-ALMORADI')).toEqual({ kind: 'logo', domain: 'coviran.es' })
  })

  it('Manper: dominio nuevo (manper.com, comprobado), reconoce el nombre con "Supermercados" delante', () => {
    expect(getStoreIcon('Manper')).toEqual({ kind: 'logo', domain: 'manper.com' })
    expect(getStoreIcon('Supermercados Manper')).toEqual({ kind: 'logo', domain: 'manper.com' })
  })

  it('Charter: sin dominio propio verificable, usa su logo real dado directamente por el usuario (imagen empaquetada) en vez del favicon de Consum', () => {
    expect(getStoreIcon('Charter')).toEqual({ kind: 'image', src: expect.any(String) })
    expect(getStoreIcon('Charter')).not.toEqual({ kind: 'logo', domain: 'consum.es' })
  })

  it('nunca coincidencia parcial de una palabra: una cadena NO aparece dentro de una tienda real distinta solo por contener las mismas letras', () => {
    expect(getStoreIcon('Consumibles de Oficina SL')).toEqual({ kind: 'emoji', icon: '🏬' })
    expect(getStoreIcon('Aldilandia Juguetería')).toEqual({ kind: 'emoji', icon: '🏬' })
  })

  it('logoAsset (vínculo manual a una cadena) y una foto personalizada siguen ganando siempre, igual que antes — esto no las toca', () => {
    expect(getStoreIcon('Carnicería Manolo', 'carrefour')).toEqual({ kind: 'emoji', icon: '🏬' })
  })

  it('Mercadona/Lidl/Carrefour/Alcampo (ya funcionaban) y Superdumbo (imagen empaquetada) siguen exactamente igual', () => {
    expect(getStoreIcon('Mercadona')).toEqual({ kind: 'logo', domain: 'mercadona.es' })
    expect(getStoreIcon('Lidl')).toEqual({ kind: 'logo', domain: 'lidl.es' })
    expect(getStoreIcon('Carrefour')).toEqual({ kind: 'logo', domain: 'carrefour.es' })
    expect(getStoreIcon('Alcampo')).toEqual({ kind: 'logo', domain: 'alcampo.es' })
    expect(getStoreIcon('Superdumbo')).toEqual({ kind: 'image', src: expect.any(String) })
  })

  it('Charter: la coincidencia por palabra completa también cubre su imagen empaquetada, no solo los dominios en vivo', () => {
    const charter = getStoreIcon('Charter')
    expect(getStoreIcon('SUPERMERCADO CHARTER RAFAL')).toEqual(charter)
    expect(getStoreIcon('CHARTER-ALMORADI')).toEqual(charter)
  })
})
