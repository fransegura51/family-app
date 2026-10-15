import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { communityStatus } from '@/data/community'

// Entrada a Comunidad en Inicio. Solo se enseña cuando Comunidad está abierta (o a la administración para probar antes del lanzamiento). Una sola consulta
// al abrir Inicio; sin consultas periódicas. `visible` ya incluye el acceso por edad y permisos de la familia (0277): menores de 15, cuentas sin fecha de
// nacimiento (si son de niño/invitado) y 15-17 sin permiso de leer NO ven esta entrada (ni un enlace que lleve a Comunidad).
export function CommunityHomeEntry() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let cancelled = false
    communityStatus().then(
      (s) => {
        if (!cancelled) setVisible(s.visible)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [])
  if (!visible) return null
  return (
    <Link to="/comunidad" className="card community-home-entry">
      <strong>🏡 Comunidad PEPA</strong>
      <span className="muted">Recetas, consejos y anécdotas de otras familias. Pregunta, comparte y aprende.</span>
    </Link>
  )
}
