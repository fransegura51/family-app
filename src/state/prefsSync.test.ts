import { describe, expect, it, vi } from 'vitest'
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
import { isSyncedPrefKey } from './prefsSync'

describe('isSyncedPrefKey', () => {
  it('sincroniza menús, pestañas fijadas, tema y orden de Inicio', () => {
    for (const k of ['familyapp:compras-menu-layout', 'familyapp:compras-pinned-tabs', 'familyapp:color-theme', 'familyapp:home-card-order', 'familyapp:tab-order:x', 'pepa:auto-confirm'])
      expect(isSyncedPrefKey(k)).toBe(true)
  })
  it('no sincroniza lo propio del aparato ni claves ajenas', () => {
    for (const k of ['familyapp:pepa-fab-positions', 'familyapp:social-menu-fab-position', 'otra:clave', 'sb-token'])
      expect(isSyncedPrefKey(k)).toBe(false)
  })
})
