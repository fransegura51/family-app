import { useMemo, useState } from 'react'
import { addContactReturningId, listContacts } from '@/data/contacts'
import { resolvePending, type PendingContact, linkContactToParticipant } from '@/data/groupContacts'
import { groupsErrorMessage, updateGroup, updateParticipant } from '@/data/groups'
import { RELATIONS, RELATION_LABEL, type Relation } from '@/domain/contactsModel'
import {
  buildContactEntries,
  cleanPresets,
  DEFAULT_SHARE_FIELDS,
  emailsOnly,
  renderContactShare,
  SHARE_FIELDS,
  SHARE_FIELD_LABEL,
  toCsv,
  toWhatsAppText,
  type LinkedContactRow,
  type ShareField,
  type SharePreset,
} from '@/domain/contactShare'
import { displayNames, NAME_FORMATS, NAME_FORMAT_LABEL, SORT_LABEL, type NameFormat, type NamePrefs, type SortBy } from '@/domain/groupNames'
import { activeParticipants, groupTitle, participantName, type GroupItem, type Participant } from '@/domain/groups'
import { findNameFixes } from '@/domain/participantImport'
import type { Contact } from '@/domain/types'
import { writePdf, writeXlsx } from '@/domain/tableFiles'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { deliverBinaryFile, downloadTextFile } from '@/services/exportFile'
import { shareText } from '@/services/share'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { GroupSheet } from '@/ui/groups/GroupSheet'

// ------------------------------------------------------------------------------------------------------------- formato de nombres del grupo
/** Cómo se muestran los participantes en listas, pagados y pendientes, y cómo se ordenan. Se guarda en el grupo; cada envío puede cambiarlo sin tocarlo. */
export function NameFormatSheet({ group, participants, onClose, onSaved }: { group: GroupItem; participants: Participant[]; onClose: () => void; onSaved: () => void }) {
  const [format, setFormat] = useState<NameFormat>(group.nameFormat)
  const [sortBy, setSortBy] = useState<SortBy>(group.sortBy)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const live = useMemo(() => activeParticipants(participants), [participants])
  const preview = useMemo(() => {
    const names = displayNames(live, format)
    const sorted = [...live].sort((a, b) => {
      const k = (p: Participant) => (sortBy === 'surname' ? [p.surname, p.name] : [p.name, p.surname]).filter(Boolean).join(' ')
      return k(a).localeCompare(k(b), 'es')
    })
    return sorted.slice(0, 6).map((p) => names.get(p.id) ?? p.name)
  }, [live, format, sortBy])
  const save = async () => {
    setBusy(true)
    try {
      await updateGroup(group.id, { nameFormat: format, sortBy })
      emitHelpEvent('grupos.name-format-saved') // el formato YA está guardado
      onSaved()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }
  return (
    <GroupSheet title="Cómo se muestran los nombres" onClose={onClose}>
      <p className="muted">Se aplica a las listas de participantes, de pagados y de pendientes de este grupo. En cada envío podrás cambiarlo sin tocar esto.</p>
      <div role="radiogroup" aria-label="Formato de los nombres" style={{ display: 'grid', gap: 6 }} data-help-id="grupos.formato-nombres">
        {NAME_FORMATS.map((f) => (
          <label key={f} className="grp-check-row">
            <input type="radio" name="nf" checked={format === f} onChange={() => setFormat(f)} />
            <span>{NAME_FORMAT_LABEL[f]}</span>
          </label>
        ))}
      </div>
      <p className="grp-section">Ordenar</p>
      <div className="grp-chips" role="radiogroup" aria-label="Orden de la lista">
        {(Object.keys(SORT_LABEL) as SortBy[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={sortBy === s} className={'chip' + (sortBy === s ? ' chip-active' : '')} onClick={() => setSortBy(s)}>
            {SORT_LABEL[s]}
          </button>
        ))}
      </div>
      {preview.length > 0 && (
        <div className="grp-card" style={{ marginTop: 10 }}>
          <p className="muted" style={{ margin: '0 0 4px' }}>Así quedaría:</p>
          {preview.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
      )}
      {problem && <p className="error">{problem}</p>}
      <div className="form-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>
          Guardar
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </GroupSheet>
  )
}

// ------------------------------------------------------------------------------------------------------------- corregir nombres ya importados
export function NameFixSheet({ participants, onClose, onDone }: { participants: Participant[]; onClose: () => void; onDone: () => void }) {
  const fixes = useMemo(() => findNameFixes(participants), [participants])
  const [chosen, setChosen] = useState<Set<string>>(new Set(fixes.filter((f) => f.confidence === 'seguro').map((f) => f.participantId)))
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toggle = (id: string) => setChosen((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)))
  const apply = async () => {
    setBusy(true)
    try {
      // Solo se tocan nombre, apellidos y madre/padre de la MISMA ficha: no se duplica nada ni se pierde ningún vínculo, bote o contacto.
      for (const f of fixes.filter((x) => chosen.has(x.participantId))) await updateParticipant(f.participantId, { name: f.to.name, surname: f.to.surname, guardianName: f.to.guardianName })
      onDone()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }
  return (
    <GroupSheet title="Revisar nombres y apellidos" onClose={onClose} wide>
      {fixes.length === 0 ? (
        <p>No veo nada que corregir: ninguna ficha tiene los apellidos dentro del nombre.</p>
      ) : (
        <>
          <p className="muted">
            Estas fichas parecen tener los apellidos en el campo del nombre. La corrección solo cambia esos campos de la misma ficha: no se duplica nadie ni se pierden pagos, botes o contactos vinculados. Las dudosas vienen sin marcar.
          </p>
          {fixes.map((f) => (
            <label key={f.participantId} className="grp-check-row" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={chosen.has(f.participantId)} onChange={() => toggle(f.participantId)} />
              <span>
                {f.reason}
                <small className="muted" style={{ display: 'block' }}>
                  Quedaría: nombre «{f.to.name}», apellidos «{f.to.surname}»{f.to.guardianName ? `, madre/padre «${f.to.guardianName}»` : f.from.guardianName ? ', sin madre/padre' : ''}
                  {f.confidence === 'dudoso' ? ' (dudoso: compruébalo)' : ''}
                </small>
              </span>
            </label>
          ))}
          {problem && <p className="error">{problem}</p>}
          <div className="form-actions">
            <button type="button" className="primary-button" disabled={busy || chosen.size === 0} onClick={() => void apply()}>
              Corregir {chosen.size} {chosen.size === 1 ? 'ficha' : 'fichas'}
            </button>
            <button type="button" className="link-button" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </GroupSheet>
  )
}

// ------------------------------------------------------------------------------------------------------------- compartir lista de contactos
type Out = { kind: 'texto' | 'emails'; text: string } | null

/**
 * «Compartir lista de contactos»: eliges personas y contactos, los campos y el formato; hay vista previa; nunca se crea un enlace público ni se incluyen notas ni datos delicados.
 * Texto para WhatsApp, copiar, solo correos, CSV, Excel o PDF. Las configuraciones se pueden guardar y reutilizar.
 */
export function ShareContactsSheet({ group, participants, links, onClose, onPresetsChanged }: { group: GroupItem; participants: Participant[]; links: LinkedContactRow[]; onClose: () => void; onPresetsChanged: () => void }) {
  const people = useMemo(() => activeParticipants(participants), [participants])
  const entries = useMemo(() => buildContactEntries(people, links), [people, links])
  const [fields, setFields] = useState<ShareField[]>(DEFAULT_SHARE_FIELDS)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [skipEmpty, setSkipEmpty] = useState(true)
  const [dedupe, setDedupe] = useState(true)
  const [format, setFormat] = useState<NameFormat>(group.nameFormat)
  const [showWho, setShowWho] = useState(false)
  const [presets, setPresets] = useState<SharePreset[]>(() => cleanPresets(group.contactSharePresets))
  const [presetName, setPresetName] = useState('')
  const [out, setOut] = useState<Out>(null)
  const [note, setNote] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const names: NamePrefs = { format, sortBy: group.sortBy }
  const cfg = { fields, excluded: [...excluded], skipEmpty, dedupe, names }
  const rendered = useMemo(() => renderContactShare(entries, cfg), [entries, fields, excluded, skipEmpty, dedupe, format, group.sortBy]) // eslint-disable-line react-hooks/exhaustive-deps
  const title = `Contactos · ${groupTitle(group)}`
  const stem = `contactos-${groupTitle(group).toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, '-').replace(/^-|-$/g, '')}`

  const toggleField = (f: ShareField) => setFields((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))
  const toggleRow = (key: string) => setExcluded((s) => (s.has(key) ? new Set([...s].filter((x) => x !== key)) : new Set(s).add(key)))
  const byStudent = useMemo(() => {
    const m = new Map<string, typeof entries>()
    for (const e of entries) m.set(e.participant.id, [...(m.get(e.participant.id) ?? []), e])
    return [...m.values()]
  }, [entries])

  const run = async (fn: () => Promise<void>) => {
    try {
      setProblem(null)
      await fn()
    } catch (e) {
      setProblem(groupsErrorMessage(e, 'No se ha podido completar la acción.'))
    }
  }
  const needFields = () => {
    if (fields.length === 0) {
      setProblem('Marca al menos un campo para compartir.')
      return false
    }
    if (rendered.rows.length === 0) {
      setProblem('No queda ninguna fila para compartir con esos ajustes.')
      return false
    }
    return true
  }

  const shareWhatsapp = () =>
    run(async () => {
      if (!needFields()) return
      const text = toWhatsAppText(title, rendered, fields)
      emitHelpEvent('grupos.contacts-shared')
      const native = await shareText({ title, text }).catch(() => null)
      if (native === null) setOut({ kind: 'texto', text })
      else setNote(native ? null : 'Copiado al portapapeles. Pégalo en el chat.')
    })
  const copyList = () =>
    run(async () => {
      if (!needFields()) return
      const text = toWhatsAppText(title, rendered, fields)
      try {
        await navigator.clipboard.writeText(text)
        setNote('Lista copiada.')
      } catch {
        setOut({ kind: 'texto', text })
      }
    })
  const copyEmails = () =>
    run(async () => {
      const list = emailsOnly(entries, [...excluded])
      if (list.length === 0) return setProblem('Ninguno de los contactos marcados tiene correo.')
      const text = list.join('; ')
      try {
        await navigator.clipboard.writeText(text)
        setNote(`${list.length} ${list.length === 1 ? 'correo copiado' : 'correos copiados'}.`)
      } catch {
        setOut({ kind: 'emails', text })
      }
    })
  const csv = () =>
    run(async () => {
      if (!needFields()) return
      downloadTextFile(`${stem}.csv`, toCsv(rendered), 'text/csv;charset=utf-8')
      setNote('CSV preparado.')
    })
  const xlsx = () =>
    run(async () => {
      if (!needFields()) return
      const how = await deliverBinaryFile(`${stem}.xlsx`, writeXlsx('Contactos', [rendered.headers, ...rendered.rows]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      setNote(how === 'compartido' ? null : 'Excel descargado.')
    })
  const pdf = () =>
    run(async () => {
      if (!needFields()) return
      const how = await deliverBinaryFile(`${stem}.pdf`, writePdf(title, [rendered.headers, ...rendered.rows]), 'application/pdf')
      setNote(how === 'compartido' ? null : 'PDF descargado.')
    })

  const savePreset = () =>
    run(async () => {
      const name = presetName.trim()
      if (!name) return setProblem('Ponle un nombre a la configuración.')
      if (fields.length === 0) return setProblem('Marca al menos un campo antes de guardarla.')
      const next = [...presets.filter((p) => p.name.toLowerCase() !== name.toLowerCase()), { id: crypto.randomUUID(), name, fields, skipEmpty, dedupe }].slice(-20)
      await updateGroup(group.id, { contactSharePresets: next })
      setPresets(next)
      setPresetName('')
      onPresetsChanged()
    })
  const dropPreset = (id: string) =>
    run(async () => {
      const next = presets.filter((p) => p.id !== id)
      await updateGroup(group.id, { contactSharePresets: next })
      setPresets(next)
      onPresetsChanged()
    })

  return (
    <GroupSheet title="Compartir lista de contactos" onClose={onClose} wide>
      <p className="muted">
        Solo se comparten los campos que marques. Nunca se incluyen notas, alias de pago ni datos delicados, y no se crea ningún enlace público: lo envías tú.
      </p>

      {presets.length > 0 && (
        <>
          <p className="grp-section">Mis configuraciones</p>
          <div className="grp-chips">
            {presets.map((p) => (
              <span key={p.id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    setFields(p.fields)
                    setSkipEmpty(p.skipEmpty)
                    setDedupe(p.dedupe)
                  }}
                >
                  {p.name}
                </button>
                <ConfirmButton label="✕" confirmMessage="¿Borrar esta configuración?" onConfirm={() => void dropPreset(p.id)} />
              </span>
            ))}
          </div>
        </>
      )}

      <p className="grp-section">Campos</p>
      <div data-help-id="grupos.contactos-campos">
        {SHARE_FIELDS.map((f) => (
          <label key={f} className="grp-check-row">
            <input type="checkbox" checked={fields.includes(f)} onChange={() => toggleField(f)} />
            <span>{SHARE_FIELD_LABEL[f]}</span>
          </label>
        ))}
      </div>
      <label className="grp-check-row">
        <input type="checkbox" checked={skipEmpty} onChange={(e) => setSkipEmpty(e.target.checked)} />
        <span>Quitar a quien no tiene ningún dato de contacto</span>
      </label>
      <label className="grp-check-row">
        <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
        <span>Quitar filas repetidas</span>
      </label>
      <label className="grp-field">
        <span>Cómo salen los nombres de los alumnos</span>
        <select className="grp-input" value={format} onChange={(e) => setFormat(e.target.value as NameFormat)}>
          {NAME_FORMATS.map((f) => (
            <option key={f} value={f}>
              {NAME_FORMAT_LABEL[f]}
              {f === group.nameFormat ? ' (el del grupo)' : ''}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="link-button" aria-expanded={showWho} onClick={() => setShowWho((v) => !v)} data-help-id="grupos.contactos-quien">
        {showWho ? 'Ocultar' : 'Elegir'} a quién incluir ({entries.length - excluded.size} de {entries.length})
      </button>
      {showWho && (
        <div className="grp-card">
          <div className="form-actions" style={{ marginTop: 0 }}>
            <button type="button" className="link-button" onClick={() => setExcluded(new Set())}>
              Marcar todos
            </button>
            <button type="button" className="link-button" onClick={() => setExcluded(new Set(entries.map((e) => e.key)))}>
              Quitar todos
            </button>
          </div>
          {byStudent.map((list) => (
            <div key={list[0].participant.id} style={{ marginBottom: 6 }}>
              <strong>{participantName(list[0].participant)}</strong>
              {list.map((e) => (
                <label key={e.key} className="grp-check-row">
                  <input type="checkbox" checked={!excluded.has(e.key)} onChange={() => toggleRow(e.key)} />
                  <span style={{ wordBreak: 'break-word' }}>
                    {e.guardian ? `${e.guardian}${e.relation ? ` (${e.relation.toLowerCase()})` : ''}` : 'Sin contacto vinculado'}
                    {[e.phone, e.email].filter(Boolean).length > 0 && <small className="muted"> · {[e.phone, e.email].filter(Boolean).join(' · ')}</small>}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      <p className="grp-section">Vista previa</p>
      <div className="grp-card" data-help-id="grupos.contactos-vista-previa" style={{ maxHeight: 220, overflow: 'auto' }}>
        {rendered.rows.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nada que enseñar con estos ajustes.</p>
        ) : (
          <pre className="grp-pre" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {toWhatsAppText(title, rendered, fields)}
          </pre>
        )}
      </div>
      <p className="muted">
        {rendered.rows.length} {rendered.rows.length === 1 ? 'fila' : 'filas'}
        {rendered.skippedEmpty > 0 ? ` · ${rendered.skippedEmpty} sin datos de contacto quitadas` : ''}
        {rendered.skippedDuplicates > 0 ? ` · ${rendered.skippedDuplicates} repetidas quitadas` : ''}
      </p>

      <div className="form-actions" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="primary-button" data-help-id="grupos.contactos-whatsapp" onClick={() => void shareWhatsapp()}>
          Texto para WhatsApp
        </button>
        <button type="button" className="grp-secondary" onClick={() => void copyList()}>
          Copiar lista
        </button>
        <button type="button" className="grp-secondary" onClick={() => void copyEmails()}>
          Copiar solo emails
        </button>
        <button type="button" className="grp-secondary" onClick={() => void csv()}>
          CSV
        </button>
        <button type="button" className="grp-secondary" onClick={() => void xlsx()}>
          Excel
        </button>
        <button type="button" className="grp-secondary" onClick={() => void pdf()}>
          PDF
        </button>
      </div>
      {note && <p className="muted" role="status">{note}</p>}
      {out && (
        <>
          <p className="muted">No se ha podido copiar automáticamente. Selecciona el texto y cópialo:</p>
          <textarea className="grp-input grp-textarea" readOnly value={out.text} onFocus={(e) => e.currentTarget.select()} aria-label="Texto para copiar" />
        </>
      )}
      {problem && <p className="error">{problem}</p>}

      <p className="grp-section">Guardar esta configuración</p>
      <div className="grp-field-row">
        <input className="grp-input" placeholder="Por ejemplo: Teléfonos de las madres" value={presetName} onChange={(e) => setPresetName(e.target.value)} aria-label="Nombre de la configuración" />
        <button type="button" className="grp-secondary" onClick={() => void savePreset()}>
          Guardar
        </button>
      </div>
    </GroupSheet>
  )
}

// ------------------------------------------------------------------------------------------------------------- pendientes de identificar
export function PendingContactsSheet({ group, participants, pending, onClose, onChanged }: { group: GroupItem; participants: Participant[]; pending: PendingContact[]; onClose: () => void; onChanged: () => void }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  const [student, setStudent] = useState('')
  const [relation, setRelation] = useState<Relation>('madre')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = pending.find((p) => p.id === openId) ?? null
  const students = useMemo(() => activeParticipants(participants), [participants])

  const start = (p: PendingContact) => {
    setOpenId(p.id)
    setPick('')
    setStudent('')
    if (!contacts) listContacts().then(setContacts).catch((e) => setProblem(groupsErrorMessage(e)))
  }
  const done = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      setOpenId(null)
      setProblem(null)
      onChanged()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const linkExisting = (p: PendingContact) =>
    done(async () => {
      if (!pick) throw new Error('Elige un contacto.')
      if (student) await linkContactToParticipant(student, pick, relation)
      await resolvePending(p.id, 'vinculado', pick)
    })
  const createNew = (p: PendingContact) =>
    done(async () => {
      const id = await addContactReturningId({
        name: (p.whatsappName ?? p.phone ?? 'Contacto de WhatsApp').replace(/[\s\p{Extended_Pictographic}‍️]+$/gu, '').trim() || 'Contacto de WhatsApp',
        category: 'Colegio',
        phone: p.phone ?? '',
        email: '',
        notes: '',
        whatsappName: p.whatsappName,
        source: { kind: 'whatsapp', at: new Date().toISOString(), detail: `Pendiente de ${group.name}` },
      })
      if (student) await linkContactToParticipant(student, id, relation)
      await resolvePending(p.id, 'vinculado', id)
    })

  return (
    <GroupSheet title="Pendientes de identificar" onClose={onClose} wide>
      <p className="muted">Contactos que salían en capturas de WhatsApp y todavía no sabes quién son. No son alumnos ni cuentan en ningún bote. Vincúlalos cuando lo sepas.</p>
      {pending.filter((p) => p.status === 'pendiente').length === 0 && <p>No hay ninguno pendiente.</p>}
      {pending
        .filter((p) => p.status === 'pendiente')
        .map((p) => (
          <div key={p.id} className="grp-card" style={{ marginBottom: 8 }}>
            <strong style={{ wordBreak: 'break-word' }}>{p.whatsappName ?? p.phone ?? '(sin nombre)'}</strong>
            <p className="muted" style={{ margin: '2px 0' }}>
              {p.phone ? `📞 ${p.phone}` : 'Sin teléfono'}
              {p.guardianHint ? ` · posible madre/padre: ${p.guardianHint}` : ''}
              {p.studentHint ? ` · posible alumno: ${p.studentHint}` : ''}
            </p>
            {openId === p.id && open ? (
              <>
                <label className="grp-field">
                  <span>Vincular con un contacto de tu agenda</span>
                  <select className="grp-input" value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">{contacts ? 'Elige uno…' : 'Cargando…'}</option>
                    {(contacts ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `· ${c.phone}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grp-field">
                  <span>Es familiar de (opcional)</span>
                  <select className="grp-input" value={student} onChange={(e) => setStudent(e.target.value)}>
                    <option value="">Sin vincular a ningún alumno</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {participantName(s)}
                      </option>
                    ))}
                  </select>
                </label>
                {student && (
                  <div className="grp-chips" role="radiogroup" aria-label="Relación">
                    {RELATIONS.map((r) => (
                      <button key={r} type="button" role="radio" aria-checked={relation === r} className={'chip' + (relation === r ? ' chip-active' : '')} onClick={() => setRelation(r)}>
                        {RELATION_LABEL[r]}
                      </button>
                    ))}
                  </div>
                )}
                <div className="form-actions">
                  <button type="button" className="primary-button" disabled={busy || !pick} onClick={() => void linkExisting(p)}>
                    Vincular
                  </button>
                  <button type="button" className="grp-secondary" disabled={busy} onClick={() => void createNew(p)}>
                    Crear contacto nuevo
                  </button>
                  <button type="button" className="link-button" onClick={() => setOpenId(null)}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <div className="form-actions" style={{ marginTop: 4 }}>
                <button type="button" className="grp-secondary" onClick={() => start(p)}>
                  Identificar
                </button>
                <ConfirmButton label="Descartar" confirmMessage="Se quita de la lista de pendientes." onConfirm={() => void done(() => resolvePending(p.id, 'descartado', null))} />
              </div>
            )}
          </div>
        ))}
      {problem && <p className="error">{problem}</p>}
    </GroupSheet>
  )
}
