// Preferencia «hacerlo directamente, sin tarjeta»: por defecto directo en la app nativa y con tarjeta en la web; lo elegido se recuerda en el aparato.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import voiceCapture from '@/ui/VoiceCapture.tsx?raw'
import family from '@/ui/FamilyScreen.tsx?raw'

const native = vi.hoisted(() => ({ value: false }))
vi.mock('@/services/nativeApp', () => ({ isNativeApp: () => native.value }))

import { getAutoConfirm, setAutoConfirm } from '@/services/pepaPreferences'

let store: Record<string, string>

beforeEach(() => {
  store = {}
  native.value = false
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('preferencia de la tarjeta de confirmación', () => {
  it('por defecto: con tarjeta en la web y directo en la app nativa', () => {
    expect(getAutoConfirm()).toBe(false)
    native.value = true
    expect(getAutoConfirm()).toBe(true)
  })

  it('lo que se elige se recuerda y manda sobre el valor por defecto', () => {
    native.value = true
    setAutoConfirm(false)
    expect(getAutoConfirm()).toBe(false)
    native.value = false
    setAutoConfirm(true)
    expect(getAutoConfirm()).toBe(true)
  })

  it('sin localStorage no rompe nada y usa el valor por defecto', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(() => setAutoConfirm(true)).not.toThrow()
    expect(getAutoConfirm()).toBe(false)
  })

  it('«Hablar con PEPA» lee la preferencia y Familia deja cambiarla', () => {
    expect(voiceCapture).toContain('autoConfirm: () => getAutoConfirm()')
    expect(family).toContain('<PepaPreferencesCard />')
  })
})
