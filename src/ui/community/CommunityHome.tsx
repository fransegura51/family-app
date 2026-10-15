import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useNavigationType } from 'react-router-dom'
import { listPosts } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { SECTIONS, type CommunityCardItem } from '@/domain/community'
import { dedupeBlocks, HOME_BLOCK_FETCH, HOME_BLOCK_SHOW, HOME_BLOCKS, MAX_QUERY_CHARS, normalizeQuery, type HomeBlockId } from '@/domain/communityDiscovery'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { useCommunityAccess } from '@/ui/community/useCommunityAccess'
import { homeCrumbs, paths } from '@/ui/community/communityNav'
import { clearListState, HOME_STATE_KEY, loadHomeState, saveHomeState } from '@/ui/community/communityListState'
import { PostCardView } from '@/ui/community/PostCardView'
import '@/ui/community/communityHome.css'
import '@/ui/community/communityLists.css'
import { InviteFriendsButton } from '@/ui/InviteFriendsButton'

// Portada de Comunidad (la cabecera oficial y el menú ya los pone CommunityLayout). Accesos a las dos secciones, buscador, «Crear publicación» y bloques
// dinámicos: Más recientes, Más comentados, Preguntas sin responder y Para mí.
//  - Cada bloque hace UNA petición pequeña al abrir (y otra solo si se desbloquea a alguien). Sin consultas periódicas.
//  - Los bloques sin contenido se ocultan y ninguna publicación se repite entre bloques visibles (el primer bloque de la lista se la queda).
//  - «Para mí» solo se pide a quien ya tiene perfil público (sin perfil no hay nada que personalizar).
//  - Al VOLVER ATRÁS desde una publicación (navegación POP) se recuperan los bloques ya cargados, el texto del buscador y la posición de desplazamiento,
//    sin volver a pedir nada al servidor (igual que las secciones, el buscador y Guardados). Al entrar de nuevo por un enlace se empieza de cero.
type BlockState = { status: 'loading' | 'ready' | 'error'; items: CommunityCardItem[]; error?: string }

const LOADING: BlockState = { status: 'loading', items: [] }

type BlocksState = Record<HomeBlockId, BlockState>

// Solo se puede recuperar una portada con los bloques públicos ya cargados (sin fallos): si no, se pide de nuevo.
function restorableBlocks(raw: unknown): BlocksState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Partial<BlocksState>
  for (const def of HOME_BLOCKS) {
    const st = b[def.id]
    if (!st || !Array.isArray(st.items)) return null
    if (!def.personal && st.status !== 'ready') return null
  }
  return b as BlocksState
}

export function CommunityHome() {
  const { me, loading: meLoading, requireParticipation } = useCommunity()
  // Con permiso solo de lectura no se enseñan los botones de crear (el aviso fijo de Comunidad lo explica).
  const { canParticipate } = useCommunityAccess()
  const navigate = useNavigate()
  const navType = useNavigationType()
  // Estado guardado de la visita anterior: solo se mira al montar y solo al volver atrás.
  const [saved] = useState(() => {
    if (navType !== 'POP') return null
    const st = loadHomeState<unknown>()
    const restored = st ? restorableBlocks(st.blocks) : null
    return st && restored ? { scrollY: st.scrollY, text: st.text, blocks: restored } : null
  })
  const [text, setText] = useState(saved?.text ?? '')
  const [blocks, setBlocks] = useState<BlocksState>(
    saved?.blocks ?? {
      recientes: LOADING,
      comentados: LOADING,
      sin_respuesta: LOADING,
      para_mi: { status: 'ready', items: [] },
    },
  )
  const [reloadToken, setReloadToken] = useState(0)
  const hasProfile = me?.hasProfile === true

  // Lo último visto, para guardarlo al salir de la portada (en el efecto de layout, ANTES de que la página siguiente cambie la altura del documento).
  const latest = useRef({ text, blocks })
  const lastScroll = useRef(typeof window === 'undefined' ? 0 : window.scrollY)
  useLayoutEffect(() => {
    latest.current = { text, blocks }
  })
  useEffect(() => {
    // Al entrar por navegación normal se olvida lo guardado antes (no debe reaparecer más tarde).
    if (!saved) clearListState(HOME_STATE_KEY)
  }, [saved])
  useLayoutEffect(() => {
    const onScroll = () => {
      lastScroll.current = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      const restorable = restorableBlocks(latest.current.blocks)
      if (restorable) saveHomeState({ scrollY: lastScroll.current, text: latest.current.text, blocks: restorable })
    }
  }, [])
  // Restaurar el desplazamiento una vez pintada la portada recuperada.
  useLayoutEffect(() => {
    if (saved) window.scrollTo(0, saved.scrollY)
  }, [saved])

  // Bloques públicos: una petición cada uno, en paralelo. Si uno falla, los demás se enseñan igual.
  useEffect(() => {
    // Recuperada de la memoria: no se vuelve a pedir (solo si luego se pide recargar, p. ej. al desbloquear a alguien).
    if (saved && reloadToken === 0) return
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
  }, [reloadToken, saved])

  // Bloque personal: solo cuando se sabe si hay perfil y solo si lo hay.
  useEffect(() => {
    if (meLoading || !hasProfile) return
    if (saved && reloadToken === 0) return
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
  }, [meLoading, hasProfile, reloadToken, saved])

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
      <InviteFriendsButton />

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
          placeholder="Busca en Comunidad"
          enterKeyHint="search"
          autoComplete="off"
        />
        <button type="submit">Buscar</button>
      </form>

      <div className="community-home-actions">
        {canParticipate && (
          <button type="button" className="primary community-home-create" onClick={() => void onCreate()}>
            ✍️ Crear publicación
          </button>
        )}
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
          {canParticipate && <p className="muted">¡Anímate a ser la primera persona! Comparte una receta, haz una pregunta o cuenta un truco.</p>}
          {canParticipate && (
            <button type="button" className="primary" onClick={() => void onCreate()}>
              Crear la primera publicación
            </button>
          )}
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
