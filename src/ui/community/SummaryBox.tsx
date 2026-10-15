import { useCommunityAccess } from '@/ui/community/useCommunityAccess'
import '@/ui/community/communityPost.css'

// Resumen breve de la conversación hecho por Pepa (SOLO con 15 comentarios o más; con menos, esta caja no existe). Resume los comentarios que hay, sin inventar
// conclusiones. No es un artículo oficial de investigación. Si la IA falla no pasa nada: los comentarios siguen accesibles (este componente nunca los esconde
// para siempre: «Ver toda la conversación» está siempre).
export function SummaryBox({
  commentCount,
  summary,
  busy,
  failed,
  conversationOpen,
  onOpenConversation,
  onRefresh,
}: {
  commentCount: number
  summary: string | null
  busy: boolean
  failed: boolean
  conversationOpen: boolean
  onOpenConversation: () => void
  onRefresh: () => void
}) {
  // Pedir que Pepa actualice el resumen es participar: con permiso solo de lectura se lee el resumen, sin el botón.
  const { canParticipate } = useCommunityAccess()
  return (
    <section className="community-summary card" aria-label="Resumen de la conversación">
      <h2 className="community-summary-title">✨ Resumen de Pepa</h2>
      {summary ? (
        <p className="community-summary-text">{summary}</p>
      ) : (
        <p className="muted" role="status">
          {busy ? 'Pepa está leyendo la conversación para resumirla…' : failed ? 'Ahora mismo no hay resumen. Puedes leer los comentarios más abajo.' : 'Todavía no hay resumen.'}
        </p>
      )}
      {summary && failed && <p className="muted">No se ha podido actualizar el resumen. Los comentarios siguen aquí debajo.</p>}
      <p className="muted community-summary-meta">
        {commentCount} {commentCount === 1 ? 'comentario' : 'comentarios'}. Es un resumen automático de lo que han dicho las personas; no es un artículo del Equipo PEPA.
      </p>
      <div className="community-summary-actions">
        {!conversationOpen && (
          <button type="button" className="primary" onClick={onOpenConversation}>
            Ver toda la conversación
          </button>
        )}
        {canParticipate && (
          <button type="button" className="link-button" disabled={busy} onClick={onRefresh}>
            {busy ? 'Actualizando…' : 'Actualizar resumen'}
          </button>
        )}
      </div>
    </section>
  )
}
