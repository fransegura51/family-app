import { INVITE_FRIENDS_ADMIN_NOTE } from '@/domain/inviteFriends'

// Estado de «Invitar amigos» dentro del Centro de Administración: aún no está activa. No activa invitaciones entre personas ni abre el registro público.
export function InviteFriendsAdminCard() {
  return (
    <div className="card admin-card">
      <strong>🤝 Invitar amigos</strong> <span className="admin-pill admin-pill-off">No activa</span>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        {INVITE_FRIENDS_ADMIN_NOTE}
      </p>
      <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
        Mientras tanto, nadie puede crear una cuenta sin una invitación válida: los códigos de familia nueva se generan aquí abajo, en «Códigos de invitación».
      </p>
    </div>
  )
}
