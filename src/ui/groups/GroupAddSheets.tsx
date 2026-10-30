import { useEffect, useState } from 'react'
import { listEvents } from '@/data/events'
import { groupsErrorMessage, linkEventToGroup, linkListToGroup, type LinkedItem } from '@/data/groups'
import { createFund } from '@/data/groupFunds'
import { createList, loadListsOverview } from '@/data/lists'
import { CONTRIBUTION_LABEL, type ContributionType } from '@/domain/groupFunds'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { Field, GroupSheet } from '@/ui/groups/GroupSheet'

type Step = 'menu' | 'fund' | 'event' | 'list'

/** «＋ Añadir»: bote compartido, evento o lista vinculada. Solo se muestra lo que el grupo ya usa en su pantalla; aquí se elige qué añadir. */
export function AddSheet({
  groupId,
  linkedEvents,
  linkedLists,
  onClose,
  onFundCreated,
  onLinked,
  onOpen,
}: {
  groupId: string
  linkedEvents: LinkedItem[]
  linkedLists: LinkedItem[]
  onClose: () => void
  onFundCreated: (fundId: string) => void
  onLinked: () => void
  onOpen: (path: string) => void
}) {
  const [step, setStep] = useState<Step>('menu')
  if (step === 'fund') return <FundCreateSheet groupId={groupId} onClose={onClose} onCreated={onFundCreated} />
  if (step === 'event') return <LinkEventSheet groupId={groupId} already={linkedEvents} onClose={onClose} onLinked={onLinked} onOpen={onOpen} />
  if (step === 'list') return <LinkListSheet groupId={groupId} already={linkedLists} onClose={onClose} onLinked={onLinked} onOpen={onOpen} />
  return (
    <GroupSheet title="Añadir al grupo" onClose={onClose}>
      <div style={{ display: 'grid', gap: 8 }}>
        <button type="button" className="grp-big-button" data-help-id="grupos.anadir-bote" onClick={() => setStep('fund')}>
          <span>💰 Bote compartido</span>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" className="grp-big-button" data-help-id="grupos.anadir-evento" onClick={() => setStep('event')}>
          <span>🎉 Evento</span>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" className="grp-big-button" data-help-id="grupos.anadir-lista" onClick={() => setStep('list')}>
          <span>📝 Lista vinculada</span>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" className="grp-big-button" data-help-id="grupos.anadir-solicitar-datos" onClick={() => (onClose(), onOpen(`/grupos/${groupId}/formularios`))}>
          <span>📋 Solicitar datos</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <p className="muted">El evento y la lista son los de siempre (Eventos y Mis listas): aquí solo se vinculan, no se copian. «Solicitar datos» crea un formulario que las familias responden sin instalar PEPA.</p>
    </GroupSheet>
  )
}

export function FundCreateSheet({ groupId, onClose, onCreated }: { groupId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ContributionType>('igual')
  const [amount, setAmount] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (!name.trim()) return setProblem('Escribe el nombre del bote.')
    const n = Number(amount.replace(',', '.'))
    if (type === 'igual' && (!Number.isFinite(n) || n <= 0)) return setProblem('Indica cuánto aporta cada persona.')
    setBusy(true)
    try {
      const id = await createFund(groupId, name.trim(), type, type === 'igual' ? n : null)
      emitHelpEvent('grupos.fund-created') // el bote YA está guardado
      onCreated(id)
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GroupSheet title="Nuevo bote compartido" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="Nombre del bote">
          <input autoFocus className="grp-input" placeholder="Por ejemplo: Excursión al museo" value={name} onChange={(e) => (setName(e.target.value), setProblem(null))} data-help-id="grupos.bote-nombre" />
        </Field>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          ¿Cómo se aporta?
        </p>
        <div className="grp-chips" role="radiogroup" aria-label="Tipo de aportación" data-help-id="grupos.bote-tipo">
          {(Object.keys(CONTRIBUTION_LABEL) as ContributionType[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} className={'chip' + (type === t ? ' chip-active' : '')} onClick={() => setType(t)}>
              {CONTRIBUTION_LABEL[t]}
            </button>
          ))}
        </div>
        {type === 'igual' && (
          <Field label="Importe por persona (€)">
            <input className="grp-input" inputMode="decimal" placeholder="10" value={amount} onChange={(e) => (setAmount(e.target.value), setProblem(null))} data-help-id="grupos.bote-importe" />
          </Field>
        )}
        {type === 'variable' && <p className="muted">Pondrás el importe de cada persona después, en el propio bote.</p>}
        {type === 'voluntaria' && <p className="muted">Nadie debe una cantidad fija: se va anotando lo que cada cual aporta.</p>}
        <p className="muted">Entran todas las personas del grupo. Después podrás marcar quién no participa o está exento, solo en este bote.</p>
        {problem && <p className="error">{problem}</p>}
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={busy} data-help-id="grupos.bote-crear">
            Crear bote
          </button>
          <button type="button" className="link-button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </GroupSheet>
  )
}

export function LinkEventSheet({ groupId, already, onClose, onLinked, onOpen }: { groupId: string; already: LinkedItem[]; onClose: () => void; onLinked: () => void; onOpen: (path: string) => void }) {
  const [mode, setMode] = useState<'choose' | 'new'>('choose')
  const [events, setEvents] = useState<{ id: string; title: string; date: string | null }[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    listEvents()
      .then((all) => setEvents(all.map((e) => ({ id: e.id, title: e.title, date: e.eventDate }))))
      .catch((e) => setProblem(groupsErrorMessage(e, 'No se han podido cargar los eventos.')))
  }, [])
  const have = new Set(already.map((a) => a.id))

  const link = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      await linkEventToGroup(groupId, id)
      onLinked()
      onClose()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GroupSheet title="Evento del grupo" onClose={onClose}>
      <div className="grp-tabs">
        <button type="button" className={'chip' + (mode === 'choose' ? ' chip-active' : '')} onClick={() => setMode('choose')}>
          Vincular uno existente
        </button>
        <button type="button" className={'chip' + (mode === 'new' ? ' chip-active' : '')} onClick={() => setMode('new')}>
          Crear uno nuevo
        </button>
      </div>
      {mode === 'new' ? (
        <>
          <p className="muted">
            Se abre el formulario completo de «Nuevo evento» de Eventos (nombre, tipo, plantilla y qué quieres organizar). Al guardarlo, el evento queda vinculado a este grupo y podrás volver aquí con «← Volver al grupo».
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="primary-button"
              data-help-id="grupos.evento-nuevo"
              onClick={() => {
                onClose()
                onOpen(`/eventos?nuevo=1&grupo=${groupId}`)
              }}
            >
              Abrir «Nuevo evento»
            </button>
          </div>
        </>
      ) : (
        <>
          {!events && !problem && <p className="muted">Cargando…</p>}
          {events && events.length === 0 && <p className="muted">No hay eventos todavía. Crea uno nuevo.</p>}
          {events?.map((e) => (
            <button key={e.id} type="button" className="grp-row" disabled={have.has(e.id) || busy} onClick={() => void link(e.id)}>
              <span aria-hidden="true">🎉</span>
              <span className="grp-row-main">
                <span className="grp-row-title">{e.title}</span>
                {e.date && <span className="grp-row-sub" style={{ display: 'block' }}>{e.date.split('-').reverse().join('/')}</span>}
              </span>
              {have.has(e.id) && <span className="muted">Ya vinculado</span>}
            </button>
          ))}
          {problem && <p className="error">{problem}</p>}
        </>
      )}
    </GroupSheet>
  )
}

export function LinkListSheet({ groupId, already, onClose, onLinked, onOpen }: { groupId: string; already: LinkedItem[]; onClose: () => void; onLinked: () => void; onOpen: (path: string) => void }) {
  const [mode, setMode] = useState<'choose' | 'new'>('choose')
  const [lists, setLists] = useState<{ id: string; title: string }[] | null>(null)
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    loadListsOverview()
      .then((o) => setLists(o.lists.filter((l) => !l.archivedAt).map((l) => ({ id: l.id, title: l.title }))))
      .catch((e) => setProblem(groupsErrorMessage(e, 'No se han podido cargar las listas.')))
  }, [])
  const have = new Set(already.map((a) => a.id))

  const link = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      await linkListToGroup(groupId, id)
      onLinked()
      onClose()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const createNew = async () => {
    if (busy) return
    if (!title.trim()) return setProblem('Escribe el título de la lista.')
    setBusy(true)
    try {
      const l = await createList({ title: title.trim(), kind: 'tareas' })
      await linkListToGroup(groupId, l.id)
      onLinked()
      onClose()
      onOpen(`/listas/${l.id}`)
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GroupSheet title="Lista del grupo" onClose={onClose}>
      <div className="grp-tabs">
        <button type="button" className={'chip' + (mode === 'choose' ? ' chip-active' : '')} onClick={() => setMode('choose')}>
          Vincular una existente
        </button>
        <button type="button" className={'chip' + (mode === 'new' ? ' chip-active' : '')} onClick={() => setMode('new')}>
          Crear una nueva
        </button>
      </div>
      {mode === 'new' ? (
        <>
          <Field label="Título de la lista" hint="Se crea en Mis listas (privada: solo tú la ves hasta que la compartas con la familia).">
            <input autoFocus className="grp-input" placeholder="Por ejemplo: Material a traer" value={title} onChange={(e) => (setTitle(e.target.value), setProblem(null))} />
          </Field>
          {problem && <p className="error">{problem}</p>}
          <div className="form-actions">
            <button type="button" className="primary-button" disabled={busy} onClick={() => void createNew()}>
              Crear y vincular
            </button>
          </div>
        </>
      ) : (
        <>
          {!lists && !problem && <p className="muted">Cargando…</p>}
          {lists && lists.length === 0 && <p className="muted">No tienes listas todavía. Crea una nueva.</p>}
          {lists?.map((l) => (
            <button key={l.id} type="button" className="grp-row" disabled={have.has(l.id) || busy} onClick={() => void link(l.id)}>
              <span aria-hidden="true">📝</span>
              <span className="grp-row-main">
                <span className="grp-row-title">{l.title}</span>
              </span>
              {have.has(l.id) && <span className="muted">Ya vinculada</span>}
            </button>
          ))}
          {problem && <p className="error">{problem}</p>}
        </>
      )}
    </GroupSheet>
  )
}
