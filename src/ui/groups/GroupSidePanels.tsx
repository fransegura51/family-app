import { useCallback, useEffect, useState } from 'react'
import { formatDateTime } from '@/domain/dateFormat'
import {
  addManager,
  cancelGroupTransfer,
  createGroupTransfer,
  groupsErrorMessage,
  listAudit,
  listGroupTransfers,
  listManagerCandidates,
  listManagers,
  removeManager,
  updateGroup,
  type AuditEntry,
  type Manager,
  type PendingTransfer,
} from '@/data/groups'
import type { GroupItem } from '@/domain/groups'
import { shareText } from '@/services/share'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { Field, GroupSheet } from '@/ui/groups/GroupSheet'


// ------------------------------------------------------------------------------------------------------------- responsables
export function ManagersSheet({ group, userId, onClose }: { group: GroupItem; userId: string; onClose: () => void }) {
  const [managers, setManagers] = useState<Manager[] | null>(null)
  const [candidates, setCandidates] = useState<{ userId: string; name: string }[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([listManagers(group), listManagerCandidates(group)])
      setManagers(m)
      setCandidates(c)
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    }
  }, [group])
  useEffect(() => {
    void load()
  }, [load])
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
      setProblem(null)
      await load()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    }
  }
  const isCreator = group.createdBy === userId
  return (
    <GroupSheet title="Responsables del grupo" onClose={onClose}>
      <p className="muted">Son las personas con cuenta PEPA que pueden gestionar este grupo. Los participantes no tienen acceso por estar en él.</p>
      {!managers && !problem && <p className="muted">Cargando…</p>}
      {managers?.map((m) => (
        <div key={m.userId} className="grp-row" style={{ cursor: 'default' }}>
          <span aria-hidden="true">🧑‍💼</span>
          <span className="grp-row-main">
            <span className="grp-row-title">{m.name}</span>
            <span className="grp-row-sub" style={{ display: 'block' }}>
              {m.isCreator ? 'Creó el grupo' : 'Responsable'}
              {m.userId === userId ? ' · tú' : ''}
            </span>
          </span>
          {!m.isCreator && (isCreator || m.userId === userId) && (
            <ConfirmButton label={m.userId === userId ? 'Dejar de ser responsable' : 'Quitar'} confirmMessage="¿Seguro?" onConfirm={() => void run(() => removeManager(group.id, m.userId))} />
          )}
        </div>
      ))}
      {candidates.length > 0 && (
        <>
          <p className="grp-section">Añadir responsable</p>
          <div className="grp-chips">
            {candidates.map((c) => (
              <button key={c.userId} type="button" className="chip" onClick={() => void run(() => addManager(group.id, c.userId))}>
                ＋ {c.name}
              </button>
            ))}
          </div>
          <p className="muted">Solo salen personas de tu mismo espacio PEPA. Una profesora, por ejemplo, puede llevar solo la clase que le des.</p>
        </>
      )}
      {problem && <p className="error">{problem}</p>}
    </GroupSheet>
  )
}

// ------------------------------------------------------------------------------------------------------------- copiar a otra persona (enviar)
export function CopyGroupSheet({ group, onClose }: { group: GroupItem; onClose: () => void }) {
  const [mode, setMode] = useState<'participantes' | 'historial'>('participantes')
  const [contacts, setContacts] = useState(false)
  const [declared, setDeclared] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingTransfer[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loadPending = useCallback(async () => {
    try {
      setPending((await listGroupTransfers(group.id)).filter((t) => t.status === 'pendiente' && new Date(t.expiresAt) > new Date()))
    } catch {
      /* sin lista de pendientes: se puede seguir creando códigos */
    }
  }, [group.id])
  useEffect(() => {
    void loadPending()
  }, [loadPending])

  const create = async () => {
    if (busy) return
    if (!declared) return setProblem('Marca la casilla para confirmar que puedes compartir estos datos.')
    setBusy(true)
    try {
      setCode(await createGroupTransfer(group.id, mode, contacts, declared))
      setProblem(null)
      void loadPending()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const message = (c: string) => `Te paso el grupo «${group.name}» de PEPA. En PEPA entra en Gestión de grupos → «Recibir un grupo» y escribe este código: ${c} (caduca en 7 días).`

  return (
    <GroupSheet title="Copiar el grupo a otra persona" onClose={onClose}>
      {code ? (
        <>
          <p>Dale este código a la persona que va a recibir el grupo. Tendrá que aceptarlo ella; hasta entonces no recibe nada.</p>
          <div className="grp-code" data-help-id="grupos.codigo">{code}</div>
          <div className="form-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                void shareText({ title: 'Grupo de PEPA', text: message(code) }).catch(() => setProblem('No se ha podido compartir. Copia el código a mano.'))
              }}
            >
              Compartir el código
            </button>
            <button type="button" className="link-button" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">La copia es independiente: el grupo original se queda contigo y no se sincronizan.</p>
          <div role="radiogroup" aria-label="Qué copiar" style={{ display: 'grid', gap: 8 }}>
            <button type="button" role="radio" aria-checked={mode === 'participantes'} className={'grp-big-button' + (mode === 'participantes' ? '' : ' grp-unselected')} style={{ opacity: mode === 'participantes' ? 1 : 0.65 }} onClick={() => setMode('participantes')}>
              <span>
                Solo integrantes
                <small className="muted" style={{ display: 'block', fontWeight: 400 }}>Las fichas de los participantes.</small>
              </span>
              <span aria-hidden="true">{mode === 'participantes' ? '●' : '○'}</span>
            </button>
            <button type="button" role="radio" aria-checked={mode === 'historial'} className="grp-big-button" style={{ opacity: mode === 'historial' ? 1 : 0.65 }} onClick={() => setMode('historial')} data-help-id="grupos.copiar-historial">
              <span>
                Integrantes e historial
                <small className="muted" style={{ display: 'block', fontWeight: 400 }}>
                  También los botes, aportaciones y gastos, como «Gestión anterior» de solo lectura.
                </small>
              </span>
              <span aria-hidden="true">{mode === 'historial' ? '●' : '○'}</span>
            </button>
          </div>
          <label className="grp-check-row" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={contacts} onChange={(e) => setContacts(e.target.checked)} />
            <span>Incluir teléfonos, correos, madre/padre y alias de pago</span>
          </label>
          <label className="grp-check-row">
            <input type="checkbox" checked={declared} onChange={(e) => (setDeclared(e.target.checked), setProblem(null))} />
            <span>Confirmo que tengo autorización (por ejemplo, la de las familias) para compartir estos datos con esa persona.</span>
          </label>
          <p className="muted">No se copian los archivos de los justificantes, las observaciones ni nada de tu Economía.</p>
          {problem && <p className="error">{problem}</p>}
          <div className="form-actions">
            <button type="button" className="primary-button" disabled={busy} onClick={() => void create()}>
              Crear código
            </button>
            <button type="button" className="link-button" onClick={onClose}>
              Cancelar
            </button>
          </div>
          {pending.length > 0 && (
            <>
              <p className="grp-section">Códigos pendientes</p>
              {pending.map((t) => (
                <div key={t.id} className="grp-card">
                  <strong>{t.code}</strong> · {t.mode === 'historial' ? 'con historial' : 'solo integrantes'}
                  <div>
                    <ConfirmButton
                      label="Cancelar este código"
                      onConfirm={() => {
                        void cancelGroupTransfer(t.id).then(loadPending)
                      }}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </GroupSheet>
  )
}

// ------------------------------------------------------------------------------------------------------------- registro de operaciones
const ENTITY_LABEL: Record<string, string> = {
  group: 'el grupo',
  manager: 'un responsable',
  participant: 'un participante',
  fund: 'un bote',
  fund_member: 'la participación en un bote',
  fund_entry: 'un apunte',
  list_link: 'una lista vinculada',
  event_link: 'un evento vinculado',
  transfer: 'una copia del grupo',
  share_link: 'un enlace de consulta',
}
const ACTION_LABEL: Record<string, string> = { insert: 'Añadió', update: 'Cambió', delete: 'Quitó', create: 'Creó', copy: 'Recibió', copied_out: 'Copió' }

export function describeAudit(a: Pick<AuditEntry, 'action' | 'entity' | 'detail'>): string {
  const base = `${ACTION_LABEL[a.action] ?? a.action} ${ENTITY_LABEL[a.entity] ?? a.entity}`
  const d = a.detail as { amount?: number | string; kind?: string; fields?: string[]; voided_at?: { to?: unknown }; status?: { to?: string } } | null
  if (!d) return base
  if (a.action === 'insert' && d.amount !== undefined) return `${base} (${d.kind ?? ''} ${d.amount} €)`
  if (d.voided_at?.to) return `Anuló ${ENTITY_LABEL[a.entity] ?? a.entity}`
  if (d.status?.to) return `${d.status.to === 'cerrado' ? 'Cerró' : 'Reabrió'} un bote`
  if (d.fields?.length) return `${base} (${d.fields.join(', ')})`
  return base
}

export function AuditSheet({ group, onClose }: { group: GroupItem; onClose: () => void }) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    listAudit(group.id)
      .then(setRows)
      .catch((e) => setProblem(groupsErrorMessage(e)))
  }, [group.id])
  return (
    <GroupSheet title="Registro de operaciones" onClose={onClose}>
      <p className="muted">Quién hizo qué y cuándo. No incluye datos personales.</p>
      {!rows && !problem && <p className="muted">Cargando…</p>}
      {rows?.length === 0 && <p className="muted">Todavía no hay operaciones.</p>}
      {rows?.map((r) => (
        <div key={r.id} className="grp-card">
          <div>{describeAudit(r)}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {r.actorName} · {formatDateTime(r.at)}
          </div>
        </div>
      ))}
      {problem && <p className="error">{problem}</p>}
    </GroupSheet>
  )
}

// ------------------------------------------------------------------------------------------------------------- cambiar nombre / curso
export function RenameGroupSheet({ group, onClose, onSaved }: { group: GroupItem; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(group.name)
  const [period, setPeriod] = useState(group.periodLabel ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const save = async () => {
    if (!name.trim()) return setProblem('Escribe el nombre del grupo.')
    try {
      await updateGroup(group.id, { name, periodLabel: period.trim() || null })
      onSaved()
      onClose()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    }
  }
  return (
    <GroupSheet title="Nombre del grupo" onClose={onClose}>
      <Field label="Nombre">
        <input className="grp-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Curso o período (opcional)" hint="Por ejemplo 2026/27. Sale junto al nombre.">
        <input className="grp-input" value={period} onChange={(e) => setPeriod(e.target.value)} maxLength={40} />
      </Field>
      {problem && <p className="error">{problem}</p>}
      <div className="form-actions">
        <button type="button" className="primary-button" onClick={() => void save()}>
          Guardar
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </GroupSheet>
  )
}
