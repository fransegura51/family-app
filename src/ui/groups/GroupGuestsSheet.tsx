import { useEffect, useMemo, useState } from 'react'
import { applyGuestUpdates, importGroupGuests, listGuestOrigins } from '@/data/groupGuests'
import { groupsErrorMessage, linkEventToGroup, listParticipants, loadGroupsHome } from '@/data/groups'
import { activeParticipants, diffGroupGuests, groupTitle, participantName, type GroupItem, type GuestDiff, type Participant } from '@/domain/groups'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { GroupSheet } from '@/ui/groups/GroupSheet'

/**
 * Eventos → Invitados → «Desde un grupo»: elegir participantes de uno o varios grupos propios para preparar las invitaciones, y «Actualizar invitados» (manual) cuando el grupo
 * cambia. El evento sigue siendo el de Eventos; aquí solo se crean sus invitados, con el origen guardado. No se copia ningún teléfono ni correo.
 */
export function GroupGuestsSheet({ eventId, onClose, onChanged }: { eventId: string; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<'importar' | 'actualizar'>('importar')
  const [groups, setGroups] = useState<GroupItem[] | null>(null)
  const [peopleByGroup, setPeopleByGroup] = useState<Record<string, Participant[]>>({})
  const [chosenGroups, setChosenGroups] = useState<Set<string>>(new Set())
  const [skip, setSkip] = useState<Set<string>>(new Set()) // participantes desmarcados
  const [origins, setOrigins] = useState<{ guestId: string; displayName: string; participantId: string; groupId: string | null }[]>([])
  const [linkGroups, setLinkGroups] = useState(true)
  const [diffs, setDiffs] = useState<GuestDiff | null>(null)
  const [diffChoice, setDiffChoice] = useState<{ add: Set<string>; rename: Set<string>; remove: Set<string> }>({ add: new Set(), rename: new Set(), remove: new Set() })
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([loadGroupsHome(), listGuestOrigins(eventId)])
      .then(([home, o]) => {
        setGroups(home.groups.filter((g) => !g.archivedAt))
        setOrigins(o)
      })
      .catch((e) => setProblem(groupsErrorMessage(e)))
  }, [eventId])

  const loadPeople = async (groupId: string) => {
    if (peopleByGroup[groupId]) return
    try {
      const p = await listParticipants(groupId)
      setPeopleByGroup((prev) => ({ ...prev, [groupId]: p }))
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    }
  }
  const toggleGroup = (id: string) => {
    setChosenGroups((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else {
        next.add(id)
        void loadPeople(id)
      }
      return next
    })
  }
  const already = useMemo(() => new Set(origins.map((o) => o.participantId)), [origins])

  const candidates = useMemo(() => {
    const out: { p: Participant; group: GroupItem }[] = []
    for (const g of groups ?? []) {
      if (!chosenGroups.has(g.id)) continue
      for (const p of activeParticipants(peopleByGroup[g.id] ?? [])) if (!already.has(p.id)) out.push({ p, group: g })
    }
    return out
  }, [groups, chosenGroups, peopleByGroup, already])
  const selected = candidates.filter((c) => !skip.has(c.p.id))

  const doImport = async () => {
    if (busy || selected.length === 0) return
    setBusy(true)
    try {
      await importGroupGuests(
        eventId,
        selected.map((c) => ({ participantId: c.p.id, groupId: c.group.id, name: participantName(c.p) })),
      )
      if (linkGroups) for (const gid of new Set(selected.map((c) => c.group.id))) await linkEventToGroup(gid, eventId).catch(() => undefined)
      emitHelpEvent('grupos.guests-imported')
      onChanged()
      onClose()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------------------------------------- actualizar
  const checkUpdates = async () => {
    setBusy(true)
    setProblem(null)
    try {
      const gids = [...new Set(origins.map((o) => o.groupId).filter((x): x is string => !!x))]
      const all: Participant[] = []
      for (const gid of gids) all.push(...(await listParticipants(gid)))
      const d = diffGroupGuests(origins, all)
      setDiffs(d)
      setDiffChoice({ add: new Set(d.toAdd.map((p) => p.id)), rename: new Set(d.toRename.map((r) => r.guestId)), remove: new Set() })
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const applyUpdates = async () => {
    if (!diffs || busy) return
    setBusy(true)
    try {
      await applyGuestUpdates(eventId, {
        add: diffs.toAdd.filter((p) => diffChoice.add.has(p.id)).map((p) => ({ participantId: p.id, groupId: p.groupId, name: participantName(p) })),
        rename: diffs.toRename.filter((r) => diffChoice.rename.has(r.guestId)).map((r) => ({ guestId: r.guestId, name: r.to })),
        remove: diffs.toRemove.filter((r) => diffChoice.remove.has(r.guestId)).map((r) => r.guestId),
      })
      onChanged()
      onClose()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }
  const flip = (k: 'add' | 'rename' | 'remove', id: string) =>
    setDiffChoice((c) => {
      const s = new Set(c[k])
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return { ...c, [k]: s }
    })

  return (
    <GroupSheet title="Invitados desde un grupo" onClose={onClose} wide>
      <div className="grp-tabs">
        <button type="button" className={'chip' + (tab === 'importar' ? ' chip-active' : '')} onClick={() => setTab('importar')}>
          Añadir de un grupo
        </button>
        {origins.length > 0 && (
          <button type="button" className={'chip' + (tab === 'actualizar' ? ' chip-active' : '')} onClick={() => setTab('actualizar')} data-help-id="grupos.actualizar-invitados">
            Actualizar invitados
          </button>
        )}
      </div>

      {tab === 'importar' && (
        <>
          <p className="muted">Cada participante se añade como un invitado (un menor). No se copian teléfonos ni correos, y las invitaciones ya enviadas no cambian.</p>
          {!groups && !problem && <p className="muted">Cargando…</p>}
          {groups?.length === 0 && <p className="muted">No tienes grupos. Créalos en Gestión de grupos.</p>}
          <div className="grp-chips">
            {groups?.map((g) => (
              <button key={g.id} type="button" className={'chip' + (chosenGroups.has(g.id) ? ' chip-active' : '')} aria-pressed={chosenGroups.has(g.id)} onClick={() => toggleGroup(g.id)}>
                👥 {groupTitle(g)}
              </button>
            ))}
          </div>
          {chosenGroups.size > 0 && (
            <>
              {candidates.length === 0 && <p className="muted">No hay personas nuevas que añadir de esos grupos.</p>}
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e3e6ee', borderRadius: 10, padding: '2px 8px' }}>
                {candidates.map(({ p, group }) => (
                  <label key={p.id} className="grp-check-row">
                    <input
                      type="checkbox"
                      checked={!skip.has(p.id)}
                      onChange={() =>
                        setSkip((s) => {
                          const n = new Set(s)
                          if (n.has(p.id)) n.delete(p.id)
                          else n.add(p.id)
                          return n
                        })
                      }
                    />
                    <span>
                      {participantName(p)}
                      {chosenGroups.size > 1 && <small className="muted"> · {group.name}</small>}
                    </span>
                  </label>
                ))}
              </div>
              <label className="grp-check-row">
                <input type="checkbox" checked={linkGroups} onChange={(e) => setLinkGroups(e.target.checked)} />
                <span>Vincular también este evento a esos grupos</span>
              </label>
            </>
          )}
          {problem && <p className="error">{problem}</p>}
          <div className="form-actions">
            <button type="button" className="primary-button" disabled={busy || selected.length === 0} onClick={() => void doImport()} data-help-id="grupos.invitados-importar">
              Añadir {selected.length > 0 ? `${selected.length} ` : ''}invitados
            </button>
            <button type="button" className="link-button" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </>
      )}

      {tab === 'actualizar' && (
        <>
          <p className="muted">Compara los invitados que vinieron de grupos con cómo están ahora esos grupos. Tú decides qué aplicar; no se toca nada solo.</p>
          {!diffs && (
            <div className="form-actions">
              <button type="button" className="primary-button" disabled={busy} onClick={() => void checkUpdates()}>
                Buscar cambios
              </button>
            </div>
          )}
          {diffs && diffs.toAdd.length + diffs.toRename.length + diffs.toRemove.length === 0 && <p>Todo está al día. No hay cambios.</p>}
          {diffs && diffs.toAdd.length > 0 && (
            <>
              <p className="grp-section">Personas nuevas en el grupo</p>
              {diffs.toAdd.map((p) => (
                <label key={p.id} className="grp-check-row">
                  <input type="checkbox" checked={diffChoice.add.has(p.id)} onChange={() => flip('add', p.id)} />
                  <span>Añadir a {participantName(p)}</span>
                </label>
              ))}
            </>
          )}
          {diffs && diffs.toRename.length > 0 && (
            <>
              <p className="grp-section">Nombres cambiados</p>
              {diffs.toRename.map((r) => (
                <label key={r.guestId} className="grp-check-row">
                  <input type="checkbox" checked={diffChoice.rename.has(r.guestId)} onChange={() => flip('rename', r.guestId)} />
                  <span>
                    «{r.from}» → «{r.to}»
                  </span>
                </label>
              ))}
            </>
          )}
          {diffs && diffs.toRemove.length > 0 && (
            <>
              <p className="grp-section">Ya no están en el grupo</p>
              {diffs.toRemove.map((r) => (
                <label key={r.guestId} className="grp-check-row">
                  <input type="checkbox" checked={diffChoice.remove.has(r.guestId)} onChange={() => flip('remove', r.guestId)} />
                  <span>Quitar a {r.name} de los invitados</span>
                </label>
              ))}
              <p className="muted">Quitarlo borra a ese invitado y su respuesta. Por eso viene sin marcar.</p>
            </>
          )}
          {problem && <p className="error">{problem}</p>}
          {diffs && diffs.toAdd.length + diffs.toRename.length + diffs.toRemove.length > 0 && (
            <div className="form-actions">
              <button type="button" className="primary-button" disabled={busy} onClick={() => void applyUpdates()}>
                Aplicar lo marcado
              </button>
              <button type="button" className="link-button" onClick={onClose}>
                Cancelar
              </button>
            </div>
          )}
        </>
      )}
    </GroupSheet>
  )
}
