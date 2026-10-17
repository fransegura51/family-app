import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchUnreadNotificationCount, NOTIFICATIONS_CHANGED_EVENT } from '@/data/notifications'
import { unreadAnnouncement } from '@/domain/focusTrap'
import { badgeText } from '@/domain/notificationsCenter'
import { NotificationPanel } from '@/ui/NotificationPanel'

// Campana de avisos: SOLO en Inicio, compacta, en la esquina superior derecha de la cabecera (junto al saludo, sin fila propia) y fuera de los accesos rápidos
// (cuya posición cambia por persona).
// El contador es el de avisos sin leer. Se pide al abrir Inicio y al volver a la app (no hay consulta periódica: no sube el gasto de Supabase).
// Accesibilidad (INC-20): el botón dice cuántos hay sin leer y si el panel está abierto; una región «polite» (invisible) anuncia el cambio del contador, pero
// solo DESPUÉS de que la persona haya interactuado con la campana (al cargar Inicio no se anuncia nada); al cerrar el panel el foco vuelve a este botón.
export function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const interacted = useRef(false)

  const lastFetch = useRef(0)

  // Al volver a la app saltan a la vez «focus» y «visibilitychange»: una sola consulta (no más de una cada 3 segundos).
  const refresh = useCallback((force = false) => {
    const now = Date.now()
    if (!force && now - lastFetch.current < 3000) return
    lastFetch.current = now
    fetchUnreadNotificationCount().then(setUnread, () => undefined)
  }, [])

  useEffect(() => {
    refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    // Un aviso abierto desde la notificación del móvil o Novedades de Comunidad cambia el contador fuera del panel (INC-06): se vuelve a pedir una vez.
    const onChanged = () => refresh(true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    }
  }, [refresh])

  // Anuncio del número de sin leer cuando cambia (tras la primera interacción).
  useEffect(() => {
    if (interacted.current) setAnnouncement(unreadAnnouncement(unread))
  }, [unread])

  return (
    <div className="home-bell-row">
      <button
        ref={buttonRef}
        type="button"
        className="notification-bell"
        aria-label={unread > 0 ? `Avisos: ${unread} sin leer` : 'Avisos'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          interacted.current = true
          setOpen(true)
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span className="notification-bell-badge" aria-hidden="true">
            {badgeText(unread)}
          </span>
        )}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </span>
      {open && (
        <NotificationPanel
          returnFocusRef={buttonRef}
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
