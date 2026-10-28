// Aviso en Inicio cuando Soporte ha contestado a una incidencia (por ejemplo, una solicitud de producto): lleva directo a esa conversación. Solo con SUPPORT_ENABLED; si algo falla
// (sin red, sin permisos) simplemente no aparece. Solo enseña el asunto que la propia persona escribió: nunca el texto de la respuesta.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMyTickets } from '@/support/data'
import { SUPPORT_ENABLED } from '@/support/flags'
import type { SupportTicket } from '@/support/types'

export function SupportReplyCard() {
  const [unread, setUnread] = useState<SupportTicket[]>([])
  useEffect(() => {
    if (!SUPPORT_ENABLED) return
    let cancelled = false
    void listMyTickets()
      .then((all) => {
        if (!cancelled) setUnread(all.filter((t) => t.userUnread))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  if (!SUPPORT_ENABLED || unread.length === 0) return null
  const first = unread[0]
  return (
    <div className="card support-reply-card" role="status" data-help-id="inicio.soporte-respuesta">
      <p style={{ margin: 0 }}>
        🛟 <strong>Atención al Cliente te ha contestado</strong>
      </p>
      <p className="muted" style={{ margin: '2px 0 6px', fontSize: 13 }}>
        {first.subject}
        {unread.length > 1 ? ` · y ${unread.length - 1} más` : ''}
      </p>
      <Link className="receipt-line-reading-btn primary" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} to={`/ayuda?soporte=${encodeURIComponent(first.id)}`}>
        Ver la conversación
      </Link>
    </div>
  )
}
