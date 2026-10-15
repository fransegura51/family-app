import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { communityErrorText } from '@/domain/communityErrors'
import { clearListState, loadListState, saveListState } from '@/ui/community/communityListState'

// Lista paginada de publicaciones para secciones, buscador y guardados. Una página = UNA petición («Ver más» pide la siguiente); sin consultas periódicas.
//
// Al VOLVER ATRÁS (restore = true, es decir useNavigationType() === 'POP') se recupera de sessionStorage lo que había: posición de desplazamiento, filtros
// (viven en la dirección), orden y lo ya cargado, sin volver a pedirlo. Al entrar de nuevo por navegación normal se empieza de cero («Más recientes»).
// La «firma» (signature) identifica lo que se está viendo; si cambia (otro filtro, otro orden), se pide desde el principio.

export interface UseCommunityListOptions<T extends { id: string }> {
  storageKey: string
  signature: string
  // false = no pedir nada todavía (p. ej. buscador sin texto).
  enabled?: boolean
  pageSize: number
  restore: boolean
  meta: { order: string; topic: string | null; kind: string | null }
  fetchPage: (offset: number) => Promise<T[]>
}

export interface CommunityListResult<T> {
  items: T[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  moreError: string | null
  loadingMore: boolean
  hasMore: boolean
  // true si lo que se ve salió de la memoria al volver atrás (no se ha vuelto a pedir al servidor).
  restored: boolean
  loadMore: () => void
  // Vuelve a pedir la primera página SIN vaciar la lista mientras llega (p. ej. tras desbloquear a alguien).
  reload: () => void
}

export function useCommunityList<T extends { id: string }>(opts: UseCommunityListOptions<T>): CommunityListResult<T> {
  const { storageKey, signature, pageSize, restore, meta } = opts
  const enabled = opts.enabled !== false

  // Estado guardado de la visita anterior: solo se mira al montar y solo al volver atrás, y solo si es de la MISMA firma.
  const [saved] = useState(() => {
    if (!restore) return null
    const st = loadListState<T>(storageKey)
    return st && st.query === signature && st.items.length > 0 ? st : null
  })

  const [items, setItems] = useState<T[]>(saved?.items ?? [])
  const [status, setStatus] = useState<CommunityListResult<T>['status']>(saved ? 'ready' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(saved ? saved.offset > 0 && saved.offset % pageSize === 0 : false)
  const [restored, setRestored] = useState(saved !== null)
  const [reloadToken, setReloadToken] = useState(0)

  const fetchRef = useRef(opts.fetchPage)
  const offsetRef = useRef(saved?.offset ?? 0)
  const reqId = useRef(0)
  const prevSignature = useRef<string | null>(saved ? signature : null)
  const prevToken = useRef(0)
  const skipFirstFetch = useRef(saved !== null)
  const loadingMoreRef = useRef(false)
  const lastScroll = useRef(typeof window === 'undefined' ? 0 : window.scrollY)
  const pendingScroll = useRef<number | null>(saved ? saved.scrollY : null)
  const latest = useRef({ items, signature, meta })

  useLayoutEffect(() => {
    fetchRef.current = opts.fetchPage
    latest.current = { items, signature, meta }
  })

  // Al entrar por navegación normal se olvida lo guardado antes (no debe reaparecer más tarde).
  useEffect(() => {
    if (!restore) clearListState(storageKey)
  }, [restore, storageKey])

  // Posición de desplazamiento: se anota al moverse y se guarda todo al salir de la pantalla (en el efecto de layout para leerla ANTES de que la página
  // siguiente cambie la altura del documento).
  useLayoutEffect(() => {
    const onScroll = () => {
      lastScroll.current = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      const s = latest.current
      if (s.items.length > 0) {
        saveListState<T>(storageKey, {
          scrollY: lastScroll.current,
          order: s.meta.order,
          topic: s.meta.topic,
          kind: s.meta.kind,
          query: s.signature,
          offset: offsetRef.current,
          items: s.items,
        })
      }
    }
  }, [storageKey])

  // Restaurar el desplazamiento una vez pintada la lista recuperada.
  useLayoutEffect(() => {
    if (pendingScroll.current !== null) {
      window.scrollTo(0, pendingScroll.current)
      pendingScroll.current = null
    }
  }, [])

  // Primera página: al montar, al cambiar la firma y al pedir recarga.
  useEffect(() => {
    if (!enabled) {
      reqId.current++
      prevSignature.current = null
      setItems([])
      setStatus('idle')
      setError(null)
      setHasMore(false)
      offsetRef.current = 0
      return
    }
    if (skipFirstFetch.current) {
      // Se acaba de recuperar de la memoria: no se vuelve a pedir.
      skipFirstFetch.current = false
      return
    }
    const id = ++reqId.current
    const isReload = prevSignature.current === signature && prevToken.current !== reloadToken
    prevSignature.current = signature
    prevToken.current = reloadToken
    if (!isReload) {
      setItems([])
      setHasMore(false)
      offsetRef.current = 0
    }
    setRestored(false)
    setStatus('loading')
    setError(null)
    setMoreError(null)
    fetchRef.current(0).then(
      (page) => {
        if (id !== reqId.current) return
        offsetRef.current = page.length
        setItems(page)
        setHasMore(page.length >= pageSize)
        setStatus('ready')
      },
      (e) => {
        if (id !== reqId.current) return
        setError(communityErrorText(e))
        setStatus('error')
      },
    )
    // Si algo cambia antes de que llegue la respuesta, la siguiente ejecución de este efecto sube reqId y la respuesta vieja se ignora.
  }, [enabled, signature, reloadToken, pageSize])

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    setMoreError(null)
    const id = reqId.current
    fetchRef.current(offsetRef.current).then(
      (page) => {
        if (id !== reqId.current) return
        offsetRef.current += page.length
        // Si mientras tanto se publicó algo, el desplazamiento puede repetir una publicación: se descarta.
        setItems((prev) => {
          const ids = new Set(prev.map((i) => i.id))
          return [...prev, ...page.filter((i) => !ids.has(i.id))]
        })
        setHasMore(page.length >= pageSize)
      },
      (e) => {
        if (id === reqId.current) setMoreError(communityErrorText(e))
      },
    ).finally(() => {
      loadingMoreRef.current = false
      setLoadingMore(false)
    })
  }, [pageSize])

  const reload = useCallback(() => setReloadToken((t) => t + 1), [])

  return { items, status, error, moreError, loadingMore, hasMore, restored, loadMore, reload }
}
