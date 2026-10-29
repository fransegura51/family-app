import { useCallback, useEffect, useState } from 'react'
import { formatDateFromTimestamp } from '@/domain/dateFormat'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/data/supabaseClient'
import { deleteGroup, groupsErrorMessage, listGroupEvents, listGroupLists, listParticipants, loadGroup, unlinkEventFromGroup, unlinkListFromGroup, updateGroup, type LinkedItem } from '@/data/groups'
import { listFunds } from '@/data/groupFunds'
import { CONTRIBUTION_LABEL, fmtEuro, type FundItem } from '@/domain/groupFunds'
import { activeParticipants, groupTitle, type GroupItem } from '@/domain/groups'
import { useRealtimeRefresh } from '@/state/useRealtimeRefresh'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { AddSheet } from '@/ui/groups/GroupAddSheets'
import { AuditSheet, CopyGroupSheet, ManagersSheet, RenameGroupSheet } from '@/ui/groups/GroupSidePanels'
import '@/ui/groups/groups.css'

type Sheet = 'add' | 'managers' | 'copy' | 'audit' | 'rename' | null

export function GroupDetail({ groupId }: { groupId: string }) {
  const navigate = useNavigate()
  const [group, setGroup] = useState<GroupItem | null | undefined>(undefined)
  const [participants, setParticipants] = useState(0)
  const [funds, setFunds] = useState<FundItem[]>([])
  const [events, setEvents] = useState<LinkedItem[]>([])
  const [lists, setLists] = useState<LinkedItem[]>([])
  const [userId, setUserId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [menu, setMenu] = useState(false)

  const reload = useCallback(async () => {
    try {
      const g = await loadGroup(groupId)
      setGroup(g)
      if (!g) return
      const [p, f, e, l, u] = await Promise.all([listParticipants(groupId), listFunds(groupId), listGroupEvents(groupId), listGroupLists(groupId), supabase.auth.getUser()])
      setParticipants(activeParticipants(p).length)
      setFunds(f)
      setEvents(e)
      setLists(l)
      setUserId(u.data.user?.id ?? '')
      setError(null)
    } catch (e) {
      setError(groupsErrorMessage(e, 'No se ha podido cargar el grupo.'))
      setGroup((prev) => (prev === undefined ? null : prev))
    }
  }, [groupId])
  useEffect(() => {
    void reload()
  }, [reload])
  useRealtimeRefresh(['groups', 'group_participants', 'group_funds', 'group_list_links', 'group_event_links', 'group_managers', 'user_lists', 'events'], reload, { paused: sheet !== null })

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
      setError(null)
      await reload()
    } catch (e) {
      setError(groupsErrorMessage(e))
    }
  }

  if (group === undefined) return <div className="screen grp-screen">Cargando…</div>
  if (group === null)
    return (
      <div className="screen grp-screen">
        <SectionBreadcrumb subsection="Grupo" />
        {error && <p className="error">{error}</p>}
        <p>No se encuentra este grupo, o no tienes acceso a él.</p>
        <Link to="/grupos">Volver a Gestión de grupos</Link>
      </div>
    )

  const own = funds.filter((f) => !f.readonlyHistory)
  const history = funds.filter((f) => f.readonlyHistory)
  const canDelete = funds.length === 0 && group.createdBy === userId

  return (
    <div className="screen grp-screen">
      <SectionBreadcrumb subsection={[{ label: 'Inicio', to: '/grupos' }, { label: group.name }]} />
      {error && <p className="error">{error}</p>}
      <h2 className="grp-title">{groupTitle(group)}</h2>
      <p className="muted grp-sub">
        {participants} {participants === 1 ? 'participante' : 'participantes'}
        {group.archivedAt ? ' · archivado' : ''}
      </p>
      {group.copiedFrom && (
        <div className="grp-banner grp-banner-info">
          Copia recibida de <strong>{group.copiedFrom.responsible ?? 'otra persona'}</strong>
          {group.copiedFrom.group ? ` («${group.copiedFrom.group}»)` : ''}
          {group.copiedFrom.copiedAt ? ` el ${formatDateFromTimestamp(group.copiedFrom.copiedAt)}` : ''}. Es independiente del original.
        </div>
      )}

      <Link to={`/grupos/${group.id}/participantes`} className="grp-big-button" data-help-id="grupos.gestionar-participantes" style={{ textDecoration: 'none' }}>
        <span>👥 Gestionar participantes</span>
        <span>{participants} ›</span>
      </Link>

      <div className="grp-actions">
        {!group.archivedAt && (
          <button type="button" className="primary-button" data-help-id="grupos.anadir" onClick={() => setSheet('add')}>
            ＋ Añadir
          </button>
        )}
        <button type="button" className="grp-secondary" onClick={() => setMenu((v) => !v)} aria-expanded={menu} data-help-id="grupos.mas">
          ⋯ Más
        </button>
      </div>

      {menu && (
        <div className="grp-menu grp-card">
          <button type="button" className="link-button" onClick={() => (setMenu(false), setSheet('rename'))}>
            Cambiar nombre o curso
          </button>
          <button type="button" className="link-button" onClick={() => (setMenu(false), setSheet('managers'))}>
            Responsables
          </button>
          <button type="button" className="link-button" data-help-id="grupos.copiar-grupo" onClick={() => (setMenu(false), setSheet('copy'))}>
            Copiar a otra persona
          </button>
          <button type="button" className="link-button" onClick={() => (setMenu(false), setSheet('audit'))}>
            Registro de operaciones
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setMenu(false)
              void run(() => updateGroup(group.id, { archived: !group.archivedAt }))
            }}
          >
            {group.archivedAt ? 'Reactivar el grupo' : 'Archivar el grupo'}
          </button>
          {canDelete && (
            <ConfirmButton
              label="Eliminar el grupo"
              confirmMessage="Se borra el grupo y sus participantes. No tiene botes."
              onConfirm={() => {
                void deleteGroup(group.id)
                  .then(() => navigate('/grupos'))
                  .catch((e) => setError(groupsErrorMessage(e)))
              }}
            />
          )}
        </div>
      )}

      {own.length > 0 && (
        <>
          <p className="grp-section">Botes</p>
          {own.map((f) => (
            <Link key={f.id} to={`/grupos/${group.id}/bote/${f.id}`} className="grp-row">
              <span aria-hidden="true">💰</span>
              <span className="grp-row-main">
                <span className="grp-row-title">{f.name}</span>
                <span className="grp-row-sub" style={{ display: 'block' }}>
                  {CONTRIBUTION_LABEL[f.contributionType]}
                  {f.contributionType === 'igual' && f.defaultAmount !== null ? ` · ${fmtEuro(f.defaultAmount)}` : ''}
                </span>
              </span>
              <span className="grp-status">{f.status === 'abierto' ? 'Abierto' : 'Cerrado'}</span>
            </Link>
          ))}
        </>
      )}
      {history.length > 0 && (
        <>
          <p className="grp-section">Gestión anterior (solo lectura)</p>
          {history.map((f) => (
            <Link key={f.id} to={`/grupos/${group.id}/bote/${f.id}`} className="grp-row">
              <span aria-hidden="true">🗄️</span>
              <span className="grp-row-main">
                <span className="grp-row-title">{f.name}</span>
                <span className="grp-row-sub" style={{ display: 'block' }}>
                  {f.history?.responsible ? `De ${f.history.responsible}` : 'Historial recibido'}
                </span>
              </span>
            </Link>
          ))}
        </>
      )}
      {events.length > 0 && (
        <>
          <p className="grp-section">Eventos</p>
          {events.map((e) => (
            <div key={e.id} className="grp-folder-head" style={{ marginBottom: 8 }}>
              <Link to={`/eventos?event=${e.id}`} className="grp-row" style={{ marginBottom: 0 }}>
                <span aria-hidden="true">🎉</span>
                <span className="grp-row-main">
                  <span className="grp-row-title">{e.title}</span>
                </span>
              </Link>
              <ConfirmButton label="Desvincular" confirmMessage="Solo se quita el vínculo; el evento sigue en Eventos." onConfirm={() => void run(() => unlinkEventFromGroup(group.id, e.id))} />
            </div>
          ))}
        </>
      )}
      {lists.length > 0 && (
        <>
          <p className="grp-section">Listas</p>
          {lists.map((l) => (
            <div key={l.id} className="grp-folder-head" style={{ marginBottom: 8 }}>
              <Link to={`/listas/${l.id}`} className="grp-row" style={{ marginBottom: 0 }}>
                <span aria-hidden="true">📝</span>
                <span className="grp-row-main">
                  <span className="grp-row-title">{l.title}</span>
                </span>
              </Link>
              <ConfirmButton label="Desvincular" confirmMessage="Solo se quita el vínculo; la lista sigue en Mis listas." onConfirm={() => void run(() => unlinkListFromGroup(group.id, l.id))} />
            </div>
          ))}
        </>
      )}
      {funds.length === 0 && events.length === 0 && lists.length === 0 && !group.archivedAt && (
        <p className="muted">Todavía no hay nada más en este grupo. Con «＋ Añadir» puedes crear un bote, un evento o una lista.</p>
      )}

      {sheet === 'add' && (
        <AddSheet
          groupId={group.id}
          linkedEvents={events}
          linkedLists={lists}
          onClose={() => setSheet(null)}
          onFundCreated={(id) => navigate(`/grupos/${group.id}/bote/${id}`)}
          onLinked={() => void reload()}
          onOpen={(path) => navigate(path)}
        />
      )}
      {sheet === 'managers' && <ManagersSheet group={group} userId={userId} onClose={() => setSheet(null)} />}
      {sheet === 'copy' && <CopyGroupSheet group={group} onClose={() => setSheet(null)} />}
      {sheet === 'audit' && <AuditSheet group={group} onClose={() => setSheet(null)} />}
      {sheet === 'rename' && <RenameGroupSheet group={group} onClose={() => setSheet(null)} onSaved={() => void reload()} />}
    </div>
  )
}
