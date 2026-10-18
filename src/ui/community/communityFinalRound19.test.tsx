// Ronda 19/10/2026: «Mi perfil de Comunidad», Novedades con lo no leído primero, botón ☰ Menú unificado y criterio editorial.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityCardItem } from '@/domain/community'
import { clearOpenedLocally, groupByRead, markOpenedLocally } from '@/domain/communityRead'
import { myProfileSubCrumbs } from '@/ui/community/communityNav'
import { saveProfileScroll, takeProfileScroll } from '@/ui/community/profileScroll'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const profile = read('src/ui/community/ProfilePage.tsx')
const recent = read('src/ui/community/RecentPage.tsx')
const layout = read('src/ui/community/CommunityLayout.tsx')
const communityCss = read('src/ui/community/community.css')
const profileCss = read('src/ui/community/communityProfile.css')

const card = (id: string, createdAt: string, readState: 'read' | 'updated' | null): CommunityCardItem => ({ id, createdAt, readState }) as unknown as CommunityCardItem

afterEach(() => clearOpenedLocally())

describe('Mi perfil de Comunidad', () => {
  it('el orden: cabecera con estadísticas, dos tarjetas (medallas y ajustes) y, justo debajo, lo que he compartido', () => {
    const head = profile.indexOf('community-profile-head')
    const stats = profile.indexOf('community-profile-stats')
    const tiles = profile.indexOf('community-profile-tiles')
    const posts = profile.indexOf('<ProfilePosts')
    expect(head).toBeGreaterThan(-1)
    expect(stats).toBeGreaterThan(head)
    expect(tiles).toBeGreaterThan(stats)
    expect(posts).toBeGreaterThan(tiles)
    expect(profile).toContain('Mi perfil de Comunidad')
    expect(profile).toContain("{mine ? 'Lo que he compartido' : 'Lo que ha compartido'}")
  })
  it('las dos tarjetas llevan a las medallas y a los ajustes, con icono, título y descripción', () => {
    expect(profile).toContain('<Link to={paths.medals} className="community-profile-tile">')
    expect(profile).toContain('<Link to={paths.myProfile} className="community-profile-tile">')
    for (const t of ['🏅', 'Mis medallas', 'Logros y reconocimientos', '⚙️', 'Mis ajustes', 'Alias, avisos y privacidad']) expect(profile).toContain(t)
  })
  it('las medallas ya no son una lista larga en el perfil propio y el enlace redundante desaparece', () => {
    expect(profile).not.toContain('Cambiar mi alias y mis ajustes')
    expect(profile).not.toContain('MedalsContent')
    expect(profile).not.toContain('profile-medals-mine')
  })
  it('SOLO el perfil propio (isMe, decidido por el servidor) tiene las tarjetas de ajustes; el de otra persona conserva sus medallas públicas y ningún acceso privado', () => {
    const start = profile.indexOf('community-profile-tiles')
    expect(profile.slice(profile.lastIndexOf('{', start - 30) - 20, start)).toContain('profile.isMe')
    expect((profile.match(/paths\.myProfile/g) ?? []).length).toBe(1)
    expect((profile.match(/paths\.medals/g) ?? []).length).toBe(1)
    expect(profile).toContain('{!profile.isOfficial && !profile.isMe && (')
    expect(profile).toContain('!p.isOfficial && !p.isMe')
  })
  it('conserva «Todo lo publicado» y «Recetas» en lo compartido', () => {
    expect(profile).toContain('Todo lo publicado')
    expect(profile).toContain('Recetas ({recipeCount})')
  })
  it('«Mis medallas» y «Mis ajustes» vuelven al perfil por su miga; con «atrás» se recupera el punto de la pantalla', () => {
    const crumbs = myProfileSubCrumbs('Medallas', 'abc')
    expect(crumbs.map((c) => c.label)).toEqual(['Inicio', 'Comunidad', 'Mi perfil', 'Medallas'])
    expect(crumbs[2].to).toBe('/comunidad/u/abc')
    expect(myProfileSubCrumbs('Mis ajustes', null)[2].to).toBe('/comunidad/mi-perfil')
    expect(read('src/ui/community/MedalsPage.tsx')).toContain("myProfileSubCrumbs('Medallas', me?.id)")
    expect(read('src/ui/community/MySettingsPage.tsx')).toContain("myProfileSubCrumbs('Mis ajustes', me?.id)")
    expect(profile).toContain("navType === 'POP'")
    const mem = new Map<string, string>()
    vi.stubGlobal('window', { sessionStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } })
    saveProfileScroll('p1', 640.4)
    expect(takeProfileScroll('p1')).toBe(640)
    expect(takeProfileScroll('p1')).toBe(0) // se gasta al usarla
    vi.unstubAllGlobals()
  })
  it('diseño móvil: dos columnas iguales sin desbordar', () => {
    expect(profileCss).toMatch(/\.community-profile-tiles \{[^}]*grid-template-columns: 1fr 1fr/)
    expect(profileCss).toMatch(/\.community-profile-tile \{[^}]*min-width: 0/)
    expect(profileCss).toMatch(/\.community-profile-tile strong \{[^}]*overflow-wrap: anywhere/)
  })
})

describe('Novedades · Últimas publicaciones', () => {
  it('no leídas arriba y leídas debajo, cada grupo de más reciente a más antigua', () => {
    const g = groupByRead([card('a', '2026-10-17T10:00:00Z', 'read'), card('b', '2026-10-16T10:00:00Z', null), card('c', '2026-10-15T10:00:00Z', 'updated'), card('d', '2026-10-18T10:00:00Z', 'read')])
    expect(g.grouped).toBe(true)
    expect(g.unread.map((x) => x.id)).toEqual(['b', 'c'])
    expect(g.read.map((x) => x.id)).toEqual(['d', 'a'])
  })
  it('sin ninguna pendiente no hay grupos ni bloque vacío: se ven las leídas con normalidad', () => {
    const g = groupByRead([card('a', '2026-10-17T10:00:00Z', 'read'), card('d', '2026-10-18T10:00:00Z', 'read')])
    expect(g.grouped).toBe(false)
    expect(g.unread).toEqual([])
    expect(g.read.map((x) => x.id)).toEqual(['d', 'a'])
  })
  it('al abrir una publicación y volver, pasa al grupo de leídas sin volver a pedir la lista', () => {
    const items = [card('a', '2026-10-18T10:00:00Z', null), card('b', '2026-10-17T10:00:00Z', null)]
    expect(groupByRead(items).unread.map((x) => x.id)).toEqual(['a', 'b'])
    markOpenedLocally('a')
    const g = groupByRead(items)
    expect(g.unread.map((x) => x.id)).toEqual(['b'])
    expect(g.read.map((x) => x.id)).toEqual(['a'])
  })
  it('usa el orden «no leídas primero» del servidor (por cuenta) con encabezados distintos; «Seguidos» conserva su orden por fecha', () => {
    expect(recent).toContain("order: following ? 'recientes' : 'no_leidas'")
    expect(recent).toContain('📬 Sin leer')
    expect(recent).toContain('✓ Ya leídas')
    expect(recent).toContain('Primero lo que todavía no has leído')
    expect(recent).toContain('const grouped = !following && split.grouped')
    expect(recent).toContain("meta: { order: following ? 'recientes' : 'no_leidas'")
  })
})

describe('botón ☰ Menú de Comunidad', () => {
  it('es el mismo botón flotante del resto de PEPA, medido sobre la cabecera, sin franja superior ni reglas propias', () => {
    expect(layout).toContain('<MenuFab')
    expect(layout).toContain('useMenuFabTop(headerRef)')
    expect(layout).toContain('<CommunityHeader headerRef={headerRef} onImageLoad={measureFab} />')
    expect(layout).not.toContain('community-topstrip')
    expect(layout).not.toContain('community-menu-btn')
    expect(communityCss).not.toContain('community-menu-btn')
    expect(communityCss).not.toContain('community-topstrip')
  })
  it('pulsar el botón no cuenta como «tocar fuera» (abre y cierra con un solo toque) y al abrir se sube arriba', () => {
    expect(layout).toContain('!menuButtonRef.current?.contains(t)')
    expect(layout).toContain("window.scrollTo({ top: 0, behavior: 'smooth' })")
  })
})
