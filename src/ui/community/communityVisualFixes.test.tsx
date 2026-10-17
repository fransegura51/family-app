// Correcciones visuales de Comunidad (17/10/2026): menú superior en dos niveles, «Invitar amigos» al final de la portada, generador de alias en el formulario y
// tarjeta de Comunidad en Inicio. Se leen los fuentes (estructura) y el CSS; el comportamiento real se comprueba además en el navegador.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import layoutSrc from '@/ui/community/CommunityLayout.tsx?raw'
import homeSrc from '@/ui/community/CommunityHome.tsx?raw'
import aliasSrc from '@/ui/community/AliasDialog.tsx?raw'
import homeScreenSrc from '@/ui/HomeScreen.tsx?raw'
import { NAV_SECTION_COLORS, NAV_TABS, navSectionId } from '@/domain/navTabs'

const css = readFileSync(join(process.cwd(), 'src/ui/community/community.css'), 'utf8')

describe('menú superior de Comunidad: dos niveles, sin desplazamiento lateral', () => {
  it('Portada, Recetas y cocina y Hogar y familia son las principales; el resto va en «Más opciones» y no se ha quitado ninguna', () => {
    const main = layoutSrc.slice(layoutSrc.indexOf('const LINKS'), layoutSrc.indexOf('export function CommunityLayout'))
    for (const label of ['Portada', '🍲 Recetas y cocina', '🏡 Hogar y familia']) {
      const line = main.split('\n').find((l) => l.includes(`'${label}'`))
      expect(line, label).toBeDefined()
      expect(line, label).not.toContain('secondary')
    }
    for (const label of ['🔎 Buscar', '🔖 Guardados', '📝 Borradores', '🔔 Novedades', '🏅 Medallas', '🙂 Mi perfil']) {
      const line = main.split('\n').find((l) => l.includes(`'${label}'`))
      expect(line, label).toContain('secondary: true')
    }
    // Administración (solo para la administración) sigue disponible, dentro de «Más opciones».
    expect(layoutSrc).toContain('🛠️ Administración')
    expect(layoutSrc.indexOf('🛠️ Administración')).toBeGreaterThan(layoutSrc.indexOf('community-nav-more-list'))
    expect(layoutSrc).toContain('Más opciones')
  })

  it('el botón anuncia si está abierto (aria-expanded / aria-controls) y el panel se cierra con Escape, tocando fuera, al elegir y con «Cerrar»', () => {
    expect(layoutSrc).toContain('aria-expanded={moreOpen}')
    expect(layoutSrc).toContain('aria-controls="community-nav-more"')
    expect(layoutSrc).toContain("e.key === 'Escape'")
    expect(layoutSrc).toContain("document.addEventListener('mousedown', onOutside)")
    expect(layoutSrc).toContain("document.addEventListener('touchstart', onOutside")
    expect(layoutSrc).toContain('}, [location.pathname])')
    expect(layoutSrc).toContain('>\n              Cerrar\n')
  })

  it('la sección elegida se destaca (active), también «Más opciones» cuando la página actual es una de sus opciones', () => {
    expect(layoutSrc).toContain("'community-nav-link' + (isActive ? ' active' : '')")
    expect(layoutSrc).toContain("(moreActive ? ' active' : '')")
  })

  it('el CSS reparte las principales en varias líneas si hace falta (flex-wrap) y no hay overflow-x en el menú; botones de 44 px', () => {
    const nav = css.slice(css.indexOf('.community-nav {'), css.indexOf('.community-preview-banner,'))
    expect(nav).toContain('flex-wrap: wrap')
    expect(nav).not.toContain('overflow-x')
    expect(nav).toContain('min-height: 44px')
  })

  it('los permisos siguen igual: solo lectura no ve Guardados, Borradores, Medallas ni Mi perfil', () => {
    for (const l of ['Guardados', 'Borradores', 'Medallas', 'Mi perfil']) expect(layoutSrc, l).toMatch(new RegExp(`${l}', participates: true`))
    expect(layoutSrc).toContain('canParticipate || !l.participates')
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
