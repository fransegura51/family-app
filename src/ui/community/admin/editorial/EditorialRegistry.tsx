import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { adminListMenus, adminListProposals, listCommunityTopics } from '@/data/community'
import { listEditorialItems } from '@/data/communityEditorial'
import { communityErrorText } from '@/domain/communityErrors'
import { toMenuList, toProposals, type MenuRow, type Proposal } from '@/domain/communityAdmin'
import { countCenter, fromMenu, fromProposal, syncProgramRows, type CenterCounts, type CenterItem } from '@/domain/communityEditorialCenter'
import { madridDay as madridDayOf, type EditorialItemRow } from '@/domain/communityEditorial'
import type { CommunityTopic } from '@/domain/community'
import { useRealtimeRefresh } from '@/state/useRealtimeRefresh'

// REGISTRO ÚNICO del Centro Editorial. Las listas (artículos, encuestas, menús), los contadores del Resumen y el programa semanal salen de aquí: ninguna pantalla guarda
// un estado propio, así que no pueden quedar desfasadas entre sí. Cualquier acción (aprobar, rechazar, editar, rectificar, reprogramar, generar…) llama a `refresh()`,
// que vuelve a pedir TODO al servidor y sustituye los datos por los reales; mientras tanto se siguen enseñando los anteriores (sin «Cargando…» ni saltos). No hay estados
// optimistas: si el servidor rechaza algo, lo que se ve es lo que hay. Si falla la recarga se avisa y se conserva lo último correcto.

export interface RegistryData {
  proposed: Proposal[]
  approved: Proposal[]
  // Se piden solo cuando se abre ese filtro por primera vez (después se mantienen al día).
  rejected: Proposal[] | null
  published: Proposal[] | null
  menus: MenuRow[]
  menuAutopublish: boolean
  program: EditorialItemRow[]
  loadedAt: number
}

export interface EditorialRegistry {
  data: RegistryData | null
  topics: CommunityTopic[]
  loading: boolean
  refreshing: boolean
  error: string | null
  /** Avisa si la última recarga falló y se están enseñando datos anteriores. */
  stale: boolean
  refresh: () => Promise<void>
  /** Pide un estado que aún no se había cargado (rechazadas / publicadas). */
  ensure: (status: 'rejected' | 'published') => void
  /** Todos los elementos como filas compactas, por tipo de lista. */
  items: CenterItem[]
  byId: ReadonlyMap<string, CenterItem>
  proposalById: (id: string) => Proposal | null
  menuById: (id: string) => MenuRow | null
  counts: CenterCounts
  program: EditorialItemRow[]
  /** Mientras es true no se recarga sola (hay un detalle abierto): se recarga al cerrarlo. */
  setPaused: (paused: boolean) => void
}

const Ctx = createContext<EditorialRegistry | null>(null)

export function useEditorialRegistry(): EditorialRegistry {
  const v = useContext(Ctx)
  if (!v) throw new Error('useEditorialRegistry fuera de EditorialRegistryProvider')
  return v
}

// Día de Madrid (AAAA-MM-DD) de un instante ISO; null si no hay instante.
const madridDay = (v: string | null): string | null => (v ? madridDayOf(v) : null)

const nonMenu = (list: Proposal[]) => list.filter((p) => p.kind !== 'menu')

export function EditorialRegistryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<RegistryData | null>(null)
  const [topics, setTopics] = useState<CommunityTopic[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [paused, setPausedState] = useState(false)
  const seq = useRef(0)
  const want = useRef<{ rejected: boolean; published: boolean }>({ rejected: false, published: false })
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    const mine = ++seq.current
    setRefreshing(true)
    try {
      const [proposed, approved, rejected, published, menus, program] = await Promise.all([
        adminListProposals('proposed'),
        adminListProposals('approved'),
        want.current.rejected ? adminListProposals('rejected') : Promise.resolve(null),
        want.current.published ? adminListProposals('published') : Promise.resolve(null),
        adminListMenus(),
        listEditorialItems(null),
      ])
      // Una recarga más reciente ya está en marcha o terminó: esta respuesta es antigua y se descarta.
      if (!alive.current || mine !== seq.current) return
      const menuList = toMenuList(menus)
      setData({
        proposed: nonMenu(toProposals(proposed)),
        approved: nonMenu(toProposals(approved)),
        rejected: rejected ? nonMenu(toProposals(rejected)) : null,
        published: published ? nonMenu(toProposals(published)) : null,
        menus: menuList.menus,
        menuAutopublish: menuList.autopublish,
        program,
        loadedAt: Date.now(),
      })
      setError(null)
      setStale(false)
    } catch (e) {
      if (!alive.current || mine !== seq.current) return
      // Se conservan los datos anteriores (si los hay) y se dice la verdad: no se han podido actualizar.
      setError(communityErrorText(e))
      setStale(true)
    } finally {
      if (alive.current && mine === seq.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    void listCommunityTopics()
      .then((t) => alive.current && setTopics(t))
      .catch(() => undefined)
  }, [refresh])

  const ensure = useCallback(
    (status: 'rejected' | 'published') => {
      if (want.current[status]) return
      want.current[status] = true
      void refresh()
    },
    [refresh],
  )

  // Otro dispositivo (o una función de servidor) cambia un elemento oficial: se recarga en silencio. Necesita que la tabla esté en la publicación de Realtime (migración pendiente
  // 0344); mientras no lo esté sigue funcionando al volver a la pestaña, recuperar el foco o la conexión.
  useRealtimeRefresh(['community_official_items'], refresh, { paused })

  const topicLabel = useCallback((id: string) => topics.find((t) => t.id === id)?.label ?? null, [topics])

  const derived = useMemo(() => {
    const items: CenterItem[] = []
    const proposals = new Map<string, Proposal>()
    const menuRows = new Map<string, MenuRow>()
    if (data) {
      for (const list of [data.proposed, data.approved, data.rejected ?? [], data.published ?? []]) {
        for (const p of list) {
          proposals.set(p.id, p)
          items.push(fromProposal(p, topicLabel(p.topicId), madridDay))
        }
      }
      for (const m of data.menus) {
        menuRows.set(m.id, m)
        items.push(fromMenu(m, madridDay))
      }
    }
    const byId = new Map(items.map((i) => [i.id, i]))
    // Los contadores solo cuentan lo que está CARGADO siempre (pendientes y aprobados + todos los menús): rechazadas y publicadas no afectan a ninguno.
    const counted = items.filter((i) => i.status === 'proposed' || i.status === 'approved' || i.kind === 'menu')
    return { items, byId, proposals, menuRows, counts: countCenter(counted), program: data ? syncProgramRows(data.program, byId) : [] }
  }, [data, topicLabel])

  const value = useMemo<EditorialRegistry>(
    () => ({
      data,
      topics,
      loading,
      refreshing,
      error,
      stale,
      refresh,
      ensure,
      items: derived.items,
      byId: derived.byId,
      proposalById: (id) => derived.proposals.get(id) ?? null,
      menuById: (id) => derived.menuRows.get(id) ?? null,
      counts: derived.counts,
      program: derived.program,
      setPaused: setPausedState,
    }),
    [data, topics, loading, refreshing, error, stale, refresh, ensure, derived],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
