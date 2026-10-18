import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router-dom'
import { listPosts } from '@/data/community'
import { KIND_ICONS, KIND_LABELS, ORDER_LABELS, SECTIONS, type CommunitySection, type PostKind } from '@/domain/community'
import {
  ALL_KINDS,
  emptyListMessage,
  hasSectionFilters,
  isCommunitySection,
  LIST_PAGE_SIZE,
  parseKind,
  parseOrder,
  readSectionFilters,
  sectionFiltersToParams,
  sectionListParams,
  sectionOrders,
  sectionSignature,
  splitFeaturedTopics,
  toggleTopic,
  topicsForSection,
  type SectionFilters,
} from '@/domain/communityDiscovery'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { useCommunityAccess } from '@/ui/community/useCommunityAccess'
import { FavoriteTopicsDialog } from '@/ui/community/FavoriteTopicsDialog'
import { paths, rememberSectionQuery, sectionCrumbs } from '@/ui/community/communityNav'
import { sortUnreadFirst } from '@/domain/communityRead'
import { PostCardView } from '@/ui/community/PostCardView'
import { useCommunityList } from '@/ui/community/useCommunityList'
import { useCommunityTopics } from '@/ui/community/useCommunityTopics'
import '@/ui/community/communityLists.css'

// Sección (ruta s/:section, section = recetas | hogar). Si la sección no existe se vuelve a la portada.
export function CommunitySectionPage() {
  const { section } = useParams()
  if (!isCommunitySection(section)) return <Navigate to={paths.home} replace />
  // key = sección: al pasar de Recetas a Hogar la pantalla se monta de nuevo y no arrastra filtros ni listas de la otra.
  return <SectionContent key={section} section={section} />
}

const PERSON_KINDS: string[] = ['receta', 'pregunta', 'consejo', 'anecdota']

function SectionContent({ section }: { section: CommunitySection }) {
  const info = SECTIONS.find((s) => s.id === section)
  const navigate = useNavigate()
  const navType = useNavigationType()
  const { requireParticipation } = useCommunity()
  // Con permiso solo de lectura no se enseñan crear ni «Mis temas favoritos» (guardarlos es participar).
  const { canParticipate } = useCommunityAccess()
  const topics = useCommunityTopics()
  const [sp, setSp] = useSearchParams()
  const [favOpen, setFavOpen] = useState(false)
  // Solo al VOLVER ATRÁS se recupera lo que había (filtros, orden, lo cargado y el desplazamiento). Cualquier otra entrada empieza en «Más recientes».
  // También al volver con la miga «Recetas y cocina» de una publicación (state.restoreList): en el móvil no hay botón «atrás».
  const location = useLocation()
  const [restore] = useState(() => navType === 'POP' || (location.state as { restoreList?: boolean } | null)?.restoreList === true)

  // El tema, el orden y el tipo viven en la dirección (?tema=&orden=&tipo=): compartibles y recuperables con «atrás».
  const sectionTopics = useMemo(() => (topics ? topicsForSection(topics, section) : []), [topics, section])
  // Varios temas a la vez (lógica O). Con el catálogo cargado se descartan los que no existen en esta sección (direcciones antiguas o ajenas).
  const filters = useMemo(() => {
    const f = readSectionFilters(section, sp)
    return sectionTopics.length > 0 ? { ...f, topics: f.topics.filter((id) => sectionTopics.some((t) => t.id === id)) } : f
  }, [section, sp, sectionTopics])
  const signature = sectionSignature(section, filters)
  // «Ver todos los temas» / «Ver menos»: solo cambia lo que se enseña, no los filtros.
  const [allTopics, setAllTopics] = useState(false)
  const { featured, rest } = useMemo(() => splitFeaturedTopics(section, sectionTopics, filters.topics), [section, sectionTopics, filters.topics])

  // Se recuerda el último filtro de la sección para que la miga de una publicación vuelva con él.
  const searchKey = sp.toString()
  useEffect(() => {
    rememberSectionQuery(section, searchKey)
  }, [section, searchKey])

  const list = useCommunityList({
    storageKey: `section:${section}`,
    signature,
    pageSize: LIST_PAGE_SIZE,
    restore,
    meta: { order: filters.order, topic: filters.topics.join(',') || null, kind: filters.kind },
    fetchPage: (offset) => listPosts(sectionListParams(section, filters, offset, LIST_PAGE_SIZE)),
  })

  // Cambiar un filtro sustituye la entrada del historial (no apila una por cada toque), así «atrás» sale de la sección.
  function setFilters(next: SectionFilters) {
    setSp(sectionFiltersToParams(next), { replace: true })
  }

  async function onCreate() {
    if (!(await requireParticipation())) return
    // Se lleva al editor con la sección (y el tipo, si es uno de los que crean las personas) ya elegidos.
    const kind = filters.kind && PERSON_KINDS.includes(filters.kind) ? (filters.kind as PostKind) : null
    navigate(paths.newPost({ seccion: section, tipo: kind }))
  }

  const filtered = hasSectionFilters(filters)
  const empty = emptyListMessage(filters.order, filtered)

  return (
    <>
      <Breadcrumbs crumbs={sectionCrumbs(section)} />
      <h1 className="community-list-title">
        <span aria-hidden="true">{info?.icon} </span>
        {info?.title}
      </h1>
      {info && <p className="muted community-list-intro">{info.description}</p>}

      {sectionTopics.length > 0 && (
        <div role="group" aria-label="Filtrar por tema (puedes elegir varios)" className="community-chips community-chips-compact">
          <button type="button" className="community-chip" aria-pressed={filters.topics.length === 0} onClick={() => setFilters({ ...filters, topics: [] })}>
            Todos
          </button>
          {[...featured, ...(allTopics ? rest : [])].map((t) => (
            <button
              key={t.id}
              type="button"
              className="community-chip"
              aria-pressed={filters.topics.includes(t.id)}
              onClick={() => setFilters({ ...filters, topics: toggleTopic(filters.topics, t.id) })}
            >
              {t.label}
            </button>
          ))}
          {rest.length > 0 && (
            <button type="button" className="community-chip community-chip-more" aria-expanded={allTopics} onClick={() => setAllTopics((v) => !v)}>
              {allTopics ? 'Ver menos' : 'Ver todos los temas'}
            </button>
          )}
        </div>
      )}
      {filtered && (
        <p className="community-filter-status muted">
          {filters.topics.length > 0 && <span>{filters.topics.length === 1 ? '1 tema seleccionado' : `${filters.topics.length} temas seleccionados`}</span>}
          {filters.topics.length > 0 && filters.kind && <span> · </span>}
          {filters.kind && <span>Tipo: {KIND_LABELS[filters.kind]}</span>}{' '}
          <button type="button" className="link-button" onClick={() => setFilters({ topics: [], order: filters.order, kind: null })}>
            Limpiar filtros
          </button>
        </p>
      )}

      <div className="community-filter-grid">
        <label htmlFor={`section-order-${section}`}>
          Ordenar por
          <select
            id={`section-order-${section}`}
            value={filters.order}
            onChange={(e) => setFilters({ ...filters, order: parseOrder(e.target.value, sectionOrders(section)) })}
          >
            {sectionOrders(section).map((o) => (
              <option key={o} value={o}>
                {ORDER_LABELS[o]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`section-kind-${section}`}>
          Tipo
          <select id={`section-kind-${section}`} value={filters.kind ?? ''} onChange={(e) => setFilters({ ...filters, kind: parseKind(e.target.value) })}>
            <option value="">Todos</option>
            {ALL_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_ICONS[k]} {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {topics && canParticipate && (
        <button type="button" className="link-button community-fav-open" onClick={() => setFavOpen(true)}>
          ⭐ Mis temas favoritos
        </button>
      )}

      <div aria-live="polite" aria-busy={list.status === 'loading'}>
        {list.status === 'loading' && list.items.length === 0 && (
          <p className="muted" role="status">
            Cargando publicaciones…
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
              <strong>{empty.title}</strong>
            </p>
            <p className="muted">{empty.hint}</p>
            {filtered && (
              <button type="button" className="link-button" onClick={() => setFilters({ topics: [], order: filters.order, kind: null })}>
                Quitar los filtros
              </button>
            )}
            {canParticipate && (
              <button type="button" className="primary" onClick={() => void onCreate()}>
                ✍️ Crear publicación
              </button>
            )}
          </div>
        )}

        {list.items.length > 0 && (
          <div className="community-card-list">
            {(filters.order === 'no_leidas' ? sortUnreadFirst(list.items) : list.items).map((item) => (
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

      {favOpen && topics && (
        <FavoriteTopicsDialog topics={topics} onClose={() => setFavOpen(false)} onSaved={filters.order === 'para_mi' ? list.reload : () => undefined} />
      )}
    </>
  )
}
