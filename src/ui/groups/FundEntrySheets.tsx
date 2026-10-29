import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDate, formatDateFromTimestamp } from '@/domain/dateFormat'
import { groupsErrorMessage, updateParticipant } from '@/data/groups'
import { addEntry, getFundReceiptUrl, listIncomingBankTx, setAllocations, updateEntry, uploadFundReceipt, voidEntry, type FundMemberRow, type IncomingBankTx } from '@/data/groupFunds'
import { ENTRY_KIND_LABEL, fmtEuro, type EntryKind, type FundEntry, type FundItem, type FundSummary } from '@/domain/groupFunds'
import { activeParticipants, foldText, participantName, type Participant } from '@/domain/groups'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { DateField } from '@/ui/DateField'
import { AllocationEditor, type AllocationOption } from '@/ui/groups/AllocationEditor'
import { Field, GroupSheet } from '@/ui/groups/GroupSheet'

type NewKind = Exclude<EntryKind, 'traspaso_in' | 'traspaso_out'>
type Method = 'efectivo' | 'bizum' | 'transferencia' | 'tarjeta' | 'otro'
const METHODS: { id: Method; label: string }[] = [
  { id: 'bizum', label: 'Bizum' },
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'otro', label: 'Otro' },
]

export interface FundCtx {
  fund: FundItem
  participants: Participant[]
  members: FundMemberRow[]
  summary: FundSummary
}

export function allocationOptions(ctx: FundCtx, includeIds: string[] = []): AllocationOption[] {
  const state = new Map(ctx.members.map((m) => [m.participantId, m.state]))
  const pending = new Map(ctx.summary.rows.map((r) => [r.participantId, r.pending]))
  const base = activeParticipants(ctx.participants)
  const extra = ctx.participants.filter((p) => p.leftAt && includeIds.includes(p.id))
  return [...base, ...extra].map((p) => ({ participant: p, state: state.get(p.id) ?? 'no_incluido', pending: pending.get(p.id) ?? 0 }))
}

const today = () => new Date().toISOString().slice(0, 10)
const parseAmount = (s: string): number => Number(s.replace(',', '.').replace(/[^\d.]/g, ''))

const PLACEHOLDER: Record<NewKind, string> = {
  aportacion: 'Por ejemplo: pago completo',
  gasto: 'Por ejemplo: Entradas del museo',
  entrega: 'Por ejemplo: Entregado a la profesora',
  reembolso: 'Por ejemplo: Material que adelantó María',
  devolucion: 'Por ejemplo: Devolución a una familia',
}
const WHO_LABEL: Record<NewKind, string> = {
  aportacion: 'Quién ha pagado (nombre del Bizum o de la persona)',
  gasto: 'Proveedor o tienda (opcional)',
  entrega: 'Para quién (opcional)',
  reembolso: 'A quién se reembolsa (opcional)',
  devolucion: 'A quién se devuelve (opcional)',
}

// ---------------------------------------------------------------------------------------------- nuevo apunte
export function EntrySheet({ ctx, kind, preselect, bankTx, onClose, onSaved }: { ctx: FundCtx; kind: NewKind; preselect?: string[]; bankTx?: IncomingBankTx | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(bankTx ? String(bankTx.amount).replace('.', ',') : '')
  const [date, setDate] = useState(bankTx?.date ?? today())
  const [method, setMethod] = useState<Method | null>(bankTx ? 'transferencia' : kind === 'aportacion' ? 'bizum' : null)
  const [who, setWho] = useState(bankTx?.description ?? '')
  const [concept, setConcept] = useState('')
  const [alloc, setAlloc] = useState<Record<string, number>>({})
  const [bank, setBank] = useState<IncomingBankTx | null>(bankTx ?? null)
  const [file, setFile] = useState<File | null>(null)
  const [pickBank, setPickBank] = useState(false)
  const [rememberAlias, setRememberAlias] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const amt = parseAmount(amount)
  const options = useMemo(() => allocationOptions(ctx), [ctx])
  // «Recordar el nombre del pagador»: solo si el pago es de UNA persona y ese nombre aún no figura entre sus alias (así el próximo Bizum se reconoce solo… como sugerencia).
  const aliasTarget = useMemo(() => {
    const ids = Object.keys(alloc)
    if (kind !== 'aportacion' || ids.length !== 1 || !who.trim()) return null
    const p = ctx.participants.find((x) => x.id === ids[0])
    if (!p) return null
    const have = (p.payerAlias ?? '').split(';').map((a) => foldText(a))
    return have.includes(foldText(who)) ? null : p
  }, [alloc, who, kind, ctx.participants])

  // Preselección (p. ej. «Registrar pago de Eric»): el importe sugerido es lo que debe.
  useEffect(() => {
    if (preselect && preselect.length > 0) {
      const owed = options.filter((o) => preselect.includes(o.participant.id)).reduce((s, o) => s + o.pending, 0)
      if (owed > 0) setAmount(String(owed).replace('.', ','))
      setAlloc(Object.fromEntries(preselect.map((id) => [id, 0])))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Si cambia el importe, el reparto vuelve a partes iguales entre los elegidos.
  useEffect(() => {
    const ids = Object.keys(alloc)
    if (ids.length === 0 || !(amt > 0)) return
    const cents = Math.round(amt * 100)
    const base = Math.floor(cents / ids.length)
    const extra = cents - base * ids.length
    const next: Record<string, number> = {}
    ids.forEach((id, i) => (next[id] = (base + (i < extra ? 1 : 0)) / 100))
    const same = ids.every((id) => Math.abs((alloc[id] ?? 0) - next[id]) < 0.001)
    if (!same) setAlloc(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amt, Object.keys(alloc).join('|')])

  const save = async () => {
    if (busy) return
    if (!(amt > 0)) return setProblem('Indica un importe mayor que cero.')
    const sum = Object.values(alloc).reduce((s, v) => s + v, 0)
    if (sum > amt + 0.001) return setProblem('El reparto supera el importe.')
    setBusy(true)
    try {
      const receiptPath = file ? await uploadFundReceipt(ctx.fund.groupId, file) : null
      await addEntry({
        fundId: ctx.fund.id,
        kind,
        amount: amt,
        entryDate: date,
        payerLabel: who,
        method,
        concept,
        receiptPath,
        bankTransactionId: bank?.id ?? null,
        allocations: kind === 'aportacion' ? Object.entries(alloc).map(([participantId, a]) => ({ participantId, amount: a })) : [],
      })
      if (rememberAlias && aliasTarget) {
        // El apunte ya está guardado: si esto falla no se pierde nada, solo no se recuerda el alias.
        await updateParticipant(aliasTarget.id, { payerAlias: [aliasTarget.payerAlias, who.trim()].filter(Boolean).join('; ') }).catch(() => undefined)
      }
      emitHelpEvent('grupos.entry-added') // el apunte YA está guardado
      onSaved()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <GroupSheet title={kind === 'aportacion' ? 'Registrar un pago' : `Registrar: ${ENTRY_KIND_LABEL[kind].toLowerCase()}`} onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {kind === 'aportacion' && (
          <div style={{ marginBottom: 6 }}>
            {bank ? (
              <div className="grp-banner grp-banner-info">
                🏦 Enlazado a un ingreso del banco ({fmtEuro(bank.amount)}, {formatDate(bank.date)}). No se contará dos veces.{' '}
                <button type="button" className="link-button" style={{ padding: 0 }} onClick={() => setBank(null)}>
                  Quitar enlace
                </button>
              </div>
            ) : (
              <button type="button" className="link-button" style={{ padding: 0 }} onClick={() => setPickBank(true)}>
                🏦 Elegir un ingreso de mi banco
              </button>
            )}
          </div>
        )}
        <div className="grp-field-row">
          <Field label="Importe (€)">
            <input className="grp-input" inputMode="decimal" autoFocus value={amount} onChange={(e) => (setAmount(e.target.value), setProblem(null))} placeholder="10" data-help-id="grupos.pago-importe" />
          </Field>
          <Field label="Fecha">
            <DateField value={date} onChange={setDate} placeholder="dd/mm/aaaa" required />
          </Field>
        </div>
        <div className="grp-chips" role="radiogroup" aria-label="Cómo se pagó">
          {METHODS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={method === m.id} className={'chip' + (method === m.id ? ' chip-active' : '')} onClick={() => setMethod(method === m.id ? null : m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <Field label={WHO_LABEL[kind]}>
          <input className="grp-input" value={who} onChange={(e) => setWho(e.target.value)} placeholder={kind === 'aportacion' ? 'Por ejemplo: Ana Ruiz' : ''} data-help-id={kind === 'aportacion' ? 'grupos.pago-pagador' : undefined} />
        </Field>
        {kind !== 'aportacion' && (
          <Field label="Concepto">
            <input className="grp-input" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder={PLACEHOLDER[kind]} />
          </Field>
        )}
        {kind === 'aportacion' && <AllocationEditor options={options} amount={amt > 0 ? amt : 0} payerLabel={who} value={alloc} onChange={setAlloc} />}
        {aliasTarget && (
          <label className="grp-check-row">
            <input type="checkbox" checked={rememberAlias} onChange={(e) => setRememberAlias(e.target.checked)} />
            <span>
              Recordar «{who.trim()}» como pagador de {participantName(aliasTarget)}
            </span>
          </label>
        )}
        <div style={{ margin: '10px 0' }}>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" className="link-button" style={{ padding: 0 }} onClick={() => fileRef.current?.click()}>
            {file ? `🧾 ${file.name} (cambiar)` : '🧾 Adjuntar justificante (foto o PDF)'}
          </button>
        </div>
        {problem && <p className="error">{problem}</p>}
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={busy} data-help-id="grupos.pago-guardar">
            Guardar
          </button>
          <button type="button" className="link-button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
      {pickBank && (
        <BankPicker
          onClose={() => setPickBank(false)}
          onPick={(t) => {
            setBank(t)
            setAmount(String(t.amount).replace('.', ','))
            setDate(t.date)
            setWho(t.description ?? '')
            setMethod('transferencia')
            setPickBank(false)
          }}
        />
      )}
    </GroupSheet>
  )
}

function BankPicker({ onClose, onPick }: { onClose: () => void; onPick: (t: IncomingBankTx) => void }) {
  const [rows, setRows] = useState<IncomingBankTx[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    listIncomingBankTx()
      .then(setRows)
      .catch((e) => setProblem(groupsErrorMessage(e)))
  }, [])
  return (
    <GroupSheet title="Ingresos de tu banco" onClose={onClose}>
      <p className="muted">Solo ves los de tus cuentas. Al elegir uno, ese ingreso queda enlazado a este apunte y no se vuelve a contar en otro.</p>
      {!rows && !problem && <p className="muted">Cargando…</p>}
      {rows?.length === 0 && <p className="muted">No hay ingresos recientes sin asignar.</p>}
      {rows?.map((t) => (
        <button key={t.id} type="button" className="grp-row" onClick={() => onPick(t)}>
          <span aria-hidden="true">🏦</span>
          <span className="grp-row-main">
            <span className="grp-row-title">{t.description || 'Ingreso'}</span>
            <span className="grp-row-sub" style={{ display: 'block' }}>
              {formatDate(t.date)} · {fmtEuro(t.amount)}
            </span>
          </span>
        </button>
      ))}
      {problem && <p className="error">{problem}</p>}
    </GroupSheet>
  )
}

// ---------------------------------------------------------------------------------------------- ver / corregir / anular un apunte
export function EntryDetailSheet({ ctx, entry, writable, allocations, onClose, onSaved }: { ctx: FundCtx; entry: FundEntry; writable: boolean; allocations: { participantId: string; amount: number }[]; onClose: () => void; onSaved: () => void }) {
  const voided = !!entry.voidedAt
  const canEdit = writable && !voided && !entry.transferId
  const [amount, setAmount] = useState(String(entry.amount).replace('.', ','))
  const [date, setDate] = useState(entry.entryDate)
  const [method, setMethod] = useState<Method | null>(entry.method)
  const [who, setWho] = useState(entry.payerLabel ?? '')
  const [concept, setConcept] = useState(entry.concept ?? '')
  const [alloc, setAlloc] = useState<Record<string, number>>(Object.fromEntries(allocations.map((a) => [a.participantId, a.amount])))
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const amt = parseAmount(amount)
  const options = useMemo(() => allocationOptions(ctx, allocations.map((a) => a.participantId)), [ctx, allocations])
  const names = new Map(ctx.participants.map((p) => [p.id, participantName(p)]))

  const openReceipt = async () => {
    try {
      window.open(await getFundReceiptUrl(entry.receiptPath as string), '_blank', 'noopener')
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    }
  }
  const save = async () => {
    if (busy) return
    if (!(amt > 0)) return setProblem('Indica un importe mayor que cero.')
    const sum = Object.values(alloc).reduce((s, v) => s + v, 0)
    if (entry.kind === 'aportacion' && sum > amt + 0.001) return setProblem('El reparto supera el importe.')
    setBusy(true)
    try {
      if (entry.kind === 'aportacion') await setAllocations(entry.id, [])
      await updateEntry(entry.id, { amount: amt, entryDate: date, payerLabel: who, method, concept })
      if (entry.kind === 'aportacion') await setAllocations(entry.id, Object.entries(alloc).map(([participantId, a]) => ({ participantId, amount: a })))
      onSaved()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }
  const doVoid = async () => {
    if (!reason.trim()) return setProblem('Indica el motivo para anular el apunte.')
    setBusy(true)
    try {
      await voidEntry(entry.id, reason)
      onSaved()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <GroupSheet title={`${ENTRY_KIND_LABEL[entry.kind]}${voided ? ' (anulado)' : ''}`} onClose={onClose} wide>
      {voided && (
        <div className="grp-banner grp-banner-warn">
          Anulado {entry.voidedAt ? formatDateFromTimestamp(entry.voidedAt) : ''}: {entry.voidReason}. Ya no cuenta, pero queda en el historial.
        </div>
      )}
      {entry.bankTransactionId && <div className="grp-banner grp-banner-info">🏦 Enlazado a un ingreso del banco: no se cuenta dos veces.</div>}
      {entry.transferId && <div className="grp-banner grp-banner-info">Traspaso entre botes: se corrige con otro traspaso, no se edita.</div>}
      <div className="grp-field-row">
        <Field label="Importe (€)">
          <input className="grp-input" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setProblem(null))} disabled={!canEdit} />
        </Field>
        <Field label="Fecha">
          <DateField value={date} onChange={setDate} placeholder="dd/mm/aaaa" required disabled={!canEdit} />
        </Field>
      </div>
      <div className="grp-chips">
        {METHODS.map((m) => (
          <button key={m.id} type="button" disabled={!canEdit} className={'chip' + (method === m.id ? ' chip-active' : '')} onClick={() => setMethod(method === m.id ? null : m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <Field label={entry.kind === 'aportacion' ? 'Quién ha pagado' : 'Para quién / proveedor'}>
        <input className="grp-input" value={who} onChange={(e) => setWho(e.target.value)} disabled={!canEdit} />
      </Field>
      {entry.kind !== 'aportacion' && (
        <Field label="Concepto">
          <input className="grp-input" value={concept} onChange={(e) => setConcept(e.target.value)} disabled={!canEdit} />
        </Field>
      )}
      {entry.kind === 'aportacion' &&
        (canEdit ? (
          <AllocationEditor options={options} amount={amt > 0 ? amt : 0} payerLabel={who} value={alloc} onChange={setAlloc} />
        ) : (
          <p className="muted">
            {allocations.length === 0 ? 'Sin identificar.' : `Asignado a: ${allocations.map((a) => `${names.get(a.participantId) ?? '—'} (${fmtEuro(a.amount)})`).join(', ')}`}
          </p>
        ))}
      {(entry.receiptPath || entry.hadReceipt) && (
        <p>
          {entry.receiptPath ? (
            <button type="button" className="link-button" style={{ padding: 0 }} onClick={() => void openReceipt()}>
              🧾 Ver justificante
            </button>
          ) : (
            <span className="muted">🧾 Tenía justificante en la gestión original (el archivo no se copia).</span>
          )}
        </p>
      )}
      {problem && <p className="error">{problem}</p>}
      {canEdit && (
        <>
          <div className="form-actions">
            <button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>
              Guardar cambios
            </button>
            <button type="button" className="link-button" onClick={onClose}>
              Cerrar
            </button>
          </div>
          <p className="grp-section">Anular este apunte</p>
          <Field label="Motivo" hint="Nada se borra: el apunte anulado queda en el historial y deja de contar.">
            <input className="grp-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por ejemplo: importe equivocado" />
          </Field>
          <ConfirmButton label="Anular apunte" confirmMessage="¿Anular este apunte?" onConfirm={() => void doVoid()} />
        </>
      )}
      {!canEdit && (
        <div className="form-actions">
          <button type="button" className="link-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      )}
    </GroupSheet>
  )
}
