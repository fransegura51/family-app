import { useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { listPosts } from '@/data/community'
import { LIST_PAGE_SIZE } from '@/domain/communityDiscovery'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { pageCrumbs, paths } from '@/ui/community/communityNav'
import { PostCardView } from '@/ui/community/PostCardView'
import { useCommunityList } from '@/ui/community/useCommunityList'
import '@/ui/community/communityLists.css'

// ✨ Novedades de la barra: las publicaciones más recientes de Comunidad, por fecha de publicación (la última primero). Es una vista de lectura de TODA la comunidad
// (mismas tarjetas, mismo servidor y mismas reglas de bloqueo y edad que «Más recientes»), sin repetir los avisos personales: los comentarios sin leer y las
// respuestas siguen en la campana 🔔 de Inicio y en «Comentarios sin leer» (enlace al final).
export function RecentPage() {
  const navType = useNavigationType()
  const [restore] = useState(() => navType === 'POP')
  const list = useCommunityList({
    storageKey: 'recent',
    signature: 'recent',
    pageSize: LIST_PAGE_SIZE,
    restore,
    meta: { order: 'recientes', topic: null, kind: null },
    fetchPage: (offset) => listPosts({ order: 'recientes', limit: LIST_PAGE_SIZE, offset }),
  })

  return (
    <>
      <Breadcrumbs crumbs={pageCrumbs('Novedades')} />
      <h1 className="community-list-title">✨ Novedades</h1>
      <p className="muted community-list-intro">Lo último que se ha publicado en Comunidad, de la más reciente a la más antigua.</p>

      <div aria-live="polite" aria-busy={list.status === 'loading'}>
        {list.status === 'loading' && list.items.length === 0 && (
          <p className="muted" role="status">
            Buscando lo último…
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
            <p>
              <strong>Todavía no hay publicaciones.</strong>
            </p>
            <Link to={paths.home} className="community-empty-link">
              Ir a la portada de Comunidad
            </Link>
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

      <p className="muted community-list-intro">
        ¿Buscas tus avisos?{' '}
        <Link to={paths.news} className="link-button">
          Comentarios sin leer
        </Link>
      </p>
    </>
  )
}
