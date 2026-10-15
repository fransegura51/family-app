// «Invitar amigos» (PEPA-INV-01..03): el botón existe pero está desactivado hasta el lanzamiento comercial. No hay infraestructura de invitaciones ni
// consultas: solo informa de que llegará. Se muestra en Inicio, Familia y la portada de Comunidad.
export function InviteFriendsButton() {
  return (
    <div className="invite-friends">
      <button type="button" className="invite-friends-btn" disabled aria-disabled="true">
        Invitar amigos (próximamente)
      </button>
    </div>
  )
}
