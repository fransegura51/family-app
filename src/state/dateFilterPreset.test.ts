import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadFavoriteDateFilterPreset, saveFavoriteDateFilterPreset } from './dateFilterPreset'

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('favorito del filtro de fecha (Bloque 5, cola nocturna) — distinto del filtro de la sesión, persistido por dispositivo', () => {
  it('por defecto es "mes" (mes contable), igual que arrancaba cada pantalla antes de este ajuste', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(loadFavoriteDateFilterPreset()).toBe('mes')
  })

  it('se guarda y se relee tal cual', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    saveFavoriteDateFilterPreset('mes_real')
    expect(storage.getItem('familyapp:date-filter-favorite')).toBe('mes_real')
    expect(loadFavoriteDateFilterPreset()).toBe('mes_real')
  })

  it('"rango" nunca se guarda como favorito — un desde/hasta concreto deja de tener sentido pasado el tiempo', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    saveFavoriteDateFilterPreset('rango')
    expect(storage.getItem('familyapp:date-filter-favorite')).toBeNull()
    expect(loadFavoriteDateFilterPreset()).toBe('mes')
  })

  it('un valor guardado antes de esta regla (una versión anterior que sí guardaba "rango") se ignora al releer, cae al valor por defecto', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    storage.setItem('familyapp:date-filter-favorite', 'rango')
    expect(loadFavoriteDateFilterPreset()).toBe('mes')
  })

  it('sin almacenamiento disponible no rompe y cae al valor por defecto', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(loadFavoriteDateFilterPreset()).toBe('mes')
    expect(() => saveFavoriteDateFilterPreset('semana')).not.toThrow()
  })
})
