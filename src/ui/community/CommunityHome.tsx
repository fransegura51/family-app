import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listPosts } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { SECTIONS, type CommunityCardItem } from '@/domain/community'
import { dedupeBlocks, HOME_BLOCK_FETCH, HOME_BLOCK_SHOW, HOME_BLOCKS, MAX_QUERY_CHARS, normalizeQuery, type HomeBlockId } from '@/domain/communityDiscovery'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { homeCrumbs, paths } from '@/ui/community/communityNav'
import { PostCardView } from '@/ui/community/PostCardView'
import '@/ui/community/communityHome.css'
import '@/ui/community/communityLists.css'

// Portada de Comunidad (la cabecera oficial y el menú ya los pone CommunityLayout). Accesos a las dos secciones, buscador, «Crear publicación» y bloques
// dinámicos: Más recientes, Más comentados, Preguntas sin responder y Para mí.
//  - Cada bloque hace UNA petición pequeña al abrir (y otra solo si se desbloquea a alguien). Sin consultas periódicas.
//  - Los bloques sin contenido se ocultan y ninguna publicación se repite entre bloques visibles (el primer bloque de la lista se la queda).
//  - «Para mí» solo se pide a quien ya tiene perfil público (sin perfil no hay nada que personalizar).
type BlockState = { status: 'loading' | 'ready' | 'error'; items: CommunityCardItem[]; error?: string }

const LOADING: BlockState = { status: 'loading', items: [] }

export function CommunityHome() {
  const { me, loading: meLoading, requireParticipation } = useCommunity()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [blocks, setBlocks] = useState<Record<HomeBlockId, BlockState>>({
    recientes: LOADING,
    comentados: LOADING,
    sin_respuesta: LOADING,
    para_mi: { status: 'ready', items: [] },
  })
  const [reloadToken, setReloadToken] = useState(0)
  const hasProfile = me?.hasProfile === true

  // Bloques públicos: una petición cada uno, en paralelo. Si uno falla, los demás se enseñan igual.
  useEffect(() => {
    let cancelled = false
    for (const block of HOME_BLOCKS.filter((b) => !b.personal)) {
      listPosts({ order: block.order, limit: HOME_BLOCK_FETCH }).then(
        (items) => {
          if (!cancelled) setBlocks((prev) => ({ ...prev, [block.id]: { status: 'ready', items } }))
        },
        (e) => {
          if (!cancelled) setBlocks((prev) => ({ ...prev, [block.id]: { status: 'error', items: [], error: communityErrorText(e) } }))
        },
      )
    }
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  // Bloque personal: solo cuando se sabe si hay perfil y solo si lo hay.
  useEffect(() => {
    if (meLoading || !hasProfile) return
    let cancelled = false
    listPosts({ order: 'para_mi', limit: HOME_BLOCK_FETCH }).then(
      (items) => {
        if (!cancelled) setBlocks((prev) => ({ ...prev, para_mi: { status: 'ready', items } }))
      },
      () => {
        // «Para mí» es un extra: si falla, simplemente no se enseña.
        if (!cancelled) setBlocks((prev) => ({ ...prev, para_mi: { status: 'ready', items: [] } }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [meLoading, hasProfile, reloadToken])

  const publicBlocks = HOME_BLOCKS.filter((b) => !b.personal)
  const stillLoading = publicBlocks.some((b) => blocks[b.id].status === 'loading')
  // No se enseña nada hasta que llegan los tres bloques públicos: si no, una publicación podría verse un instante en «Más comentados» y desaparecer
  // al llegar «Más recientes» (que tiene prioridad).
  const visible = useMemo(
    () =>
      dedupeBlocks(
        HOME_BLOCKS.map((b) => ({ id: b.id, items: stillLoading ? [] : blocks[b.id].items })),
        HOME_BLOCK_SHOW,
      ),
    [blocks, stillLoading],
  )
  const failed = publicBlocks.map((b) => blocks[b.id]).filter((b) => b.status === 'error')
  const allFailed = failed.length === publicBlocks.length

  function onSearch(e: FormEvent) {
    e.preventDefault()
    const q = normalizeQuery(text)
    navigate(paths.search(q || undefined))
  }

  async function onCreate() {
    // Crear exige alias público (y normas la primera vez): se pide aquí, justo antes de abrir el editor.
    if (await requireParticipation()) navigate(paths.newPost())
  }

  return (
    <>
      <Breadcrumbs crumbs={homeCrumbs} />

      <nav className="community-home-sections" aria-label="Secciones de Comunidad">
        {SECTIONS.map((s) => (
          <Link key={s.id} to={paths.section(s.id)} className="community-home-section">
            <span className="community-home-section-icon" aria-hidden="true">
              {s.icon}
            </span>
            <span className="community-home-section-text">
              <strong>{s.title}</strong>
              <span>{s.description}</span>
            </span>
          </Link>
        ))}
      </nav>

      <form className="community-home-search" role="search" onSubmit={onSearch}>
        <label htmlFor="community-home-q" className="community-visually-hidden">
          Buscar en Comunidad
        </label>
        <input
          id="community-home-q"
          type="search"
          value={text}
          maxLength={MAX_QUERY_CHARS}
          onChange={(e) => setText(e.target.value)}
          placeholder="Busca recetas, consejos, preguntas…"
          enterKeyHint="search"
          autoComplete="off"
        />
        <button type="submit">Buscar</button>
      </form>

      <div className="community-home-actions">
        <button type="button" className="primary community-home-create" onClick={() => void onCreate()}>
          ✍️ Crear publicación
        </button>
        <Link to={paths.rules} className="link-button">
          Normas
        </Link>
      </div>

      {stillLoading && visible.length === 0 && (
        <p className="muted" role="status">
          Cargando publicaciones…
        </p>
      )}

      {allFailed && (
        <div className="community-home-error" role="alert">
          <p className="error">{failed[0].error ?? 'No hemos podido cargar Comunidad.'}</p>
          <button type="button" onClick={() => setReloadToken((t) => t + 1)}>
            Reintentar
          </button>
        </div>
      )}

      {!allFailed && !stillLoading && visible.length === 0 && (
        <div className="community-empty">
          <p>
            <strong>Todavía no hay publicaciones.</strong>
          </p>
          <p className="muted">¡Anímate a ser la primera persona! Comparte una receta, haz una pregunta o cuenta un truco.</p>
          <button type="button" className="primary" onClick={() => void onCreate()}>
            Crear la primera publicación
          </button>
        </div>
      )}

      {visible.map((block) => {
        const def = HOME_BLOCKS.find((b) => b.id === block.id)
        return (
          <section key={block.id} className="community-home-block" aria-labelledby={`community-block-${block.id}`}>
            <h2 id={`community-block-${block.id}`}>{def?.title}</h2>
            <div className="community-card-list">
              {block.items.map((item) => (
                <PostCardView key={item.id} item={item} onUnblocked={() => setReloadToken((t) => t + 1)} />
              ))}
            </div>
          </section>
        )
      })}

      {!allFailed && failed.length > 0 && (
        <p className="muted community-home-partial">
          Algunos bloques no se han podido cargar.{' '}
          <button type="button" className="link-button" onClick={() => setReloadToken((t) => t + 1)}>
            Reintentar
          </button>
        </p>
      )}
    </>
  )
}
