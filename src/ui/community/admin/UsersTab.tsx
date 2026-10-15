import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { adminBan, adminLiftBan, adminListUsers, adminRevokeWarning, adminWarn } from '@/data/community'
import {
  ADMIN_TEXT,
  READMISSION_TEXT,
  activeWarningCount,
  banStateText,
  currentBan,
  formatMadrid,
  toAdminUsers,
  warnResultText,
  type AdminUser,
} from '@/domain/communityAdmin'
import { paths } from '@/ui/community/communityNav'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox, NoteForm } from '@/ui/community/admin/AdminShared'
import { useAdminAction, useAdminData } from '@/ui/community/admin/useAdminData'

// Usuarios: buscador por alias, perfil público e historial de infracciones (solo lo ve la administración) y acciones con motivo obligatorio.
export function UsersTab({ onChanged }: { onChanged?: () => void }) {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const loader = useCallback(async () => toAdminUsers(await adminListUsers(query.trim() === '' ? null : query.trim())), [query])
  const { data, loading, error, reload } = useAdminData(loader)

  const search = (e: FormEvent) => {
    e.preventDefault()
    setNotice(null)
    setQuery(draft)
  }

  return (
    <div className="cadm-stack">
      <InfoBox>
        {ADMIN_TEXT.threeWarnings} El historial de infracciones solo lo ve la administración. Cada acción pide un motivo y queda en el historial; cualquiera de los dos
        administradores puede retirar una advertencia o una expulsión puesta por error.
      </InfoBox>
      <form className="cadm-search" role="search" onSubmit={search}>
        <label htmlFor="cadm-user-search">Buscar por alias</label>
        <div className="cadm-search-row">
          <input id="cadm-user-search" type="search" value={draft} maxLength={40} placeholder="Parte del alias" onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="cadm-btn cadm-btn-primary">
            Buscar
          </button>
        </div>
      </form>
      <ActionNotice message={notice} />
      {loading && <AdminLoading label="Buscando personas…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && data && data.length === 0 && <AdminEmpty>No hay personas con ese alias.</AdminEmpty>}
      {!loading && data && (
        <>
          <p className="muted cadm-small">{query ? `Resultados para «${query}»` : 'Las personas más recientes'} (máximo 50).</p>
          <ul className="cadm-list">
            {data.map((u) => (
              <li key={u.id}>
                <UserCard
                  user={u}
                  onChanged={(text) => {
                    setNotice(text)
                    onChanged?.()
                    reload()
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

type UserAction = { kind: 'warn' } | { kind: 'ban' } | { kind: 'revoke'; warningId: string } | { kind: 'lift'; banId: string }

export function UserCard({ user, onChanged }: { user: AdminUser; onChanged: (message: string) => void }) {
  const [history, setHistory] = useState(false)
  const [act, setAct] = useState<UserAction | null>(null)
  const action = useAdminAction()
  const warnings = activeWarningCount(user)
  const live = currentBan(user)
  const done = (text: string) => {
    setAct(null)
    onChanged(text)
  }

  return (
    <article className="cadm-card" aria-label={`Persona ${user.alias}`}>
      <header className="cadm-card-head">
        <h4>
          <Link to={paths.profile(user.id)}>{user.alias}</Link>
        </h4>
        <span className={`cadm-chip ${user.banState === 'ok' ? 'cadm-chip-ok' : 'cadm-chip-warn'}`}>{banStateText(user.banState, live?.endsAt)}</span>
      </header>
      <p className="muted cadm-small">
        Con alias desde el {formatMadrid(user.createdAt, 'date')} · {user.posts} publicaciones visibles · Advertencias vigentes: {warnings} de 3
      </p>

      <button type="button" className="link-button cadm-linkbtn" aria-expanded={history} onClick={() => setHistory((h) => !h)}>
        {history ? 'Ocultar el historial de infracciones' : `Ver el historial de infracciones (${user.warnings.length} advertencias, ${user.bans.length} expulsiones)`}
      </button>
      {history && (
        <div className="cadm-detail">
          <h5>Advertencias</h5>
          {user.warnings.length === 0 && <p className="muted cadm-small">Sin advertencias.</p>}
          <ul className="cadm-reportlist">
            {user.warnings.map((w) => (
              <li key={w.id}>
                {formatMadrid(w.issuedAt)} · {w.reason}
                {w.revokedAt ? (
                  <span className="cadm-chip"> Retirada el {formatMadrid(w.revokedAt, 'date')}</span>
                ) : (
                  <button type="button" className="link-button cadm-linkbtn" onClick={() => setAct({ kind: 'revoke', warningId: w.id })}>
                    Retirar esta advertencia
                  </button>
                )}
              </li>
            ))}
          </ul>
          <h5>Expulsiones</h5>
          {user.bans.length === 0 && <p className="muted cadm-small">Sin expulsiones.</p>}
          <ul className="cadm-reportlist">
            {user.bans.map((b) => (
              <li key={b.id}>
                Del {formatMadrid(b.startsAt, 'date')} al {formatMadrid(b.endsAt, 'date')} · {b.reason} · Readmisión: {READMISSION_TEXT[b.readmissionStatus] ?? b.readmissionStatus}
                {b.liftedAt ? (
                  <span className="cadm-chip"> Retirada el {formatMadrid(b.liftedAt, 'date')}</span>
                ) : (
                  b.readmissionStatus !== 'approved' && (
                    <button type="button" className="link-button cadm-linkbtn" onClick={() => setAct({ kind: 'lift', banId: b.id })}>
                      Retirar esta expulsión (fue un error)
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!act && (
        <div className="cadm-actions" role="group" aria-label={`Acciones sobre ${user.alias}`}>
          <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => setAct({ kind: 'warn' })}>
            Advertir
          </button>
          <button type="button" className="cadm-btn cadm-btn-danger" onClick={() => setAct({ kind: 'ban' })}>
            Expulsar de Comunidad
          </button>
        </div>
      )}

      {act?.kind === 'warn' && (
        <NoteForm
          title={`Advertir a ${user.alias}`}
          help={`Se le avisa de la advertencia (llevará ${warnings + 1} de 3). A la tercera se le expulsa de Comunidad 30 días.`}
          required
          confirmLabel="Confirmar: advertir"
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setAct(null)
            action.clear()
          }}
          onSubmit={(note) => {
            void (async () => {
              const r = await action.run(() => adminWarn(user.id, note))
              if (r.ok) done(warnResultText(r.result))
            })()
          }}
        />
      )}
      {act?.kind === 'ban' && (
        <NoteForm
          title={`Expulsar a ${user.alias} de Comunidad`}
          help="No podrá publicar ni comentar durante 30 días y se le avisa. Su cuenta de PEPA y los datos de su familia no se tocan. Pasado el plazo podrá pedir volver."
          required
          confirmLabel="Confirmar: expulsar"
          danger
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setAct(null)
            action.clear()
          }}
          onSubmit={(note) => {
            void (async () => {
              const r = await action.run(() => adminBan(user.id, note, null))
              if (r.ok) done(`${user.alias} queda expulsada de Comunidad.`)
            })()
          }}
        />
      )}
      {act?.kind === 'revoke' && (
        <NoteForm
          title="Retirar la advertencia"
          help="La advertencia deja de contar y se recalculan sus medallas."
          required
          confirmLabel="Confirmar: retirar advertencia"
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setAct(null)
            action.clear()
          }}
          onSubmit={(note) => {
            void (async () => {
              const r = await action.run(() => adminRevokeWarning(act.warningId, note))
              if (r.ok) done('Advertencia retirada.')
            })()
          }}
        />
      )}
      {act?.kind === 'lift' && (
        <NoteForm
          title="Retirar la expulsión"
          help="La persona vuelve a poder participar al momento y se le avisa."
          required
          confirmLabel="Confirmar: retirar expulsión"
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setAct(null)
            action.clear()
          }}
          onSubmit={(note) => {
            void (async () => {
              const r = await action.run(() => adminLiftBan(act.banId, note))
              if (r.ok) done('Expulsión retirada.')
            })()
          }}
        />
      )}
    </article>
  )
}
