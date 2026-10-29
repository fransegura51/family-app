import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addParticipant, deleteParticipant, groupsErrorMessage, listParticipants, loadGroup, setParticipantLeft, updateParticipant, type ParticipantInput } from '@/data/groups'
import { addMembers, listFunds } from '@/data/groupFunds'
import type { FundItem } from '@/domain/groupFunds'
import { activeParticipants, filterParticipants, groupTitle, participantName, sortParticipants, type GroupItem, type Participant } from '@/domain/groups'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { useRealtimeRefresh } from '@/state/useRealtimeRefresh'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { Field, GroupSheet } from '@/ui/groups/GroupSheet'
import { ParticipantImport } from '@/ui/groups/ParticipantImport'
import '@/ui/groups/groups.css'

export function ParticipantsScreen({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<GroupItem | null | undefined>(undefined)
  const [people, setPeople] = useState<Participant[]>([])
  const [openFunds, setOpenFunds] = useState<FundItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showLeft, setShowLeft] = useState(false)
  const [editing, setEditing] = useState<Participant | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [offerFor, setOfferFor] = useState<string[] | null>(null) // participantes recién creados: ofrecer incorporarlos a botes abiertos

  const reload = useCallback(async () => {
    try {
      const g = await loadGroup(groupId)
      setGroup(g)
      if (!g) return
      const [p, f] = await Promise.all([listParticipants(groupId), listFunds(groupId)])
      setPeople(p)
      setOpenFunds(f.filter((x) => x.status === 'abierto' && !x.readonlyHistory))
      setError(null)
    } catch (e) {
      setError(groupsErrorMessage(e, 'No se han podido cargar los participantes.'))
      setGroup((prev) => (prev === undefined ? null : prev))
    }
  }, [groupId])
  useEffect(() => {
    void reload()
  }, [reload])
  useRealtimeRefresh(['group_participants', 'groups', 'group_funds'], reload, { paused: editing !== null || importing || offerFor !== null })

  const active = useMemo(() => sortParticipants(filterParticipants(activeParticipants(people), query)), [people, query])
  const left = useMemo(() => sortParticipants(filterParticipants(people.filter((p) => p.leftAt), query)), [people, query])

  const afterCreate = (ids: string[]) => {
    if (ids.length > 0 && openFunds.length > 0) setOfferFor(ids)
    void reload()
  }

  if (group === undefined) return <div className="screen grp-screen">Cargando…</div>
  if (group === null)
    return (
      <div className="screen grp-screen">
        <p>No se encuentra este grupo, o no tienes acceso a él.</p>
        <Link to="/grupos">Volver a Gestión de grupos</Link>
      </div>
    )

  const readOnly = !!group.archivedAt

  return (
    <div className="screen grp-screen">
      <SectionBreadcrumb subsection={[{ label: 'Inicio', to: '/grupos' }, { label: group.name, to: `/grupos/${group.id}` }, { label: 'Participantes' }]} />
      {error && <p className="error">{error}</p>}
      <h2 className="grp-title">Participantes · {groupTitle(group)}</h2>
      <p className="muted grp-sub">
        {active.length === activeParticipants(people).length ? `${active.length} ${active.length === 1 ? 'persona' : 'personas'}` : `${active.length} de ${activeParticipants(people).length}`}
      </p>

      {!readOnly && (
        <div className="grp-actions">
          <button type="button" className="primary-button" data-help-id="grupos.anadir-participante" onClick={() => setEditing('new')}>
            ＋ Añadir persona
          </button>
          <button type="button" className="grp-secondary" data-help-id="grupos.importar-participantes" onClick={() => setImporting(true)}>
            📥 Importar lista
          </button>
        </div>
      )}

      <input className="grp-input" type="search" placeholder="Buscar por nombre, madre/padre o teléfono" aria-label="Buscar un participante" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div style={{ marginTop: 10 }} data-help-id="grupos.lista-participantes">
        {active.map((p) => (
          <button key={p.id} type="button" className="grp-row" onClick={() => setEditing(p)}>
            <span aria-hidden="true">🧒</span>
            <span className="grp-row-main">
              <span className="grp-row-title">{participantName(p)}</span>
              <span className="grp-row-sub" style={{ display: 'block' }}>
                {[p.guardianName, p.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
        {active.length === 0 && <p className="muted">{people.length === 0 ? 'Todavía no hay participantes. Añade uno o importa una lista (foto, PDF, Excel o texto).' : 'Nadie coincide con la búsqueda.'}</p>}
      </div>

      {left.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="link-button" aria-expanded={showLeft} onClick={() => setShowLeft((v) => !v)}>
            {showLeft ? 'Ocultar' : 'Ver'} personas de baja ({left.length})
          </button>
          {showLeft &&
            left.map((p) => (
              <button key={p.id} type="button" className="grp-row" style={{ opacity: 0.7 }} onClick={() => setEditing(p)}>
                <span aria-hidden="true">🧒</span>
                <span className="grp-row-main">
                  <span className="grp-row-title">{participantName(p)}</span>
                  <span className="grp-row-sub" style={{ display: 'block' }}>De baja</span>
                </span>
              </button>
            ))}
        </div>
      )}

      {editing && (
        <ParticipantSheet
          groupId={group.id}
          participant={editing === 'new' ? null : editing}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSaved={(createdId) => {
            setEditing(null)
            if (createdId) afterCreate([createdId])
            else void reload()
          }}
        />
      )}
      {importing && (
        <ParticipantImport
          group={group}
          existing={people}
          onClose={() => setImporting(false)}
          onDone={(ids) => {
            setImporting(false)
            afterCreate(ids)
          }}
        />
      )}
      {offerFor && <OfferFundsSheet participantIds={offerFor} funds={openFunds} onClose={() => setOfferFor(null)} />}
    </div>
  )
}

function ParticipantSheet({ groupId, participant, readOnly, onClose, onSaved }: { groupId: string; participant: Participant | null; readOnly: boolean; onClose: () => void; onSaved: (createdId?: string) => void }) {
  const [f, setF] = useState<ParticipantInput>({
    name: participant?.name ?? '',
    surname: participant?.surname ?? '',
    guardianName: participant?.guardianName ?? '',
    phone: participant?.phone ?? '',
    email: participant?.email ?? '',
    payerAlias: participant?.payerAlias ?? '',
    notes: participant?.notes ?? '',
  })
  const [more, setMore] = useState(!!(participant && (participant.surname || participant.email || participant.payerAlias || participant.notes)))
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof ParticipantInput) => (e: { target: { value: string } }) => (setF((p) => ({ ...p, [k]: e.target.value })), setProblem(null))

  const save = async () => {
    if (busy) return
    if (!f.name.trim()) return setProblem('Escribe el nombre identificativo.')
    setBusy(true)
    try {
      if (participant) {
        await updateParticipant(participant.id, f)
        onSaved()
      } else {
        const id = await addParticipant(groupId, f)
        emitHelpEvent('grupos.participant-added')
        onSaved(id)
      }
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <GroupSheet title={participant ? 'Ficha de la persona' : 'Nueva persona'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Nombre identificativo" hint="Es lo que saldrá en las listas de pagados y pendientes.">
          <input className="grp-input" autoFocus={!participant} value={f.name} onChange={set('name')} placeholder="Por ejemplo: Eric García" disabled={readOnly} data-help-id="grupos.ficha-nombre" />
        </Field>
        <Field label="Madre, padre o tutor (opcional)">
          <input className="grp-input" value={f.guardianName ?? ''} onChange={set('guardianName')} disabled={readOnly} />
        </Field>
        <Field label="Teléfono de contacto (opcional)">
          <input className="grp-input" inputMode="tel" value={f.phone ?? ''} onChange={set('phone')} disabled={readOnly} />
        </Field>
        {!more && (
          <button type="button" className="link-button" onClick={() => setMore(true)}>
            ＋ Más datos (apellidos, correo, alias de Bizum, observaciones)
          </button>
        )}
        {more && (
          <>
            <Field label="Apellidos (opcional)">
              <input className="grp-input" value={f.surname ?? ''} onChange={set('surname')} disabled={readOnly} />
            </Field>
            <Field label="Correo electrónico (opcional)">
              <input className="grp-input" inputMode="email" value={f.email ?? ''} onChange={set('email')} disabled={readOnly} />
            </Field>
            <Field label="Alias o nombre del pagador de Bizum (opcional)" hint="Ayuda a reconocer sus pagos. Si hay varios, sepáralos con «;».">
              <input className="grp-input" value={f.payerAlias ?? ''} onChange={set('payerAlias')} disabled={readOnly} />
            </Field>
            <Field label="Observaciones (opcional)" hint="Solo lo necesario. No anotes aquí datos de salud ni otros datos especialmente sensibles.">
              <input className="grp-input" value={f.notes ?? ''} onChange={set('notes')} maxLength={500} disabled={readOnly} />
            </Field>
          </>
        )}
        {problem && <p className="error">{problem}</p>}
        {!readOnly && (
          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={busy} data-help-id="grupos.ficha-guardar">
              Guardar
            </button>
            <button type="button" className="link-button" onClick={onClose}>
              Cancelar
            </button>
          </div>
        )}
      </form>
      {participant && !readOnly && (
        <div className="grp-menu" style={{ paddingLeft: 0 }}>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              void setParticipantLeft(participant.id, !participant.leftAt)
                .then(() => onSaved())
                .catch((e) => setProblem(groupsErrorMessage(e)))
            }}
          >
            {participant.leftAt ? 'Volver a darla de alta' : 'Dar de baja (conserva su historial)'}
          </button>
          <ConfirmButton
            label="Eliminar la ficha"
            confirmMessage="Se borra la ficha. Si tiene pagos en algún bote no se podrá: entonces se da de baja."
            onConfirm={() => {
              void deleteParticipant(participant.id)
                .then(() => onSaved())
                .catch((e) => setProblem(groupsErrorMessage(e)))
            }}
          />
        </div>
      )}
    </GroupSheet>
  )
}

/** Tras añadir personas: ofrecer incorporarlas a los botes abiertos que se elijan. Los botes ya creados NO se modifican solos. */
function OfferFundsSheet({ participantIds, funds, onClose }: { participantIds: string[]; funds: FundItem[]; onClose: () => void }) {
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toggle = (id: string) => setChosen((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)))
  const apply = async () => {
    setBusy(true)
    try {
      for (const id of chosen) await addMembers(id, participantIds)
      onClose()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }
  return (
    <GroupSheet title="¿Incorporarla a algún bote?" onClose={onClose}>
      <p className="muted">
        Los botes que ya existen no cambian solos. Marca en cuáles {participantIds.length === 1 ? 'entra esta persona' : 'entran estas personas'} (se pondrán como «participa»).
      </p>
      {funds.map((f) => (
        <label key={f.id} className="grp-check-row">
          <input type="checkbox" checked={chosen.has(f.id)} onChange={() => toggle(f.id)} />
          <span>{f.name}</span>
        </label>
      ))}
      {problem && <p className="error">{problem}</p>}
      <div className="form-actions">
        <button type="button" className="primary-button" disabled={busy || chosen.size === 0} onClick={() => void apply()}>
          Incorporar
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Ahora no
        </button>
      </div>
    </GroupSheet>
  )
}
