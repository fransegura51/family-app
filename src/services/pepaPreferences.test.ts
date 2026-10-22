// Preferencia «hacerlo directamente, sin tarjeta»: por defecto directo en la app nativa y con tarjeta en la web; lo elegido se recuerda en el aparato.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import voiceCapture from '@/ui/VoiceCapture.tsx?raw'
import family from '@/ui/FamilyScreen.tsx?raw'
import settings from '@/ui/MenuSettingsScreen.tsx?raw'
import navShell from '@/ui/NavShell.tsx?raw'
import socialFab from '@/ui/SocialMenuFab.tsx?raw'
import ayuda from '@/help/legacy/legacyHelp.ts?raw'

const native = vi.hoisted(() => ({ value: false }))
vi.mock('@/services/nativeApp', () => ({ isNativeApp: () => native.value }))

import { getAutoConfirm, setAutoConfirm, getShowClassicButtons, setShowClassicButtons } from '@/services/pepaPreferences'

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

  it('«Hablar con PEPA» lee la preferencia y Configuración (tema «Pepa») deja cambiarla; ya no está en Familia', () => {
    expect(voiceCapture).toContain('autoConfirm: () => getAutoConfirm()')
    expect(settings).toContain('<PepaPreferencesCard />')
    expect(family).not.toContain('PepaPreferencesCard')
  })
})

describe('«Mostrar botones clásicos» (Configuración → Pepa): se esconden los cinco botones de siempre, sin borrar nada', () => {
  it('por defecto se ven, y lo elegido se recuerda en el aparato', () => {
    expect(getShowClassicButtons()).toBe(true)
    setShowClassicButtons(false)
    expect(getShowClassicButtons()).toBe(false)
    setShowClassicButtons(true)
    expect(getShowClassicButtons()).toBe(true)
  })

  it('sin localStorage no rompe nada y se quedan visibles', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(() => setShowClassicButtons(false)).not.toThrow()
    expect(getShowClassicButtons()).toBe(true)
  })

  it('en VoiceCapture solo se esconden los cinco clásicos: «Hablar con PEPA» se ve siempre y ningún botón se borra', () => {
    expect(voiceCapture).toContain('useShowClassicButtons()')
    expect(voiceCapture).toContain("PANEL_MODES.filter((m) => m !== 'talk')")
    expect(voiceCapture).toContain('PANEL_MODES.filter((m) => !CLASSIC_PANEL_MODES.includes(m))')
    // Siguen definidos los seis modos, con todo su código: ocultar no es quitar.
    for (const mode of ['ask-calendario', 'ask-compras', 'create-calendario', 'create-compras', 'search-place', 'talk']) {
      expect(voiceCapture).toContain(`'${mode}'`)
    }
    expect(voiceCapture).toContain('async function handleSearchPlace')
  })

  it('el botón de redes se recoloca solo y se elige en Configuración (tema «Pepa»), no en Familia', () => {
    expect(navShell).toContain('slot={showClassicButtons ? 5 : 1}')
    expect(socialFab).toContain('slot = DEFAULT_SLOT')
    expect(settings).toContain('<ClassicButtonsCard />')
    expect(settings).toMatch(/title="Pepa"/)
    expect(family).not.toContain('ClassicButtonsCard')
  })

  it('la ayuda explica cómo mostrarlos y ocultarlos', () => {
    expect(ayuda).toContain('Botones de Pepa: mostrar u ocultar')
    expect(ayuda).toContain('Mostrar botones clásicos')
  })
})
