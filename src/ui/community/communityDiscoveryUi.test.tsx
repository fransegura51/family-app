// Pantallas de descubrimiento de Comunidad (portada, sección, buscador y guardados): estructura que se ve, accesibilidad y reglas de coste.
// Se renderiza con renderToStaticMarkup (sin navegador ni red: los efectos no se ejecutan) y se lee el código fuente para lo que no se ve en el primer pintado.
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import home from '@/ui/community/CommunityHome.tsx?raw'
import section from '@/ui/community/CommunitySectionPage.tsx?raw'
import search from '@/ui/community/SearchPage.tsx?raw'
import saved from '@/ui/community/SavedPage.tsx?raw'
import list from '@/ui/community/useCommunityList.ts?raw'
import favorites from '@/ui/community/FavoriteTopicsDialog.tsx?raw'
import filterFields from '@/ui/community/DiscoveryFilterFields.tsx?raw'

// Sin servidor: la capa de datos y el proveedor se sustituyen por versiones mudas.
vi.mock('@/data/community', () => ({
  listPosts: vi.fn(async () => []),
  listCommunityTopics: vi.fn(async () => []),
  listSearches: vi.fn(async () => []),
  clearSearches: vi.fn(async () => undefined),
  recordSearch: vi.fn(async () => undefined),
  searchSuggest: vi.fn(async () => []),
  similarPosts: vi.fn(async () => []),
  getFavoriteTopics: vi.fn(async () => []),
  setFavoriteTopics: vi.fn(async () => undefined),
  unblockUser: vi.fn(async () => undefined),
  createCommunityPhotoSignedUrls: vi.fn(async () => ({})),
}))
vi.mock('@/ui/community/CommunityProvider', () => ({
  useCommunity: () => ({ status: null, me: { hasProfile: false }, loading: false, refresh: async () => undefined, requireParticipation: async () => true }),
}))

import { CommunityHome } from '@/ui/community/CommunityHome'
import { CommunitySectionPage } from '@/ui/community/CommunitySectionPage'
import { SavedPage } from '@/ui/community/SavedPage'
import { SearchPage } from '@/ui/community/SearchPage'

function render(el: React.ReactElement, url: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[url]}>{el}</MemoryRouter>)
}

describe('portada', () => {
  const html = render(<CommunityHome />, '/comunidad')

  it('da acceso a las DOS secciones, tiene buscador, «Crear publicación» y «Normas»', () => {
    expect(html).toContain('href="/comunidad/s/recetas"')
    expect(html).toContain('href="/comunidad/s/hogar"')
    expect(html).toContain('Recetas y cocina')
    expect(html).toContain('Hogar y familia')
    expect(html).toContain('role="search"')
    expect(html).toContain('Buscar en Comunidad')
    expect(html).toContain('Crear publicación')
    expect(html).toContain('href="/comunidad/normas"')
  })

  it('no repite la cabecera oficial (la pone el marco) y lleva migas', () => {
    expect(html).not.toContain('community-header')
    expect(html).not.toContain('<img')
    expect(html).toContain('aria-label="Migas de pan"')
  })

  it('los bloques sin contenido no se pintan (ni siquiera mientras carga)', () => {
    expect(html).not.toContain('Más recientes')
    expect(html).not.toContain('Más comentados')
    expect(html).not.toContain('Preguntas sin responder')
    expect(html).toContain('Cargando publicaciones')
  })

  it('el código pide una vez por bloque, sin consultas periódicas, deduplica y pide «Para mí» solo con perfil', () => {
    expect(home).toContain('dedupeBlocks')
    expect(home).toContain('HOME_BLOCK_FETCH')
    expect(home).not.toMatch(/setInterval|setTimeout/)
    expect(home).toContain('hasProfile')
    expect(home).toContain('requireParticipation()')
    expect(home).toContain('paths.newPost()')
    expect(home).toContain('paths.search(')
    expect(home).not.toContain('dangerouslySetInnerHTML')
  })
})

describe('sección', () => {
  const renderSection = (url: string) =>
    renderToStaticMarkup(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/comunidad/s/:section" element={<CommunitySectionPage />} />
        </Routes>
      </MemoryRouter>,
    )

  it('Recetas ofrece «Mejor valoradas»; Hogar y familia no', () => {
    const recetas = renderSection('/comunidad/s/recetas')
    const hogar = renderSection('/comunidad/s/hogar')
    expect(recetas).toContain('Mejor valoradas')
    expect(hogar).not.toContain('Mejor valoradas')
    for (const html of [recetas, hogar]) {
      for (const o of ['Más recientes', 'Más comentados', 'Preguntas sin responder', 'Para mí']) expect(html).toContain(o)
    }
  })

  it('muestra el título, las migas y el orden inicial «Más recientes»', () => {
    const html = renderSection('/comunidad/s/hogar')
    expect(html).toContain('<h1')
    expect(html).toContain('Hogar y familia')
    expect(html).toContain('aria-label="Migas de pan"')
    expect(html).toMatch(/<option value="recientes" selected="">Más recientes<\/option>/)
  })

  it('un orden no permitido en la dirección (valoradas en Hogar) se queda en «Más recientes»', () => {
    const html = renderSection('/comunidad/s/hogar?orden=valoradas')
    expect(html).toMatch(/<option value="recientes" selected="">Más recientes<\/option>/)
  })

  it('el orden de la dirección se respeta en Recetas', () => {
    const html = renderSection('/comunidad/s/recetas?orden=comentados')
    expect(html).toMatch(/<option value="comentados" selected="">Más comentados<\/option>/)
  })

  it('el código de la sección usa la dirección para tema, orden y tipo, y restaura solo al volver atrás', () => {
    expect(section).toContain('useNavigationType')
    expect(section).toContain("navType === 'POP'")
    expect(section).toContain('readSectionFilters')
    expect(section).toContain('sectionOrders(section)')
    expect(section).toContain('Ver más')
    expect(section).toContain('PostCardView')
    expect(section).toContain('sectionCrumbs(section)')
    expect(section).toContain('<Navigate to={paths.home} replace />')
    expect(section).toContain('Mis temas favoritos')
    expect(section).toContain('aria-pressed')
    expect(section).not.toContain('dangerouslySetInnerHTML')
  })

  it('el listado guarda y recupera lo cargado, el orden y el desplazamiento solo al volver atrás', () => {
    expect(list).toContain('loadListState')
    expect(list).toContain('saveListState')
    expect(list).toContain('clearListState')
    expect(list).toContain('scrollTo')
    expect(list).toContain('if (!restore) clearListState')
    expect(list).not.toMatch(/setInterval/)
  })

  it('los temas favoritos solo piden alias al guardar y no dejan guardar si no se pudieron leer', () => {
    const afterSave = favorites.slice(favorites.indexOf('async function save'))
    expect(afterSave.indexOf('requireParticipation()')).toBeGreaterThan(-1)
    expect(afterSave.indexOf('requireParticipation()')).toBeLessThan(afterSave.indexOf('setFavoriteTopics'))
    expect(favorites.slice(0, favorites.indexOf('async function save'))).not.toContain('requireParticipation()')
    expect(favorites).toContain('loadFailed')
    expect(favorites).toContain('role="dialog"')
    expect(favorites).toContain("'Escape'")
  })
})

describe('buscador', () => {
  const html = render(<SearchPage />, '/comunidad/buscar')

  it('tiene campo con etiqueta, combobox accesible y filtros de sección, tema, tipo y orden', () => {
    expect(html).toContain('Buscar publicaciones y temas')
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-autocomplete="list"')
    for (const label of ['Sección', 'Tema', 'Tipo', 'Ordenar por']) expect(html).toContain(label)
    expect(html).toContain('aria-label="Migas de pan"')
    expect(html).toContain('>Buscar</span>')
  })

  it('sin búsqueda no enseña resultados y explica qué hacer', () => {
    expect(html).not.toContain('Resultados para')
    expect(html).toContain('Escribe lo que buscas')
  })

  it('el orden del buscador no incluye «Para mí» ni «Preguntas sin responder»', () => {
    expect(html).not.toContain('Para mí')
    expect(html).not.toContain('Preguntas sin responder')
  })

  it('con texto muy corto no pide nada y avisa', () => {
    const short = render(<SearchPage />, '/comunidad/buscar?q=a')
    expect(short).toContain('Escribe al menos 2 letras')
    expect(short).not.toContain('Resultados para')
  })

  it('con texto enseña el título de resultados (el texto va escapado)', () => {
    const r = render(<SearchPage />, '/comunidad/buscar?q=%3Cb%3Eola')
    expect(r).toContain('Resultados para')
    expect(r).not.toContain('<b>ola')
  })

  it('el código: pausa de 300 ms, mínimo 2 letras, historial privado, sin resultados y sin consultas periódicas', () => {
    expect(search).toContain('SUGGEST_DELAY_MS')
    expect(search).toContain('searchSuggest(term)')
    expect(search).toContain('MIN_SEARCH_CHARS')
    expect(search).toContain('recordSearch(')
    expect(search).toContain('hasProfile')
    expect(search).toContain('listSearches()')
    expect(search).toContain('clearSearches()')
    expect(search).toContain('Borrar historial')
    expect(search).toContain('similarPosts(q, null, null)')
    expect(search).toContain('Preguntar a la comunidad')
    expect(search).toContain("paths.newPost({ tipo: 'pregunta', titulo: askTitleFromQuery(filters.q) })")
    expect(search).toContain("pageCrumbs('Buscar')")
    expect(search).not.toContain('setInterval')
    expect(search).not.toContain('dangerouslySetInnerHTML')
  })
})

describe('guardados', () => {
  const html = render(<SavedPage />, '/comunidad/guardados')

  it('tiene búsqueda de texto y filtros de sección, tema y tipo, pero SIN carpetas ni orden', () => {
    expect(html).toContain('Buscar entre mis guardados')
    for (const label of ['Sección', 'Tema', 'Tipo']) expect(html).toContain(label)
    expect(html).not.toContain('Ordenar por')
    expect(html.toLowerCase()).not.toContain('carpeta')
    expect(html).toContain('aria-label="Migas de pan"')
  })

  it('el código pide solo guardados (saved: true) con paginación', () => {
    expect(saved).toContain('{ saved: true }')
    expect(saved).toContain("pageCrumbs('Guardados')")
    expect(saved).toContain('Ver más')
    expect(saved).toContain('Todavía no has guardado nada')
    expect(saved).not.toContain('dangerouslySetInnerHTML')
  })
})

describe('accesibilidad de los filtros', () => {
  it('cada desplegable tiene su etiqueta asociada por id', () => {
    for (const f of ['section', 'topic', 'kind', 'order']) expect(filterFields).toContain(`htmlFor={\`\${idPrefix}-${f}\`}`)
  })
})
