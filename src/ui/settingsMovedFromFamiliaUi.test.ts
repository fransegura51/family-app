// 16/10/2026 — «En Familia hay varios botones que son de configuraciones que no tienen nada que ver con la familia: trasládalos a Configuración».
// Se mueven: Cerrar sesión, Avisos en este móvil, permiso «Permitir siempre» (Android), guía de batería, Pepa: tarjeta de confirmación y Borrar mi cuenta.
// Se quedan en Familia: Actividad reciente, los miembros (añadir, editar, ordenar) y Peso y medidas.
import { describe, expect, it } from 'vitest'
import family from '@/ui/FamilyScreen.tsx?raw'
import settings from '@/ui/MenuSettingsScreen.tsx?raw'
import app from '@/App.tsx?raw'
import onboarding from '@/ui/NotificationsOnboarding.tsx?raw'
import ayuda from '@/ui/AyudaScreen.tsx?raw'

const MOVED = ['NotificationsCard', 'PepaPreferencesCard', 'BackgroundLocationCard', 'BatteryGuideCard', 'DeleteAccountCard']

describe('Familia ya solo tiene lo de la familia', () => {
  it('no enseña ninguna de las tarjetas que se han llevado a Configuración, ni «Cerrar sesión»', () => {
    for (const name of MOVED) expect(family).not.toContain(name)
    expect(family).not.toContain('Cerrar sesión')
    expect(family).not.toContain('signOut')
  })

  it('conserva lo suyo: Actividad reciente, los miembros, añadir miembro y Peso y medidas', () => {
    expect(family).toContain('Actividad reciente')
    expect(family).toContain('+ Añadir miembro')
    expect(family).toContain('Peso y medidas')
    expect(family).toContain('<AddMemberForm')
    expect(family).toContain('<EditMemberForm')
  })
})

describe('Configuración tiene lo que salió de Familia, en temas que se abren y se cierran', () => {
  it('tema «Avisos»: los avisos del móvil, el permiso de Android y la guía de batería, en ese orden', () => {
    expect(settings).toMatch(/title="Avisos"[\s\S]*?<NotificationsCard \/>\s*<BackgroundLocationCard \/>\s*<BatteryGuideCard \/>/)
    expect(settings).toContain("open={openGroup === 'avisos'}")
  })

  it('tema «Pepa»: la tarjeta de confirmación y los botones clásicos', () => {
    expect(settings).toMatch(/title="Pepa"[\s\S]*?<PepaPreferencesCard \/>\s*<ClassicButtonsCard \/>/)
  })

  it('tema «Mi cuenta»: cerrar sesión (anulando antes la llave de ubicación) y borrar mi cuenta, con el rol real de quien mira', () => {
    expect(settings).toContain('title="Mi cuenta"')
    expect(settings).toContain('<SignOutCard displayName={profile.displayName} />')
    expect(settings).toMatch(/await disableNativeUpload\(\)[\s\S]*?await supabase\.auth\.signOut\(\{ scope: 'local' \}\)/)
    expect(settings).toContain("<DeleteAccountCard isAdmin={profile.role === 'admin'} />")
  })

  it('todos los temas tienen su propio color (se pide uno más por cada tema nuevo; los de antes no cambian)', () => {
    expect(settings).toContain('pastelPalette(12)')
    expect(settings).toContain('groupColors[9]')
    expect(settings).toContain('groupColors[10]')
  })
})

describe('cualquier persona llega a esas opciones', () => {
  it('la ruta de Configuración recibe el perfil y no está limitada a administradoras', () => {
    expect(app).toContain('<Route path="/menu-organizar" element={<MenuSettingsScreen profile={profile} />} />')
    expect(app).not.toMatch(/isAdmin[^\n]*menu-organizar|menu-organizar[^\n]*isAdmin/)
  })

  it('los textos que mandaban a Familia ahora mandan a Configuración', () => {
    expect(onboarding).toContain('☰ Menú → Configuración → Avisos')
    expect(onboarding).not.toContain('entra en Familia')
    expect(ayuda).toContain('Avisos (antes en Familia)')
    expect(ayuda).toContain('Mi cuenta (antes en Familia)')
    expect(ayuda).toContain('aparece en Configuración → Avisos una tarjeta')
  })
})
