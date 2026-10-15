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
import { useModalDialog } from '@/ui/useModalDialog'

// Panel de avisos (se abre sobre Inicio, sin salir de ella): casi pantalla completa en móvil y lateral en ordenador. Cerrarlo deja Inicio donde estaba.
//  · Dos bloques en orden fijo (Personales / Otras notificaciones), cada uno plegable a mano; las no leídas desplegadas y las anteriores plegadas
//    bajo «Ver anteriores (X)». Sin bloques vacíos. Cronológico, nunca por importancia.
//  · Abrir el panel NO marca nada como leído; abrir un aviso sí. «Marcar todas como leídas» es una acción aparte de borrar.
//  · Borrar uno, varios o todos (también los plegados) pide confirmación; borrar un aviso no borra la tarea, el pago o el evento al que apuntaba.
//  · El historial es el del servidor (30 días), así que leído/borrado/contador son iguales en todos los dispositivos de la persona.
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
  }, [items, busy, selecting, confirmDelete])

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
    if (target) {
      onClose()
      navigate(target)
    }
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
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
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
    </div>,
    document.body,
  )
}
