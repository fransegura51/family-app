import { describe, expect, it } from 'vitest'
import { ADMIN_AREAS, adminAreaPath, legacyAdminUsagePath, legacyCommunityAdminPath, parseAdminArea } from '@/admin/adminAreas'
import { ADMIN_TABS } from '@/domain/communityAdmin'

describe('áreas del Centro de Administración', () => {
  it('son exactamente las siete, en orden, en orden', () => {
    expect(ADMIN_AREAS.map((a) => a.id)).toEqual(['resumen', 'usuarios', 'comunidad', 'ia', 'funcionalidades', 'ayuda', 'sistema'])
    expect(ADMIN_AREAS.map((a) => a.label)).toEqual([
      'Resumen general',
      'Usuarios, familias e invitaciones',
      'Comunidad y moderación',
      'Control de IA',
      'Estado de funcionalidades',
      'Ayuda y documentación',
      'Sistema',
    ])
  })
  it('un área desconocida o ausente vuelve al resumen (nunca una pantalla vacía)', () => {
    expect(parseAdminArea(null)).toBe('resumen')
    expect(parseAdminArea('nada')).toBe('resumen')
    expect(parseAdminArea('sistema')).toBe('sistema')
  })
  it('las direcciones antiguas redirigen al área que les corresponde', () => {
    expect(legacyAdminUsagePath()).toBe('/administracion?area=usuarios')
    expect(legacyCommunityAdminPath('')).toBe('/administracion?area=comunidad')
    expect(legacyCommunityAdminPath('?tab=moderacion')).toBe('/administracion?area=comunidad&tab=moderacion')
    expect(adminAreaPath('ayuda')).toBe('/administracion?area=ayuda')
  })
  it('todas las pestañas de Comunidad siguen siendo alcanzables por la redirección (?tab=…)', () => {
    for (const t of ADMIN_TABS) expect(legacyCommunityAdminPath(`?tab=${t.id}`)).toContain(`tab=${t.id}`)
    expect(ADMIN_TABS).toHaveLength(9)
  })
})
