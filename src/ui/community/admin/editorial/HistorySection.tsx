import { PROPOSAL_KIND_TEXT } from '@/domain/communityAdmin'
import type { CenterItem } from '@/domain/communityEditorialCenter'
import { EditorialPanel } from '@/ui/community/admin/EditorialPanel'
import { useEditorialRegistry } from '@/ui/community/admin/editorial/EditorialRegistry'

// «Historial y errores»: lo que ha fallado al publicar (con acceso directo al elemento), los errores recientes de la generación y el historial de ejecuciones.
export function HistorySection({ onOpen, refreshKey }: { onOpen: (item: CenterItem) => void; refreshKey?: number }) {
  const reg = useEditorialRegistry()
  const failing = reg.items.filter((i) => i.hasError)
  return (
    <div className="cadm-stack" data-help-id="comunidad.centro-historial">
      <section className="cadm-card" aria-label="Publicaciones con error">
        <h4>Publicaciones con error</h4>
        {failing.length === 0 ? (
          <p className="muted cadm-small">No hay ninguna publicación con error.</p>
        ) : (
          <ul className="cadm-options">
            {failing.map((i) => (
              <li key={i.id}>
                <strong>{PROPOSAL_KIND_TEXT[i.kind]}</strong> · {i.title}
                {i.errorText ? `: ${i.errorText}` : ''}{' '}
                <button type="button" className="link-button cadm-linkbtn" onClick={() => onOpen(i)}>
                  Abrir para gestionarla
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <EditorialPanel show="history" onReview={() => undefined} onGenerated={() => undefined} refreshKey={refreshKey} program={{ data: null, loading: false, error: null, reload: () => undefined }} />
    </div>
  )
}
