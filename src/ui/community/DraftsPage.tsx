import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteDraft, listDrafts } from '@/data/community'
import { KIND_ICONS, KIND_LABELS, type DraftSummary } from '@/domain/community'
import { communityErrorText } from '@/domain/communityErrors'
import { DRAFT_EXPIRING_SOON_DAYS, daysLeftText, sortDraftsBySavedDesc } from '@/domain/communityPostForm'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { ConfirmDiscardDialog } from '@/ui/community/ConfirmDiscardDialog'
import { DraftExpiryNotice } from '@/ui/community/DraftExpiryNotice'
import { pageCrumbs, paths } from '@/ui/community/communityNav'
import '@/ui/community/communityEditor.css'

// «Mis borradores» (ruta `borradores`): los guardados a mano, del último guardado al más antiguo, con título, tipo, fecha del guardado y días que les quedan.
// Tocar uno abre el editor con todos sus datos. Descartar pide confirmación. Una sola petición al abrir la pantalla (sin consultas periódicas).
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toDiscard, setToDiscard] = useState<DraftSummary | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const [discardError, setDiscardError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setDrafts(sortDraftsBySavedDesc(await listDrafts()))
    } catch (e) {
      setError(communityErrorText(e))
      setDrafts([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function confirmDiscard() {
    if (!toDiscard) return
    setDiscarding(true)
    setDiscardError(null)
    try {
      await deleteDraft(toDiscard.id) // el servidor borra también sus fotos
      setDrafts((list) => (list ?? []).filter((d) => d.id !== toDiscard.id))
      setToDiscard(null)
    } catch (e) {
      setDiscardError(communityErrorText(e))
    } finally {
      setDiscarding(false)
    }
  }

  return (
    <section className="ce-page">
      <Breadcrumbs crumbs={pageCrumbs('Mis borradores')} />
      <h1>Mis borradores</h1>
      {/* Aviso de caducidad: INMEDIATAMENTE debajo del título. */}
      <DraftExpiryNotice />

      {drafts === null && <p className="muted">Cargando tus borradores…</p>}

      {error && (
        <div role="alert">
          <p className="error">{error}</p>
          <button type="button" className="ce-btn ce-btn-secondary" onClick={() => void load()}>
            Volver a intentarlo
          </button>
        </div>
      )}

      {drafts !== null && !error && drafts.length === 0 && (
        <div className="ce-empty">
          <p>
            <strong>No tienes ningún borrador guardado.</strong>
          </p>
          <p className="muted">Cuando empieces una publicación y pulses «Guardar borrador», aparecerá aquí para que la termines cuando quieras.</p>
          <Link className="ce-btn ce-btn-primary ce-link-btn" to={paths.newPost()}>
            Escribir una publicación
          </Link>
        </div>
      )}

      {drafts !== null && drafts.length > 0 && (
        <ul className="ce-draft-list">
          {drafts.map((d) => {
            const soon = d.daysLeft <= DRAFT_EXPIRING_SOON_DAYS
            return (
              <li key={d.id} className="ce-draft">
                <Link className="ce-draft-main" to={paths.newPost({ borrador: d.id })}>
                  <span className="ce-draft-kind">
                    <span aria-hidden="true">{KIND_ICONS[d.kind]}</span> {KIND_LABELS[d.kind]}
                  </span>
                  <span className="ce-draft-title">{d.title.trim() || 'Sin título'}</span>
                  <span className="ce-draft-meta">Guardado el {formatDate(d.savedAt)}</span>
                  <span className={'ce-draft-days' + (soon ? ' soon' : '')}>{daysLeftText(d.daysLeft)}</span>
                </Link>
                <button
                  type="button"
                  className="ce-btn ce-btn-danger-outline ce-draft-discard"
                  aria-label={`Descartar el borrador ${d.title.trim() || 'sin título'}`}
                  onClick={() => {
                    setDiscardError(null)
                    setToDiscard(d)
                  }}
                >
                  Descartar
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {toDiscard && (
        <ConfirmDiscardDialog
          title="¿Descartar este borrador?"
          message={`Se borrará «${toDiscard.title.trim() || 'Sin título'}», con su texto y sus fotos. Esto no se puede deshacer.`}
          confirmLabel="Sí, descartar"
          cancelLabel="No, conservarlo"
          busy={discarding}
          error={discardError}
          onCancel={() => setToDiscard(null)}
          onConfirm={() => void confirmDiscard()}
        />
      )}
    </section>
  )
}
