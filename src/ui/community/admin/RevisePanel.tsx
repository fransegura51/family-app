import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { decideRevision, listEditorialRevisions, listItemVersions, requestRevision, restoreItemVersion, EditorialCallError } from '@/data/communityEditorial'
import { communityErrorText } from '@/domain/communityErrors'
import {
  EDITORIAL_TEXT,
  MEAL_TEXT,
  REVISE_MAX,
  REVISION_STATUS_TEXT,
  decideResultText,
  diffMenu,
  diffOptions,
  diffRecipes,
  diffWords,
  formatMadridSlot,
  generalQuality,
  hasChanges,
  optionsOf,
  recipeChangesText,
  restoreResultText,
  reviseErrorText,
  shortcutsFor,
  validateInstruction,
  type EditorialItemKind,
  type ItemVersion,
  type MealKind,
  type ReviseContent,
  type ReviseProposal,
  type RevisionRow,
} from '@/domain/communityEditorial'
import { CommunityRichText } from '@/ui/community/CommunityRichText'
import { AdminLoading, InfoBox, TwoTapButton } from '@/ui/community/admin/AdminShared'

// «Rectificar con Pepa»: la persona escribe qué quiere cambiar, Pepa PROPONE una versión nueva, se compara con la anterior y se acepta o se rechaza. Aceptar guarda una
// versión nueva (la anterior se conserva y se puede restaurar) y deja el borrador como «Pendiente de revisar»: NUNCA publica nada.
export interface DishTarget {
  day: number
  meal: MealKind
  label: string
}

export function RevisePanel({
  itemId,
  kind,
  target,
  onClose,
  onChanged,
}: {
  itemId: string
  kind: EditorialItemKind
  /** Solo en menús: cambiar UN plato (los demás no cambian). Sin él, la rectificación es general. */
  target?: DishTarget | null
  onClose: () => void
  /** Se llama cuando se acepta una propuesta o se restaura una versión (la lista debe recargarse). */
  onChanged: (message: string) => void
}) {
  const id = useId()
  const [instruction, setInstruction] = useState('')
  const [proposal, setProposal] = useState<ReviseProposal | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'asking' | 'deciding' | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const lock = useRef(false)
  const title = target ? `Cambiar este plato con Pepa: ${target.label}` : kind === 'menu' ? 'Pedir cambios generales del menú' : 'Rectificar con Pepa'

  const ask = async () => {
    if (lock.current) return
    const p = validateInstruction(instruction)
    setProblem(p)
    if (p) return
    lock.current = true
    setBusy('asking')
    setError(null)
    setDone(null)
    try {
      const r = await requestRevision(itemId, instruction, target ? { day: target.day, meal: target.meal } : undefined)
      setProposal(r)
    } catch (e) {
      // La instrucción escrita NO se borra: se puede reintentar tal cual.
      setError(e instanceof EditorialCallError ? e.message : reviseErrorText('internal_error'))
    } finally {
      lock.current = false
      setBusy(null)
    }
  }

  const decide = async (accept: boolean, revisionId: string) => {
    if (lock.current) return
    lock.current = true
    setBusy('deciding')
    setError(null)
    try {
      const r = await decideRevision(revisionId, accept)
      const message = decideResultText(r.accepted, r.version)
      setProposal(null)
      setDone(message)
      if (r.accepted) {
        setInstruction('')
        onChanged(message)
      }
    } catch (e) {
      // STALE: el borrador cambió mientras tanto → la propuesta ya no vale y hay que pedir otra (la instrucción se conserva).
      setError(communityErrorText(e))
      setProposal(null)
    } finally {
      lock.current = false
      setBusy(null)
    }
  }

  const resume = useCallback((row: RevisionRow) => {
    setProposal({ revisionId: row.id, notes: row.notes, before: row.before, result: row.result, quality: [] })
    setInstruction(row.instruction)
    setShowHistory(false)
    setError(null)
    setDone(null)
  }, [])

  return (
    <section className="cadm-noteform cadm-revise" aria-labelledby={`${id}-title`} data-help-id="comunidad.revise-panel">
      <p id={`${id}-title`} className="cadm-noteform-title">
        {title}
      </p>
      <InfoBox>{EDITORIAL_TEXT.reviseNeverPublishes}</InfoBox>
      <p className="muted cadm-small">Pepa respeta lo que no le pidas cambiar. Puedes repetirlo las veces que haga falta, o editar a mano con «Editar».</p>

      <div className="cadm-chips cadm-shortcuts-row" role="group" aria-label="Ejemplos de instrucciones">
        {shortcutsFor(kind).map((s) => (
          <button key={s.id} type="button" className="cadm-chip-button" disabled={busy !== null} onClick={() => setInstruction(s.text)}>
            {s.label}
          </button>
        ))}
      </div>

      <label htmlFor={`${id}-text`}>¿Qué quieres cambiar?</label>
      <textarea
        id={`${id}-text`}
        rows={3}
        value={instruction}
        maxLength={REVISE_MAX}
        disabled={busy !== null}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-problem` : undefined}
        placeholder={target ? 'Por ejemplo: «Cámbialo por un plato de pescado»' : 'Por ejemplo: «Haz la introducción más cercana»'}
        data-help-id="comunidad.revise-instruction"
        onChange={(e) => setInstruction(e.target.value)}
      />
      {problem && (
        <p id={`${id}-problem`} className="error cadm-small" role="alert">
          {problem}
        </p>
      )}
      {error && (
        <p className="cadm-notice cadm-notice-error" role="alert">
          {error}
        </p>
      )}
      {busy === 'asking' && (
        <p className="cadm-notice cadm-notice-ok" role="status">
          Pepa está preparando la nueva versión… puede tardar hasta un par de minutos. Mientras tanto no se cambia nada.
        </p>
      )}
      {done && (
        <p className="cadm-notice cadm-notice-ok" role="status">
          {done}
        </p>
      )}

      <div className="cadm-actions">
        <button type="button" className="cadm-btn cadm-btn-primary" disabled={busy !== null} onClick={() => void ask()} data-help-id="comunidad.revise-ask">
          {busy === 'asking' ? 'Preparando…' : proposal ? 'Pedir otra versión' : error ? 'Reintentar' : 'Pedir una nueva versión'}
        </button>
        <button type="button" className="cadm-btn cadm-btn-ghost" disabled={busy !== null} onClick={onClose}>
          Cerrar
        </button>
      </div>

      {proposal && (
        <div className="cadm-compare-block" data-help-id="comunidad.revise-compare">
          <RevisionCompare kind={kind} proposal={proposal} />
          <div className="cadm-actions" role="group" aria-label="Qué hacer con la propuesta de Pepa">
            <button type="button" className="cadm-btn cadm-btn-primary" disabled={busy !== null} onClick={() => void decide(true, proposal.revisionId)} data-help-id="comunidad.revise-accept">
              {busy === 'deciding' ? 'Guardando…' : 'Aceptar esta versión'}
            </button>
            <button type="button" className="cadm-btn cadm-btn-secondary" disabled={busy !== null} onClick={() => void decide(false, proposal.revisionId)} data-help-id="comunidad.revise-reject">
              Rechazar
            </button>
          </div>
          <p className="muted cadm-small">Aceptar no publica nada: el borrador vuelve a «Pendiente de revisar» y tendrás que aprobarlo de nuevo.</p>
        </div>
      )}

      <div className="cadm-actions">
        <button type="button" className="cadm-btn cadm-btn-secondary" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)} data-help-id="comunidad.revise-history">
          {showHistory ? 'Ocultar el historial' : 'Ver el historial de versiones'}
        </button>
      </div>
      {showHistory && <RevisionHistory itemId={itemId} busy={busy !== null} onResume={resume} onRestored={(msg) => { setDone(msg); onChanged(msg) }} />}
    </section>
  )
}

// ---- Historial: propuestas de Pepa (con la posibilidad de retomar una sin decidir) y versiones del elemento (con «Restaurar esta versión»).
function RevisionHistory({ itemId, busy, onResume, onRestored }: { itemId: string; busy: boolean; onResume: (row: RevisionRow) => void; onRestored: (message: string) => void }) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; revisions: RevisionRow[]; versions: ItemVersion[] }>({ loading: true, error: null, revisions: [], versions: [] })
  const [actionError, setActionError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const load = useCallback(() => {
    Promise.all([listEditorialRevisions(itemId), listItemVersions(itemId)])
      .then(([revisions, versions]) => setState({ loading: false, error: null, revisions, versions }))
      .catch((e: unknown) => setState({ loading: false, error: communityErrorText(e), revisions: [], versions: [] }))
  }, [itemId])
  useEffect(() => {
    load()
  }, [load])

  const current = state.versions[0]?.version ?? null
  const restore = async (v: ItemVersion) => {
    if (working) return
    setWorking(true)
    setActionError(null)
    try {
      const next = await restoreItemVersion(itemId, v.version)
      onRestored(restoreResultText(v.version, next))
      setState((st) => ({ ...st, loading: true }))
      load()
    } catch (e) {
      setActionError(communityErrorText(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="cadm-history">
      {state.loading && <AdminLoading label="Cargando el historial…" />}
      {state.error && (
        <div role="alert" className="cadm-notice cadm-notice-error">
          {state.error}{' '}
          <button type="button" className="cadm-btn cadm-btn-secondary" onClick={load}>
            Reintentar
          </button>
        </div>
      )}
      {actionError && (
        <p className="cadm-notice cadm-notice-error" role="alert">
          {actionError}
        </p>
      )}
      {!state.loading && !state.error && (
        <>
          <h5>Versiones guardadas</h5>
          {state.versions.length === 0 && <p className="muted cadm-small">Todavía no hay versiones guardadas.</p>}
          <ul className="cadm-options">
            {state.versions.map((v) => (
              <li key={v.version}>
                <strong>Versión {v.version}</strong>
                {v.version === current ? ' (actual)' : ''}
                {v.editedAt ? ` · ${formatMadridSlot(v.editedAt)}` : ''} · {v.title}
                {v.version !== current && (
                  <>
                    {' '}
                    <TwoTapButton
                      label="Restaurar esta versión"
                      armedLabel="Toca otra vez: restaurar como versión nueva"
                      variant="secondary"
                      disabled={busy || working}
                      onConfirm={() => void restore(v)}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="muted cadm-small">Restaurar crea una versión nueva (no borra ninguna) y deja el borrador pendiente de aprobar otra vez.</p>
          <h5>Propuestas de Pepa</h5>
          {state.revisions.length === 0 && <p className="muted cadm-small">Todavía no has pedido ninguna rectificación.</p>}
          <ul className="cadm-options">
            {state.revisions.map((r) => (
              <li key={r.id}>
                <span>
                  «{r.instruction}» · {REVISION_STATUS_TEXT[r.status]}
                  {r.createdAt ? ` · ${formatMadridSlot(r.createdAt)}` : ''}
                </span>
                {r.status === 'proposed' && (
                  <>
                    {' '}
                    <button type="button" className="cadm-btn cadm-btn-secondary" disabled={busy} onClick={() => onResume(r)}>
                      Ver y decidir
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// ---- Comparación antes / después
export function RevisionCompare({ kind, proposal }: { kind: EditorialItemKind; proposal: ReviseProposal }) {
  const { before, result, notes, quality } = proposal
  const titleDiff = diffWords(before.title, result.title)
  const bodyDiff = diffWords(before.body, result.body)
  const recipes = diffRecipes(before.payload, result.payload)
  const recipeLines = recipeChangesText(recipes)
  const options = diffOptions(before.payload, result.payload)
  const dishes = diffMenu(before.payload, result.payload, quality)
  const general = generalQuality(quality)
  const nothing = !hasChanges(titleDiff) && !hasChanges(bodyDiff) && recipeLines.length === 0 && options.added.length === 0 && options.removed.length === 0 && dishes.length === 0

  return (
    <div className="cadm-compare" aria-label="Comparación con la versión anterior">
      <h5>Comparación con la versión anterior</h5>
      <p className="cadm-small cadm-legend">
        <ins className="cadm-ins">Añadido</ins> · <del className="cadm-del">Eliminado</del> · texto sin marca = igual
      </p>
      {notes && (
        <p className="cadm-notice cadm-notice-ok" role="note">
          <strong>Lo que dice Pepa que ha cambiado:</strong> {notes}
        </p>
      )}
      {nothing && <p className="cadm-notice cadm-notice-error" role="note">Pepa no ha cambiado nada visible. Puedes rechazarla o reformular la instrucción.</p>}

      {hasChanges(titleDiff) && (
        <>
          <h5>Título</h5>
          <DiffText segments={titleDiff} />
        </>
      )}
      {hasChanges(bodyDiff) && (
        <>
          <h5>Texto</h5>
          <DiffText segments={bodyDiff} />
        </>
      )}
      {recipeLines.length > 0 && (
        <>
          <h5>Fichas de recetas</h5>
          <ul className="cadm-options">
            {recipeLines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </>
      )}
      {kind === 'poll' && (options.added.length > 0 || options.removed.length > 0) && (
        <>
          <h5>Opciones de la encuesta</h5>
          <ol className="cadm-options">
            {optionsOf(result.payload).map((o) => (
              <li key={o}>{options.added.includes(o) ? <ins className="cadm-ins">{o}</ins> : o}</li>
            ))}
          </ol>
          {options.removed.length > 0 && (
            <p className="cadm-small">
              Opciones eliminadas:{' '}
              {options.removed.map((o) => (
                <del key={o} className="cadm-del">
                  {o}{' '}
                </del>
              ))}
            </p>
          )}
        </>
      )}
      {kind === 'menu' && dishes.length > 0 && (
        <>
          <h5>Platos que cambian</h5>
          <ul className="cadm-options">
            {dishes.map((d) => (
              <li key={`${d.dayIndex}-${d.meal}`}>
                <strong>
                  {d.day} · {MEAL_TEXT[d.meal]}
                </strong>
                : {d.before ? <del className="cadm-del">{d.before}</del> : <em>(sin plato)</em>} → {d.after ? <ins className="cadm-ins">{d.after}</ins> : <em>(sin plato)</em>}
                {d.warnings.map((w) => (
                  <span key={w} className="cadm-small cadm-warnline">
                    {' '}
                    ⚠️ {w}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
      {general.length > 0 && (
        <>
          <h5>Avisos de calidad</h5>
          <ul className="cadm-options">
            {general.map((q) => (
              <li key={q.code + q.message}>
                {q.severity === 'error' ? '⛔ ' : '⚠️ '}
                {q.message}
              </li>
            ))}
          </ul>
        </>
      )}
      <details className="cadm-criteria">
        <summary>Ver la versión nueva completa</summary>
        <FullContent content={result} />
      </details>
    </div>
  )
}

function FullContent({ content }: { content: ReviseContent }) {
  return (
    <div className="cadm-proposal">
      <p className="cadm-title">{content.title}</p>
      {content.body && <CommunityRichText text={content.body} className="cadm-body" />}
    </div>
  )
}

export function DiffText({ segments }: { segments: ReturnType<typeof diffWords> }) {
  return (
    <p className="cadm-diff">
      {segments.map((s, i) =>
        s.type === 'add' ? (
          <ins key={i} className="cadm-ins">
            <span className="cadm-sr">[añadido: </span>
            {s.text}
            <span className="cadm-sr">]</span>
          </ins>
        ) : s.type === 'del' ? (
          <del key={i} className="cadm-del">
            <span className="cadm-sr">[eliminado: </span>
            {s.text}
            <span className="cadm-sr">]</span>
          </del>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  )
}
