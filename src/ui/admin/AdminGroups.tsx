import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AdminAreaId } from '@/admin/adminAreas'
import '@/ui/admin/administration.css'

// Bloques plegables del Centro de Administración. Cada área se organiza en grupos temáticos con un encabezado pulsable (botón con aria-expanded).
//  - El contenido de un grupo se monta la PRIMERA vez que se abre y después se conserva (oculto) al plegar: así no se pierde lo escrito en un formulario ni se repiten consultas
//    a Supabase, y un bloque que nunca se abre no pide sus datos.
//  - El estado abierto/cerrado vive en el Centro (no en cada área) y sobrevive al ir y volver entre áreas.
//  - El buscador global abre el grupo que contiene la herramienta elegida (`reveal`).
export const groupKey = (area: AdminAreaId, id: string) => `${area}:${id}`

interface GroupsApi {
  isOpen: (key: string, defaultOpen: boolean) => boolean
  setOpen: (key: string, open: boolean) => void
  register: (area: AdminAreaId, key: string) => () => void
  setAllOpen: (area: AdminAreaId, open: boolean) => void
  /** Abre el grupo (y, si hace falta, lo trae a la vista). */
  reveal: (key: string) => void
  /** Clave del último grupo pedido por el buscador (para que el grupo se desplace a la vista cuando ya esté montado). */
  revealed: { key: string; n: number } | null
}

const GroupsContext = createContext<GroupsApi | null>(null)

export function AdminGroupsProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState<Record<string, boolean>>({})
  const [revealed, setRevealed] = useState<{ key: string; n: number } | null>(null)
  const registry = useRef(new Map<AdminAreaId, Set<string>>())

  const api = useMemo<GroupsApi>(
    () => ({
      isOpen: (key, defaultOpen) => open[key] ?? defaultOpen,
      setOpen: (key, v) => setOpenState((o) => ({ ...o, [key]: v })),
      register: (area, key) => {
        const set = registry.current.get(area) ?? new Set<string>()
        set.add(key)
        registry.current.set(area, set)
        return () => {
          set.delete(key)
        }
      },
      setAllOpen: (area, v) => {
        const keys = [...(registry.current.get(area) ?? [])]
        setOpenState((o) => ({ ...o, ...Object.fromEntries(keys.map((k) => [k, v])) }))
      },
      reveal: (key) => {
        setOpenState((o) => ({ ...o, [key]: true }))
        setRevealed((r) => ({ key, n: (r?.n ?? 0) + 1 }))
      },
      revealed,
    }),
    [open, revealed],
  )
  return <GroupsContext.Provider value={api}>{children}</GroupsContext.Provider>
}

// Sin Centro (pruebas aisladas de un área) los grupos funcionan igual, con su propio estado local.
function useGroups(): GroupsApi {
  const ctx = useContext(GroupsContext)
  const [local, setLocal] = useState<Record<string, boolean>>({})
  const fallback = useMemo<GroupsApi>(
    () => ({
      isOpen: (k, d) => local[k] ?? d,
      setOpen: (k, v) => setLocal((o) => ({ ...o, [k]: v })),
      register: () => () => undefined,
      setAllOpen: () => undefined,
      reveal: (k) => setLocal((o) => ({ ...o, [k]: true })),
      revealed: null,
    }),
    [local],
  )
  return ctx ?? fallback
}

export interface AdminGroupProps {
  area: AdminAreaId
  id: string
  title: string
  /** Frase corta bajo el título (siempre visible, aunque el grupo esté plegado). */
  summary?: string
  /** Indicador siempre visible en el encabezado (un número, un estado…). */
  badge?: ReactNode
  /** Tono del indicador: «alert» para avisos críticos. */
  badgeTone?: 'info' | 'alert'
  defaultOpen?: boolean
  /** Fuerza el grupo abierto mientras haya un filtro activo (no cambia el estado guardado). */
  forceOpen?: boolean
  children: ReactNode
}

export function AdminGroup({ area, id, title, summary, badge, badgeTone = 'info', defaultOpen = false, forceOpen = false, children }: AdminGroupProps) {
  const groups = useGroups()
  const key = groupKey(area, id)
  const uid = useId()
  const open = forceOpen || groups.isOpen(key, defaultOpen)
  // Se monta la primera vez que se abre y se conserva después.
  const [everOpened, setEverOpened] = useState(open)
  const ref = useRef<HTMLElement | null>(null)
  const headRef = useRef<HTMLButtonElement | null>(null)
  const { register } = groups

  useEffect(() => register(area, key), [register, area, key])
  useEffect(() => {
    if (open) setEverOpened(true)
  }, [open])

  // Si el buscador pidió este grupo, se trae a la vista y el foco va a su encabezado.
  const revealedN = groups.revealed?.key === key ? groups.revealed.n : 0
  useEffect(() => {
    if (!revealedN) return
    const t = setTimeout(() => {
      ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      headRef.current?.focus({ preventScroll: true })
    }, 60)
    return () => clearTimeout(t)
  }, [revealedN])

  return (
    <section ref={ref} className={`admin-group${open ? ' admin-group-open' : ''}`} id={`admin-group-${area}-${id}`} aria-labelledby={`${uid}-h`}>
      <h3 className="admin-group-title" id={`${uid}-h`}>
        <button type="button" ref={headRef} className="admin-group-head" aria-expanded={open} aria-controls={`${uid}-body`} onClick={() => groups.setOpen(key, !open)}>
          <span className="admin-group-chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span className="admin-group-heading">
            <span className="admin-group-name">{title}</span>
            {summary && <span className="admin-group-summary">{summary}</span>}
          </span>
          {badge !== undefined && badge !== null && <span className={`admin-group-badge admin-group-badge-${badgeTone}`}>{badge}</span>}
        </button>
      </h3>
      <div id={`${uid}-body`} className="admin-group-body" role="region" aria-labelledby={`${uid}-h`} hidden={!open}>
        {everOpened && children}
      </div>
    </section>
  )
}

// «Expandir todo» / «Plegar todo» de una área (solo actúa sobre los grupos de esa área).
export function AdminGroupsToolbar({ area }: { area: AdminAreaId }) {
  const groups = useGroups()
  return (
    <div className="admin-groups-toolbar" role="group" aria-label="Mostrar u ocultar todos los bloques de esta área">
      <button type="button" className="cadm-btn cadm-btn-ghost" onClick={() => groups.setAllOpen(area, true)}>
        Expandir todo
      </button>
      <button type="button" className="cadm-btn cadm-btn-ghost" onClick={() => groups.setAllOpen(area, false)}>
        Plegar todo
      </button>
    </div>
  )
}

export function useAdminGroups(): GroupsApi {
  return useGroups()
}
