import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigationType, useSearchParams } from 'react-router-dom'
import { listPosts } from '@/data/community'
import {
  discoveryFiltersToParams,
  discoveryListParams,
  discoverySignature,
  hasDiscoveryFilters,
  LIST_PAGE_SIZE,
  MAX_QUERY_CHARS,
  normalizeQuery,
  readDiscoveryFilters,
  type DiscoveryFilters,
} from '@/domain/communityDiscovery'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { DiscoveryFilterFields } from '@/ui/community/DiscoveryFilterFields'
import { pageCrumbs, paths } from '@/ui/community/communityNav'
import { PostCardView } from '@/ui/community/PostCardView'
import { useCommunityList } from '@/ui/community/useCommunityList'
import { useCommunityTopics } from '@/ui/community/useCommunityTopics'
import '@/ui/community/communityLists.css'

// Mis guardados: las publicaciones que la persona ha guardado, con búsqueda de texto y filtros (sección, tema y tipo). SIN carpetas.
// El texto y los filtros viven en la dirección (?q=&seccion=&tema=&tipo=), así «atrás» los recupera junto con lo cargado y el desplazamiento.
export function SavedPage() {
  const navType = useNavigationType()
  const topics = useCommunityTopics()
  const [sp, setSp] = useSearchParams()
  const [restore] = useState(() => navType === 'POP')
  const filters = useMemo(() => readDiscoveryFilters(sp, false), [sp])
  const [text, setText] = useState(filters.q)
  const [lastQ, setLastQ] = useState(filters.q)
  // Si la dirección cambia desde fuera (atrás, «Quitar filtros»), el campo la sigue.
  if (filters.q !== lastQ) {
    setLastQ(filters.q)
    setText(filters.q)
  }

  const list = useCommunityList({
    storageKey: 'saved',
    signature: discoverySignature(filters),
    pageSize: LIST_PAGE_SIZE,
    restore,
    meta: { order: filters.order, topic: filters.topic, kind: filters.kind },
    fetchPage: (offset) => listPosts(discoveryListParams(filters, offset, LIST_PAGE_SIZE, { saved: true })),
  })

  function apply(next: DiscoveryFilters, replace: boolean) {
    setSp(discoveryFiltersToParams(next), { replace })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const q = normalizeQuery(text)
    setText(q)
    if (q === filters.q) list.reload()
    else apply({ ...filters, q }, true)
  }

  const filtered = hasDiscoveryFilters(filters) || filters.q !== ''

  return (
    <>
      <Breadcrumbs crumbs={pageCrumbs('Guardados')} />
      <h1 className="community-list-title">🔖 Mis guardados</h1>
      <p className="muted community-list-intro">Las publicaciones que has guardado para volver a ellas. Solo las ves tú.</p>

      <form className="community-search-form" role="search" onSubmit={onSubmit}>
        <div className="community-search-field">
          <label htmlFor="community-saved-q">Buscar entre mis guardados</label>
          <div className="community-search-row">
            <input
              id="community-saved-q"
              type="search"
              value={text}
              maxLength={MAX_QUERY_CHARS}
              placeholder="Escribe una palabra…"
              autoComplete="off"
              enterKeyHint="search"
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit">Buscar</button>
          </div>
        </div>
        <DiscoveryFilterFields idPrefix="saved" filters={filters} topics={topics} withOrder={false} onChange={(next) => apply({ ...next, q: filters.q }, true)} />
      </form>

      <div aria-live="polite" aria-busy={list.status === 'loading'}>
        {list.status === 'loading' && list.items.length === 0 && (
          <p className="muted" role="status">
            Cargando tus guardados…
          </p>
        )}

        {list.status === 'error' && (
          <div className="community-list-error" role="alert">
            <p className="error">{list.error}</p>
            <button type="button" onClick={list.reload}>
              Reintentar
            </button>
          </div>
        )}

        {list.status === 'ready' && list.items.length === 0 && (
          <div className="community-empty">
            {filtered ? (
              <>
                <p>
                  <strong>Ninguna publicación guardada coincide.</strong>
                </p>
                <p className="muted">Prueba con otra palabra u otros filtros.</p>
                <button type="button" className="link-button" onClick={() => apply({ ...filters, q: '', section: null, topic: null, kind: null }, true)}>
                  Quitar búsqueda y filtros
                </button>
              </>
            ) : (
              <>
                <p>
                  <strong>Todavía no has guardado nada.</strong>
                </p>
                <p className="muted">Guarda las publicaciones que te interesen desde su página y las encontrarás aquí.</p>
                <Link to={paths.home} className="community-empty-link">
                  Explorar Comunidad
                </Link>
              </>
            )}
          </div>
        )}

        {list.items.length > 0 && (
          <div className="community-card-list">
            {list.items.map((item) => (
              <PostCardView key={item.id} item={item} onUnblocked={list.reload} />
            ))}
          </div>
        )}

        {list.moreError && (
          <p className="error" role="alert">
            {list.moreError}
          </p>
        )}
        {list.items.length > 0 && list.hasMore && (
          <button type="button" className="community-more" onClick={list.loadMore} disabled={list.loadingMore}>
            {list.loadingMore ? 'Cargando…' : 'Ver más'}
          </button>
        )}
      </div>
    </>
  )
}
