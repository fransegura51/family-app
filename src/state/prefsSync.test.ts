import { describe, expect, it, vi } from 'vitest'
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
import { isSyncedPrefKey } from './prefsSync'

describe('isSyncedPrefKey', () => {
  it('sincroniza menús, pestañas fijadas, tema y orden de Inicio', () => {
    for (const k of ['familyapp:compras-menu-layout', 'familyapp:compras-pinned-tabs', 'familyapp:color-theme', 'familyapp:home-card-order', 'familyapp:tab-order:x', 'pepa:auto-confirm', 'familyapp:calendar-onboarding-seen:1', 'familyapp:kids-theme:abc', 'pepa.eventMenuView', 'pepa.reviewInvite.until'])
      expect(isSyncedPrefKey(k)).toBe(true)
  })
  it('no sincroniza lo propio del aparato ni claves ajenas', () => {
    for (const k of ['familyapp:location-sharing-member-id', 'familyapp:location-visit-candidate', 'familyapp:pepa-fab-positions', 'familyapp:social-menu-fab-position', 'pepa:shared-class', 'otra:clave', 'sb-token'])
      expect(isSyncedPrefKey(k)).toBe(false)
  })
})
