import { useState } from 'react'
import { Link, useNavigationType, useSearchParams } from 'react-router-dom'
import { listPosts } from '@/data/community'
import { LIST_PAGE_SIZE } from '@/domain/communityDiscovery'
import { groupByRead } from '@/domain/communityRead'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { pageCrumbs, paths, PEPA_PROFILE_ID } from '@/ui/community/communityNav'
import { PostCardView } from '@/ui/community/PostCardView'
import { useCommunityList } from '@/ui/community/useCommunityList'
import '@/ui/community/communityLists.css'
import '@/ui/community/communityProfile.css'

// ✨ Novedades de la barra, «Últimas publicaciones»: PRIMERO lo que todavía no he leído y debajo lo ya leído (cada grupo, de más reciente a más antigua). El servidor da ese orden
// (orden «no_leidas», por cuenta) y aquí se recoloca al momento lo que acabo de abrir al volver atrás, sin volver a pedirlo. Con todo leído, no hay encabezados: se ve como siempre.
// «Seguidos» no cambia: sigue siendo lo último de las cuentas que sigo, por fecha.
// Antes: las publicaciones más recientes de Comunidad, por fecha de publicación (la última primero). Es una vista de lectura de TODA la comunidad
// (mismas tarjetas, mismo servidor y mismas reglas de bloqueo y edad que «Más recientes»), sin repetir los avisos personales: los comentarios sin leer y las
// respuestas siguen en la campana 🔔 de Inicio y en «Comentarios sin leer» (enlace al final).
// «👥 Seguidos»: las publicaciones de las cuentas que sigo (Pepa y otras personas), con el mismo listado (?ver=seguidos). Cuánto aviso recibo de cada una se ajusta en su
// perfil o en «Mi perfil»; el servidor nunca dice quién me sigue a mí.
export function RecentPage() {
  const navType = useNavigationType()
  const [sp, setSp] = useSearchParams()
  const following = sp.get('ver') === 'seguidos'
  const [restore] = useState(() => navType === 'POP')
  const list = useCommunityList({
    storageKey: following ? 'recent-following' : 'recent-unread-first',
    signature: following ? 'recent-following' : 'recent-unread-first',
    pageSize: LIST_PAGE_SIZE,
    restore,
    meta: { order: following ? 'recientes' : 'no_leidas', topic: null, kind: null },
    fetchPage: (offset) => listPosts({ order: following ? 'recientes' : 'no_leidas', limit: LIST_PAGE_SIZE, offset, following }),
  })

  // «Últimas publicaciones»: no leídas arriba y leídas debajo (cada grupo por fecha). En «Seguidos» el orden es el de siempre.
  const split = groupByRead(list.items)
  const unread = following ? [] : split.unread
  const read = following ? list.items : split.read
  const grouped = !following && split.grouped

  return (
    <>
      <Breadcrumbs crumbs={pageCrumbs(following ? 'Seguidos' : 'Novedades')} />
      <h1 className="community-list-title">{following ? '👥 Seguidos' : '✨ Novedades'}</h1>
      <div className="community-profile-tabs" role="group" aria-label="Qué ver">
        <button type="button" aria-pressed={!following} className={!following ? 'active' : ''} onClick={() => setSp({}, { replace: true })}>
          ✨ Últimas publicaciones
        </button>
        <button type="button" aria-pressed={following} className={following ? 'active' : ''} onClick={() => setSp({ ver: 'seguidos' }, { replace: true })}>
          👥 Seguidos
        </button>
      </div>
      <p className="muted community-list-intro">
        {following ? 'Lo último de las cuentas que sigues, de la más reciente a la más antigua.' : 'Primero lo que todavía no has leído y, debajo, lo que ya has abierto. En cada grupo, de la más reciente a la más antigua.'}
      </p>

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
            {following ? (
              <>
                <p>
                  <strong>Todavía no hay publicaciones de las cuentas que sigues.</strong>
                </p>
                <p className="muted">Puedes seguir a Pepa y a otras personas desde su perfil.</p>
                <Link to={paths.profile(PEPA_PROFILE_ID)} className="community-empty-link">
                  Ver el perfil de Pepa
                </Link>
              </>
            ) : (
              <>
                <p>
                  <strong>Todavía no hay publicaciones.</strong>
                </p>
                <Link to={paths.home} className="community-empty-link">
                  Ir a la portada de Comunidad
                </Link>
              </>
            )}
          </div>
        )}

        {list.items.length > 0 && grouped && (
          <section className="community-recent-group community-recent-unread" aria-labelledby="recent-unread-title">
            <h2 id="recent-unread-title" className="community-recent-group-title">
              📬 Sin leer <span className="community-recent-count">({unread.length})</span>
            </h2>
            <div className="community-card-list">
              {unread.map((item) => (
                <PostCardView key={item.id} item={item} onUnblocked={list.reload} />
              ))}
            </div>
          </section>
        )}
        {list.items.length > 0 && read.length > 0 && (
          <section className={grouped ? 'community-recent-group community-recent-read' : undefined} aria-labelledby={grouped ? 'recent-read-title' : undefined}>
            {grouped && (
              <h2 id="recent-read-title" className="community-recent-group-title">
                ✓ Ya leídas
              </h2>
            )}
            <div className="community-card-list">
              {read.map((item) => (
                <PostCardView key={item.id} item={item} onUnblocked={list.reload} />
              ))}
            </div>
          </section>
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
        {following ? (
          <>
            ¿Quieres cambiar los avisos de alguna cuenta?{' '}
            <Link to={paths.myProfile} className="link-button">
              Mi perfil → Personas que sigo
            </Link>
          </>
        ) : (
          <>
            ¿Buscas tus avisos?{' '}
            <Link to={paths.news} className="link-button">
              Comentarios sin leer
            </Link>
          </>
        )}
      </p>
    </>
  )
}
