import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { addContactReturningId, applyContactPatch, listContacts } from '@/data/contacts'
import { addPendingContacts, linkContactToParticipant, listPendingContacts, pendingPhoneKeys, resolvePending, type PendingContact } from '@/data/groupContacts'
import { groupsErrorMessage } from '@/data/groups'
import { applyContactMerge, hasPatch, phoneKey, planContactMerge, RELATIONS, RELATION_LABEL, type ContactMergePlan, type Relation, type Resolution } from '@/domain/contactsModel'
import { activeParticipants, participantName, type GroupItem, type Participant } from '@/domain/groups'
import type { Contact } from '@/domain/types'
import { mergeWhatsappBatch, proposeWhatsapp, suggestContactName, type WaDecision, type WaProposal, type WaRow } from '@/domain/whatsappImport'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { ParticipantsReaderUnavailableError } from '@/services/participantsDocument'
import { analyzeWhatsappImage } from '@/services/whatsappContacts'
import { imageFileToCanvas } from '@/ui/lists/sourceImage'
import { GroupSheet } from '@/ui/groups/GroupSheet'

interface Choice {
  decision: WaDecision
  contactId: string | null
  name: string
  relation: Relation
  studentId: string | null
  include: boolean
}

const MAX_SHOTS = 12

function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo preparar la imagen'))), 'image/jpeg', 0.88))
}

const DECISION_LABEL: Record<WaDecision, string> = {
  crear: 'Crear contacto nuevo',
  vincular: 'Vincular con uno existente',
  pendiente: 'Guardar pendiente de identificar',
  omitir: 'No importar',
}

/**
 * Importar contactos desde capturas de WhatsApp. Las capturas se pueden elegir varias a la vez o añadir una a una: cada una COMPLETA lo anterior (mismo teléfono = misma persona).
 * Siempre hay vista previa; usa SOLO la agenda de Contactos de PEPA; lo no identificado queda «pendiente de vincular» (no es alumno ni cuenta en ningún bote).
 */
export function WhatsappImport({ group, participants, onClose, onDone }: { group: GroupItem; participants: Participant[]; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<'source' | 'reading' | 'review' | 'conflicts'>('source')
  const [rows, setRows] = useState<WaRow[]>([])
  const [log, setLog] = useState<string[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [pending, setPending] = useState<PendingContact[]>([])
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [category, setCategory] = useState('Colegio')
  const [progress, setProgress] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflictPlans, setConflictPlans] = useState<{ key: string; contact: Contact; plan: ContactMergePlan }[]>([])
  const [decisions, setDecisions] = useState<Record<string, Resolution>>({})
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const students = useMemo(() => activeParticipants(participants), [participants])

  useEffect(() => {
    Promise.all([listContacts(), listPendingContacts(group.id)])
      .then(([c, p]) => {
        setContacts(c)
        setPending(p)
      })
      .catch((e) => setProblem(groupsErrorMessage(e, 'No se ha podido cargar tu agenda.')))
  }, [group.id])

  const proposals = useMemo(() => proposeWhatsapp(rows, contacts, pendingPhoneKeys(pending), participants), [rows, contacts, pending, participants])

  // Cada propuesta nueva arranca con su decisión sugerida; lo que la persona ya tocó no se pisa.
  useEffect(() => {
    setChoices((prev) => {
      const next = { ...prev }
      for (const p of proposals) {
        if (next[p.row.key]) continue
        next[p.row.key] = {
          decision: p.suggested,
          contactId: p.suggestedContactId ?? p.candidates[0]?.contact.id ?? null,
          name: suggestContactName(p.row.whatsappName, p.row.phone),
          relation: 'otro',
          studentId: p.studentMatch?.id ?? null,
          include: p.suggested !== 'omitir',
        }
      }
      return next
    })
  }, [proposals])

  const setChoice = (key: string, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [key]: { ...c[key], ...patch } }))

  const readFiles = async (files: File[]) => {
    if (files.length === 0) return
    setStep('reading')
    setProblem(null)
    let current = rows
    const lines: string[] = []
    try {
      for (let i = 0; i < Math.min(files.length, MAX_SHOTS); i++) {
        setProgress(`Leyendo la captura ${i + 1} de ${Math.min(files.length, MAX_SHOTS)}…`)
        const found = await analyzeWhatsappImage(await canvasToBlob(await imageFileToCanvas(files[i])))
        const merged = mergeWhatsappBatch(current, found)
        current = merged.rows
        lines.push(
          found.length === 0
            ? 'Una captura no tenía ningún contacto legible.'
            : `Captura: ${merged.added} contacto${merged.added === 1 ? '' : 's'} nuevo${merged.added === 1 ? '' : 's'}` + (merged.completed > 0 ? `, ${merged.completed} completado${merged.completed === 1 ? '' : 's'} con datos de otra captura` : '') + '.',
          ...merged.conflicts,
        )
      }
      if (files.length > MAX_SHOTS) lines.push(`Solo he leído las ${MAX_SHOTS} primeras capturas de ${files.length}. Añade el resto después.`)
      setRows(current)
      setLog((l) => [...l, ...lines])
      setStep('review')
    } catch (e) {
      setRows(current)
      setLog((l) => [...l, ...lines])
      setStep(current.length > 0 ? 'review' : 'source')
      setProblem(e instanceof ParticipantsReaderUnavailableError ? 'La lectura de capturas no está disponible ahora mismo.' : groupsErrorMessage(e, 'No se ha podido leer la captura.'))
    }
  }
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    void readFiles(files)
  }

  const selected = proposals.filter((p) => choices[p.row.key]?.include && choices[p.row.key].decision !== 'omitir')
  const counts = {
    crear: selected.filter((p) => choices[p.row.key].decision === 'crear').length,
    vincular: selected.filter((p) => choices[p.row.key].decision === 'vincular').length,
    pendiente: selected.filter((p) => choices[p.row.key].decision === 'pendiente').length,
  }

  // 1) Antes de guardar: ¿algún «vincular» choca con datos ya confirmados del contacto? Entonces se pregunta (nunca se pisa nada).
  const planFor = (p: WaProposal): { contact: Contact; plan: ContactMergePlan } | null => {
    const c = choices[p.row.key]
    if (c?.decision !== 'vincular' || !c.contactId) return null
    const contact = contacts.find((x) => x.id === c.contactId)
    // Elegir vincular es la confirmación de identidad: por eso los huecos se completan solos y lo que choca se pregunta.
    return contact ? { contact, plan: planContactMerge(contact, { phone: p.row.phone, whatsappName: p.row.whatsappName }, true) } : null
  }
  const prepare = () => {
    const plans = selected.flatMap((p) => {
      const x = planFor(p)
      return x && x.plan.conflicts.length > 0 ? [{ key: p.row.key, ...x }] : []
    })
    if (plans.length > 0) {
      setConflictPlans(plans)
      setStep('conflicts')
    } else void save()
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setProblem(null)
    try {
      const stamp = new Date().toISOString()
      const pendingRows: Parameters<typeof addPendingContacts>[1] = []
      for (const p of selected) {
        const c = choices[p.row.key]
        let contactId: string | null = null
        if (c.decision === 'crear') {
          contactId = await addContactReturningId({
            name: c.name.trim() || suggestContactName(p.row.whatsappName, p.row.phone),
            category: category.trim() || 'Colegio',
            phone: p.row.phone ?? '',
            email: '',
            notes: '',
            whatsappName: p.row.whatsappName,
            source: { kind: 'whatsapp', at: stamp, detail: `Captura de WhatsApp (${group.name})` },
          })
        } else if (c.decision === 'vincular') {
          const x = planFor(p)
          if (x) {
            // Las decisiones de esta fila (clave «fila:campo») → mapa por campo.
            const mine: Record<string, Resolution | undefined> = {}
            for (const cf of x.plan.conflicts) mine[cf.key] = decisions[`${p.row.key}:${cf.key}`]
            const patch = applyContactMerge(x.contact, x.plan, mine)
            if (hasPatch(patch)) await applyContactPatch(x.contact.id, patch)
            contactId = x.contact.id
          }
        } else if (c.decision === 'pendiente') {
          if (!p.alreadyPending) pendingRows.push({ whatsappName: p.row.whatsappName, phone: p.row.phone, guardianHint: p.row.guardianHint, studentHint: p.row.studentHint })
          continue
        }
        if (contactId && c.studentId) await linkContactToParticipant(c.studentId, contactId, c.relation)
        // Si ese teléfono estaba en la lista de pendientes, queda resuelto con este contacto.
        const k = phoneKey(p.row.phone)
        const match = k ? pending.find((x) => x.status === 'pendiente' && phoneKey(x.phone) === k) : undefined
        if (match && contactId) await resolvePending(match.id, 'vinculado', contactId)
      }
      await addPendingContacts(group.id, pendingRows)
      emitHelpEvent('grupos.whatsapp-imported') // los contactos YA están guardados
      onDone()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setSaving(false)
      setStep('review')
    }
  }

  if (step === 'source')
    return (
      <GroupSheet title="Contactos desde capturas de WhatsApp" onClose={onClose}>
        <p className="muted">
          Haz capturas de la lista de participantes de tu grupo de WhatsApp (o de su información) y súbelas. Puedes elegir varias a la vez o ir añadiendo más después. Antes de guardar nada verás una vista previa.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          <button type="button" className="grp-big-button" data-help-id="grupos.whatsapp-capturas" onClick={() => galleryRef.current?.click()}>
            <span>🖼️ Elegir capturas de la galería</span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="grp-big-button" onClick={() => cameraRef.current?.click()}>
            <span>📷 Hacer una foto a la pantalla</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
        <input ref={galleryRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPick} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPick} />
        <p className="muted">No se inventa ningún dato: si un teléfono no se ve en la captura, el contacto queda sin teléfono. Se usa solo tu agenda de Contactos, sin crear otra.</p>
        {problem && <p className="error">{problem}</p>}
      </GroupSheet>
    )

  if (step === 'reading')
    return (
      <GroupSheet title="Leyendo…" onClose={() => undefined}>
        <p aria-live="polite">{progress}</p>
        <p className="muted">Esto puede tardar unos segundos por captura.</p>
      </GroupSheet>
    )

  if (step === 'conflicts')
    return (
      <GroupSheet title="Datos que no coinciden" onClose={onClose} wide>
        <p className="muted">Estos contactos ya tienen otro dato. No se cambia nada sin tu permiso: elige qué hacer con cada uno.</p>
        {conflictPlans.map(({ key, contact, plan }) =>
          plan.conflicts.map((cf) => {
            const k = `${key}:${cf.key}`
            return (
              <div key={k} className="grp-card" style={{ marginBottom: 8 }}>
                <strong>{contact.name}</strong> · {cf.label}
                <p className="muted" style={{ margin: '4px 0' }}>
                  Ahora: {cf.existing} — Nuevo: {cf.incoming}
                </p>
                <div className="grp-chips">
                  {cf.options.map((o) => (
                    <button key={o} type="button" className={'chip' + ((decisions[k] ?? 'conservar') === o ? ' chip-active' : '')} onClick={() => setDecisions((d) => ({ ...d, [k]: o }))}>
                      {o === 'anadir' ? 'Añadir como adicional' : o === 'sustituir' ? 'Sustituir el anterior' : 'Conservar el anterior'}
                    </button>
                  ))}
                </div>
              </div>
            )
          }),
        )}
        <div className="form-actions">
          <button type="button" className="primary-button" disabled={saving} onClick={() => void save()}>
            Continuar
          </button>
          <button type="button" className="link-button" onClick={() => setStep('review')}>
            Volver
          </button>
        </div>
      </GroupSheet>
    )

  const rowView = (p: WaProposal) => {
    const c = choices[p.row.key]
    if (!c) return null
    return (
      <div key={p.row.key} className={'grp-import-row' + (p.row.doubts.length > 0 ? ' grp-import-row-doubt' : '')} data-help-id={p === proposals[0] ? 'grupos.whatsapp-fila' : undefined}>
        <label className="grp-check-row">
          <input type="checkbox" checked={c.include} onChange={(e) => setChoice(p.row.key, { include: e.target.checked })} />
          <strong style={{ wordBreak: 'break-word' }}>{p.row.whatsappName ?? p.row.phone ?? '(sin nombre)'}</strong>
        </label>
        <p className="muted" style={{ margin: '0 0 6px' }}>
          {p.row.phone ? `📞 ${p.row.phone}` : 'Sin teléfono visible'}
          {p.row.seenIn > 1 ? ` · salía en ${p.row.seenIn} capturas` : ''}
        </p>
        {(p.row.guardianHint || p.row.studentHint) && (
          <p className="muted" style={{ margin: '0 0 6px' }}>
            {p.row.guardianHint ? `Posible madre/padre: ${p.row.guardianHint}. ` : ''}
            {p.row.studentHint ? `Posible alumno: ${p.row.studentHint}.` : ''}
          </p>
        )}
        {p.row.doubts.map((d) => (
          <p key={d} className="grp-doubt">
            ⚠️ {d}
          </p>
        ))}
        {p.alreadyPending && <p className="muted">Ya estaba guardado como pendiente de identificar.</p>}
        {c.include && (
          <>
            <div className="grp-chips" role="radiogroup" aria-label="Qué hacer con este contacto">
              {(['crear', 'vincular', 'pendiente'] as WaDecision[]).map((d) => (
                <button key={d} type="button" role="radio" aria-checked={c.decision === d} disabled={d === 'vincular' && p.candidates.length === 0} className={'chip' + (c.decision === d ? ' chip-active' : '')} onClick={() => setChoice(p.row.key, { decision: d })}>
                  {DECISION_LABEL[d]}
                </button>
              ))}
            </div>
            {c.decision === 'crear' && (
              <label className="grp-field">
                <span>Nombre en tu agenda</span>
                <input className="grp-input" value={c.name} onChange={(e) => setChoice(p.row.key, { name: e.target.value })} />
                <small className="muted">El nombre original de WhatsApp se conserva aparte.</small>
              </label>
            )}
            {c.decision === 'vincular' && (
              <>
                <label className="grp-field">
                  <span>Contacto existente</span>
                  <select className="grp-input" value={c.contactId ?? ''} onChange={(e) => setChoice(p.row.key, { contactId: e.target.value || null })}>
                    {p.candidates.map((x) => (
                      <option key={x.contact.id} value={x.contact.id}>
                        {x.contact.name} · {x.by === 'telefono' ? 'mismo teléfono' : x.by === 'correo' ? 'mismo correo' : 'mismo nombre: confírmalo'}
                      </option>
                    ))}
                  </select>
                </label>
                {p.candidates.find((x) => x.contact.id === c.contactId)?.by === 'nombre' && <p className="muted">Coincide solo por el nombre: comprueba que es la misma persona antes de vincular.</p>}
              </>
            )}
            {c.decision === 'pendiente' && <p className="muted">Se guarda en «Pendientes de identificar» de este grupo, sin crear ningún contacto ni alumno. Podrás vincularlo después.</p>}
            {(c.decision === 'crear' || c.decision === 'vincular') && students.length > 0 && (
              <div className="grp-field-row">
                <label className="grp-field">
                  <span>Es familiar de (opcional)</span>
                  <select className="grp-input" value={c.studentId ?? ''} onChange={(e) => setChoice(p.row.key, { studentId: e.target.value || null })}>
                    <option value="">Sin vincular a ningún alumno</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {participantName(s)}
                      </option>
                    ))}
                  </select>
                </label>
                {c.studentId && (
                  <label className="grp-field">
                    <span>Relación</span>
                    <select className="grp-input" value={c.relation} onChange={(e) => setChoice(p.row.key, { relation: e.target.value as Relation })}>
                      {RELATIONS.map((r) => (
                        <option key={r} value={r}>
                          {RELATION_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            {p.studentMatch && !c.studentId && <p className="muted">La captura sugiere a «{participantName(p.studentMatch)}», pero no lo vinculo sin que lo elijas.</p>}
          </>
        )}
      </div>
    )
  }

  return (
    <GroupSheet title="Revisa antes de importar" onClose={onClose} wide>
      {log.map((l, i) => (
        <div key={i} className="grp-banner grp-banner-info">
          {l}
        </div>
      ))}
      <div className="form-actions" style={{ marginBottom: 8 }}>
        <button type="button" className="grp-secondary" onClick={() => galleryRef.current?.click()}>
          ＋ Añadir más capturas
        </button>
      </div>
      <input ref={galleryRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPick} />
      {rows.length === 0 && <p>No he encontrado ningún contacto en esas capturas.</p>}
      {counts.crear > 0 && (
        <label className="grp-field">
          <span>Categoría de los contactos nuevos</span>
          <input className="grp-input" list="grp-wa-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="grp-wa-cats">
            {['Colegio', 'Familia', 'Otros'].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      )}
      {proposals.map(rowView)}
      {problem && <p className="error">{problem}</p>}
      <div className="grp-sticky-bar">
        <button type="button" className="primary-button" disabled={saving || selected.length === 0} onClick={prepare} data-help-id="grupos.whatsapp-confirmar">
          {[counts.crear ? `Crear ${counts.crear}` : '', counts.vincular ? `Vincular ${counts.vincular}` : '', counts.pendiente ? `Guardar ${counts.pendiente} pendiente${counts.pendiente === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || 'Nada que guardar'}
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </GroupSheet>
  )
}
