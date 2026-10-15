import { useCallback, useRef, useState } from 'react'
import { listMinorPermissions, setMinorPermission } from '@/data/communityMinors'
import {
  applyMinorToggle,
  groupMinors,
  MINORS_EMPTY,
  MINORS_INTRO,
  MINORS_LEGAL_REMINDER,
  minorPermissionErrorText,
  needsBirthdateText,
  PARTICIPATE_HELP,
  PARTICIPATE_LABEL,
  READ_HELP,
  READ_LABEL,
  under15Text,
  type MinorPermission,
} from '@/domain/communityAccess'
import '@/ui/communityPermissionsCard.css'

// «Permisos de Comunidad» (solo administradores de la familia): regla aprobada el 15/10/2026. Menores de 15: sin acceso. De 15 a 17: solo si la familia lo
// autoriza, con DOS permisos independientes por persona (leer / participar; participar exige también leer), desactivados por defecto. Desde 18: normal.
//  - Coste: UNA sola consulta, y solo la primera vez que se abre la tarjeta (cerrada no consulta nada); nunca consultas periódicas. Cada cambio es una llamada.
//  - Cada cambio se guarda al instante y se aplica ya en el servidor (también en las sesiones que la persona tenga abiertas).
//  - La seguridad no depende de esta pantalla: el servidor recalcula el acceso en cada llamada de Comunidad.

export type PermissionRowState = { phase: 'saving' | 'saved' | 'error'; error?: string }
export type PermissionsLoad = 'idle' | 'loading' | 'ready' | 'error'

export interface CommunityPermissionsViewProps {
  open: boolean
  onToggleOpen: () => void
  load: PermissionsLoad
  loadError: string | null
  items: MinorPermission[]
  rows: Record<string, PermissionRowState | undefined>
  onChange: (m: MinorPermission, field: 'read' | 'participate', value: boolean) => void
  onRetry: () => void
}

function RowStatus({ state }: { state: PermissionRowState | undefined }) {
  // El elemento existe siempre (aunque vacío) para que los lectores de pantalla anuncien «Guardando…» y «Guardado» cuando cambian.
  return (
    <span className={'cp-status' + (state?.phase === 'error' ? ' cp-status-error' : '')} role="status" aria-live="polite">
      {state?.phase === 'saving' && 'Guardando…'}
      {state?.phase === 'saved' && '✓ Guardado'}
      {state?.phase === 'error' && (state.error ?? 'No se ha podido guardar.')}
    </span>
  )
}

function PersonRow({ m, state, onChange }: { m: MinorPermission; state: PermissionRowState | undefined; onChange: CommunityPermissionsViewProps['onChange'] }) {
  const saving = state?.phase === 'saving'
  const readId = `cp-read-${m.profileId}`
  const partId = `cp-part-${m.profileId}`
  return (
    <fieldset className="cp-person" aria-busy={saving}>
      <legend>
        {m.name}
        {m.age !== null ? ` (${m.age} años)` : ''}
      </legend>
      <label className="cp-switch">
        <input type="checkbox" role="switch" checked={m.canRead} disabled={saving} aria-labelledby={`${readId}-label`} aria-describedby={`${readId}-help`} onChange={(e) => onChange(m, 'read', e.target.checked)} />
        <span className="cp-switch-text">
          <strong id={`${readId}-label`}>{READ_LABEL}</strong>
          <span id={`${readId}-help`} className="muted">
            {READ_HELP}
          </span>
        </span>
      </label>
      <label className="cp-switch">
        <input
          type="checkbox"
          role="switch"
          checked={m.canParticipate}
          disabled={saving}
          aria-labelledby={`${partId}-label`}
          aria-describedby={`${partId}-help`}
          onChange={(e) => onChange(m, 'participate', e.target.checked)}
        />
        <span className="cp-switch-text">
          <strong id={`${partId}-label`}>{PARTICIPATE_LABEL}</strong>
          <span id={`${partId}-help`} className="muted">
            {PARTICIPATE_HELP}
          </span>
        </span>
      </label>
      <RowStatus state={state} />
    </fieldset>
  )
}

// Parte visible (sin red ni estado propio): la usa la tarjeta real y las pruebas.
export function CommunityPermissionsView({ open, onToggleOpen, load, loadError, items, rows, onChange, onRetry }: CommunityPermissionsViewProps) {
  const groups = groupMinors(items)
  const nobody = groups.configurable.length + groups.under15.length + groups.needsBirthdate.length === 0
  return (
    <section className="card member-form community-permissions" aria-labelledby="community-permissions-title">
      <h2 id="community-permissions-title">
        <button type="button" className="cp-toggle" aria-expanded={open} aria-controls="community-permissions-body" onClick={onToggleOpen}>
          <span>👪 Permisos de Comunidad</span>
          <span aria-hidden="true">{open ? '▲' : '▼'}</span>
        </button>
      </h2>
      {!open && <p className="muted">Decide si las personas de 15 a 17 años de tu familia pueden entrar en Comunidad.</p>}
      {open && (
        <div id="community-permissions-body" className="cp-body">
          <p className="muted">{MINORS_INTRO}</p>

          {load === 'loading' && (
            <p className="muted" role="status">
              Cargando…
            </p>
          )}
          {load === 'error' && (
            <div>
              <p className="error" role="alert">
                {loadError ?? 'No se ha podido cargar la lista.'}
              </p>
              <button type="button" className="link-button" onClick={onRetry}>
                Volver a intentarlo
              </button>
            </div>
          )}

          {load === 'ready' && (
            <>
              {nobody && <p className="muted">{MINORS_EMPTY}</p>}
              {groups.configurable.map((m) => (
                <PersonRow key={m.profileId} m={m} state={rows[m.profileId]} onChange={onChange} />
              ))}
              {groups.under15.map((m) => (
                <p key={m.profileId} className="cp-info">
                  {under15Text(m)}
                </p>
              ))}
              {groups.needsBirthdate.map((m) => (
                <p key={m.profileId} className="cp-info cp-warning">
                  ⚠️ {needsBirthdateText(m)}
                </p>
              ))}
              {groups.configurable.length > 0 && <p className="muted cp-legal">{MINORS_LEGAL_REMINDER}</p>}
            </>
          )}
        </div>
      )}
    </section>
  )
}

export function CommunityPermissionsCard() {
  const [open, setOpen] = useState(false)
  const [load, setLoad] = useState<PermissionsLoad>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [items, setItems] = useState<MinorPermission[]>([])
  const [rows, setRows] = useState<Record<string, PermissionRowState | undefined>>({})
  const asked = useRef(false)

  const fetchList = useCallback(async () => {
    setLoad('loading')
    setLoadError(null)
    try {
      setItems(await listMinorPermissions())
      setLoad('ready')
    } catch (e) {
      setLoadError(minorPermissionErrorText(e))
      setLoad('error')
    }
  }, [])

  function toggleOpen() {
    const next = !open
    setOpen(next)
    // La única consulta de la tarjeta: la primera vez que se abre.
    if (next && !asked.current) {
      asked.current = true
      void fetchList()
    }
  }

  async function change(m: MinorPermission, field: 'read' | 'participate', value: boolean) {
    if (rows[m.profileId]?.phase === 'saving') return
    const next = applyMinorToggle(m, field, value)
    const patch = (flags: { canRead: boolean; canParticipate: boolean }) =>
      setItems((prev) => prev.map((x) => (x.profileId === m.profileId ? { ...x, canRead: flags.canRead, canParticipate: flags.canParticipate } : x)))
    patch(next) // se ve al instante; si el servidor falla, vuelve atrás
    setRows((r) => ({ ...r, [m.profileId]: { phase: 'saving' } }))
    try {
      const saved = await setMinorPermission(m.profileId, next.canRead, next.canParticipate)
      patch({ canRead: saved.canRead, canParticipate: saved.canParticipate })
      setRows((r) => ({ ...r, [m.profileId]: { phase: 'saved' } }))
    } catch (e) {
      patch({ canRead: m.canRead, canParticipate: m.canParticipate })
      setRows((r) => ({ ...r, [m.profileId]: { phase: 'error', error: minorPermissionErrorText(e) } }))
    }
  }

  return (
    <CommunityPermissionsView
      open={open}
      onToggleOpen={toggleOpen}
      load={load}
      loadError={loadError}
      items={items}
      rows={rows}
      onChange={(m, f, v) => void change(m, f, v)}
      onRetry={() => void fetchList()}
    />
  )
}
