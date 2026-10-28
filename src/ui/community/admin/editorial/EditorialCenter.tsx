import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ADMIN_TEXT, type ProposalStatus } from '@/domain/communityAdmin'
import {
  CENTER_SECTIONS,
  parseCenterSection,
  sectionOfKind,
  type CenterItem,
  type CenterKind,
  type CenterSectionId,
} from '@/domain/communityEditorialCenter'
import type { EditorialItemRow } from '@/domain/communityEditorial'
import { HelpDestMark } from '@/help/ui/HelpDest'
import { ActionNotice, AdminError, AdminLoading, InfoBox } from '@/ui/community/admin/AdminShared'
import { EditorialPanel } from '@/ui/community/admin/EditorialPanel'
import { MenuCard } from '@/ui/community/admin/MenusSection'
import { ProposalCard } from '@/ui/community/admin/ProposalCard'
import { CenterFilterBar, CenterItems, INITIAL_LIST, type ListState } from '@/ui/community/admin/editorial/CenterList'
import { EditorialRegistryProvider, useEditorialRegistry } from '@/ui/community/admin/editorial/EditorialRegistry'
import { HistorySection } from '@/ui/community/admin/editorial/HistorySection'
import '@/ui/community/admin/editorial/editorialCenter.css'

// CENTRO EDITORIAL (Administración → Comunidad y moderación → Contenido oficial). Una sola pantalla con navegación interna compacta (Resumen, Artículos, Encuestas, Menús
// semanales, Programación y configuración, Historial y errores) en lugar de una página interminable. Todo sale de UN registro compartido (`EditorialRegistry`): listas,
// contadores y programa semanal se actualizan a la vez después de cualquier acción, sin recargar la página. NADA se publica sin la aprobación de una persona administradora.
export function EditorialCenter({ onChanged }: { onChanged: () => void }) {
  return (
    <EditorialRegistryProvider>
      <CenterBody onChanged={onChanged} />
    </EditorialRegistryProvider>
  )
}

const PARAM = 'ed'
const LIST_KINDS: Record<'articulos' | 'encuestas' | 'menus', CenterKind[]> = { articulos: ['article', 'tip'], encuestas: ['poll'], menus: ['menu'] }
const EMPTY_TEXT: Record<'articulos' | 'encuestas' | 'menus', Record<ProposalStatus, string>> = {
  articulos: {
    proposed: 'No hay artículos ni consejos por revisar. Pepa propone un lote nuevo cada semana.',
    approved: 'No hay artículos ni consejos aprobados pendientes de salir.',
    rejected: 'No hay artículos ni consejos rechazados.',
    published: 'Todavía no hay artículos ni consejos publicados.',
  },
  encuestas: { proposed: 'No hay encuestas por revisar.', approved: 'No hay encuestas aprobadas pendientes de salir.', rejected: 'No hay encuestas rechazadas.', published: 'Todavía no hay encuestas publicadas.' },
  menus: { proposed: 'No hay menús por revisar.', approved: 'No hay menús aprobados o programados.', rejected: 'No hay menús rechazados.', published: 'Todavía no hay menús publicados.' },
}

function CenterBody({ onChanged }: { onChanged: () => void }) {
  const reg = useEditorialRegistry()
  const [params, setParams] = useSearchParams()
  const section = parseCenterSection(params.get(PARAM))
  const [visited, setVisited] = useState<CenterSectionId[]>([section])
  // Estado de cada lista (estado elegido, filtros y cuántos se enseñan): vive AQUÍ, no dentro de la lista, para conservarse al abrir un detalle o cambiar de sección.
  const [lists, setLists] = useState<Record<'articulos' | 'encuestas' | 'menus', ListState>>({ articulos: INITIAL_LIST, encuestas: INITIAL_LIST, menus: INITIAL_LIST })
  const [openId, setOpenId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const scrollBefore = useRef(0)
  const detailRef = useRef<HTMLDivElement | null>(null)
  const noticeRef = useRef<HTMLDivElement | null>(null)

  const go = useCallback(
    (next: CenterSectionId) => {
      setVisited((v) => (v.includes(next) ? v : [...v, next]))
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set(PARAM, next)
          return p
        },
        { replace: true },
      )
    },
    [setParams],
  )
  useEffect(() => {
    setVisited((v) => (v.includes(section) ? v : [...v, section]))
  }, [section])
  // Mientras hay un detalle abierto (quizá con un formulario) no se recarga sola la pantalla; al cerrarlo se recarga.
  useEffect(() => {
    reg.setPaused(openId !== null)
  }, [openId, reg])
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [notice])

  const setList = (key: 'articulos' | 'encuestas' | 'menus', next: ListState) => {
    if (next.status !== lists[key].status && (next.status === 'rejected' || next.status === 'published')) reg.ensure(next.status)
    setLists((l) => ({ ...l, [key]: next }))
  }

  const open = useCallback((id: string) => {
    scrollBefore.current = typeof window === 'undefined' ? 0 : window.scrollY
    setOpenId(id)
  }, [])
  const close = useCallback(() => {
    setOpenId(null)
    void reg.refresh()
    // Se vuelve a donde estaba la persona en la lista.
    window.requestAnimationFrame?.(() => window.scrollTo?.({ top: scrollBefore.current }))
  }, [reg])
  useEffect(() => {
    if (openId) detailRef.current?.scrollIntoView?.({ block: 'start' })
  }, [openId])

  // «Revisar» del programa semanal y las tarjetas del Resumen abren ESE elemento en su gestor.
  const review = (item: EditorialItemRow) => {
    go(sectionOfKind(item.kind))
    open(item.id)
  }
  const jump = (target: 'articulos' | 'encuestas' | 'menus', status: ProposalStatus) => {
    if (status === 'rejected' || status === 'published') reg.ensure(status)
    setLists((l) => ({ ...l, [target]: { ...INITIAL_LIST, status } }))
    go(target)
  }

  // Después de CUALQUIER acción: se anota el aviso, se vuelve a pedir TODO al servidor y se avisa al Centro de Administración (su resumen). Sin optimismo: lo que se ve es lo real.
  const afterAction = useCallback(
    async (text: string | null) => {
      setNotice(text)
      onChanged()
      await reg.refresh()
    },
    [onChanged, reg],
  )

  const content = (id: CenterSectionId) => {
    switch (id) {
      case 'resumen':
        return <Summary onJump={jump} onGo={go} onOpen={open} />
      case 'articulos':
      case 'encuestas':
      case 'menus': {
        const kinds = LIST_KINDS[id]
        const state = lists[id]
        const pool = reg.items.filter((i) => kinds.includes(i.kind))
        const byStatus = pool.filter((i) => i.status === state.status)
        const loadedStatus = state.status === 'rejected' ? reg.data?.rejected : state.status === 'published' ? reg.data?.published : true
        const counts: Partial<Record<ProposalStatus, number>> = {
          proposed: pool.filter((i) => i.status === 'proposed').length,
          approved: pool.filter((i) => i.status === 'approved').length,
        }
        return (
          <div className="cadm-stack">
            <CenterFilterBar state={state} onChange={(n) => setList(id, n)} onStatus={(s) => setList(id, { ...state, status: s, shown: INITIAL_LIST.shown })} counts={counts} />
            {!loadedStatus && <AdminLoading label="Cargando…" />}
            <CenterItems items={byStatus} state={state} onChange={(n) => setList(id, n)} onOpen={(i) => open(i.id)} emptyText={EMPTY_TEXT[id][state.status]} loading={!loadedStatus} />
          </div>
        )
      }
      case 'programacion':
        return (
          <EditorialPanel
            show="config"
            onReview={review}
            onGenerated={() => void afterAction(null)}
            program={{ data: reg.program, loading: reg.loading, error: reg.stale ? reg.error : null, reload: () => void reg.refresh() }}
            refreshKey={reg.data?.loadedAt}
          />
        )
      case 'historial':
        return <HistorySection onOpen={(i) => { go(sectionOfKind(i.kind)); open(i.id) }} refreshKey={reg.data?.loadedAt} />
    }
  }

  const openItem = openId ? (reg.byId.get(openId) ?? null) : null

  return (
    <div className="cadm-stack cadm-center" data-help-id="comunidad.centro-editorial">
      <HelpDestMark id="admin.comunidad-oficial" />
      <InfoBox tone="warn">{ADMIN_TEXT.noPublishWithoutApproval}</InfoBox>
      <nav className="cadm-subnav" aria-label="Secciones del Centro Editorial" data-help-id="comunidad.centro-secciones">
        {CENTER_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`cadm-chip-button${section === s.id ? ' active' : ''}`}
            aria-current={section === s.id ? 'page' : undefined}
            onClick={() => {
              setOpenId(null)
              go(s.id)
            }}
          >
            <span aria-hidden="true">{s.icon} </span>
            {s.label}
            {s.id === 'historial' && reg.counts.errors > 0 ? ` (${reg.counts.errors})` : ''}
          </button>
        ))}
      </nav>
      <div ref={noticeRef}>
        <ActionNotice message={notice} />
      </div>
      {reg.stale && reg.error && (
        <div className="cadm-notice cadm-notice-error" role="alert">
          <p>No se ha podido actualizar: {reg.error} Lo que ves puede estar desfasado.</p>
          <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => void reg.refresh()}>
            Reintentar
          </button>
        </div>
      )}
      {reg.loading && !reg.data && <AdminLoading label="Cargando el Centro Editorial…" />}
      {!reg.loading && !reg.data && reg.error && <AdminError message={reg.error} onRetry={() => void reg.refresh()} />}

      {reg.data && (
        <>
          {openId && (
            <div ref={detailRef} className="cadm-detail" data-help-id="comunidad.centro-detalle">
              <button type="button" className="cadm-btn cadm-btn-ghost cadm-back" onClick={close} data-help-id="comunidad.centro-volver">
                ← Volver a la lista
              </button>
              {openItem ? <Detail item={openItem} onAction={(text) => afterAction(text)} /> : <p className="muted">Este elemento ya no está en el registro (puede haberse eliminado o cambiado de lista).</p>}
            </div>
          )}
          {CENTER_SECTIONS.filter((s) => s.id === section || visited.includes(s.id)).map((s) => (
            <section key={s.id} hidden={s.id !== section || openId !== null} aria-label={s.label} className="cadm-center-section">
              {content(s.id)}
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function Detail({ item, onAction }: { item: CenterItem; onAction: (text: string | null) => Promise<void> }) {
  const reg = useEditorialRegistry()
  const proposal = item.kind === 'menu' ? null : reg.proposalById(item.id)
  const menu = item.kind === 'menu' ? reg.menuById(item.id) : null
  if (proposal) return <ProposalCard proposal={proposal} topics={reg.topics} onDone={(text) => void onAction(text)} />
  if (menu) return <MenuCard menu={menu} topics={reg.topics} onDone={(text) => void onAction(text)} />
  return null
}

// ---- Resumen: lo que requiere atención, en segundos
function Summary({ onJump, onGo, onOpen }: { onJump: (target: 'articulos' | 'encuestas' | 'menus', status: ProposalStatus) => void; onGo: (s: CenterSectionId) => void; onOpen: (id: string) => void }) {
  const reg = useEditorialRegistry()
  const c = reg.counts
  const errors = useMemo(() => reg.items.filter((i) => i.hasError), [reg.items])
  const cards: { key: string; label: string; value: number; hint: string; onClick: () => void; warn?: boolean }[] = [
    { key: 'art', label: 'Artículos pendientes de revisión', value: c.articlesPending, hint: 'Borradores por leer y aprobar', onClick: () => onJump('articulos', 'proposed') },
    { key: 'enc', label: 'Encuestas pendientes', value: c.pollsPending, hint: 'Por revisar', onClick: () => onJump('encuestas', 'proposed') },
    { key: 'men', label: 'Menús pendientes', value: c.menusPending, hint: 'Borradores de menú', onClick: () => onJump('menus', 'proposed') },
    { key: 'apr', label: 'Aprobado y programado', value: c.approvedScheduled, hint: 'Saldrá a su hora', onClick: () => onGo('programacion') },
    { key: 'err', label: 'Errores que requieren intervención', value: c.errors, hint: c.errors > 0 ? 'Revisa qué ha fallado' : 'Sin errores', onClick: () => onGo('historial'), warn: c.errors > 0 },
  ]
  return (
    <div className="cadm-stack" data-help-id="comunidad.centro-resumen">
      <div className="cadm-summary">
        {cards.map((k) => (
          <button key={k.key} type="button" className={`cadm-summary-card${k.warn ? ' warn' : ''}`} onClick={k.onClick} aria-label={`${k.label}: ${k.value}. Abrir`}>
            <span className="cadm-summary-value">{k.value}</span>
            <span className="cadm-summary-label">{k.label}</span>
            <span className="muted cadm-small">{k.hint}</span>
          </button>
        ))}
      </div>
      {errors.length > 0 && (
        <div className="cadm-card" aria-label="Con error">
          <h4>Con error</h4>
          <ul className="cadm-options">
            {errors.map((e) => (
              <li key={e.id}>
                <button type="button" className="link-button cadm-linkbtn" onClick={() => onOpen(e.id)}>
                  {e.title}
                </button>
                {e.errorText ? `: ${e.errorText}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {reg.refreshing && (
        <p className="muted cadm-small" role="status">
          Actualizando…
        </p>
      )}
    </div>
  )
}
