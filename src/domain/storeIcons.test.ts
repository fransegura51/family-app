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
})
