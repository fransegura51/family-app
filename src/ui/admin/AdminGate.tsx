import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAppOwner } from '@/state/useAppOwner'
import { AdminLoading } from '@/ui/community/admin/AdminShared'

// Puerta del Centro de Administración. Solo pasa quien administra PEPA de verdad (profiles.is_app_owner, preguntado al servidor con am_i_app_owner). Mientras se comprueba no se pinta
// nada del Centro; si no se puede verificar (sin red o error) se DENIEGA con un aviso, nunca se «supone» el permiso. Detrás de la puerta no se monta ninguna pantalla ni se pide
// ningún dato, así que una persona sin permiso no dispara consultas administrativas. No confundir con el rol «Administrador/a» de una familia: ese NO da acceso aquí.
export function AdminGate({ children }: { children: ReactNode }) {
  const owner = useAppOwner({ fresh: true })
  if (owner === 'checking') return <AdminLoading label="Comprobando permisos…" />
  if (owner === 'owner') return <>{children}</>
  return (
    <section className="cadm" aria-labelledby="admin-denied">
      <h1 id="admin-denied">Esta zona es solo para la administración de PEPA</h1>
      {owner === 'unverified' ? (
        <>
          <p className="muted">No hemos podido comprobar tus permisos ahora mismo (puede ser la conexión). Por seguridad, no se muestra nada. Inténtalo de nuevo en unos minutos.</p>
          <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </>
      ) : (
        <p className="muted">
          Es distinta de la administración de tu familia: solo las cuentas propietarias de PEPA pueden entrar. Si crees que deberías tener acceso, habla con quien administra PEPA.
        </p>
      )}
      <p>
        <Link to="/" className="link-button">
          Volver a Inicio
        </Link>
      </p>
    </section>
  )
}
