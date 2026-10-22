import { INVITE_FRIENDS_ADMIN_NOTE, INVITE_FRIENDS_LABEL } from '@/domain/inviteFriends'
import { useAppOwner } from '@/state/useAppOwner'

// «Invitar amigos» (PEPA-INV-01..03): todavía NO está activo. Solo lo ven las administradoras de PEPA (verificado en el servidor con am_i_app_owner), desactivado y con el
// aviso de que está en preparación; para cualquier otra persona, o si no se puede verificar, no se pinta nada. No hay infraestructura de invitaciones entre personas ni
// consultas al servidor más allá de esa comprobación. Se muestra en Inicio, Familia y la portada de Comunidad.
export function InviteFriendsButton() {
  const owner = useAppOwner()
  if (owner !== 'owner') return null
  return (
    <div className="invite-friends">
      <button type="button" className="invite-friends-btn" disabled aria-disabled="true" aria-describedby="invite-friends-note">
        {INVITE_FRIENDS_LABEL}
      </button>
      <p id="invite-friends-note" className="muted invite-friends-note">
        {INVITE_FRIENDS_ADMIN_NOTE}
      </p>
    </div>
  )
}
