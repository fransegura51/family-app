import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchUnreadNotificationCount } from '@/data/notifications'
import { badgeText } from '@/domain/notificationsCenter'
import { NotificationPanel } from '@/ui/NotificationPanel'

// Campana de avisos: SOLO en Inicio, arriba a la derecha, por encima del saludo y fuera de los accesos rápidos (cuya posición cambia por persona).
// El contador es el de avisos sin leer. Se pide al abrir Inicio y al volver a la app (no hay consulta periódica: no sube el gasto de Supabase).
export function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)

  const lastFetch = useRef(0)

  // Al volver a la app saltan a la vez «focus» y «visibilitychange»: una sola consulta (no más de una cada 3 segundos).
  const refresh = useCallback(() => {
    const now = Date.now()
    if (now - lastFetch.current < 3000) return
    lastFetch.current = now
    fetchUnreadNotificationCount().then(setUnread, () => undefined)
  }, [])

  useEffect(() => {
    refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  return (
    <div className="home-bell-row">
      <button
        type="button"
        className="notification-bell"
        aria-label={unread > 0 ? `Avisos: ${unread} sin leer` : 'Avisos'}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="notification-bell-badge">{badgeText(unread)}</span>}
      </button>
      {open && (
        <NotificationPanel
          onClose={() => {
            setOpen(false)
            refresh()
          }}
          onUnreadChange={setUnread}
        />
      )}
    </div>
  )
}
