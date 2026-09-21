import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSharedClassEnabled, setSharedClassEnabled } from './sharedClassFlag'

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('interruptor del aprendizaje compartido en las lecturas', () => {
  it('por defecto está activo', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(isSharedClassEnabled()).toBe(true)
  })

  it('se apaga con «off» (y las pantallas vuelven al comportamiento anterior) y se vuelve a encender', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    setSharedClassEnabled(false)
    expect(storage.getItem('pepa:shared-class')).toBe('off')
    expect(isSharedClassEnabled()).toBe(false)
    setSharedClassEnabled(true)
    expect(isSharedClassEnabled()).toBe(true)
  })

  it('sin almacenamiento disponible no rompe y queda activo', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(isSharedClassEnabled()).toBe(true)
    expect(() => setSharedClassEnabled(false)).not.toThrow()
  })
})
