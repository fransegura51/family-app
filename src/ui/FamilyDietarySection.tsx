import { useId, useState } from 'react'
import {
  addDietaryRestriction,
  DIETARY_ERROR_TEXT,
  DietaryError,
  deleteDietaryRestriction,
  grantDietaryConsent,
  hasDietaryConsent,
  restrictionsOfMember,
  revokeDietaryConsent,
  updateDietaryRestriction,
} from '@/data/dietaryRestrictions'
import {
  DIETARY_CATALOG,
  DIETARY_GENERAL_DISCLAIMER,
  DIETARY_KINDS,
  DIETARY_LABEL_MAX,
  DIETARY_NOTE_MAX,
  DIETARY_SEVERITIES,
  DIETARY_SEVERITY_LABELS,
  dietaryRestrictionLabel,
  getDietaryCatalogEntry,
  suggestCatalogKeys,
  validateDietaryDraft,
  type DietaryAllergenKey,
  type DietaryDraft,
  type DietaryKind,
  type DietaryRestriction,
  type DietarySeverity,
} from '@/domain/dietaryRestrictions'
import { useDialogFocus } from '@/ui/community/useDialogFocus'
import { useFamilyDietary } from '@/ui/useFamilyDietary'
import { isDietaryFeatureEnabled } from '@/domain/dietaryFeature'
import type { FamilyMember, Profile } from '@/domain/types'
import * as T from '@/ui/familyDietaryText'
import '@/ui/familyDietary.css'

// Ficha PRIVADA de alergias e intolerancias de cada miembro de Familia (DATOS DE SALUD, RGPD art. 9; migración 0279; análisis en
// docs/comunidad/ALERGIAS_INTOLERANCIAS_ANALISIS.md). REGLAS:
//  · Opcional y PLEGADA por defecto. Plegada no pide nada al servidor: la única lectura (dietary_list, compartida con las recetas de Cocina) se hace la primera
//    vez que se abre una ficha, y las demás fichas la reutilizan. Cada alta, edición o borrado es una llamada y se refleja en memoria sin volver a leer.
//  · Antes de guardar nada de una persona hace falta SU consentimiento expreso (aviso con texto PROVISIONAL, pendiente de revisión jurídica). Retirarlo BORRA
//    todo lo anotado de esa persona, y lo dice antes de hacerlo.
//  · Quién ve y edita lo decide el servidor (administradores y adultos: todo; niño o invitado: solo lo suyo y sin editar). Aquí solo se refleja.
//  · Nada de esto se guarda en el navegador, en la URL ni en registros; los errores llevan frases fijas (DIETARY_ERROR_TEXT).

// ¿Esta persona que mira Familia ve la ficha de ese miembro? Administradores y adultos, la de todos; niño o invitado, solo la suya (el servidor le enviará
// únicamente lo suyo, sin poder cambiarlo). Con esto las fichas ajenas ni se ofrecen a una cuenta que no puede ver nada en ellas.
export function canSeeDietarySection(profile: Pick<Profile, 'id' | 'role'>, member: Pick<FamilyMember, 'linkedProfileId'>): boolean {
  // Interruptor apagado (domain/dietaryFeature.ts): la sección no existe para nadie.
  if (!isDietaryFeatureEnabled()) return false
  if (profile.role === 'admin' || profile.role === 'adult') return true
  return member.linkedProfileId === profile.id
}

// Frase fija de un error de la ficha (nunca el texto del error original ni datos de salud).
export function dietaryErrorText(e: unknown): string {
  return e instanceof DietaryError ? e.message : DIETARY_ERROR_TEXT.network
}

// ─── Formulario (alta y edición) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const UE_ENTRIES = DIETARY_CATALOG.filter((e) => e.group === 'ue14')
const OTHER_ENTRIES = DIETARY_CATALOG.filter((e) => e.group === 'otras')

function defaultKindFor(choice: string): DietaryKind {
  if (choice === T.DIETARY_CHOICE_CUSTOM_VALUE) return 'restriccion'
  const entry = getDietaryCatalogEntry(choice)
  return entry?.group === 'otras' ? 'intolerancia' : 'alergia'
}

export interface RestrictionFormProps {
  mode: 'add' | 'edit'
  // Solo en edición: lo que ya había.
  initial?: DietaryRestriction
  busy: boolean
  error: string | null
  onSubmit: (draft: DietaryDraft) => void
  onCancel: () => void
}

export function RestrictionForm({ mode, initial, busy, error, onSubmit, onCancel }: RestrictionFormProps) {
  const uid = useId()
  const [choice, setChoice] = useState<string>(initial ? (initial.allergenKey ?? T.DIETARY_CHOICE_CUSTOM_VALUE) : '')
  const [customLabel, setCustomLabel] = useState(initial?.customLabel ?? '')
  const [kind, setKind] = useState<DietaryKind>(initial?.kind ?? 'alergia')
  const [kindTouched, setKindTouched] = useState(Boolean(initial))
  const [severity, setSeverity] = useState<DietarySeverity | ''>(initial?.severity ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  const isCustom = choice === T.DIETARY_CHOICE_CUSTOM_VALUE
  const entry = getDietaryCatalogEntry(choice)
  const allowedKinds: readonly DietaryKind[] = entry ? entry.allowedKinds : DIETARY_KINDS
  const suggestions = isCustom ? suggestCatalogKeys(customLabel) : []
  const hint = entry ? T.dietaryChoiceHint(entry.key) : null

  function pickChoice(next: string) {
    setChoice(next)
    setLocalError(null)
    const nextEntry = getDietaryCatalogEntry(next)
    const nextAllowed: readonly DietaryKind[] = nextEntry ? nextEntry.allowedKinds : DIETARY_KINDS
    // Mientras la persona no haya elegido el tipo, se propone el habitual; si el elegido ya no vale con la nueva opción, se corrige.
    if (!kindTouched || !nextAllowed.includes(kind)) setKind(next ? defaultKindFor(next) : 'alergia')
  }

  function submit() {
    const draft: DietaryDraft = {
      kind,
      allergenKey: isCustom || !choice ? null : choice,
      customLabel: isCustom ? customLabel : null,
      severity: severity || null,
      note,
    }
    // En edición la clave del catálogo no cambia (el servidor solo cambia tipo, gravedad, nota y el texto libre): se manda tal cual estaba.
    const checked = validateDietaryDraft(draft)
    if (!checked.ok) {
      setLocalError(T.DIETARY_DRAFT_ERRORS[checked.error] ?? DIETARY_ERROR_TEXT.invalid)
      return
    }
    setLocalError(null)
    onSubmit(draft)
  }

  const choiceId = `${uid}-choice`
  const customId = `${uid}-custom`
  const kindId = `${uid}-kind`
  const sevId = `${uid}-sev`
  const noteId = `${uid}-note`
  const errId = `${uid}-err`
  const shownError = localError ?? error

  return (
    <form
      className="fd-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      aria-describedby={shownError ? errId : undefined}
    >
      {mode === 'add' ? (
        <>
          <label htmlFor={choiceId}>{T.DIETARY_CHOICE_LABEL}</label>
          <select id={choiceId} value={choice} onChange={(e) => pickChoice(e.target.value)} aria-describedby={hint ? `${uid}-hint` : undefined}>
            <option value="">{T.DIETARY_CHOICE_PLACEHOLDER}</option>
            <optgroup label={T.DIETARY_GROUP_UE}>
              {UE_ENTRIES.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={T.DIETARY_GROUP_OTHER}>
              {OTHER_ENTRIES.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </optgroup>
            <option value={T.DIETARY_CHOICE_CUSTOM_VALUE}>{T.DIETARY_CHOICE_CUSTOM}</option>
          </select>
          {entry && <p className="muted fd-help">Por ejemplo: {entry.examples}.</p>}
          {hint && (
            <p id={`${uid}-hint`} className="fd-help fd-help-strong">
              {hint}
            </p>
          )}
        </>
      ) : (
        <p className="fd-edit-title">
          <strong>{initial ? dietaryRestrictionLabel(initial) : ''}</strong>
        </p>
      )}

      {isCustom && (
        <>
          <label htmlFor={customId}>{T.DIETARY_CUSTOM_LABEL}</label>
          <input id={customId} type="text" value={customLabel} maxLength={DIETARY_LABEL_MAX} onChange={(e) => setCustomLabel(e.target.value)} autoComplete="off" aria-describedby={`${customId}-help`} />
          <p id={`${customId}-help`} className="muted fd-help">
            {T.DIETARY_CUSTOM_HELP}
          </p>
          {mode === 'add' &&
            suggestions.map((k: DietaryAllergenKey) => {
              const s = getDietaryCatalogEntry(k)
              return s ? (
                <button key={k} type="button" className="link-button fd-suggestion" onClick={() => pickChoice(k)}>
                  {T.DIETARY_USE_SUGGESTION(s.label)}
                </button>
              ) : null
            })}
        </>
      )}

      <fieldset className="fd-kind" aria-describedby={`${kindId}-general`}>
        <legend>{T.DIETARY_KIND_LEGEND}</legend>
        <p id={`${kindId}-general`} className="muted fd-help">
          {T.DIETARY_KIND_GENERAL_HELP}
        </p>
        <div className="fd-kind-options">
          {DIETARY_KINDS.map((k) => {
            const allowed = allowedKinds.includes(k)
            return (
              <label key={k} className={'fd-radio' + (allowed ? '' : ' fd-radio-disabled')}>
                <input
                  type="radio"
                  name={kindId}
                  value={k}
                  checked={kind === k}
                  disabled={!allowed}
                  onChange={() => {
                    setKind(k)
                    setKindTouched(true)
                  }}
                />
                <span className="fd-radio-text">
                  <strong>{T.DIETARY_KIND_UI_LABELS[k]}</strong>
                  <span className="muted">{T.DIETARY_KIND_HELP[k]}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <label htmlFor={sevId}>{T.DIETARY_SEVERITY_LABEL}</label>
      <select id={sevId} value={severity} onChange={(e) => setSeverity(e.target.value as DietarySeverity | '')}>
        <option value="">{T.DIETARY_SEVERITY_NONE}</option>
        {DIETARY_SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {DIETARY_SEVERITY_LABELS[s]}
          </option>
        ))}
      </select>

      <label htmlFor={noteId}>{T.DIETARY_NOTE_LABEL}</label>
      <textarea id={noteId} rows={2} value={note} maxLength={DIETARY_NOTE_MAX} onChange={(e) => setNote(e.target.value)} aria-describedby={`${noteId}-help`} />
      <p id={`${noteId}-help`} className="muted fd-help">
        {T.DIETARY_NOTE_HELP} ({note.length}/{DIETARY_NOTE_MAX})
      </p>

      {shownError && (
        <p id={errId} className="error" role="alert">
          {shownError}
        </p>
      )}
      <div className="fd-actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? T.DIETARY_SAVING : T.DIETARY_SAVE}
        </button>
        <button type="button" className="link-button" onClick={onCancel} disabled={busy}>
          {T.DIETARY_CANCEL}
        </button>
      </div>
    </form>
  )
}

// ─── Diálogos (consentimiento y retirada) ───────────────────────────────────────────────────────────────────────────────────────────────────────

export function ConsentDialog({ memberName, busy, error, onConfirm, onCancel }: { memberName: string; busy: boolean; error: string | null; onConfirm: () => void; onCancel: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>()
  const uid = useId()
  const [checked, setChecked] = useState(false)
  return (
    <div className="modal-overlay fd-overlay" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        ref={ref}
        className="modal-sheet fd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-provisional`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onCancel()
        }}
      >
        <h2 id={`${uid}-title`}>{T.DIETARY_CONSENT_TITLE}</h2>
        <p id={`${uid}-provisional`} className="fd-provisional" role="note">
          {T.DIETARY_PROVISIONAL_TEXT}
        </p>
        {T.DIETARY_CONSENT_PARAGRAPHS(memberName).map((p) => (
          <p key={p.title} className="fd-consent-par">
            <strong>{p.title}. </strong>
            {p.text}
          </p>
        ))}
        <p className="muted fd-consent-par">{DIETARY_GENERAL_DISCLAIMER}</p>
        <p className="muted fd-consent-version">{T.DIETARY_CONSENT_VERSION_LINE}</p>
        <label className="checkbox-label fd-declaration">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} aria-required="true" />
          <span>{T.DIETARY_CONSENT_CHECK(memberName)}</span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="fd-actions">
          <button type="button" className="primary" disabled={!checked || busy} onClick={onConfirm}>
            {busy ? T.DIETARY_SAVING : T.DIETARY_CONSENT_GIVE}
          </button>
          <button type="button" className="link-button" disabled={busy} onClick={onCancel}>
            {T.DIETARY_CONSENT_CANCEL}
          </button>
        </div>
      </div>
    </div>
  )
}

export function RevokeDialog({ memberName, count, busy, error, onConfirm, onCancel }: { memberName: string; count: number; busy: boolean; error: string | null; onConfirm: () => void; onCancel: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>()
  const uid = useId()
  return (
    <div className="modal-overlay fd-overlay" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        ref={ref}
        className="modal-sheet fd-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-text`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onCancel()
        }}
      >
        <h2 id={`${uid}-title`}>{T.DIETARY_REVOKE_TITLE}</h2>
        <p id={`${uid}-text`}>{T.DIETARY_REVOKE_TEXT(memberName, count)}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="fd-actions">
          <button type="button" className="fd-danger" disabled={busy} onClick={onConfirm}>
            {busy ? T.DIETARY_SAVING : T.DIETARY_REVOKE_CONFIRM}
          </button>
          <button type="button" className="link-button" disabled={busy} onClick={onCancel}>
            {T.DIETARY_REVOKE_CANCEL}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Parte visible (sin red ni estado propio: la usan el componente real y las pruebas) ─────────────────────────────────────────────────────────

export interface FamilyDietarySectionViewProps {
  memberName: string
  open: boolean
  onToggleOpen: () => void
  load: 'idle' | 'loading' | 'ready' | 'error'
  loadError: string | null
  onRetry: () => void
  // true para administradores y adultos; false (niño o invitado) = solo lectura de lo suyo.
  canManage: boolean
  hasConsent: boolean
  restrictions: DietaryRestriction[]
  busy: boolean
  actionError: string | null
  adding: boolean
  editingId: string | null
  consentDialog: boolean
  revokeDialog: boolean
  onAskConsent: () => void
  onConfirmConsent: () => void
  onCancelConsent: () => void
  onAskRevoke: () => void
  onConfirmRevoke: () => void
  onCancelRevoke: () => void
  onStartAdd: () => void
  onCancelAdd: () => void
  onSubmitAdd: (draft: DietaryDraft) => void
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSubmitEdit: (r: DietaryRestriction, draft: DietaryDraft) => void
  onDelete: (r: DietaryRestriction) => void
}

function RestrictionRow({ r, canManage, onEdit, onDelete, busy }: { r: DietaryRestriction; canManage: boolean; onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const label = dietaryRestrictionLabel(r)
  return (
    <li className="fd-item">
      <div className="fd-item-main">
        <strong className="fd-item-label">{label}</strong>
        <span className="fd-pill">{T.DIETARY_KIND_UI_LABELS[r.kind]}</span>
        {r.severity && <span className="fd-pill fd-pill-severity">{DIETARY_SEVERITY_LABELS[r.severity]}</span>}
      </div>
      {r.note && <p className="muted fd-item-note">{r.note}</p>}
      {canManage && (
        <div className="fd-item-actions">
          <button type="button" className="link-button" onClick={onEdit} disabled={busy} aria-label={`${T.DIETARY_EDIT}: ${label}`}>
            {T.DIETARY_EDIT}
          </button>
          <ConfirmRemove label={label} onConfirm={onDelete} disabled={busy} />
        </div>
      )}
    </li>
  )
}

// Quitar pide un segundo toque (como el resto de la app).
function ConfirmRemove({ label, onConfirm, disabled }: { label: string; onConfirm: () => void; disabled: boolean }) {
  const [asking, setAsking] = useState(false)
  if (asking) {
    return (
      <span className="fd-confirm">
        <span className="muted">¿Quitar «{label}»?</span>
        <button type="button" className="link-button" onClick={onConfirm} disabled={disabled}>
          Sí, quitar
        </button>
        <button type="button" className="link-button" onClick={() => setAsking(false)}>
          No
        </button>
      </span>
    )
  }
  return (
    <button type="button" className="link-button" onClick={() => setAsking(true)} disabled={disabled} aria-label={`${T.DIETARY_REMOVE}: ${label}`}>
      {T.DIETARY_REMOVE}
    </button>
  )
}

export function FamilyDietarySectionView(p: FamilyDietarySectionViewProps) {
  const uid = useId()
  const bodyId = `${uid}-body`
  const dialogOpen = p.consentDialog || p.revokeDialog
  return (
    <div className="fd-section">
      <h3 className="fd-heading">
        <button type="button" className="fd-toggle" aria-expanded={p.open} aria-controls={bodyId} onClick={p.onToggleOpen}>
          <span>
            <span aria-hidden="true">🩺 </span>
            {T.DIETARY_SECTION_TITLE}
          </span>
          <span className="fd-toggle-side">
            <span className="muted fd-toggle-opt">Opcional</span>
            <span aria-hidden="true">{p.open ? '▲' : '▼'}</span>
          </span>
        </button>
      </h3>
      {p.open && (
        <div id={bodyId} className="fd-body">
          <p className="muted fd-privacy">{p.load === 'ready' && !p.canManage ? T.DIETARY_PRIVACY_READONLY : T.DIETARY_PRIVACY_MANAGER}</p>

          {(p.load === 'idle' || p.load === 'loading') && (
            <p className="muted" role="status">
              {T.DIETARY_LOADING_TEXT}
            </p>
          )}
          {p.load === 'error' && (
            <div>
              <p className="error" role="alert">
                {p.loadError ?? DIETARY_ERROR_TEXT.network}
              </p>
              <button type="button" className="link-button" onClick={p.onRetry}>
                {T.DIETARY_RETRY_LABEL}
              </button>
            </div>
          )}

          {p.load === 'ready' && !p.hasConsent && (
            <div>
              <p>{p.canManage ? T.DIETARY_NO_CONSENT_TEXT(p.memberName) : T.DIETARY_NO_CONSENT_READONLY}</p>
              {p.canManage && (
                <button type="button" className="primary fd-main-btn" onClick={p.onAskConsent}>
                  {T.DIETARY_CONSENT_ASK}
                </button>
              )}
            </div>
          )}

          {p.load === 'ready' && p.hasConsent && (
            <div>
              {p.restrictions.length === 0 && !p.adding && <p className="muted">{T.DIETARY_EMPTY_TEXT(p.memberName)}</p>}
              {p.restrictions.length > 0 && (
                <ul className="fd-list">
                  {p.restrictions.map((r) =>
                    p.editingId === r.id ? (
                      <li key={r.id} className="fd-item">
                        <RestrictionForm mode="edit" initial={r} busy={p.busy} error={p.actionError} onSubmit={(d) => p.onSubmitEdit(r, d)} onCancel={p.onCancelEdit} />
                      </li>
                    ) : (
                      <RestrictionRow key={r.id} r={r} canManage={p.canManage} busy={p.busy} onEdit={() => p.onStartEdit(r.id)} onDelete={() => p.onDelete(r)} />
                    ),
                  )}
                </ul>
              )}
              {p.canManage && p.adding && <RestrictionForm mode="add" busy={p.busy} error={p.actionError} onSubmit={p.onSubmitAdd} onCancel={p.onCancelAdd} />}
              {p.canManage && !p.adding && p.editingId === null && (
                <button type="button" className="family-add-btn fd-add-btn" onClick={p.onStartAdd}>
                  {T.DIETARY_ADD_LABEL}
                </button>
              )}
              <p className="muted fd-disclaimer">{DIETARY_GENERAL_DISCLAIMER}</p>
              {p.canManage && (
                <button type="button" className="link-button fd-revoke" onClick={p.onAskRevoke} disabled={p.busy}>
                  {T.DIETARY_REVOKE_ASK}
                </button>
              )}
            </div>
          )}

          {/* Un error de una acción fuera de formularios y diálogos (por ejemplo al quitar) se enseña aquí. */}
          {p.actionError && !p.adding && p.editingId === null && !dialogOpen && (
            <p className="error" role="alert">
              {p.actionError}
            </p>
          )}
        </div>
      )}
      {p.consentDialog && <ConsentDialog memberName={p.memberName} busy={p.busy} error={p.actionError} onConfirm={p.onConfirmConsent} onCancel={p.onCancelConsent} />}
      {p.revokeDialog && <RevokeDialog memberName={p.memberName} count={p.restrictions.length} busy={p.busy} error={p.actionError} onConfirm={p.onConfirmRevoke} onCancel={p.onCancelRevoke} />}
    </div>
  )
}

// ─── Componente real ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function FamilyDietarySection({ memberId, memberName }: { memberId: string; memberName: string }) {
  // autoLoad=false: plegada no consulta nada. Todas las fichas comparten la misma lectura (useFamilyDietary).
  const dietary = useFamilyDietary({ autoLoad: false })
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [consentDialog, setConsentDialog] = useState(false)
  const [revokeDialog, setRevokeDialog] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const overview = dietary.overview
  const hasConsent = overview ? hasDietaryConsent(overview, memberId) : false
  const restrictions = overview ? restrictionsOfMember(overview, memberId) : []

  function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next) void dietary.ensureLoaded() // la primera vez, una lectura; después, la que ya hay
  }

  // Ejecuta una acción del servidor con el control de «ocupado» y el error con frase fija; devuelve true si salió bien.
  async function run(action: () => Promise<void>): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    setActionError(null)
    try {
      await action()
      return true
    } catch (e) {
      setActionError(dietaryErrorText(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function confirmConsent() {
    const ok = await run(async () => {
      const consent = await grantDietaryConsent(memberId)
      dietary.update((o) => ({ ...o, consents: [...o.consents.filter((c) => c.memberId !== memberId), consent] }))
    })
    if (ok) setConsentDialog(false)
  }

  async function confirmRevoke() {
    const ok = await run(async () => {
      await revokeDietaryConsent(memberId)
      // El servidor ya borró todo de esa persona: aquí se quita también de la memoria.
      dietary.update((o) => ({ ...o, consents: o.consents.filter((c) => c.memberId !== memberId), restrictions: o.restrictions.filter((r) => r.memberId !== memberId) }))
    })
    if (ok) {
      setRevokeDialog(false)
      setAdding(false)
      setEditingId(null)
    }
  }

  async function submitAdd(draft: DietaryDraft) {
    const ok = await run(async () => {
      const created = await addDietaryRestriction(memberId, draft)
      dietary.update((o) => ({ ...o, restrictions: [...o.restrictions, created] }))
    })
    if (ok) setAdding(false)
  }

  async function submitEdit(r: DietaryRestriction, draft: DietaryDraft) {
    const ok = await run(async () => {
      const kind = draft.kind as DietaryKind
      const updated = await updateDietaryRestriction(r, { kind, customLabel: r.allergenKey ? null : (draft.customLabel ?? null), severity: (draft.severity as DietarySeverity | null) ?? null, note: draft.note ?? null })
      dietary.update((o) => ({ ...o, restrictions: o.restrictions.map((x) => (x.id === updated.id ? updated : x)) }))
    })
    if (ok) setEditingId(null)
  }

  async function remove(r: DietaryRestriction) {
    await run(async () => {
      await deleteDietaryRestriction(r.id)
      dietary.update((o) => ({ ...o, restrictions: o.restrictions.filter((x) => x.id !== r.id) }))
    })
  }

  return (
    <FamilyDietarySectionView
      memberName={memberName}
      open={open}
      onToggleOpen={toggleOpen}
      load={dietary.status}
      loadError={dietary.errorText}
      onRetry={() => void dietary.reload()}
      canManage={overview?.canManage === true}
      hasConsent={hasConsent}
      restrictions={restrictions}
      busy={busy}
      actionError={actionError}
      adding={adding}
      editingId={editingId}
      consentDialog={consentDialog}
      revokeDialog={revokeDialog}
      onAskConsent={() => {
        setActionError(null)
        setConsentDialog(true)
      }}
      onConfirmConsent={() => void confirmConsent()}
      onCancelConsent={() => {
        setConsentDialog(false)
        setActionError(null)
      }}
      onAskRevoke={() => {
        setActionError(null)
        setRevokeDialog(true)
      }}
      onConfirmRevoke={() => void confirmRevoke()}
      onCancelRevoke={() => {
        setRevokeDialog(false)
        setActionError(null)
      }}
      onStartAdd={() => {
        setActionError(null)
        setEditingId(null)
        setAdding(true)
      }}
      onCancelAdd={() => {
        setAdding(false)
        setActionError(null)
      }}
      onSubmitAdd={(d) => void submitAdd(d)}
      onStartEdit={(id) => {
        setActionError(null)
        setAdding(false)
        setEditingId(id)
      }}
      onCancelEdit={() => {
        setEditingId(null)
        setActionError(null)
      }}
      onSubmitEdit={(r, d) => void submitEdit(r, d)}
      onDelete={(r) => void remove(r)}
    />
  )
}
