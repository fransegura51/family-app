import { useMemo, type ReactNode } from 'react'
import type { PostDetail } from '@/domain/community'
import { parseMenu, type SelectedRecipe } from '@/domain/communityMenu'
import { CommunityRichText } from '@/ui/community/CommunityRichText'
import { MenuPlanView } from '@/ui/community/menu/MenuPlanView'
import { useCommunityAccess } from '@/ui/community/useCommunityAccess'

// Cuerpo de una publicación OFICIAL de tipo menú (sustituye al cuerpo solo-texto): el texto completo de la publicación (visible por defecto) y debajo el plan semanal con sus acciones
// (el importador). Las acciones de importar y de Compras exigen acceso completo a Comunidad (canParticipate); con solo lectura se ve el menú y se
// explica por qué no están. Si el menú estructurado no llega o está mal, se cae al texto de siempre (sin botones que no podrían funcionar).
export function MenuPostPanel({ detail, renderWarnings }: { detail: PostDetail; renderWarnings?: (items: SelectedRecipe[]) => ReactNode }) {
  const menu = useMemo(() => parseMenu(detail.menu), [detail.menu])
  const { canParticipate } = useCommunityAccess()

  if (!menu) {
    return (
      <>
        {detail.body && <CommunityRichText text={detail.body} className="community-post-body" />}
        <p className="community-notice" role="status">
          El plan detallado de este menú no está disponible ahora mismo. Puedes leer el texto de la publicación.
        </p>
      </>
    )
  }

  return (
    <>
      {/* El artículo completo va siempre a la vista, y justo debajo el importador semanal (igual en todos los menús semanales, presentes y futuros). */}
      {detail.body && <CommunityRichText text={detail.body} className="community-post-body" />}
      <MenuPlanView postId={detail.id} menu={menu} canUseKitchen={canParticipate && detail.canInteract !== false} renderWarnings={renderWarnings} />
    </>
  )
}
