import { EditorialCenter } from '@/ui/community/admin/editorial/EditorialCenter'

// Contenido oficial. Desde la reorganización del Centro Editorial, esta pestaña es el Centro Editorial: navegación interna compacta (Resumen, Artículos, Encuestas, Menús
// semanales, Programación y configuración, Historial y errores) sobre un registro único. La tarjeta completa de cada propuesta vive en `ProposalCard.tsx`; se reexporta aquí
// para no cambiar quien la importaba.
export { ProposalCard, ProposalContent, ProposalEditForm } from '@/ui/community/admin/ProposalCard'

export function OfficialTab({ onChanged }: { onChanged: () => void }) {
  return <EditorialCenter onChanged={onChanged} />
}
