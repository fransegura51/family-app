import { useEffect, useMemo, useState } from 'react'
import { groupsErrorMessage } from '@/data/groups'
import {
  closeFund,
  createShareLink,
  fundShareUrl,
  listOpenFundsAcrossGroups,
  listShareLinks,
  removeMember,
  revokeShareLink,
  setMemberRequired,
  setMembersState,
  transferBetweenFunds,
  updateFund,
  type FundMemberRow,
  type ShareLink,
} from '@/data/groupFunds'
import {
  buildDetailedReport,
  buildFundReport,
  CONTRIBUTION_LABEL,
  closeWarnings,
  fmtEuro,
  STATUS_LABEL,
  type ContributionType,
  type FundEntry,
  type FundItem,
  type FundSummary,
  type MemberState,
  type ReportKind,
} from '@/domain/groupFunds'
import { participantName, type Participant } from '@/domain/groups'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { shareText } from '@/services/share'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { Field, GroupSheet } from '@/ui/groups/GroupSheet'
import { useNamePrefs } from '@/ui/groups/NamePrefsContext'
import { displayNames, NAME_FORMATS, NAME_FORMAT_LABEL, type NameFormat } from '@/domain/groupNames'

// ---------------------------------------------------------------------------------------------- la persona dentro de ESTE bote
export function ParticipantFundSheet({
  fund,
  participant,
  member,
  summary,
  writable,
  hasPayments,
  onClose,
  onSaved,
  onPay,
}: {
  fund: FundItem
  participant: Participant
  member: FundMemberRow | null
  summary: FundSummary
  writable: boolean
  hasPayments: boolean
  onClose: () => void
  onSaved: () => void
  onPay: () => void
}) {
  const { namer } = useNamePrefs()
  const row = summary.rows.find((r) => r.participantId === participant.id)
  const [state, setState] = useState<MemberState>(member?.state ?? 'participa')
  const [req, setReq] = useState(member?.requiredAmount !== null && member?.requiredAmount !== undefined ? String(member.requiredAmount).replace('.', ',') : '')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (busy) return
    const n = req.trim() === '' ? null : Number(req.replace(',', '.'))
    if (n !== null && (!Number.isFinite(n) || n < 0)) return setProblem('El importe no es válido.')
    setBusy(true)
    try {
      if (state !== member?.state) await setMembersState(fund.id, [participant.id], state)
      if ((n ?? null) !== (member?.requiredAmount ?? null)) await setMemberRequired(fund.id, participant.id, n)
      onSaved()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }
  const STATES: { id: MemberState; label: string }[] = [
    { id: 'participa', label: 'Participa' },
    { id: 'no_participa', label: 'No participa' },
    { id: 'exento', label: 'Exento' },
  ]
  return (
    <GroupSheet title={namer(participant)} onClose={onClose}>
      {row && (
        <p>
          <span className={'grp-status grp-status-' + row.status}>{STATUS_LABEL[row.status]}</span>{' '}
          {fund.contributionType !== 'voluntaria' && state === 'participa' && (
            <span className="muted">
              Ha pagado {fmtEuro(row.paid)} de {fmtEuro(row.required)}
              {row.pending > 0 ? ` · faltan ${fmtEuro(row.pending)}` : ''}
            </span>
          )}
          {fund.contributionType === 'voluntaria' && <span className="muted">Ha aportado {fmtEuro(row.paid)}</span>}
        </p>
      )}
      {writable ? (
        <>
          <p className="muted" style={{ marginBottom: 4 }}>
            En <strong>este bote</strong> (no cambia su ficha ni otros botes):
          </p>
          <div className="grp-chips" role="radiogroup" aria-label="Participación en este bote">
            {STATES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={state === s.id} className={'chip' + (state === s.id ? ' chip-active' : '')} onClick={() => setState(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          {state === 'participa' && fund.contributionType !== 'voluntaria' && (
            <Field
              label="Importe que se le pide (€)"
              hint={`Vacío = el general${fund.defaultAmount !== null && fund.contributionType === 'igual' ? ` (${fmtEuro(fund.defaultAmount)})` : ''}. Cambiarlo no toca los pagos ya anotados.`}
            >
              <input className="grp-input" inputMode="decimal" value={req} onChange={(e) => (setReq(e.target.value), setProblem(null))} placeholder="importe general" />
            </Field>
          )}
          {problem && <p className="error">{problem}</p>}
          <div className="form-actions">
            <button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>
              Guardar
            </button>
            {state === 'participa' && (
              <button type="button" className="grp-secondary" onClick={onPay}>
                Registrar su pago
              </button>
            )}
            <button type="button" className="link-button" onClick={onClose}>
              Cerrar
            </button>
          </div>
          {member && !hasPayments && (
            <ConfirmButton
              label="Quitar de este bote"
              confirmMessage="Solo sale de este bote."
              onConfirm={() => {
                void removeMember(fund.id, participant.id)
                  .then(onSaved)
                  .catch((e) => setProblem(groupsErrorMessage(e)))
              }}
            />
          )}
        </>
      ) : (
        <p className="muted">Este bote no se puede modificar.</p>
      )}
    </GroupSheet>
  )
}

// ---------------------------------------------------------------------------------------------- compartir por WhatsApp
export function ReportSheet({ fund, summary, rows, entries, participants, onClose }: { fund: FundItem; summary: FundSummary; rows: { name: string; row: FundSummary['rows'][number] }[]; entries: FundEntry[]; participants: Participant[]; onClose: () => void }) {
  const { prefs } = useNamePrefs()
  const [kind, setKind] = useState<ReportKind | 'detalle'>('pendientes')
  // El formato por defecto es el del grupo, pero se puede cambiar para ESTE envío sin tocar el del grupo.
  const [format, setFormat] = useState<NameFormat>(prefs.format)
  const named = useMemo(() => {
    const live = participants.filter((p) => !p.leftAt)
    const names = displayNames(live.length ? live : participants, format)
    const byId = new Map(participants.map((p) => [p.id, p]))
    const key = (id: string) => {
      const p = byId.get(id)
      return p ? (prefs.sortBy === 'surname' ? [p.surname, p.name] : [p.name, p.surname]).filter(Boolean).join(' ') : ''
    }
    return rows.map((r) => ({ ...r, name: names.get(r.row.participantId) ?? r.name, sort: key(r.row.participantId) }))
  }, [rows, participants, format, prefs.sortBy])
  const base = useMemo(() => (kind === 'detalle' ? buildDetailedReport(fund.name, summary, entries) : buildFundReport(kind, fund.name, summary, named)), [kind, fund.name, summary, named, entries])
  const [text, setText] = useState(base)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => setText(base), [base])

  const share = async () => {
    try {
      const native = await shareText({ title: fund.name, text })
      emitHelpEvent('grupos.report-shared')
      setNote(native ? null : 'Copiado al portapapeles. Pégalo en el chat.')
    } catch {
      setNote('No se ha podido compartir. Selecciona el texto y cópialo.')
    }
  }
  const whatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
    emitHelpEvent('grupos.report-shared')
  }
  const KINDS: { id: ReportKind | 'detalle'; label: string }[] = [
    { id: 'pendientes', label: 'Pendientes' },
    { id: 'pagados', label: 'Pagados' },
    { id: 'resumen', label: 'Resumen' },
    { id: 'detalle', label: 'Detallado' },
  ]
  return (
    <GroupSheet title="Compartir por WhatsApp" onClose={onClose} wide>
      <div className="grp-chips" role="radiogroup" aria-label="Qué compartir" data-help-id="grupos.informe-tipo">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={'chip' + (kind === k.id ? ' chip-active' : '')} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      {kind !== 'detalle' && kind !== 'resumen' && (
        <label className="grp-field" data-help-id="grupos.informe-formato-nombres">
          <span>Cómo salen los nombres en este envío</span>
          <select className="grp-input" value={format} onChange={(e) => setFormat(e.target.value as NameFormat)}>
            {NAME_FORMATS.map((f) => (
              <option key={f} value={f}>
                {NAME_FORMAT_LABEL[f]}
                {f === prefs.format ? ' (el del grupo)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="muted" style={{ margin: '4px 0' }}>
        Vista previa (puedes editarla). {kind === 'detalle' ? 'El detallado lleva fechas e importes; ' : ''}No incluye teléfonos, correos ni alias de pago.
      </p>
      <textarea className="grp-input grp-textarea" value={text} onChange={(e) => setText(e.target.value)} aria-label="Texto a compartir" data-help-id="grupos.informe-texto" />
      {note && <p className="muted">{note}</p>}
      <div className="form-actions">
        <button type="button" className="primary-button" onClick={() => void whatsapp()} data-help-id="grupos.informe-whatsapp">
          Abrir WhatsApp
        </button>
        <button type="button" className="grp-secondary" onClick={() => void share()}>
          Compartir / copiar
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </GroupSheet>
  )
}

// ---------------------------------------------------------------------------------------------- cerrar el bote
export function CloseFundSheet({ fund, summary, onClose, onDone }: { fund: FundItem; summary: FundSummary; onClose: () => void; onDone: () => void }) {
  const warnings = closeWarnings(summary)
  const [option, setOption] = useState<'traspaso' | 'devolucion' | 'archivado'>('devolucion')
  const [target, setTarget] = useState('')
  const [note, setNote] = useState('')
  const [others, setOthers] = useState<{ id: string; label: string }[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const surplus = summary.balance > 0
  useEffect(() => {
    listOpenFundsAcrossGroups()
      .then((all) => setOthers(all.filter((f) => f.id !== fund.id).map((f) => ({ id: f.id, label: `${f.name} · ${f.groupName}` }))))
      .catch(() => setOthers([]))
  }, [fund.id])

  const confirm = async () => {
    if (busy) return
    if (surplus && option === 'traspaso' && !target) return setProblem('Elige el bote al que pasa el sobrante.')
    setBusy(true)
    try {
      await closeFund(fund.id, option, option === 'traspaso' ? target : null, note)
      emitHelpEvent('grupos.fund-closed')
      onDone()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }
  return (
    <GroupSheet title={`Cerrar «${fund.name}»`} onClose={onClose}>
      {warnings.length > 0 && (
        <div className="grp-banner">
          <strong>Antes de cerrar:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted">No hace falta que el saldo sea cero. Un bote cerrado se puede reabrir después para corregir errores.</p>
      {surplus && (
        <>
          <p style={{ marginBottom: 4 }}>
            Sobran <strong>{fmtEuro(summary.balance)}</strong>. ¿Qué hacemos con ellos?
          </p>
          <div role="radiogroup" aria-label="Destino del sobrante" style={{ display: 'grid', gap: 8 }}>
            {(
              [
                ['devolucion', 'Registrar una devolución o entrega externa', 'Sale del bote y queda anotado.'],
                ['traspaso', 'Pasarlo a otro bote', 'Se traspasa a un bote abierto tuyo.'],
                ['archivado', 'Archivar dejando constancia del saldo', 'Se queda anotado como saldo pendiente de destino.'],
              ] as const
            ).map(([id, label, hint]) => (
              <button key={id} type="button" role="radio" aria-checked={option === id} className="grp-big-button" style={{ opacity: option === id ? 1 : 0.65 }} onClick={() => setOption(id)}>
                <span>
                  {label}
                  <small className="muted" style={{ display: 'block', fontWeight: 400 }}>{hint}</small>
                </span>
                <span aria-hidden="true">{option === id ? '●' : '○'}</span>
              </button>
            ))}
          </div>
          {option === 'traspaso' && (
            <Field label="Bote de destino">
              <select className="grp-input" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Elige un bote…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}
      <Field label="Nota (opcional)">
        <input className="grp-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={surplus ? 'Por ejemplo: para el regalo de fin de curso' : ''} />
      </Field>
      {problem && <p className="error">{problem}</p>}
      <div className="form-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void confirm()} data-help-id="grupos.cerrar-confirmar">
          Cerrar el bote
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </GroupSheet>
  )
}

// ---------------------------------------------------------------------------------------------- traspaso entre botes
export function TransferFundsSheet({ fund, summary, onClose, onDone }: { fund: FundItem; summary: FundSummary; onClose: () => void; onDone: () => void }) {
  const [others, setOthers] = useState<{ id: string; label: string }[] | null>(null)
  const [target, setTarget] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    listOpenFundsAcrossGroups()
      .then((all) => setOthers(all.filter((f) => f.id !== fund.id).map((f) => ({ id: f.id, label: `${f.name} · ${f.groupName}` }))))
      .catch((e) => setProblem(groupsErrorMessage(e)))
  }, [fund.id])
  const save = async () => {
    const n = Number(amount.replace(',', '.'))
    if (!target) return setProblem('Elige el bote de destino.')
    if (!(n > 0)) return setProblem('Indica un importe mayor que cero.')
    if (n > summary.balance) return setProblem(`Solo hay ${fmtEuro(summary.balance)} disponibles.`)
    setBusy(true)
    try {
      await transferBetweenFunds(fund.id, target, n, note)
      onDone()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }
  return (
    <GroupSheet title="Traspasar dinero a otro bote" onClose={onClose}>
      <p className="muted">Disponible: {fmtEuro(summary.balance)}. Quedan dos apuntes enlazados (sale de uno, entra en otro) y no se crea ningún ingreso ni gasto nuevo.</p>
      {others && others.length === 0 && <p className="muted">No tienes otros botes abiertos.</p>}
      <Field label="Bote de destino">
        <select className="grp-input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Elige un bote…</option>
          {others?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Importe (€)">
        <input className="grp-input" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setProblem(null))} />
      </Field>
      <Field label="Nota (opcional)">
        <input className="grp-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {problem && <p className="error">{problem}</p>}
      <div className="form-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>
          Traspasar
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </GroupSheet>
  )
}

// ---------------------------------------------------------------------------------------------- editar el bote
export function EditFundSheet({ fund, canChangeType, onClose, onSaved }: { fund: FundItem; canChangeType: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(fund.name)
  const [type, setType] = useState<ContributionType>(fund.contributionType)
  const [amount, setAmount] = useState(fund.defaultAmount !== null ? String(fund.defaultAmount).replace('.', ',') : '')
  const [problem, setProblem] = useState<string | null>(null)
  const save = async () => {
    if (!name.trim()) return setProblem('Escribe el nombre del bote.')
    const n = Number(amount.replace(',', '.'))
    if (type === 'igual' && !(n > 0)) return setProblem('Indica cuánto aporta cada persona.')
    try {
      await updateFund(fund.id, { name, contributionType: type, defaultAmount: type === 'igual' ? n : null })
      onSaved()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    }
  }
  return (
    <GroupSheet title="Editar el bote" onClose={onClose}>
      <Field label="Nombre">
        <input className="grp-input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {canChangeType && (
        <div className="grp-chips">
          {(Object.keys(CONTRIBUTION_LABEL) as ContributionType[]).map((t) => (
            <button key={t} type="button" className={'chip' + (type === t ? ' chip-active' : '')} onClick={() => setType(t)}>
              {CONTRIBUTION_LABEL[t]}
            </button>
          ))}
        </div>
      )}
      {type === 'igual' && (
        <Field label="Importe por persona (€)" hint="Cambiarlo recalcula lo pendiente; los pagos ya anotados no se tocan.">
          <input className="grp-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      )}
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

// ---------------------------------------------------------------------------------------------- enlaces de consulta
export function LinksSheet({ fund, participants, onClose }: { fund: FundItem; participants: Participant[]; onClose: () => void }) {
  const [links, setLinks] = useState<ShareLink[] | null>(null)
  const [pick, setPick] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const load = () =>
    listShareLinks(fund.id)
      .then(setLinks)
      .catch((e) => setProblem(groupsErrorMessage(e)))
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fund.id])
  const names = new Map(participants.map((p) => [p.id, participantName(p)]))
  const general = links?.find((l) => l.kind === 'general')
  const personal = links?.filter((l) => l.kind === 'participante') ?? []

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      setProblem(null)
      await load()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    }
  }
  const send = async (l: ShareLink) => {
    const who = l.participantId ? names.get(l.participantId) : null
    const text = l.kind === 'general' ? `Estado del bote «${fund.name}»: ${fundShareUrl(l.token)}` : `Tu aportación al bote «${fund.name}»${who ? ` (${who})` : ''}: ${fundShareUrl(l.token)}`
    try {
      const native = await shareText({ title: fund.name, text })
      setNote(native ? null : 'Enlace copiado al portapapeles.')
    } catch {
      setNote('No se ha podido compartir. Copia el enlace a mano.')
    }
  }
  const linkRow = (l: ShareLink) => (
    <div key={l.id} className="grp-card">
      <div style={{ overflowWrap: 'anywhere' }}>{l.kind === 'general' ? 'Estado general' : names.get(l.participantId ?? '') ?? 'Participante'}</div>
      <div className="form-actions" style={{ margin: 0 }}>
        <button type="button" className="link-button" onClick={() => void send(l)}>
          Compartir enlace
        </button>
        <ConfirmButton label="Revocar" confirmMessage="Deja de funcionar al instante." onConfirm={() => void run(() => revokeShareLink(l.id))} />
      </div>
    </div>
  )
  return (
    <GroupSheet title="Enlaces de consulta" onClose={onClose}>
      <p className="muted">
        Para que una familia consulte sin instalar PEPA. El enlace general solo enseña totales (sin nombres). El de una persona solo enseña lo suyo y permite avisar «Ya he pagado», que
        tú verificas: no marca nada como cobrado por sí solo. Se pueden revocar cuando quieras.
      </p>
      {!links && !problem && <p className="muted">Cargando…</p>}
      {links && (
        <>
          <p className="grp-section">Estado general</p>
          {general ? linkRow(general) : (
            <button type="button" className="grp-secondary" onClick={() => void run(() => createShareLink(fund.id, 'general', null))}>
              Crear enlace general
            </button>
          )}
          <p className="grp-section">Enlaces por persona</p>
          {personal.map(linkRow)}
          <Field label="Crear el enlace de…">
            <select className="grp-input" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Elige una persona…</option>
              {participants
                .filter((p) => !p.leftAt && !personal.some((l) => l.participantId === p.id))
                .sort((a, b) => participantName(a).localeCompare(participantName(b), 'es'))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {participantName(p)}
                  </option>
                ))}
            </select>
          </Field>
          <button
            type="button"
            className="grp-secondary"
            disabled={!pick}
            onClick={() => {
              const id = pick
              setPick('')
              void run(() => createShareLink(fund.id, 'participante', id))
            }}
          >
            Crear enlace
          </button>
        </>
      )}
      {note && <p className="muted">{note}</p>}
      {problem && <p className="error">{problem}</p>}
    </GroupSheet>
  )
}
