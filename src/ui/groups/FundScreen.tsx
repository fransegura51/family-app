import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDate, formatDateFromTimestamp } from '@/domain/dateFormat'
import { Link, useNavigate } from 'react-router-dom'
import { groupsErrorMessage, listParticipants, loadGroup } from '@/data/groups'
import { addMembers, deleteEmptyFund, loadFund, markNoticeReviewed, reopenFund, setMembersState, type FundDetail } from '@/data/groupFunds'
import {
  CONTRIBUTION_LABEL,
  ENTRY_KIND_LABEL,
  fmtEuro,
  INCOME_KINDS,
  STATUS_LABEL,
  summarizeFund,
  toSummaryInputs,
  type EntryKind,
  type FundEntry,
  type MemberState,
  type ParticipantFundStatus,
} from '@/domain/groupFunds'
import { activeParticipants, foldText, participantName, type GroupItem, type Participant } from '@/domain/groups'
import { useRealtimeRefresh } from '@/state/useRealtimeRefresh'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { EntryDetailSheet, EntrySheet } from '@/ui/groups/FundEntrySheets'
import { CloseFundSheet, EditFundSheet, LinksSheet, ParticipantFundSheet, ReportSheet, TransferFundsSheet } from '@/ui/groups/FundOtherSheets'
import { GroupSheet } from '@/ui/groups/GroupSheet'
import '@/ui/groups/groups.css'

type NewKind = Exclude<EntryKind, 'traspaso_in' | 'traspaso_out'>
type Sheet =
  | { t: 'menu' }
  | { t: 'new'; kind: NewKind; preselect?: string[] }
  | { t: 'entry'; id: string }
  | { t: 'person'; id: string }
  | { t: 'report' }
  | { t: 'close' }
  | { t: 'transfer' }
  | { t: 'edit' }
  | { t: 'links' }
  | null

type Filter = 'todos' | 'pendientes' | 'pagados' | 'exentos'

export function FundScreen({ groupId, fundId }: { groupId: string; fundId: string }) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState<FundDetail | null | undefined>(undefined)
  const [group, setGroup] = useState<GroupItem | null>(null)
  const [people, setPeople] = useState<Participant[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [tab, setTab] = useState<'personas' | 'movimientos'>('personas')
  const [filter, setFilter] = useState<Filter>('todos')
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const reload = useCallback(async () => {
    try {
      const [d, g, p] = await Promise.all([loadFund(fundId), loadGroup(groupId), listParticipants(groupId)])
      setDetail(d)
      setGroup(g)
      setPeople(p)
      setError(null)
    } catch (e) {
      setError(groupsErrorMessage(e, 'No se ha podido cargar el bote.'))
      setDetail((prev) => (prev === undefined ? null : prev))
    }
  }, [fundId, groupId])
  useEffect(() => {
    void reload()
  }, [reload])
  useRealtimeRefresh(['group_funds', 'fund_members', 'fund_entries', 'fund_entry_allocations', 'fund_payment_notices', 'group_participants'], reload, { paused: sheet !== null })

  const summary = useMemo(() => {
    if (!detail) return null
    const inputs = toSummaryInputs(detail.members, detail.entries, detail.allocations)
    return summarizeFund({ contributionType: detail.fund.contributionType, defaultAmount: detail.fund.defaultAmount }, inputs.members, inputs.entries, inputs.allocations)
  }, [detail])

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const rows = useMemo(
    () =>
      (summary?.rows ?? [])
        .map((r) => ({ name: byId.get(r.participantId) ? participantName(byId.get(r.participantId) as Participant) : '—', row: r }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [summary, byId],
  )

  if (detail === undefined) return <div className="screen grp-screen">Cargando…</div>
  if (detail === null || !summary || !group)
    return (
      <div className="screen grp-screen">
        {error && <p className="error">{error}</p>}
        <p>No se encuentra este bote, o no tienes acceso a él.</p>
        <Link to={`/grupos/${groupId}`}>Volver al grupo</Link>
      </div>
    )

  const { fund } = detail
  const writable = fund.status === 'abierto' && !fund.readonlyHistory && !group.archivedAt
  const ctx = { fund, participants: people, members: detail.members, summary }
  const memberIds = new Set(detail.members.map((m) => m.participantId))
  const missing = activeParticipants(people).filter((p) => !memberIds.has(p.id))
  const pendingNotices = detail.notices.filter((n) => n.status === 'pendiente')
  const allocsByEntry = new Map<string, { participantId: string; amount: number }[]>()
  for (const a of detail.allocations) allocsByEntry.set(a.entryId, [...(allocsByEntry.get(a.entryId) ?? []), { participantId: a.participantId, amount: a.amount }])

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
      setError(null)
      await reload()
    } catch (e) {
      setError(groupsErrorMessage(e))
    }
  }

  const matches = (s: ParticipantFundStatus, f: Filter) =>
    f === 'todos' ? true : f === 'pendientes' ? s === 'pendiente' || s === 'parcial' || s === 'sin_aportar' : f === 'pagados' ? s === 'pagado' || s === 'sobrepago' || s === 'aporto' : s === 'exento' || s === 'no_participa'
  const q = foldText(query)
  const shownRows = rows.filter((r) => matches(r.row.status, filter) && (!q || foldText(r.name).includes(q)))
  const collectedPct = summary.expected > 0 ? Math.min(100, Math.round((summary.collected / summary.expected) * 100)) : 0

  const toggleSel = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)))
  const bulk = (state: MemberState) =>
    run(async () => {
      await setMembersState(fund.id, [...selected], state)
      setSelected(new Set())
      setSelecting(false)
    })

  const entryRow = (e: FundEntry) => {
    const income = INCOME_KINDS.includes(e.kind)
    const al = allocsByEntry.get(e.id) ?? []
    const who = al.length === 0 ? null : al.map((a) => (byId.get(a.participantId) ? participantName(byId.get(a.participantId) as Participant) : '—')).join(', ')
    const unidentified = e.kind === 'aportacion' && !e.voidedAt && al.length === 0
    return (
      <button key={e.id} type="button" className={'grp-row' + (e.voidedAt ? ' grp-entry-void' : '')} onClick={() => setSheet({ t: 'entry', id: e.id })}>
        <span aria-hidden="true">{income ? '⬇️' : '⬆️'}</span>
        <span className="grp-row-main">
          <span className="grp-row-title">
            {ENTRY_KIND_LABEL[e.kind]}
            {e.concept ? ` · ${e.concept}` : ''}
          </span>
          <span className="grp-row-sub" style={{ display: 'block' }}>
            {formatDate(e.entryDate)}
            {who ? ` · ${who}` : ''}
            {unidentified ? ' · ' : ''}
            {unidentified && <strong style={{ color: '#8a5a00' }}>sin identificar</strong>}
            {e.receiptPath || e.hadReceipt ? ' · 🧾' : ''}
          </span>
        </span>
        <strong>
          {income ? '+' : '−'}
          {fmtEuro(e.amount)}
        </strong>
      </button>
    )
  }

  const entrySheetFor = sheet?.t === 'entry' ? detail.entries.find((e) => e.id === sheet.id) : undefined
  const personSheetFor = sheet?.t === 'person' ? byId.get(sheet.id) : undefined

  return (
    <div className="screen grp-screen">
      <SectionBreadcrumb subsection={[{ label: 'Inicio', to: '/grupos' }, { label: group.name, to: `/grupos/${group.id}` }, { label: fund.name }]} />
      {error && <p className="error">{error}</p>}
      <h2 className="grp-title">{fund.name}</h2>
      <p className="muted grp-sub">
        {CONTRIBUTION_LABEL[fund.contributionType]}
        {fund.contributionType === 'igual' && fund.defaultAmount !== null ? ` · ${fmtEuro(fund.defaultAmount)} por persona` : ''} ·{' '}
        <span className="grp-status">{fund.readonlyHistory ? 'Gestión anterior' : fund.status === 'abierto' ? 'Abierto' : 'Cerrado'}</span>
      </p>

      {fund.readonlyHistory && (
        <div className="grp-readonly-banner">
          <strong>Gestión anterior · solo lectura.</strong> Recibido de {fund.history?.responsible ?? 'otra persona'}
          {fund.history?.group ? ` («${fund.history.group}»)` : ''}
          {fund.history?.from ? `. Período: ${formatDate(fund.history.from)}${fund.history.to && fund.history.to !== fund.history.from ? ` – ${formatDate(fund.history.to)}` : ''}` : ''}.
          {Array.isArray(fund.history?.chain) && (fund.history?.chain?.length ?? 0) > 1 ? ` Ha pasado por ${fund.history?.chain?.length} gestiones.` : ''} No se puede modificar ni reabrir.
        </div>
      )}
      {fund.status === 'cerrado' && !fund.readonlyHistory && (
        <div className="grp-banner">
          Bote cerrado{fund.closedAt ? ` el ${formatDateFromTimestamp(fund.closedAt)}` : ''}.
          {fund.leftoverAmount ? ` Sobrante ${fmtEuro(fund.leftoverAmount)} (${fund.leftoverDestination === 'traspaso' ? 'traspasado a otro bote' : fund.leftoverDestination === 'devolucion' ? 'devuelto o entregado' : 'archivado con constancia'}).` : ''}
          {fund.closeNote ? ` «${fund.closeNote}»` : ''}{' '}
          {!group.archivedAt && (
            <button type="button" className="link-button" style={{ padding: 0 }} onClick={() => void run(() => reopenFund(fund.id))} data-help-id="grupos.reabrir">
              Reabrir para corregir
            </button>
          )}
        </div>
      )}

      <div className="grp-stats" data-help-id="grupos.bote-resumen">
        <div className="grp-stat">
          <strong>{fmtEuro(summary.expected)}</strong>
          <span>Previsto</span>
        </div>
        <div className="grp-stat">
          <strong>{fmtEuro(summary.collected)}</strong>
          <span>Recaudado</span>
        </div>
        <div className="grp-stat">
          <strong>{fmtEuro(summary.pending)}</strong>
          <span>Pendiente</span>
        </div>
        <div className="grp-stat">
          <strong>{fmtEuro(summary.balance)}</strong>
          <span>Saldo disponible</span>
        </div>
      </div>
      {fund.contributionType !== 'voluntaria' && (
        <div className="grp-bar" aria-label={`Recaudado ${collectedPct} %`}>
          <div style={{ width: `${collectedPct}%` }} />
        </div>
      )}
      <p className="muted" style={{ margin: '0 0 8px' }}>
        {summary.counts.pagado} pagados · {summary.counts.parcial + summary.counts.pendiente} pendientes
        {summary.counts.exento ? ` · ${summary.counts.exento} ${summary.counts.exento === 1 ? "exento" : "exentos"}` : ""}
        {summary.counts.noParticipa ? ` · ${summary.counts.noParticipa} ${summary.counts.noParticipa === 1 ? "no participa" : "no participan"}` : ""}
        {summary.spent > 0 ? ` · gastado ${fmtEuro(summary.spent)}` : ''}
      </p>
      {summary.unidentified > 0 && (
        <div className="grp-banner">
          Hay <strong>{fmtEuro(summary.unidentified)}</strong> de ingresos sin identificar. Suman al saldo, pero no marcan a nadie como pagado.{' '}
          <button type="button" className="link-button" style={{ padding: 0 }} onClick={() => setTab('movimientos')}>
            Ver movimientos
          </button>
        </div>
      )}

      {!fund.readonlyHistory && (
        <div className="grp-actions">
          {writable && (
            <button type="button" className="primary-button" data-help-id="grupos.registrar" onClick={() => setSheet({ t: 'menu' })}>
              ＋ Registrar
            </button>
          )}
          <button type="button" className="grp-secondary" data-help-id="grupos.whatsapp" onClick={() => setSheet({ t: 'report' })}>
            Compartir por WhatsApp
          </button>
          <button type="button" className="grp-secondary" data-help-id="grupos.bote-menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            ⋯
          </button>
        </div>
      )}
      {fund.readonlyHistory && (
        <div className="grp-actions">
          <button type="button" className="grp-secondary" onClick={() => setSheet({ t: 'report' })}>
            Ver informe
          </button>
        </div>
      )}
      {menu && !fund.readonlyHistory && (
        <div className="grp-menu grp-card">
          {writable && (
            <button type="button" className="link-button" onClick={() => (setMenu(false), setSheet({ t: 'edit' }))}>
              Editar el bote
            </button>
          )}
          {writable && summary.balance > 0 && (
            <button type="button" className="link-button" onClick={() => (setMenu(false), setSheet({ t: 'transfer' }))}>
              Traspasar dinero a otro bote
            </button>
          )}
          <button type="button" className="link-button" onClick={() => (setMenu(false), setSheet({ t: 'links' }))}>
            Enlaces de consulta para las familias
          </button>
          {writable && (
            <button type="button" className="link-button" data-help-id="grupos.cerrar-bote" onClick={() => (setMenu(false), setSheet({ t: 'close' }))}>
              Cerrar el bote
            </button>
          )}
          {detail.entries.length === 0 && !fund.readonlyHistory && group.archivedAt === null && (
            <ConfirmButton
              label="Eliminar el bote vacío"
              confirmMessage="Se borra el bote (no tiene apuntes)."
              onConfirm={() => {
                void deleteEmptyFund(fund.id)
                  .then(() => navigate(`/grupos/${group.id}`))
                  .catch((e) => setError(groupsErrorMessage(e)))
              }}
            />
          )}
        </div>
      )}

      {pendingNotices.length > 0 && (
        <div className="grp-banner grp-banner-info">
          <strong>Avisos «Ya he pagado» por verificar</strong>
          {pendingNotices.map((n) => (
            <div key={n.id} style={{ marginTop: 6 }}>
              {byId.get(n.participantId) ? participantName(byId.get(n.participantId) as Participant) : '—'} dice que ha pagado
              {n.note ? `: «${n.note}»` : ''} <small className="muted">({formatDateFromTimestamp(n.createdAt)})</small>
              <div className="form-actions" style={{ margin: 0 }}>
                {writable && (
                  <button type="button" className="link-button" onClick={() => setSheet({ t: 'new', kind: 'aportacion', preselect: [n.participantId] })}>
                    Registrar su pago
                  </button>
                )}
                <button type="button" className="link-button" onClick={() => void run(() => markNoticeReviewed(n.id))}>
                  Marcar como visto
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'personas'} className={'chip' + (tab === 'personas' ? ' chip-active' : '')} onClick={() => setTab('personas')} data-help-id="grupos.bote-personas">
          Personas
        </button>
        <button type="button" role="tab" aria-selected={tab === 'movimientos'} className={'chip' + (tab === 'movimientos' ? ' chip-active' : '')} onClick={() => setTab('movimientos')} data-help-id="grupos.bote-movimientos">
          Movimientos
        </button>
      </div>

      {tab === 'personas' && (
        <>
          {missing.length > 0 && writable && (
            <div className="grp-banner">
              {missing.length === 1 ? `${participantName(missing[0])} no está en este bote.` : `${missing.length} personas del grupo no están en este bote.`}{' '}
              <button type="button" className="link-button" style={{ padding: 0 }} onClick={() => void run(() => addMembers(fund.id, missing.map((p) => p.id)))}>
                Incorporar
              </button>
            </div>
          )}
          <div className="grp-chips">
            {(
              [
                ['todos', 'Todos'],
                ['pendientes', 'Pendientes'],
                ['pagados', 'Pagados'],
                ['exentos', 'Exentos / fuera'],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" className={'chip' + (filter === id ? ' chip-active' : '')} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          <input className="grp-input" type="search" placeholder="Buscar una persona" aria-label="Buscar una persona" value={query} onChange={(e) => setQuery(e.target.value)} />
          {writable && (
            <div style={{ margin: '6px 0' }}>
              <button type="button" className="link-button" style={{ padding: 0 }} data-help-id="grupos.seleccionar-varios" onClick={() => (setSelecting((v) => !v), setSelected(new Set()))}>
                {selecting ? 'Terminar selección' : 'Seleccionar varios (excluir o eximir)'}
              </button>
            </div>
          )}
          <div style={{ marginTop: 6 }} data-help-id="grupos.bote-lista-personas">
            {shownRows.map(({ name, row }) => {
              const p = byId.get(row.participantId)
              if (!p) return null
              return (
                <div key={row.participantId} className="grp-folder-head" style={{ marginBottom: 8 }}>
                  {selecting && (
                    <label className="grp-check-row" style={{ flex: '0 0 auto' }}>
                      <input type="checkbox" aria-label={`Seleccionar a ${name}`} checked={selected.has(row.participantId)} onChange={() => toggleSel(row.participantId)} />
                    </label>
                  )}
                  <button type="button" className="grp-row" style={{ marginBottom: 0 }} onClick={() => (selecting ? toggleSel(row.participantId) : setSheet({ t: 'person', id: row.participantId }))}>
                    <span className="grp-row-main">
                      <span className="grp-row-title">{name}</span>
                      <span className="grp-row-sub" style={{ display: 'block' }}>
                        {row.state === 'participa' && fund.contributionType !== 'voluntaria' ? `${fmtEuro(row.paid)} de ${fmtEuro(row.required)}` : row.paid > 0 ? `Ha aportado ${fmtEuro(row.paid)}` : ' '}
                      </span>
                    </span>
                    <span className={'grp-status grp-status-' + row.status}>{STATUS_LABEL[row.status]}</span>
                  </button>
                </div>
              )
            })}
            {shownRows.length === 0 && <p className="muted">Nadie en esta vista.</p>}
          </div>
          {selecting && selected.size > 0 && (
            <div className="grp-sticky-bar">
              <span className="muted" style={{ alignSelf: 'center' }}>{selected.size} elegidas</span>
              <button type="button" className="primary-button" onClick={() => void bulk('no_participa')} data-help-id="grupos.no-participan">
                No participan
              </button>
              <button type="button" className="grp-secondary" onClick={() => void bulk('exento')}>
                Exentas
              </button>
              <button type="button" className="grp-secondary" onClick={() => void bulk('participa')}>
                Participan
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'movimientos' && (
        <div style={{ marginTop: 6 }}>
          {detail.entries.length === 0 && <p className="muted">Todavía no hay movimientos. Con «＋ Registrar» anota un pago, un gasto…</p>}
          {detail.entries.map(entryRow)}
        </div>
      )}

      {sheet?.t === 'menu' && (
        <GroupSheet title="¿Qué quieres registrar?" onClose={() => setSheet(null)}>
          <div style={{ display: 'grid', gap: 8 }}>
            {(
              [
                ['aportacion', '💶 Un pago recibido', 'De una familia (Bizum, efectivo…).'],
                ['gasto', '🛒 Un gasto', 'Compra de material, entradas, un proveedor…'],
                ['entrega', '🤝 Una entrega de dinero', 'Al profesor o a un responsable.'],
                ['reembolso', '↩️ Un reembolso', 'A quien adelantó un gasto.'],
                ['devolucion', '🔙 Una devolución', 'A una familia.'],
              ] as [NewKind, string, string][]
            ).map(([kind, label, hint]) => (
              <button key={kind} type="button" className="grp-big-button" onClick={() => setSheet({ t: 'new', kind })} data-help-id={kind === 'aportacion' ? 'grupos.registrar-pago' : undefined}>
                <span>
                  {label}
                  <small className="muted" style={{ display: 'block', fontWeight: 400 }}>{hint}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
            {summary.balance > 0 && (
              <button type="button" className="grp-big-button" onClick={() => setSheet({ t: 'transfer' })}>
                <span>
                  🔀 Traspasar a otro bote
                  <small className="muted" style={{ display: 'block', fontWeight: 400 }}>Pasa dinero a otro bote tuyo.</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            )}
          </div>
        </GroupSheet>
      )}
      {sheet?.t === 'new' && <EntrySheet ctx={ctx} kind={sheet.kind} preselect={sheet.preselect} onClose={() => setSheet(null)} onSaved={() => (setSheet(null), void reload())} />}
      {entrySheetFor && <EntryDetailSheet ctx={ctx} entry={entrySheetFor} writable={writable} allocations={allocsByEntry.get(entrySheetFor.id) ?? []} onClose={() => setSheet(null)} onSaved={() => (setSheet(null), void reload())} />}
      {personSheetFor && (
        <ParticipantFundSheet
          fund={fund}
          participant={personSheetFor}
          member={detail.members.find((m) => m.participantId === personSheetFor.id) ?? null}
          summary={summary}
          writable={writable}
          hasPayments={detail.allocations.some((a) => a.participantId === personSheetFor.id)}
          onClose={() => setSheet(null)}
          onSaved={() => (setSheet(null), void reload())}
          onPay={() => setSheet({ t: 'new', kind: 'aportacion', preselect: [personSheetFor.id] })}
        />
      )}
      {sheet?.t === 'report' && <ReportSheet fund={fund} summary={summary} rows={rows} entries={detail.entries} onClose={() => setSheet(null)} />}
      {sheet?.t === 'close' && <CloseFundSheet fund={fund} summary={summary} onClose={() => setSheet(null)} onDone={() => (setSheet(null), void reload())} />}
      {sheet?.t === 'transfer' && <TransferFundsSheet fund={fund} summary={summary} onClose={() => setSheet(null)} onDone={() => (setSheet(null), void reload())} />}
      {sheet?.t === 'edit' && <EditFundSheet fund={fund} canChangeType={detail.entries.length === 0} onClose={() => setSheet(null)} onSaved={() => (setSheet(null), void reload())} />}
      {sheet?.t === 'links' && <LinksSheet fund={fund} participants={people} onClose={() => setSheet(null)} />}
    </div>
  )
}
