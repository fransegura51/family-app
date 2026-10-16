import { NAV_SECTION_COLORS } from '@/domain/navTabs'
import { useCommunityVisible } from '@/ui/community/useCommunityVisible'

// Entrada «Comunidad PEPA» del menú ☰ (junto a la tarjeta del Inicio). Se monta SOLO con el menú abierto y comparte el estado de 2 minutos de Inicio y Cocina
// (communityStatusCache), así que no añade llamadas periódicas: abrir el menú justo después del Inicio no cuesta ninguna consulta nueva. Solo se pinta cuando
// Comunidad está abierta para esta persona (con el interruptor de lanzamiento en 0, solo las propietarias; ya incluye la edad y los permisos de la familia).
export function CommunityMenuItem({ onGo }: { onGo: (to: string) => void }) {
  const visible = useCommunityVisible()
  if (visible !== true) return null
  return (
    <button type="button" className="nav-menu-item" style={{ background: NAV_SECTION_COLORS.get('ayuda') }} onClick={() => onGo('/comunidad')}>
      <span className="nav-item-icon">🏡</span>
      Comunidad PEPA
    </button>
  )
}
