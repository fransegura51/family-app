import { useCommunityVisible } from '@/ui/community/useCommunityVisible'

// Botón «Compartir en Comunidad» de la ficha de una receta de la Cocina. Solo se enseña si Comunidad está abierta para esta persona (ya incluye la edad y los
// permisos de la familia): con Comunidad cerrada, o sin acceso, no hay botón y por tanto tampoco se carga nada de Comunidad (INC-17). El estado se recuerda
// 2 minutos y se comparte con Inicio y con el aviso de «versión nueva», así que no añade consultas a Supabase.
export function ShareToCommunityButton({ onShare }: { onShare: () => void }) {
  const visible = useCommunityVisible()
  if (visible !== true) return null
  return (
    <button type="button" className="link-button" style={{ minHeight: 44, alignSelf: 'flex-start' }} onClick={onShare}>
      🌍 Compartir en Comunidad
    </button>
  )
}
