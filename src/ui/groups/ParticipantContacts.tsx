import { useEffect, useMemo, useState } from 'react'
import { addContactReturningId, listContacts } from '@/data/contacts'
import { linkContactToParticipant, unlinkContactFromParticipant } from '@/data/groupContacts'
import { groupsErrorMessage } from '@/data/groups'
import { findContactCandidates, RELATIONS, RELATION_LABEL, type Relation } from '@/domain/contactsModel'
import type { LinkedContactRow } from '@/domain/contactShare'
import { foldText, type Participant } from '@/domain/groups'
import type { Contact } from '@/domain/types'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { Field, GroupSheet } from '@/ui/groups/GroupSheet'

const contactTitle = (c: { name: string; surname?: string | null }) => [c.name, c.surname].filter(Boolean).join(' ')

/** Contactos familiares de una persona del grupo: se consultan sus teléfonos y correos, se vinculan, se crean sin salir del grupo y se desvinculan. Los datos personales viven en la agenda. */
export function LinkedContactsSection({ participant, links, readOnly, onChanged }: { participant: Participant; links: LinkedContactRow[]; readOnly: boolean; onChanged: () => void }) {
  const mine = links.filter((l) => l.participantId === participant.id)
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <div data-help-id="grupos.contactos-familiares" style={{ marginTop: 14 }}>
      <p className="grp-section">Contactos familiares</p>
      {mine.length === 0 && <p className="muted">Todavía no hay ningún contacto vinculado. {readOnly ? '' : 'Vincula a la madre, el padre o el tutor desde tu agenda, o créalo aquí mismo.'}</p>}
      {mine.map((l) => (
        <div key={l.contactId} className="grp-card" style={{ marginBottom: 8 }}>
          <strong>{contactTitle(l)}</strong> <span className="muted">· {RELATION_LABEL[l.relation]}</span>
          <div className="muted" style={{ wordBreak: 'break-word' }}>
            {[l.phone, ...l.extraPhones].filter(Boolean).map((p) => (
              <div key={p}>
                📞 <a href={`tel:${p}`}>{p}</a>
              </div>
            ))}
            {[l.email, ...l.extraEmails].filter(Boolean).map((m) => (
              <div key={m}>✉️ {m}</div>
            ))}
            {!l.phone && !l.email && l.extraPhones.length === 0 && l.extraEmails.length === 0 && <div>Sin teléfono ni correo en la agenda.</div>}
          </div>
          {!readOnly && (
            <ConfirmButton
              label="Desvincular"
              confirmMessage="Solo se quita el vínculo con esta persona; el contacto sigue en tu agenda."
              onConfirm={() => {
                void unlinkContactFromParticipant(participant.id, l.contactId)
                  .then(onChanged)
                  .catch((e) => setProblem(groupsErrorMessage(e)))
              }}
            />
          )}
        </div>
      ))}
      {!readOnly && (
        <button type="button" className="link-button" data-help-id="grupos.vincular-contacto" onClick={() => setAdding(true)}>
          ＋ Vincular o crear un contacto
        </button>
      )}
      {problem && <p className="error">{problem}</p>}
      {adding && (
        <LinkContactSheet
          participant={participant}
          alreadyIds={new Set(mine.map((l) => l.contactId))}
          onClose={() => setAdding(false)}
          onLinked={() => {
            setAdding(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function RelationChips({ value, onChange }: { value: Relation; onChange: (r: Relation) => void }) {
  return (
    <div className="grp-chips" role="radiogroup" aria-label="Relación con la persona">
      {RELATIONS.map((r) => (
        <button key={r} type="button" role="radio" aria-checked={value === r} className={'chip' + (value === r ? ' chip-active' : '')} onClick={() => onChange(r)}>
          {RELATION_LABEL[r]}
        </button>
      ))}
    </div>
  )
}

export function LinkContactSheet({ participant, alreadyIds, onClose, onLinked }: { participant: Participant; alreadyIds: Set<string>; onClose: () => void; onLinked: () => void }) {
  const [tab, setTab] = useState<'buscar' | 'nuevo'>('buscar')
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [query, setQuery] = useState('')
  const [relation, setRelation] = useState<Relation>('madre')
  const [f, setF] = useState({ name: participant.guardianName ?? '', surname: '', phone: participant.phone ?? '', email: participant.email ?? '' })
  const [confirmDup, setConfirmDup] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    listContacts()
      .then(setContacts)
      .catch((e) => setProblem(groupsErrorMessage(e, 'No se ha podido cargar tu agenda.')))
  }, [])

  const shown = useMemo(() => {
    const q = foldText(query)
    return (contacts ?? []).filter((c) => !alreadyIds.has(c.id) && (!q || foldText([c.name, c.surname, c.phone, c.email].filter(Boolean).join(' ')).includes(q))).slice(0, 60)
  }, [contacts, query, alreadyIds])
  const duplicates = useMemo(() => (contacts ?? []).length ? findContactCandidates(contacts ?? [], { name: [f.name, f.surname].filter(Boolean).join(' '), phone: f.phone, email: f.email }).filter((c) => c.by !== 'nombre' && !alreadyIds.has(c.contact.id)) : [], [contacts, f, alreadyIds])

  const link = async (contactId: string) => {
    if (busy) return
    setBusy(true)
    try {
      await linkContactToParticipant(participant.id, contactId, relation)
      emitHelpEvent('grupos.contact-linked') // el vínculo YA está guardado
      onLinked()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }
  const create = async () => {
    if (busy) return
    if (!f.name.trim()) return setProblem('Escribe el nombre del contacto.')
    if (duplicates.length > 0 && !confirmDup) return setConfirmDup(true)
    setBusy(true)
    try {
      const id = await addContactReturningId({
        name: f.name.trim(),
        surname: f.surname.trim() || null,
        category: 'Colegio',
        phone: f.phone.trim(),
        email: f.email.trim(),
        notes: '',
        source: { kind: 'grupo', at: new Date().toISOString() },
      })
      await linkContactToParticipant(participant.id, id, relation)
      emitHelpEvent('grupos.contact-linked')
      onLinked()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <GroupSheet title="Contacto familiar" onClose={onClose}>
      <p className="muted">
        Para <strong>{participant.name}</strong>. Los datos personales (teléfono, correo…) se guardan en tu agenda de Contactos; aquí solo se vincula.
      </p>
      <p className="grp-section" style={{ marginTop: 0 }}>Relación</p>
      <RelationChips value={relation} onChange={setRelation} />
      <div className="grp-tabs">
        <button type="button" className={'chip' + (tab === 'buscar' ? ' chip-active' : '')} onClick={() => setTab('buscar')}>
          Buscar en mi agenda
        </button>
        <button type="button" className={'chip' + (tab === 'nuevo' ? ' chip-active' : '')} onClick={() => setTab('nuevo')}>
          Crear contacto nuevo
        </button>
      </div>
      {tab === 'buscar' ? (
        <>
          <input className="grp-input" type="search" placeholder="Buscar por nombre, teléfono o correo" aria-label="Buscar un contacto" value={query} onChange={(e) => setQuery(e.target.value)} />
          {!contacts && !problem && <p className="muted">Cargando…</p>}
          {contacts && shown.length === 0 && <p className="muted">No hay contactos que coincidan. Puedes crear uno nuevo.</p>}
          {shown.map((c) => (
            <button key={c.id} type="button" className="grp-row" disabled={busy} onClick={() => void link(c.id)}>
              <span aria-hidden="true">👤</span>
              <span className="grp-row-main">
                <span className="grp-row-title">{contactTitle(c)}</span>
                <span className="grp-row-sub" style={{ display: 'block', wordBreak: 'break-word' }}>
                  {[c.phone, c.email].filter(Boolean).join(' · ') || 'Sin teléfono ni correo'}
                </span>
              </span>
            </button>
          ))}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <Field label="Nombre">
            <input className="grp-input" autoFocus value={f.name} onChange={(e) => (setF({ ...f, name: e.target.value }), setConfirmDup(false), setProblem(null))} />
          </Field>
          <Field label="Apellidos (opcional)">
            <input className="grp-input" value={f.surname} onChange={(e) => setF({ ...f, surname: e.target.value })} />
          </Field>
          <Field label="Teléfono (opcional)">
            <input className="grp-input" inputMode="tel" value={f.phone} onChange={(e) => (setF({ ...f, phone: e.target.value }), setConfirmDup(false))} />
          </Field>
          <Field label="Correo (opcional)">
            <input className="grp-input" inputMode="email" value={f.email} onChange={(e) => (setF({ ...f, email: e.target.value }), setConfirmDup(false))} />
          </Field>
          {duplicates.length > 0 && (
            <div className="grp-banner">
              <p style={{ margin: '0 0 6px' }}>Ya tienes en tu agenda a alguien con ese {duplicates[0].by === 'telefono' ? 'teléfono' : 'correo'}:</p>
              {duplicates.slice(0, 3).map((d) => (
                <button key={d.contact.id} type="button" className="chip" disabled={busy} onClick={() => void link(d.contact.id)}>
                  Vincular a {contactTitle(d.contact)}
                </button>
              ))}
              {confirmDup && <p className="muted" style={{ margin: '6px 0 0' }}>Si es otra persona distinta, pulsa de nuevo «Crear contacto».</p>}
            </div>
          )}
          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={busy} data-help-id="grupos.contacto-crear">
              Crear contacto y vincular
            </button>
          </div>
        </form>
      )}
      {problem && <p className="error">{problem}</p>}
    </GroupSheet>
  )
}
