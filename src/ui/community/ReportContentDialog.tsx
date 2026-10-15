import { reportChannel, type ReportableType } from '@/domain/communityReports'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { ReportDialog, type ReportResult } from '@/ui/community/ReportDialog'
import { useCommunityAccess } from '@/ui/community/useCommunityAccess'

// Envoltorio ÚNICO para denunciar publicaciones, comentarios y reseñas. Decide a qué función del servidor se llama:
//   · puede participar + tiene alias + no está expulsado/a  →  `community_report` (denuncia de miembro);
//   · en cualquier otro caso (permiso de solo lectura, sin alias, expulsión)  →  `community_visitor_report` (aviso de lector, sin ocultar nada por sí solo).
// Así nadie se queda sin poder avisar de algo grave por tener solo permiso de lectura. No pide alias ni normas: denunciar no es participar.
// `canParticipate` solo sirve para forzar el camino en pruebas; en la aplicación sale de `useCommunityAccess()`.
export function ReportContentDialog({
  type,
  id,
  onClose,
  onReported,
  canParticipate,
}: {
  type: ReportableType
  id: string
  onClose: () => void
  onReported?: (result: ReportResult) => void
  canParticipate?: boolean
}) {
  const access = useCommunityAccess()
  const { me } = useCommunity()
  const channel = reportChannel({
    canParticipate: canParticipate ?? access.canParticipate,
    // Alias creado Y normas aceptadas: es lo que exige `community_report`; si falta algo, el camino de lector no pide nada.
    hasAlias: me?.hasProfile === true && me.rulesAccepted !== false,
    banState: me?.banState ?? null,
  })
  return <ReportDialog type={type} id={id} channel={channel} onClose={onClose} onReported={onReported} />
}
