import { Link, Outlet } from 'react-router-dom'
import { accessFromStatus, UNAVAILABLE_TITLE, unavailableReasonText, type CommunityAccessReason } from '@/domain/communityAccess'
import { CommunityHeader } from '@/ui/community/CommunityLayout'
import { useCommunity } from '@/ui/community/CommunityProvider'
import '@/ui/community/communityAccess.css'

// Pantalla de «Comunidad no está disponible para tu cuenta» y marco de rutas que la usa (regla de 0277). Los avisos de solo lectura viven en
// CommunityAccessNotices.tsx (sin depender del marco, para que el marco pueda usarlos).

export function CommunityUnavailable({ reason }: { reason: CommunityAccessReason | null }) {
  return (
    <div className="screen community-screen">
      <CommunityHeader />
      <section className="community-unavailable" aria-labelledby="community-unavailable-title">
        <h1 id="community-unavailable-title">{UNAVAILABLE_TITLE}</h1>
        <p>{unavailableReasonText(reason)}</p>
        <p className="muted">Tu cuenta de PEPA y todo lo demás de la aplicación siguen igual.</p>
        <Link to="/" className="link-button">
          Volver a Inicio
        </Link>
      </section>
    </div>
  )
}

// Marco de las rutas de Comunidad: sin acceso no se monta NADA de Comunidad (ni una sola consulta de contenido), solo esta explicación. Con acceso (completo o de
// solo lectura) deja pasar a las rutas. Mientras carga o sin red no bloquea: el servidor decide en cada llamada.
export function CommunityAccessGate() {
  const { status, loading } = useCommunity()
  const access = accessFromStatus(status)
  if (!loading && status && access.level === 'none') return <CommunityUnavailable reason={access.reason} />
  return <Outlet />
}
