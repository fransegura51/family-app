import { DRAFT_EXPIRY_WARNING } from '@/domain/communityPostForm'
import '@/ui/community/communityEditor.css'

// Advertencia de caducidad: va INMEDIATAMENTE DEBAJO DEL TÍTULO de «Nueva publicación» y de «Mis borradores» (especificación sección 4).
export function DraftExpiryNotice() {
  return (
    <div className="ce-expiry" role="note" aria-label="Aviso sobre la caducidad de los borradores">
      <p>
        <strong>Ojo:</strong> {DRAFT_EXPIRY_WARNING.kept}
      </p>
      <p>{DRAFT_EXPIRY_WARNING.autosave}</p>
    </div>
  )
}
