import { useCallback, useEffect, useMemo, useState } from 'react'
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

// Panel de avisos (se abre sobre Inicio, sin salir de ella): casi pantalla completa en móvil y lateral en ordenador. Cerrarlo deja Inicio donde estaba.
//  · Dos bloques en orden fijo (Personales / Otras notificaciones), cada uno plegable a mano; las no leídas desplegadas y las anteriores plegadas
//    bajo «Ver anteriores (X)». Sin bloques vacíos. Cronológico, nunca por importancia.
//  · Abrir el panel NO marca nada como leído; abrir un aviso sí. «Marcar todas como leídas» es una acción aparte de borrar.
//  · Borrar uno, varios o todos (también los plegados) pide confirmación; borrar un aviso no borra la tarea, el pago o el evento al que apuntaba.
//  · El historial es el del servidor (30 días), así que leído/borrado/contador son iguales en todos los dispositivos de la persona.
export function NotificationPanel({ onClose, onUnreadChange }: { onClose: () => void; onUnreadChange: (count: number) => void }) {
  const navigate = useNavigate()
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
    } catch {
      setError('No he podido cargar tus avisos. Inténtalo de nuevo.')
    }
  }, [onUnreadChange])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const views = useMemo(() => buildBucketViews(items ?? []), [items])
  const total = items?.length ?? 0
  const unread = items ? unreadCount(items) : 0

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
      await load()
    } catch {
      setError('No se ha podido completar la acción. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

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
          <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} aria-label={`Seleccionar: ${n.title}`} />
        )}
        <button type="button" className="notification-item-main" onClick={() => openItem(n)}>
          <span className="notification-item-title">
            {isUnread && <span className="notification-dot" aria-label="Sin leer" />}
            {n.title}
          </span>
          {n.body && <span className="notification-item-body">{n.body}</span>}
          <span className="notification-item-time muted">{relativeTime(n.createdAt)}</span>
        </button>
      </li>
    )
  }

  return (
    <div className="notification-overlay" role="presentation" onClick={onClose}>
      <aside className="notification-panel" role="dialog" aria-modal="true" aria-label="Avisos" onClick={(e) => e.stopPropagation()}>
        <header className="notification-panel-header">
          <h2>Avisos</h2>
          <button type="button" className="link-button" onClick={onClose} aria-label="Cerrar avisos">
            ✕
          </button>
        </header>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {items === null && !error && <p className="muted">Cargando…</p>}

        {items !== null && total === 0 && <p className="muted notification-empty">No tienes avisos. Aquí aparecerán los de los últimos 30 días.</p>}

        {items !== null && total > 0 && (
          <div className="notification-actions">
            {!selecting ? (
              <>
                <button type="button" className="link-button" disabled={busy || unread === 0} onClick={() => run(markAllNotificationsRead)}>
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
                  <span className="confirm-delete">
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
                        })
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
          return (
            <section key={view.bucket} className="notification-bucket">
              <button
                type="button"
                className="notification-bucket-title"
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((prev) => ({ ...prev, [view.bucket]: !isCollapsed }))}
              >
                <span>
                  {view.title} ({view.unread.length + view.earlier.length})
                </span>
                <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
              </button>
              {!isCollapsed && (
                <>
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
                </>
              )}
            </section>
          )
        })}
      </aside>
    </div>
  )
}
