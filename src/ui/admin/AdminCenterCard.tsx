import { Link } from 'react-router-dom'
import { useAppOwner } from '@/state/useAppOwner'
import '@/ui/admin/administration.css'

// Tarjeta de acceso al Centro de Administración de PEPA (Configuración, justo debajo de «Nombre de familia»). Solo para las cuentas propietarias de la app
// (profiles.is_app_owner): se pregunta al SERVIDOR (am_i_app_owner) y, si no lo confirma o no se puede verificar, no se pinta nada. Para cualquier otra persona (incluidos
// administradores de familia) no existe, y aunque escriban la dirección a mano la puerta del Centro les deniega la entrada. Toda la tarjeta es el enlace.
export function AdminCenterCard() {
  const owner = useAppOwner()
  if (owner !== 'owner') return null

  return (
    <Link to="/administracion" className="admin-center-card" aria-label="Centro de Administración PEPA. Gestiona usuarios, Comunidad, funcionalidades, Ayuda y sistema">
      <span className="admin-center-card-icon" aria-hidden="true">
        🛡️
      </span>
      <span className="admin-center-card-text">
        <strong>Centro de Administración PEPA</strong>
        <span>Gestiona usuarios, Comunidad, funcionalidades, Ayuda y sistema</span>
      </span>
      <span className="admin-center-card-chevron" aria-hidden="true">
        ›
      </span>
    </Link>
  )
}
