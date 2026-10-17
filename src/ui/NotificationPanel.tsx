import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  deleteAllNotifications,
  deleteNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
} from '@/data/notifications'
import {
  buildBucketViews,
  relativeTime,
  safeInternalUrl,
  selectionIds,
  unreadCount,
  type AppNotification,
  type NotificationBucket,
} from '@/domain/notificationsCenter'
import { unreadAnnouncement } from '@/domain/focusTrap'
import { formatDate } from '@/domain/dateFormat'
import {
  assignedText,
  omittedCount,
  parseTaskSummary,
  summaryTaskLink,
  TASK_SUMMARY_CATEGORY,
  type SummaryGroup,
  type TaskSummaryDetail,
} from '@/domain/taskSummaryNotice'
import { useModalDialog } from '@/ui/useModalDialog'

// Panel de avisos (se abre sobre Inicio, sin salir de ella): casi pantalla completa en móvil y lateral en ordenador. Cerrarlo deja Inicio donde estaba.
//  · Dos bloques en orden fijo (Personales / Otras notificaciones), cada uno plegable a mano; las no leídas desplegadas y las anteriores plegadas
//    bajo «Ver anteriores (X)». Sin bloques vacíos. Cronológico, nunca por importancia.
//  · Abrir el panel NO marca nada como leído; abrir un aviso sí. «Marcar todas como leídas» es una acción aparte de borrar.
//  · Borrar uno, varios o todos (también los plegados) pide confirmación; borrar un aviso no borra la tarea, el pago o el evento al que apuntaba.
//  · El historial es el del servidor (30 días), así que leído/borrado/contador son iguales en todos los dispositivos de la persona.
//  · El aviso agrupado de tareas (resumen diario) no navega: abre un DETALLE dentro del mismo panel con TODAS las tareas del aviso (título completo, fecha,
//    personas asignadas); cada tarea abre Calendario en ella. Los avisos antiguos (sin listado completo) lo explican y llevan a Calendario sin inventar datos.
// Accesibilidad (INC-20): diálogo modal de verdad (role=dialog + aria-modal + nombre), foco inicial dentro, foco atrapado, Escape / botón / tocar fuera para
// cerrar, el foco vuelve al botón de la campana, el fondo no se desplaza y queda inerte (useModalDialog; se dibuja con un portal FUERA de #root para que el
// fondo se pueda marcar como inerte sin afectar al panel), lista con semántica (ul/li), cada aviso es un botón con su estado en texto («Sin leer»/«Leído») y
// una región «polite» avisa de los cambios (cuántos sin leer, «todo leído», «eliminados»).
export function NotificationPanel({
  onClose,
  onUnreadChange,
  returnFocusRef,
}: {
  onClose: () => void
  onUnreadChange: (count: number) => void
  // Botón de la campana: recibe el foco al cerrar el panel.
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [status, setStatus] = useState('')
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [collapsed, setCollapsed] = useState<Partial<Record<NotificationBucket, boolean>>>({})
  const [showEarlier, setShowEarlier] = useState<Partial<Record<NotificationBucket, boolean>>>({})
  const [busy, setBusy] = useState(false)
  // Aviso agrupado de tareas abierto (vista de detalle dentro del panel).
  const [detail, setDetail] = useState<AppNotification | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await listNotifications()
      setItems(list)
      onUnreadChange(unreadCount(list))
      setError(null)
      return list
    } catch {
      setError('No he podido cargar tus avisos. Inténtalo de nuevo.')
    }
    return null
  }, [onUnreadChange])

  // Al abrir: se cargan los avisos y se anuncia cuántos hay sin leer (una sola vez).
  useEffect(() => {
    void load().then((list) => {
      if (list) setStatus(unreadAnnouncement(unreadCount(list)))
    })
  }, [load])

  // Foco, Escape, scroll y fondo inerte (ver useModalDialog).
  useModalDialog(panelRef, { onClose, returnFocusRef })

  const views = useMemo(() => buildBucketViews(items ?? []), [items])
  const total = items?.length ?? 0
  const unread = items ? unreadCount(items) : 0

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true)
    try {
      await action()
      await load()
      setStatus(done)
    } catch {
      setError('No se ha podido completar la acción. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  // Si el botón que tenía el foco desaparece o se desactiva (p. ej. «Marcar todas» al no quedar nada sin leer, o lo seleccionado ya borrado), el foco no se
  // pierde en el fondo: vuelve al panel. Se mira DESPUÉS de pintar, cuando el botón ya está desactivado.
  useEffect(() => {
    const panel = panelRef.current
    const active = document.activeElement as HTMLButtonElement | null
    if (panel && (!active || active === document.body || !panel.contains(active) || active.disabled)) panel.focus({ preventScroll: true })
  }, [items, busy, selecting, confirmDelete, detail])

  function openItem(n: AppNotification) {
    if (selecting) {
      toggle(n.id)
      return
    }
    const target = safeInternalUrl(n.url)
    // Abrir un aviso lo marca como leído (se avisa a la lista al instante y al servidor en segundo plano).
    if (n.readAt === null) {
      setItems((prev) => (prev ? prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) : prev))
      void markNotificationsRead([n.id]).then(
        () => undefined,
        () => undefined,
      )
    }
    if (n.category === TASK_SUMMARY_CATEGORY) {
      // El resumen de tareas se abre como detalle (todas las tareas), no se va directo a Calendario.
      setDetail(n)
      return
    }
    if (target) {
      onClose()
      navigate(target)
    }
  }

  function openTask(link: string | null) {
    const target = link ? safeInternalUrl(link) : null
    if (!target) return
    onClose()
    navigate(target)
  }

  function renderGroup(title: string, group: SummaryGroup, id: string) {
    if (group.tasks.length === 0) return null
    const omitted = omittedCount(group)
    return (
      <section key={id} className="notification-task-group" aria-labelledby={id}>
        <h3 id={id} className="notification-task-group-title">
          {title} ({group.count})
        </h3>
        <ul className="notification-list">
          {group.tasks.map((t) => {
            const who = assignedText(t)
            return (
              <li key={`${t.id}-${t.date}`} className="notification-item">
                <button type="button" className="notification-item-main" onClick={() => openTask(summaryTaskLink(t))}>
                  <span className="notification-item-title notification-task-title">{t.title}</span>
                  <span className="notification-item-body">Fecha: {formatDate(t.date)}</span>
                  {who && <span className="notification-item-body">Asignada a: {who}</span>}
                </button>
              </li>
            )
          })}
        </ul>
        {omitted > 0 && <p className="muted">Se muestran {group.tasks.length} de {group.count}. El resto está en Calendario.</p>}
      </section>
    )
  }

  // Vista de detalle del aviso agrupado de tareas.
  function renderDetail(n: AppNotification) {
    const summary: TaskSummaryDetail | null = parseTaskSummary(n.payload)
    const calendarUrl = safeInternalUrl(n.url)
    return (
      <>
        <header className="notification-panel-header">
          <h2 id={`${titleId}-detail`}>{n.title}</h2>
          <button type="button" className="notification-close" onClick={() => setDetail(null)} aria-label="Cerrar el detalle y volver a los avisos">
            <span aria-hidden="true">✕</span>
          </button>
        </header>
        {summary ? (
          <>
            {renderGroup('Atrasadas', summary.overdue, `${titleId}-overdue`)}
            {renderGroup('Hoy', summary.today, `${titleId}-today`)}
          </>
        ) : (
          <>
            <p className="notification-item-body">{n.body}</p>
            <p className="muted">
              Este aviso se envió antes de que PEPA guardara la lista completa, así que solo conserva las tareas del resumen. Puedes ver todas tus tareas
              pendientes en Calendario.
            </p>
          </>
        )}
        <div className="notification-detail-actions">
          {calendarUrl && !summary && (
            <button type="button" className="link-button" onClick={() => openTask(calendarUrl)}>
              Abrir las tareas en Calendario
            </button>
          )}
          <button type="button" className="notification-detail-close" onClick={() => setDetail(null)}>
            Cerrar
          </button>
        </div>
      </>
    )
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
    setConfirmDelete(false)
  }

  const allIds = (items ?? []).map((n) => n.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  function renderItem(n: AppNotification) {
    const isUnread = n.readAt === null
    return (
      <li key={n.id} className={`notification-item${isUnread ? ' notification-item-unread' : ''}`}>
        {selecting && (
          <label className="notification-select">
            <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} />
            <span className="visually-hidden">Seleccionar: {n.title}</span>
          </label>
        )}
        {/* El estado va en TEXTO («Sin leer»/«Leído») para el lector de pantalla; el punto azul es solo decoración. Enter y Espacio abren el aviso (es un botón). */}
        <button type="button" className="notification-item-main" onClick={() => openItem(n)}>
          <span className="visually-hidden">{isUnread ? 'Sin leer. ' : 'Leído. '}</span>
          <span className="notification-item-title">
            {isUnread && <span className="notification-dot" aria-hidden="true" />}
            {n.title}
          </span>
          {n.body && <span className="notification-item-body">{n.body}</span>}
          <span className="notification-item-time muted">{relativeTime(n.createdAt)}</span>
        </button>
      </li>
    )
  }

  return createPortal(
    <div className="notification-overlay" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="notification-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={detail ? `${titleId}-detail` : titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Detalle de un aviso agrupado de tareas (sustituye a la lista mientras está abierto; la lista queda oculta y conserva su estado). */}
        {detail && renderDetail(detail)}
        <div hidden={detail !== null}>
          <header className="notification-panel-header">
            <h2 id={titleId}>Avisos</h2>
            <button type="button" className="notification-close" onClick={onClose} aria-label="Cerrar avisos">
              <span aria-hidden="true">✕</span>
            </button>
          </header>

          {/* Anuncios discretos para el lector de pantalla (no se ven). */}
          <p className="visually-hidden" role="status" aria-live="polite">
            {status}
          </p>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {items === null && !error && (
            <p className="muted" role="status">
              Cargando…
            </p>
          )}

          {items !== null && total === 0 && <p className="muted notification-empty">No tienes avisos. Aquí aparecerán los de los últimos 30 días.</p>}

          {items !== null && total > 0 && (
            <div className="notification-actions">
              {!selecting ? (
                <>
                  <button
                    type="button"
                    className="link-button"
                    disabled={busy || unread === 0}
                    onClick={() => run(markAllNotificationsRead, 'Todos los avisos están marcados como leídos.')}
                  >
                    Marcar todas como leídas
                  </button>
                  <button type="button" className="link-button" onClick={() => setSelecting(true)}>
                    Seleccionar
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="link-button" onClick={() => setSelected(allSelected ? new Set() : new Set(allIds))}>
                    {allSelected ? 'Quitar selección' : 'Seleccionar todas'}
                  </button>
                  {!confirmDelete ? (
                    <button type="button" className="link-button danger" disabled={selected.size === 0} onClick={() => setConfirmDelete(true)}>
                      Eliminar ({selected.size})
                    </button>
                  ) : (
                    <span className="confirm-delete" role="group" aria-label="Confirmar eliminación">
                      ¿Eliminar {selected.size === total ? 'todos los avisos' : `${selected.size} aviso${selected.size === 1 ? '' : 's'}`}?{' '}
                      <button
                        type="button"
                        className="link-button danger"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            if (selected.size === total) await deleteAllNotifications()
                            else await deleteNotifications(selectionIds(items, selected))
                            stopSelecting()
                          }, 'Avisos eliminados.')
                        }
                      >
                        Sí, eliminar
                      </button>{' '}
                      <button type="button" className="link-button" onClick={() => setConfirmDelete(false)}>
                        Cancelar
                      </button>
                    </span>
                  )}
                  <button type="button" className="link-button" onClick={stopSelecting}>
                    Hecho
                  </button>
                </>
              )}
            </div>
          )}

          {views.map((view) => {
            const isCollapsed = collapsed[view.bucket] === true
            const earlierOpen = showEarlier[view.bucket] === true
            const bodyId = `${titleId}-${view.bucket}`
            return (
              <section key={view.bucket} className="notification-bucket" aria-label={view.title}>
                <h3 className="notification-bucket-heading">
                  <button
                    type="button"
                    className="notification-bucket-title"
                    aria-expanded={!isCollapsed}
                    aria-controls={bodyId}
                    onClick={() => setCollapsed((prev) => ({ ...prev, [view.bucket]: !isCollapsed }))}
                  >
                    <span>
                      {view.title} ({view.unread.length + view.earlier.length})
                    </span>
                    <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                  </button>
                </h3>
                <div id={bodyId} hidden={isCollapsed}>
                  {view.unread.length > 0 && <ul className="notification-list">{view.unread.map(renderItem)}</ul>}
                  {view.earlier.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="link-button notification-earlier-toggle"
                        aria-expanded={earlierOpen}
                        onClick={() => setShowEarlier((prev) => ({ ...prev, [view.bucket]: !earlierOpen }))}
                      >
                        {earlierOpen ? 'Ocultar anteriores' : `Ver anteriores (${view.earlier.length})`}
                      </button>
                      {earlierOpen && <ul className="notification-list">{view.earlier.map(renderItem)}</ul>}
                    </>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
