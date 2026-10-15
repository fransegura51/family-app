import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import { clearSearches, listPosts, listSearches, recordSearch, searchSuggest, similarPosts } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { KIND_ICONS, SECTIONS, type PostCard, type SearchHistoryItem, type SuggestItem } from '@/domain/community'
import {
  askTitleFromQuery,
  describeFilters,
  discoveryFiltersToParams,
  discoveryListParams,
  discoverySignature,
  filtersFromRecord,
  filtersToRecord,
  hasDiscoveryFilters,
  isSearchable,
  LIST_PAGE_SIZE,
  MAX_QUERY_CHARS,
  MIN_SEARCH_CHARS,
  normalizeQuery,
  readDiscoveryFilters,
  SUGGEST_DELAY_MS,
  type DiscoveryFilters,
} from '@/domain/communityDiscovery'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { DiscoveryFilterFields } from '@/ui/community/DiscoveryFilterFields'
import { pageCrumbs, paths } from '@/ui/community/communityNav'
import { PostCardView } from '@/ui/community/PostCardView'
import { useCommunityList } from '@/ui/community/useCommunityList'
import { useCommunityTopics } from '@/ui/community/useCommunityTopics'
import '@/ui/community/communityLists.css'

// Buscador (ruta buscar?q=). Texto + filtros (sección, tema, tipo y orden), todo en la dirección. Autocompletado con resultados reales (con una pausa de
// ~300 ms y nunca con menos de 2 letras). Si hay sesión con perfil, cada búsqueda se guarda en un historial PRIVADO de las últimas 10 (con sus filtros).
// Sin resultados: contenido relacionado y «Preguntar a la comunidad».
export function SearchPage() {
  const { me } = useCommunity()
  const navigate = useNavigate()
  const navType = useNavigationType()
  const topics = useCommunityTopics()
  const [sp, setSp] = useSearchParams()
  const [restore] = useState(() => navType === 'POP')
  const hasProfile = me?.hasProfile === true

  const filters = useMemo(() => readDiscoveryFilters(sp, true), [sp])
  const searchable = isSearchable(filters.q)
  const signature = discoverySignature(filters)

  // ---- Campo de texto y autocompletado
  const [text, setText] = useState(filters.q)
  const [lastQ, setLastQ] = useState(filters.q)
  const [typing, setTyping] = useState(false)
  const [shortHint, setShortHint] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  // Si la dirección cambia desde fuera (historial, «atrás»), el campo la sigue.
  if (filters.q !== lastQ) {
    setLastQ(filters.q)
    setText(filters.q)
    setTyping(false)
  }

  useEffect(() => {
    if (!typing) return
    const term = normalizeQuery(text)
    if (term.length < MIN_SEARCH_CHARS) {
      setSuggestions([])
      return
    }
    let cancelled = false
    // Pausa: solo se pide cuando la persona deja de escribir un momento (una petición por pausa, no por letra).
    const timer = setTimeout(() => {
      searchSuggest(term).then(
        (r) => {
          if (cancelled) return
          setSuggestions(r)
          setActive(-1)
        },
        () => {
          if (!cancelled) setSuggestions([])
        },
      )
    }, SUGGEST_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, typing])

  const showList = open && typing && suggestions.length > 0

  function submitSearch(raw: string) {
    const q = normalizeQuery(raw)
    setTyping(false)
    setOpen(false)
    setSuggestions([])
    if (!isSearchable(q)) {
      setShortHint(true)
      return
    }
    setShortHint(false)
    setText(q)
    if (q === filters.q) list.reload()
    else setSp(discoveryFiltersToParams({ ...filters, q }))
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    submitSearch(text)
  }

  function chooseSuggestion(item: SuggestItem) {
    setTyping(false)
    setOpen(false)
    if (item.type === 'post') navigate(paths.post(item.id))
    else if (item.section) navigate(paths.section(item.section, { tema: item.id }))
    else submitSearch(item.label)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault()
      setOpen(true)
      setActive((a) => (a + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault()
      setOpen(true)
      setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1))
    } else if (e.key === 'Enter' && showList && active >= 0) {
      e.preventDefault()
      chooseSuggestion(suggestions[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // ---- Resultados (una petición por página; «Ver más» pide la siguiente)
  const list = useCommunityList({
    storageKey: 'search',
    signature,
    enabled: searchable,
    pageSize: LIST_PAGE_SIZE,
    restore,
    meta: { order: filters.order, topic: filters.topic, kind: filters.kind },
    fetchPage: (offset) => listPosts(discoveryListParams(filters, offset, LIST_PAGE_SIZE)),
  })

  function changeFilters(next: DiscoveryFilters) {
    // Cambiar un filtro sustituye la entrada del historial del navegador (no apila una por cada toque).
    setSp(discoveryFiltersToParams({ ...next, q: filters.q }), { replace: true })
  }

  // ---- Historial privado: se guarda la búsqueda (con filtros) cuando ya se han visto sus resultados, tras una pausa corta para no anotar cada cambio
  // de filtro intermedio. Solo con perfil; si falla, se ignora. Lo recuperado al volver atrás no se vuelve a guardar.
  const recorded = useRef<string | null>(null)
  const [historyDirty, setHistoryDirty] = useState(true)
  useEffect(() => {
    if (!searchable || !hasProfile || list.status !== 'ready' || list.restored || recorded.current === signature) return
    const timer = setTimeout(() => {
      recorded.current = signature
      recordSearch(filters.q, filtersToRecord(filters)).then(
        () => setHistoryDirty(true),
        () => undefined,
      )
    }, 1500)
    return () => clearTimeout(timer)
  }, [searchable, hasProfile, list.status, list.restored, signature, filters])

  const [history, setHistory] = useState<SearchHistoryItem[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  // Solo se lee cuando se va a enseñar (sin búsqueda activa) y solo si hay algo nuevo que leer.
  useEffect(() => {
    if (!hasProfile || searchable || !historyDirty) return
    let cancelled = false
    listSearches().then(
      (h) => {
        if (cancelled) return
        setHistory(h)
        setHistoryDirty(false)
      },
      (e) => {
        if (cancelled) return
        setHistoryError(communityErrorText(e))
        setHistoryDirty(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [hasProfile, searchable, historyDirty])

  async function onClearHistory() {
    setHistoryError(null)
    try {
      await clearSearches()
      setHistory([])
    } catch (e) {
      setHistoryError(communityErrorText(e))
    }
  }

  function repeatSearch(item: SearchHistoryItem) {
    setSp(discoveryFiltersToParams(filtersFromRecord(item.query, item.filters)))
  }

  // ---- Sin resultados: contenido relacionado y preguntar a la comunidad
  const noResults = searchable && list.status === 'ready' && list.items.length === 0
  const [similar, setSimilar] = useState<{ q: string; items: PostCard[] } | null>(null)
  useEffect(() => {
    if (!noResults) return
    let cancelled = false
    const q = filters.q
    similarPosts(q, null, null).then(
      (items) => {
        if (!cancelled) setSimilar({ q, items })
      },
      () => {
        if (!cancelled) setSimilar({ q, items: [] })
      },
    )
    return () => {
      cancelled = true
    }
  }, [noResults, filters.q])
  const similarItems = noResults && similar?.q === filters.q ? similar.items : []

  return (
    <>
      <Breadcrumbs crumbs={pageCrumbs('Buscar')} />
      <h1 className="community-list-title">Buscar</h1>

      <form className="community-search-form" role="search" onSubmit={onSubmit}>
        <div className="community-search-field">
          <label htmlFor="community-search-input">Buscar publicaciones y temas</label>
          <div className="community-search-row">
            <input
              id="community-search-input"
              type="search"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
              value={text}
              maxLength={MAX_QUERY_CHARS}
              placeholder="Por ejemplo: tortilla, ahorro, manualidades…"
              autoComplete="off"
              enterKeyHint="search"
              onChange={(e) => {
                setText(e.target.value)
                setTyping(true)
                setOpen(true)
                setShortHint(false)
              }}
              onKeyDown={onKeyDown}
              onBlur={() => setOpen(false)}
              onFocus={() => setOpen(true)}
            />
            <button type="submit">Buscar</button>
          </div>
          {showList && (
            <ul id={listId} role="listbox" aria-label="Sugerencias" className="community-suggest">
              {suggestions.map((s, i) => (
                <li
                  key={`${s.type}-${s.id}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={'community-suggest-item' + (i === active ? ' active' : '')}
                  // mouseDown (no click) y sin quitar el foco: así el campo no se cierra antes de registrar el toque.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    chooseSuggestion(s)
                  }}
                >
                  <span>
                    {s.type === 'topic' ? '🏷️' : s.kind ? KIND_ICONS[s.kind] : '📄'} {s.label}
                  </span>
                  <small>{s.type === 'topic' ? `Tema${s.section ? ` · ${SECTIONS.find((x) => x.id === s.section)?.title ?? ''}` : ''}` : 'Publicación'}</small>
                </li>
              ))}
            </ul>
          )}
          <p className="community-visually-hidden" role="status">
            {showList ? `${suggestions.length} sugerencias disponibles` : ''}
          </p>
        </div>
        {(shortHint || (filters.q && !searchable)) && (
          <p className="muted" role="status">
            Escribe al menos {MIN_SEARCH_CHARS} letras para buscar.
          </p>
        )}
        <DiscoveryFilterFields idPrefix="search" filters={filters} topics={topics} withOrder onChange={changeFilters} />
      </form>

      {searchable && (
        <section aria-labelledby="community-search-results">
          <h2 id="community-search-results" className="community-results-title">
            Resultados para «{filters.q}»
          </h2>
          <div aria-live="polite" aria-busy={list.status === 'loading'}>
            {list.status === 'loading' && list.items.length === 0 && (
              <p className="muted" role="status">
                Buscando…
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

          {noResults && (
            <div className="community-empty">
              <p>
                <strong>No hemos encontrado nada para «{filters.q}».</strong>
              </p>
              <p className="muted">{hasDiscoveryFilters(filters) ? 'Prueba a quitar algún filtro o a escribir de otra forma. ' : 'Prueba a escribirlo de otra forma. '}También puedes preguntarlo a otras familias.</p>
              <button type="button" className="primary" onClick={() => navigate(paths.newPost({ tipo: 'pregunta', titulo: askTitleFromQuery(filters.q) }))}>
                ❓ Preguntar a la comunidad
              </button>
              {similarItems.length > 0 && (
                <section aria-labelledby="community-similar" className="community-similar">
                  <h3 id="community-similar">Quizá te interese</h3>
                  <div className="community-card-list">
                    {similarItems.map((item) => (
                      <PostCardView key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </section>
      )}

      {!searchable && (
        <>
          <p className="muted">Escribe lo que buscas: una receta, un truco, un tema… Puedes afinar con los filtros de arriba.</p>
          {hasProfile && history.length > 0 && (
            <section aria-labelledby="community-history" className="community-history">
              <h2 id="community-history" className="community-results-title">
                Tus últimas búsquedas
              </h2>
              <p className="muted">Solo las ves tú.</p>
              <ul className="community-history-list">
                {history.map((h) => {
                  const f = filtersFromRecord(h.query, h.filters)
                  const extra = describeFilters(f, topics)
                  return (
                    <li key={h.id}>
                      <button type="button" className="community-history-item" onClick={() => repeatSearch(h)}>
                        <span className="community-history-query">🔎 {h.query}</span>
                        {extra.length > 0 && <small>{extra.join(' · ')}</small>}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <button type="button" className="link-button" onClick={() => void onClearHistory()}>
                Borrar historial
              </button>
            </section>
          )}
          {historyError && (
            <p className="error" role="alert">
              {historyError}
            </p>
          )}
        </>
      )}
    </>
  )
}
