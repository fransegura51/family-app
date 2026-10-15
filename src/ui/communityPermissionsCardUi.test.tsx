// Tarjeta «Permisos de Comunidad» de Familia (solo administradores): render estático con datos simulados, abierta y cerrada, y reglas de la tarjeta.
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import cardSrc from '@/ui/CommunityPermissionsCard.tsx?raw'
import familySrc from '@/ui/FamilyScreen.tsx?raw'
import dataSrc from '@/data/communityMinors.ts?raw'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MinorPermission } from '@/domain/communityAccess'

const cssSrc = readFileSync(join(process.cwd(), 'src/ui/communityPermissionsCard.css'), 'utf8')

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

import { CommunityPermissionsCard, CommunityPermissionsView, type CommunityPermissionsViewProps } from '@/ui/CommunityPermissionsCard'

const base = { updatedAt: null, canRead: false, canParticipate: false }
const LUCIA: MinorPermission = { ...base, profileId: 'p-lucia', name: 'Lucía', age: 16, status: 'configurable' }
const MARCOS: MinorPermission = { ...base, profileId: 'p-marcos', name: 'Marcos', age: 17, status: 'configurable', canRead: true, canParticipate: true }
const MATEO: MinorPermission = { ...base, profileId: 'p-mateo', name: 'Mateo', age: 11, status: 'under_15' }
const SOFIA: MinorPermission = { ...base, profileId: 'p-sofia', name: 'Sofía', age: null, status: 'needs_birthdate' }

function view(over: Partial<CommunityPermissionsViewProps> = {}) {
  return renderToStaticMarkup(
    <CommunityPermissionsView open load="ready" loadError={null} items={[]} rows={{}} onToggleOpen={() => undefined} onChange={() => undefined} onRetry={() => undefined} {...over} />,
  )
}

describe('tarjeta cerrada (compacta y sin consultas)', () => {
  it('solo enseña el título y una frase; no muestra nombres ni interruptores', () => {
    const html = view({ open: false, load: 'idle' })
    expect(html).toContain('Permisos de Comunidad')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('de 15 a 17 años')
    expect(html).not.toContain('role="switch"')
    expect(html).not.toContain('Permitir leer Comunidad')
  })

  it('al renderizar la tarjeta real cerrada no se consulta nada (los efectos no hay: la consulta solo sale al abrir)', () => {
    const html = renderToStaticMarkup(<CommunityPermissionsCard />)
    expect(html).toContain('aria-expanded="false"')
    expect(cardSrc).not.toMatch(/useEffect/)
    expect(cardSrc).not.toMatch(/setInterval|setTimeout/)
  })
})

describe('tarjeta abierta', () => {
  it('explica la regla y el recordatorio legal cuando hay alguien a quien autorizar', () => {
    const html = view({ items: [LUCIA] })
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('menores de 15 años no pueden entrar')
    expect(html).toContain('De 15 a 17 años solo entran si vosotros lo autorizáis')
    expect(html).toContain('madre, el padre o la persona tutora legal')
    expect(html).toContain('retirar el permiso cuando quieras')
  })

  it('por cada persona de 15 a 17: dos interruptores etiquetados, con el estado actual', () => {
    const html = view({ items: [LUCIA, MARCOS] })
    expect(html).toContain('Lucía (16 años)')
    expect(html).toContain('Marcos (17 años)')
    expect((html.match(/role="switch"/g) ?? []).length).toBe(4)
    expect((html.match(/Permitir leer Comunidad/g) ?? []).length).toBe(2)
    expect((html.match(/Permitir participar en Comunidad/g) ?? []).length).toBe(2)
    // Cada interruptor tiene nombre (aria-labelledby) y descripción (aria-describedby) propios.
    expect(html).toContain('aria-labelledby="cp-read-p-lucia-label"')
    expect(html).toContain('id="cp-read-p-lucia-label"')
    expect(html).toContain('aria-describedby="cp-part-p-marcos-help"')
    // Lucía: ambos apagados (por defecto). Marcos: ambos encendidos.
    const lucia = html.slice(html.indexOf('Lucía (16 años)'), html.indexOf('Marcos (17 años)'))
    expect(lucia).not.toContain('checked')
    const marcos = html.slice(html.indexOf('Marcos (17 años)'))
    expect((marcos.match(/checked=""/g) ?? []).length).toBe(2)
  })

  it('los dos permisos están desactivados por defecto para quien no tiene ninguno', () => {
    expect(view({ items: [LUCIA] })).not.toContain('checked')
  })

  it('«Guardando…», «Guardado» y los errores se anuncian con una región de estado', () => {
    expect(view({ items: [LUCIA], rows: { 'p-lucia': { phase: 'saving' } } })).toContain('Guardando…')
    expect(view({ items: [LUCIA], rows: { 'p-lucia': { phase: 'saving' } } })).toContain('disabled=""')
    expect(view({ items: [LUCIA], rows: { 'p-lucia': { phase: 'saved' } } })).toContain('✓ Guardado')
    const err = view({ items: [LUCIA], rows: { 'p-lucia': { phase: 'error', error: 'No se ha podido guardar el cambio. Inténtalo de nuevo.' } } })
    expect(err).toContain('No se ha podido guardar el cambio')
    expect(err).toContain('cp-status-error')
    expect(err).toContain('aria-live="polite"')
    // Sin cambios no hay texto pero el elemento existe, para que el lector de pantalla anuncie lo que llegue.
    expect(view({ items: [LUCIA] })).toContain('role="status" aria-live="polite"')
  })

  it('menores de 15: solo informativo (sin interruptores); sin fecha de nacimiento: aviso para añadirla', () => {
    const html = view({ items: [MATEO, SOFIA] })
    expect(html).toContain('Mateo (11 años): aún no puede acceder')
    expect(html).toContain('Sofía')
    expect(html).toContain('Añade su fecha de nacimiento en su ficha de familia')
    expect(html).not.toContain('role="switch"')
    // Sin nadie a quien autorizar no se repite el recordatorio legal (tarjeta compacta).
    expect(html).not.toContain('madre, el padre')
  })

  it('sin nadie en esos casos: texto corto', () => {
    const html = view({ items: [] })
    expect(html).toContain('Ahora mismo nadie de vuestra familia necesita este permiso.')
    expect(html).not.toContain('role="switch"')
    expect(html).not.toContain('madre, el padre')
  })

  it('cargando y error con «Volver a intentarlo»', () => {
    expect(view({ load: 'loading' })).toContain('Cargando…')
    const err = view({ load: 'error', loadError: 'Solo quien administra la familia puede cambiar estos permisos.' })
    expect(err).toContain('Solo quien administra la familia')
    expect(err).toContain('Volver a intentarlo')
    expect(err).toContain('role="alert"')
  })
})

describe('colocación y coste', () => {
  it('Familia la enseña solo a administradores y ANTES de NotificationsCard (respeta batteryGuide.test.ts)', () => {
    expect(familySrc).toContain('{isAdmin && <CommunityPermissionsCard />}')
    const iCard = familySrc.indexOf('<CommunityPermissionsCard />')
    const iNotifications = familySrc.indexOf('<NotificationsCard />')
    const iBattery = familySrc.indexOf('<BatteryGuideCard />')
    expect(iCard).toBeGreaterThan(familySrc.indexOf('<InviteFriendsButton />'))
    expect(iCard).toBeLessThan(iNotifications)
    expect(iNotifications).toBeLessThan(iBattery)
    expect(familySrc).toMatch(/<NotificationsCard \/>\s*(?:<NotificationPrefsCard \/>\s*)?(?:<TaskNotifyModeCard [^>]*\/>\s*)?(?:<PepaPreferencesCard \/>\s*)?<BatteryGuideCard \/>/)
  })

  it('una sola consulta al abrir (la primera vez) y ninguna periódica', () => {
    expect((cardSrc.match(/listMinorPermissions\(\)/g) ?? []).length).toBe(1)
    expect(cardSrc).toContain('if (next && !asked.current)')
    expect(cardSrc).not.toMatch(/setInterval|useEffect/)
  })

  it('participar fuerza leer y desactivar leer desactiva participar, con vuelta atrás si falla el guardado', () => {
    expect(cardSrc).toContain('applyMinorToggle(m, field, value)')
    expect(cardSrc).toContain('patch({ canRead: m.canRead, canParticipate: m.canParticipate })')
    expect(cardSrc).toContain("if (rows[m.profileId]?.phase === 'saving') return")
  })

  it('las llamadas usan las funciones del servidor de 0277 y la tarjeta no toca otras tablas', () => {
    for (const fn of ['community_get_access', 'community_list_minor_permissions', 'community_set_minor_permission']) expect(dataSrc).toContain(`'${fn}'`)
    expect(dataSrc).toContain('p_profile: profileId')
    expect(dataSrc).not.toMatch(/\.from\(/)
  })

  it('los interruptores miden al menos 44 px de alto de toque', () => {
    expect(cssSrc).toMatch(/\.cp-switch \{[^}]*min-height: 44px/)
    expect(cssSrc).toMatch(/\.cp-toggle \{[^}]*min-height: 44px/)
  })
})
