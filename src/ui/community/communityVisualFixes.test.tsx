// Correcciones visuales de Comunidad (17/10/2026): marco con «☰ Menú» desplegable y barra de herramientas (antes, menú superior en dos niveles), «Invitar amigos» al final de la portada, generador de alias en el formulario y
// tarjeta de Comunidad en Inicio. Se leen los fuentes (estructura) y el CSS; el comportamiento real se comprueba además en el navegador.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import layoutSrc from '@/ui/community/CommunityLayout.tsx?raw'
import homeSrc from '@/ui/community/CommunityHome.tsx?raw'
import aliasSrc from '@/ui/community/AliasDialog.tsx?raw'
import homeScreenSrc from '@/ui/HomeScreen.tsx?raw'
import menuSrc from '@/ui/community/CommunityMenu.tsx?raw'
import toolbarSrc from '@/ui/community/CommunityToolbar.tsx?raw'
import stateSrc from '@/state/communityMenu.ts?raw'
import { communityToolbarItems } from '@/ui/community/CommunityToolbar'
import { nextFloatingHidden } from '@/ui/community/useHideFloatingOnScroll'
import { NAV_SECTION_COLORS, NAV_TABS, navSectionId } from '@/domain/navTabs'

const css = readFileSync(join(process.cwd(), 'src/ui/community/community.css'), 'utf8')

describe('marco de Comunidad: «☰ Menú» desplegable + barra de herramientas (sustituyen a las cuatro pestañas grandes)', () => {
  it('el menú desplegable tiene los tres destinos (Portada, Recetas y cocina, Hogar y familia) y reutiliza las clases del desplegable de Compras', () => {
    for (const label of ['Portada', 'Recetas y cocina', 'Hogar y familia']) expect(stateSrc, label).toContain(`label: '${label}'`)
    for (const cls of ['economia-menu-dropdown', 'economia-menu-row', 'economia-menu-item', 'economia-menu-pin', 'economia-menu-edit-toggle', 'economia-menu-edit-controls']) {
      expect(menuSrc, cls).toContain(cls)
    }
    // El diseño antiguo (cuatro botones grandes + «Más opciones») ya no existe.
    expect(layoutSrc).not.toContain('community-nav')
    expect(layoutSrc).not.toContain('Más opciones')
  })

  it('el botón «☰ Menú» anuncia si está abierto (aria-expanded / aria-controls) y el panel se cierra con Escape, tocando fuera, al elegir y con «Cerrar»', () => {
    expect(layoutSrc).toContain('aria-expanded={menuOpen}')
    expect(layoutSrc).toContain('aria-controls="community-menu"')
    expect(menuSrc).toContain('id="community-menu"')
    expect(layoutSrc).toContain("e.key === 'Escape'")
    expect(layoutSrc).toContain("document.addEventListener('mousedown', onOutside)")
    expect(layoutSrc).toContain("document.addEventListener('touchstart', onOutside")
    expect(layoutSrc).toContain('}, [location.pathname])')
    expect(menuSrc).toContain('onClick={onClose}')
  })

  it('el destino actual se destaca (active / aria-current) y los accesos «sacados» se ven como botones en la pantalla', () => {
    expect(menuSrc).toContain("(activeKey === key ? ' active' : '')")
    expect(menuSrc).toContain("aria-current={activeKey === key ? 'page' : undefined}")
    expect(layoutSrc).toContain("className={'chip' + (activeKey === key ? ' chip-active' : '')}")
  })

  it('Administración no está en la barra: es un enlace discreto dentro del menú y solo para la administración', () => {
    expect(menuSrc).toContain('{isAdmin && !editMode && (')
    expect(menuSrc).toContain('🛠️ Administración')
    expect(communityToolbarItems('abc').map((i) => i.label)).not.toContain('Administración')
    expect(toolbarSrc).not.toContain('paths.admin')
  })

  it('la barra tiene Buscar, Guardados, Borradores, Novedades, Mi perfil y Publicar (sin Medallas) y los permisos siguen igual en solo lectura', () => {
    const labels = communityToolbarItems('abc').map((i) => i.label)
    expect(labels).toEqual(['Buscar', 'Guardados', 'Borradores', 'Novedades', 'Mi perfil', 'Publicar'])
    expect(labels).not.toContain('Medallas')
    const readOnly = communityToolbarItems('abc').filter((i) => !i.participates).map((i) => i.label)
    expect(readOnly).toEqual(['Buscar', 'Novedades'])
    expect(toolbarSrc).toContain('canParticipate || !i.participates')
  })

  it('el CSS: toolbar en UNA fila sin desplazamiento lateral y botones de 48 px; «Publicar» más destacado; cabecera a todo el ancho y con su proporción', () => {
    const bar = css.slice(css.indexOf('.community-toolbar {'), css.indexOf('/* Mientras se baja'))
    expect(bar).toContain('display: flex')
    expect(bar).not.toContain('flex-wrap')
    expect(bar).not.toContain('overflow-x')
    expect(bar).toContain('min-height: 48px')
    expect(bar).toMatch(/\.community-toolbar-publish \{[^}]*flex: 1\.3/)
    const header = css.slice(css.indexOf('.community-header {'), css.indexOf('/* Barra de herramientas'))
    expect(header).toContain('margin: 0 -16px 8px')
    expect(header).toContain('width: 100%')
    expect(header).toContain('height: auto')
    expect(header).not.toContain('max-height')
    expect(header).not.toContain('object-fit')
  })

  it('los botones flotantes de arriba se esconden al bajar por la página y vuelven al subir (sin tapar texto ni fotos)', () => {
    expect(layoutSrc).toContain('useHideFloatingOnScroll()')
    expect(css).toContain('body.community-floating-hidden .voice-fab-round')
    expect(nextFloatingHidden(false, 0, 40)).toBe(false) // arriba del todo: siempre a la vista
    expect(nextFloatingHidden(false, 100, 300)).toBe(true) // bajando
    expect(nextFloatingHidden(true, 300, 296)).toBe(true) // un temblor pequeño no los hace aparecer
    expect(nextFloatingHidden(true, 300, 200)).toBe(false) // subiendo
  })

  it('ya no hay aviso de «Vista previa para administración»: Comunidad se ve igual para todas las personas con acceso', () => {
    expect(layoutSrc).not.toContain('Vista previa para administración')
    expect(layoutSrc).not.toContain('community-preview-banner')
  })
})

describe('«Invitar amigos» al final de la portada de Comunidad', () => {
  it('ya no está junto a las migas y sí después de todos los bloques, desactivado como antes', () => {
    const body = homeSrc.slice(homeSrc.indexOf('return (\n    <>'))
    expect(body.indexOf('<InviteFriendsButton />')).toBeGreaterThan(body.indexOf('community-home-sections'))
    expect(body.indexOf('<InviteFriendsButton />')).toBeGreaterThan(body.indexOf('visible.map((block)'))
    expect(body.indexOf('<InviteFriendsButton />')).toBeGreaterThan(body.indexOf('Algunos bloques no se han podido cargar'))
    expect(body.match(/<InviteFriendsButton \/>/g)).toHaveLength(1)
    const btn = readFileSync(join(process.cwd(), 'src/ui/InviteFriendsButton.tsx'), 'utf8')
    expect(btn).toContain('disabled')
    expect(btn).toContain('Invitar amigos (próximamente)')
  })
})

describe('formulario «Elige tu alias»', () => {
  it('propone un alias al abrir (solo al crear), tiene «🎲 Sugerir otro» y no guarda hasta confirmar', () => {
    expect(aliasSrc).toContain("import { suggestAlias } from '@/domain/communityAlias'")
    expect(aliasSrc).toContain('current?.alias ?? (creating ? suggestAlias() : \'\')')
    expect(aliasSrc).toContain('🎲 Sugerir otro')
    expect(aliasSrc).toContain('onClick={suggestAnother}')
    // setCommunityAlias solo se llama desde save(), que solo se llama desde el botón «Guardar y continuar».
    expect(aliasSrc.match(/setCommunityAlias\(/g)).toHaveLength(1)
    expect(aliasSrc).toContain('onClick={() => void save()}')
    // El icono sigue siendo independiente del alias.
    expect(aliasSrc).toContain('community-avatar-picker')
    expect(aliasSrc).toContain('setEmoji(emoji === a ? null : a)')
  })

  it('si el servidor dice que la propuesta automática ya está cogida, se cambia por otra; si la escribió la persona, se le explica sin cambiarla', () => {
    expect(aliasSrc).toContain("toCommunityError(e).code === 'ALIAS_TAKEN' && generated !== null && alias.trim() === generated")
    expect(aliasSrc).toContain('communityErrorText(e)')
  })
})

describe('tarjeta de Comunidad PEPA en Inicio', () => {
  it('es una tarjeta del mismo componente (HomeCard) con su pastel propio, sin enlace de texto y solo con Comunidad visible', () => {
    expect(homeScreenSrc).not.toContain('CommunityHomeEntry')
    expect(homeScreenSrc).toContain("id: 'comunidad'")
    expect(homeScreenSrc).toContain("NAV_SECTION_COLORS.get('comunidad')")
    // La tarjeta pasa por el mismo HomeCard y la misma rejilla que las demás.
    expect(homeScreenSrc).toContain('{orderedCards.map((card, i) => (')
    expect(homeScreenSrc).toContain('<HomeCard')
  })

  it('el pastel de Comunidad no coincide con el de ninguna otra tarjeta y no cambia los de las demás', () => {
    const community = NAV_SECTION_COLORS.get('comunidad')
    expect(community).toBeTruthy()
    const others = [...NAV_SECTION_COLORS.entries()].filter(([k]) => k !== 'comunidad').map(([, v]) => v)
    expect(others).not.toContain(community)
    // Los colores de las 12 secciones y de Ayuda/Sugerencias/Configuración siguen siendo los de siempre (por índice).
    expect(NAV_SECTION_COLORS.get(navSectionId(NAV_TABS[1]))).toBeTruthy()
  })
})
