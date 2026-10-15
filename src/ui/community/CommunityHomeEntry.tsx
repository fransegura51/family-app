import { Link } from 'react-router-dom'
import { useCommunityVisible } from '@/ui/community/useCommunityVisible'

// Entrada a Comunidad en Inicio. Solo se enseña cuando Comunidad está abierta (o a la administración para probar antes del lanzamiento). El estado se recuerda
// 2 minutos y se comparte con la Cocina (useCommunityVisible → data/communityStatusCache.ts), sin consultas periódicas. `visible` ya incluye el acceso por
// edad y permisos de la familia (0277): menores de 15, cuentas sin fecha de nacimiento (si son de niño/invitado) y 15-17 sin permiso de leer NO ven esta
// entrada (ni un enlace que lleve a Comunidad).
export function CommunityHomeEntry() {
  const visible = useCommunityVisible()
  if (visible !== true) return null
  return (
    <Link to="/comunidad" className="card community-home-entry">
      <strong>🏡 Comunidad PEPA</strong>
      <span className="muted">Recetas, consejos y anécdotas de otras familias. Pregunta, comparte y aprende.</span>
    </Link>
  )
}
