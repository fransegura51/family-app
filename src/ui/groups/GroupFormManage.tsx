import { useMemo, useState } from 'react'
import { assignResponse, fileUrl, publishForm, purgeNow, readSensitive, resolveDeletion, resolveProposal, setFormRetention, setFormStatus, setRecipientActive, type FormDetail } from '@/data/groupForms'
import { groupsErrorMessage, updateParticipant } from '@/data/groups'
import { toCsv, type RenderedShare } from '@/domain/contactShare'
import { formatDate, formatDateTime } from '@/domain/dateFormat'
import { addDays, formShareUrl, hasSensitive, inviteText, isOpenForAnswers, MAPS_TO_LABEL, MAX_RETENTION_DAYS, notesBlock, responseStatus, retentionMaxError, todayIn, type FormField, type FormRecipient, type FormResponse } from '@/domain/groupForms'
import { writeXlsx } from '@/domain/tableFiles'
import { makeNamer } from '@/domain/groupNames'
import type { LinkedContactRow } from '@/domain/contactShare'
import { parsePhone } from '@/domain/participantImport'
import { activeParticipants, groupTitle, type GroupItem, type Participant } from '@/domain/groups'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { deliverBinaryFile, downloadTextFile } from '@/services/exportFile'
import { shareText } from '@/services/share'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { DateField } from '@/ui/DateField'
import { GroupSheet } from '@/ui/groups/GroupSheet'

const waNumber = (raw: string | null | undefined): string | null => {
  const p = parsePhone(raw ?? '').phone
  if (!p) return null
  return p.startsWith('+') ? p.slice(1) : /^[6-9]\d{8}$/.test(p) ? `34${p}` : null
}

function answerText(f: FormField, v: unknown): string {
  if (v === undefined || v === null) return ''
  if (Array.isArray(v)) return f.type === 'archivo' ? `${v.length} ${v.length === 1 ? 'archivo' : 'archivos'}` : v.join(', ')
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  return String(v)
}

// ------------------------------------------------------------------------------------------------------------- enviar y seguir quién falta
export function FormSend({ group, detail, participants, links, onChanged }: { group: GroupItem; detail: FormDetail; participants: Participant[]; links: LinkedContactRow[]; onChanged: () => void }) {
  const { form, recipients, responses } = detail
  const live = useMemo(() => activeParticipants(participants), [participants])
  const namer = useMemo(() => makeNamer(live, { format: group.nameFormat, sortBy: group.sortBy }), [live, group.nameFormat, group.sortBy])
  const status = useMemo(() => responseStatus(recipients, responses), [recipients, responses])
  const byParticipant = new Map(participants.map((p) => [p.id, p]))
  const withLink = new Set(recipients.filter((r) => r.participantId).map((r) => r.participantId as string))
  const withoutLink = live.filter((p) => !withLink.has(p.id))
  const [chosen, setChosen] = useState<Set<string>>(new Set(live.map((p) => p.id)))
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const general = recipients.find((r) => r.kind === 'general')
  const today = todayIn(new Date())
  const open = isOpenForAnswers(form, today)

  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      setProblem(null)
      await fn()
      onChanged()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const publish = (ids: string[]) =>
    run(async () => {
      const n = await publishForm(form.id, ids)
      emitHelpEvent('grupos.form-published') // el formulario YA está publicado y los enlaces creados
      setNote(n > 0 ? `Enlaces creados para ${n} ${n === 1 ? 'persona' : 'personas'}.` : 'Formulario publicado.')
    })

  const phoneOf = (p: Participant): string | null => {
    const fromLinks = links.filter((l) => l.participantId === p.id).flatMap((l) => [l.phone, ...l.extraPhones])
    return [...fromLinks, p.phone].map(waNumber).find((x): x is string => !!x) ?? null
  }
  const send = async (r: FormRecipient) => {
    const p = r.participantId ? byParticipant.get(r.participantId) : undefined
    const text = inviteText(form, groupTitle(group), formShareUrl(r.token), p ? namer(p) : null, formatDate)
    const wa = p ? phoneOf(p) : null
    if (wa) window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
    else {
      try {
        const native = await shareText({ title: form.title, text })
        setNote(native ? null : 'Mensaje con el enlace copiado: pégalo en el chat.')
      } catch {
        setProblem('No se ha podido compartir. Copia el enlace a mano.')
      }
    }
  }
  const copy = async (r: FormRecipient) => {
    try {
      await navigator.clipboard.writeText(formShareUrl(r.token))
      setNote('Enlace copiado.')
    } catch {
      setNote(formShareUrl(r.token))
    }
  }

  if (form.status === 'borrador')
    return (
      <div data-help-id="grupos.formulario-publicar">
        <p className="muted">
          Elige a quién enviar el formulario. Cada persona recibe su propio enlace (así sabrás quién ha respondido y quién falta) y además tendrás un enlace general para el grupo de WhatsApp.
        </p>
        <div className="form-actions" style={{ marginTop: 0 }}>
          <button type="button" className="link-button" onClick={() => setChosen(new Set(live.map((p) => p.id)))}>
            Marcar todos
          </button>
          <button type="button" className="link-button" onClick={() => setChosen(new Set())}>
            Quitar todos
          </button>
        </div>
        <div className="grp-card" style={{ maxHeight: 280, overflow: 'auto' }}>
          {live.map((p) => (
            <label key={p.id} className="grp-check-row">
              <input type="checkbox" checked={chosen.has(p.id)} onChange={() => setChosen((s) => (s.has(p.id) ? new Set([...s].filter((x) => x !== p.id)) : new Set(s).add(p.id)))} />
              <span>{namer(p)}</span>
            </label>
          ))}
          {live.length === 0 && <p className="muted">Este grupo no tiene participantes todavía. Puedes publicar solo con el enlace general.</p>}
        </div>
        {hasSensitive(form.fields) && !form.retentionMax && <p className="error">Antes de publicar, edita el formulario y fija la fecha máxima de conservación de los datos delicados.</p>}
        {problem && <p className="error">{problem}</p>}
        <div className="form-actions">
          <button type="button" className="primary-button" disabled={busy || (hasSensitive(form.fields) && !form.retentionMax)} onClick={() => void publish([...chosen])}>
            Publicar y crear enlaces ({chosen.size})
          </button>
        </div>
      </div>
    )

  const shown = recipients.filter((r) => r.kind === 'participante').filter((r) => !onlyMissing || status.missing.some((m) => m.id === r.id))
  const rows = shown
    .map((r) => ({ r, p: r.participantId ? byParticipant.get(r.participantId) : undefined }))
    .filter((x) => x.p)
    .sort((a, b) => namer(a.p as Participant).localeCompare(namer(b.p as Participant), 'es'))

  return (
    <div>
      <div className="grp-stats">
        <div className="grp-stat">
          <strong>
            {status.answered.length} de {status.answered.length + status.missing.length}
          </strong>
          <span>Han respondido</span>
        </div>
        <div className="grp-stat">
          <strong>{status.missing.length}</strong>
          <span>Faltan</span>
        </div>
      </div>
      <p className="muted">
        {form.status === 'cerrado' ? 'Cerrado: no admite más respuestas.' : open ? 'Abierto' + (form.deadline ? ` hasta el ${formatDate(form.deadline)}` : '') : 'La fecha límite ya ha pasado: no admite más respuestas.'}
      </p>
      <div className="form-actions" style={{ marginTop: 0 }}>
        {form.status === 'abierto' ? (
          <ConfirmButton label="Cerrar el formulario" confirmMessage="Nadie podrá responder más." onConfirm={() => void run(() => setFormStatus(form.id, 'cerrado'))} />
        ) : (
          <button type="button" className="grp-secondary" onClick={() => void run(() => setFormStatus(form.id, 'abierto'))}>
            Reabrir
          </button>
        )}
      </div>

      {general && (
        <div className="grp-card" data-help-id="grupos.formulario-enlace-general">
          <strong>Enlace general</strong>
          <p className="muted" style={{ margin: '2px 0' }}>Para el grupo de WhatsApp: cada persona escribe el nombre del alumno y su respuesta queda «por revisar» hasta que la asignes.</p>
          <div className="form-actions" style={{ marginTop: 4 }}>
            <button type="button" className="grp-secondary" onClick={() => void send(general)}>
              Compartir
            </button>
            <button type="button" className="link-button" onClick={() => void copy(general)}>
              Copiar enlace
            </button>
            <button type="button" className="link-button" onClick={() => void run(() => setRecipientActive(general.id, !general.active))}>
              {general.active ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        </div>
      )}

      {withoutLink.length > 0 && (
        <div className="grp-banner">
          {withoutLink.length} {withoutLink.length === 1 ? 'persona del grupo no tiene' : 'personas del grupo no tienen'} enlace todavía.{' '}
          <button type="button" className="link-button" disabled={busy} onClick={() => void publish(withoutLink.map((p) => p.id))}>
            Crear los enlaces que faltan
          </button>
        </div>
      )}

      <p className="grp-section">Enlaces personales</p>
      <label className="grp-check-row">
        <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
        <span>Ver solo a quienes faltan por responder</span>
      </label>
      {rows.map(({ r, p }) => {
        const answered = status.answered.some((a) => a.id === r.id)
        return (
          <div key={r.id} className="grp-card" style={{ marginBottom: 6, opacity: r.active ? 1 : 0.6 }}>
            <strong>{namer(p as Participant)}</strong> <span className="muted">{answered ? '✅ ha respondido' : r.active ? '⏳ falta' : 'enlace desactivado'}</span>
            <div className="form-actions" style={{ marginTop: 4 }}>
              {r.active && (
                <button type="button" className="grp-secondary" onClick={() => void send(r)}>
                  {answered ? 'Reenviar' : phoneOf(p as Participant) ? 'Enviar por WhatsApp' : 'Compartir'}
                </button>
              )}
              <button type="button" className="link-button" onClick={() => void copy(r)}>
                Copiar enlace
              </button>
              <button type="button" className="link-button" onClick={() => void run(() => setRecipientActive(r.id, !r.active))}>
                {r.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        )
      })}
      {rows.length === 0 && <p className="muted">{onlyMissing ? 'Todas las personas con enlace han respondido.' : 'Todavía no hay enlaces personales.'}</p>}
      {note && <p className="muted" role="status" style={{ wordBreak: 'break-all' }}>{note}</p>}
      {problem && <p className="error">{problem}</p>}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------------------- respuestas
export function FormResponses({ group, detail, participants, userId, onChanged }: { group: GroupItem; detail: FormDetail; participants: Participant[]; userId: string; onChanged: () => void }) {
  const { form, responses, recipients, deletions, sensitive } = detail
  const live = useMemo(() => activeParticipants(participants), [participants])
  const namer = useMemo(() => makeNamer(live.length ? live : participants, { format: 'full', sortBy: group.sortBy }), [live, participants, group.sortBy])
  const byId = new Map(participants.map((p) => [p.id, p]))
  const [openId, setOpenId] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const isCreator = form.createdBy === userId
  const today = todayIn(new Date())
  const [newRetention, setNewRetention] = useState('')
  const openResponse = responses.find((r) => r.id === openId) ?? null
  const pendingDeletes = deletions.filter((d) => d.status === 'pendiente')
  const nameOf = (r: FormResponse) => (r.participantId && byId.get(r.participantId) ? namer(byId.get(r.participantId) as Participant) : r.claimedName ? `${r.claimedName} (sin asignar)` : 'Sin identificar')
  const ordinaryFields = form.fields.filter((f) => !f.sensitive && f.type !== 'archivo')

  const exportRows = (): RenderedShare => ({
    headers: ['Persona', ...ordinaryFields.map((f) => f.label)],
    rows: responses.map((r) => [nameOf(r), ...ordinaryFields.map((f) => answerText(f, r.answers[f.id]))]),
    skippedEmpty: 0,
    skippedDuplicates: 0,
  })
  const stem = `respuestas-${form.title.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, '-').replace(/^-|-$/g, '')}`
  const exportCsv = () => downloadTextFile(`${stem}.csv`, toCsv(exportRows()), 'text/csv;charset=utf-8')
  const exportXlsx = async () => {
    const r = exportRows()
    await deliverBinaryFile(`${stem}.xlsx`, writeXlsx('Respuestas', [r.headers, ...r.rows]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }

  const toNotes = async () => {
    setProblem(null)
    let updated = 0
    let skipped = 0
    try {
      for (const r of responses) {
        const p = r.participantId ? byId.get(r.participantId) : undefined
        if (!p || r.status === 'revisar') {
          skipped++
          continue
        }
        const block = notesBlock(form.title, formatDate(r.submittedAt.slice(0, 10)), r.id, form.fields, r.answers)
        const marker = `[${r.id.slice(0, 8)}]`
        if (!block || (p.notes ?? '').includes(marker)) continue
        const next = [p.notes, block].filter(Boolean).join('\n\n')
        if (next.length > 2000) {
          skipped++
          continue
        }
        await updateParticipant(p.id, { notes: next })
        updated++
      }
      setNote(`Respuestas añadidas a las notas de ${updated} ${updated === 1 ? 'ficha' : 'fichas'}${skipped ? ` (${skipped} sin añadir: sin persona asignada o sin espacio)` : ''}. Lo que ya había escrito no se toca.`)
      onChanged()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    }
  }

  const setRet = async () => {
    const e = retentionMaxError(newRetention || null, today)
    if (e) return setProblem(e)
    try {
      const n = await setFormRetention(form.id, newRetention)
      setNote(n > 0 ? `Fecha cambiada. ${n} ${n === 1 ? 'dato ya recogido se eliminará' : 'datos ya recogidos se eliminarán'} antes.` : 'Fecha cambiada. Los datos ya recogidos mantienen la fecha que aceptó cada persona.')
      setNewRetention('')
      onChanged()
    } catch (err) {
      setProblem(groupsErrorMessage(err))
    }
  }

  return (
    <div>
      <p className="muted">
        {responses.length} {responses.length === 1 ? 'respuesta' : 'respuestas'} · {responses.filter((r) => r.status === 'revisar').length} por revisar
      </p>
      {pendingDeletes.length > 0 && (
        <div className="grp-banner grp-banner-warn" data-help-id="grupos.formulario-eliminacion">
          Hay {pendingDeletes.length} {pendingDeletes.length === 1 ? 'petición de eliminación anticipada' : 'peticiones de eliminación anticipada'} esperando respuesta. Ábrela desde la respuesta correspondiente.
        </div>
      )}
      {responses.map((r) => (
        <button key={r.id} type="button" className="grp-row" onClick={() => setOpenId(r.id)}>
          <span aria-hidden="true">{r.status === 'revisar' ? '⚠️' : '📝'}</span>
          <span className="grp-row-main">
            <span className="grp-row-title">{nameOf(r)}</span>
            <span className="grp-row-sub" style={{ display: 'block' }}>
              {formatDateTime(r.submittedAt)}
              {r.status === 'revisar' ? ' · por revisar' : ''}
              {r.proposals.some((p) => p.status === 'conflicto') ? ' · cambios por confirmar' : ''}
              {deletions.some((d) => d.responseId === r.id && d.status === 'pendiente') ? ' · pide eliminar datos' : ''}
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
      {responses.length === 0 && <p className="muted">Todavía no ha respondido nadie.</p>}

      {responses.length > 0 && (
        <>
          <p className="grp-section">Llevarse las respuestas</p>
          <div className="form-actions" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="grp-secondary" onClick={exportCsv}>
              CSV
            </button>
            <button type="button" className="grp-secondary" onClick={() => void exportXlsx()}>
              Excel
            </button>
            <button type="button" className="grp-secondary" data-help-id="grupos.formulario-a-notas" onClick={() => void toNotes()}>
              Añadir a las notas de cada ficha
            </button>
          </div>
          <p className="muted">
            Las exportaciones y las notas llevan solo las respuestas ordinarias, nunca los datos delicados ni los archivos. Las notas se añaden debajo de lo que ya haya escrito, con el nombre del formulario como referencia.
          </p>
        </>
      )}

      {hasSensitive(form.fields) && (
        <div className="grp-card" style={{ marginTop: 12 }}>
          <strong>🔒 Conservación de datos delicados</strong>
          <p className="muted" style={{ margin: '4px 0' }}>
            Fecha máxima actual: <strong>{form.retentionMax ? formatDate(form.retentionMax) : 'sin fijar'}</strong>.
            {form.retentionHistory.length > 0 ? ` Se ha cambiado ${form.retentionHistory.length} ${form.retentionHistory.length === 1 ? 'vez' : 'veces'}.` : ''}
          </p>
          {isCreator && (
            <>
              <DateField value={newRetention} onChange={setNewRetention} placeholder="Nueva fecha máxima" min={addDays(today, 1)} max={addDays(today, MAX_RETENTION_DAYS)} />
              <div className="form-actions" style={{ marginTop: 6 }}>
                <button type="button" className="grp-secondary" disabled={!newRetention} onClick={() => void setRet()}>
                  Cambiar la fecha
                </button>
              </div>
              <p className="muted">Acortarla elimina antes lo ya recogido; alargarla solo afecta a las respuestas nuevas (cada persona aceptó su fecha).</p>
            </>
          )}
          <p className="muted">PEPA elimina lo que guarda ella. Lo que hayas descargado o enviado a otros servicios lo tienes que borrar tú.</p>
        </div>
      )}
      {note && <p className="muted" role="status">{note}</p>}
      {problem && <p className="error">{problem}</p>}

      {openResponse && (
        <ResponseSheet
          group={group}
          form={form}
          response={openResponse}
          recipient={recipients.find((r) => r.id === openResponse.recipientId)}
          participants={live}
          nameOf={nameOf}
          sensitiveRows={sensitive.filter((s) => s.responseId === openResponse.id)}
          deletion={deletions.find((d) => d.responseId === openResponse.id && d.status === 'pendiente') ?? null}
          isCreator={isCreator}
          onClose={() => setOpenId(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  )
}

function ResponseSheet({
  form,
  response,
  participants,
  nameOf,
  sensitiveRows,
  deletion,
  isCreator,
  onClose,
  onChanged,
}: {
  group: GroupItem
  form: FormDetail['form']
  response: FormResponse
  recipient: FormRecipient | undefined
  participants: Participant[]
  nameOf: (r: FormResponse) => string
  sensitiveRows: FormDetail['sensitive']
  deletion: FormDetail['deletions'][number] | null
  isCreator: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  const [secret, setSecret] = useState<{ fieldId: string; value: unknown; expiresAt: string }[] | null>(null)
  const [legal, setLegal] = useState('')
  const [askKeep, setAskKeep] = useState(false)
  const run = async (fn: () => Promise<void>) => {
    try {
      setProblem(null)
      await fn()
      onChanged()
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    }
  }
  const open = (path: string) =>
    fileUrl(path)
      .then((u) => window.open(u, '_blank', 'noopener'))
      .catch((e) => setProblem(groupsErrorMessage(e)))
  const sensitiveFields = form.fields.filter((f) => f.sensitive)
  return (
    <GroupSheet title={nameOf(response)} onClose={onClose} wide>
      <p className="muted">Respondido el {formatDateTime(response.submittedAt)}.</p>
      {response.status === 'revisar' && (
        <div className="grp-banner grp-banner-warn" data-help-id="grupos.formulario-revisar">
          <p style={{ margin: '0 0 6px' }}>
            Respuesta del enlace general{response.claimedName ? ` («${response.claimedName}»)` : ''}. Dime a qué persona corresponde antes de usarla.
          </p>
          <select className="grp-input" value={pick || response.participantId || ''} onChange={(e) => setPick(e.target.value)}>
            <option value="">Elige a la persona…</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.name, p.surname].filter(Boolean).join(' ')}
              </option>
            ))}
          </select>
          <div className="form-actions">
            <button type="button" className="primary-button" disabled={!(pick || response.participantId)} onClick={() => void run(() => assignResponse(response.id, pick || (response.participantId as string)))}>
              Asignar a esta persona
            </button>
          </div>
        </div>
      )}
      {form.fields
        .filter((f) => !f.sensitive)
        .map((f) => {
          const v = response.answers[f.id]
          return (
            <div key={f.id} style={{ marginBottom: 8 }}>
              <strong>{f.label}</strong>
              <div style={{ overflowWrap: 'anywhere' }}>
                {f.type === 'archivo' && Array.isArray(v) ? (
                  v.map((p) => (
                    <div key={p}>
                      <button type="button" className="link-button" onClick={() => void open(p)}>
                        📎 Abrir archivo
                      </button>
                    </div>
                  ))
                ) : (
                  answerText(f, v) || <span className="muted">Sin respuesta</span>
                )}
              </div>
            </div>
          )
        })}

      {response.proposals.length > 0 && (
        <>
          <p className="grp-section">Cambios en la ficha de la persona</p>
          {response.proposals.map((p) => (
            <div key={p.field} className="grp-card" style={{ marginBottom: 6 }}>
              <strong>{MAPS_TO_LABEL[p.field]}</strong>: «{p.value}»
              <div className="muted">
                {p.status === 'aplicado' && '✅ Estaba vacío: se ha completado solo.'}
                {p.status === 'igual' && 'Ya constaba igual.'}
                {p.status === 'ignorado' && 'Descartado: no se cambia.'}
                {p.status === 'conflicto' && `Ahora consta «${p.current}». No se cambia sin tu permiso.`}
              </div>
              {p.status === 'conflicto' && (
                <div className="form-actions" style={{ marginTop: 4 }}>
                  <button type="button" className="primary-button" disabled={!response.participantId} onClick={() => void run(() => resolveProposal(response.id, p.field, true))}>
                    Cambiar el dato
                  </button>
                  <button type="button" className="link-button" onClick={() => void run(() => resolveProposal(response.id, p.field, false))}>
                    Dejar como está
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {sensitiveFields.length > 0 && (
        <div className="grp-card" data-help-id="grupos.formulario-datos-protegidos">
          <strong>🔒 Datos protegidos</strong>
          {sensitiveRows.length === 0 ? (
            <p className="muted" style={{ margin: '4px 0' }}>No hay datos protegidos guardados (no se contestaron o ya se eliminaron).</p>
          ) : (
            <p className="muted" style={{ margin: '4px 0' }}>
              {sensitiveRows.length} {sensitiveRows.length === 1 ? 'dato guardado' : 'datos guardados'}. Se eliminan el {formatDate([...sensitiveRows].map((s) => s.expiresAt).sort()[0])}.
            </p>
          )}
          {sensitiveRows.length > 0 &&
            (isCreator ? (
              secret ? (
                secret.map((s) => {
                  const f = sensitiveFields.find((x) => x.id === s.fieldId)
                  return (
                    <div key={s.fieldId} style={{ marginBottom: 6, overflowWrap: 'anywhere' }}>
                      <strong>{f?.label ?? s.fieldId}</strong>
                      <div>
                        {Array.isArray(s.value) ? (
                          (s.value as string[]).map((p) => (
                            <button key={p} type="button" className="link-button" onClick={() => void open(p)}>
                              📎 Abrir archivo
                            </button>
                          ))
                        ) : typeof s.value === 'boolean' ? (
                          s.value ? (
                            'Sí'
                          ) : (
                            'No'
                          )
                        ) : (
                          String(s.value)
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <button type="button" className="grp-secondary" onClick={() => void run(async () => setSecret(await readSensitive(response.id)))}>
                  Ver los datos protegidos
                </button>
              )
            ) : (
              <p className="muted">Solo quien creó el formulario puede verlos. Tú ves únicamente que existen y cuándo se eliminan.</p>
            ))}
          {isCreator && sensitiveRows.length > 0 && <p className="muted">Cada vez que los abres queda registrado. No se pueden exportar.</p>}
        </div>
      )}

      {deletion && (
        <div className="grp-banner grp-banner-warn">
          <p style={{ margin: '0 0 6px' }}>
            <strong>Pide que se eliminen sus datos protegidos antes de la fecha.</strong>
            {deletion.reason ? ` Motivo: «${deletion.reason}».` : ''}
          </p>
          {isCreator ? (
            askKeep ? (
              <>
                <input className="grp-input" placeholder="Excepción legal por la que debes conservarlos" value={legal} maxLength={500} onChange={(e) => setLegal(e.target.value)} />
                <div className="form-actions">
                  <button type="button" className="primary-button" disabled={legal.trim().length < 5} onClick={() => void run(() => resolveDeletion(deletion.id, 'conservar', legal))}>
                    Conservar y explicarlo
                  </button>
                  <button type="button" className="link-button" onClick={() => setAskKeep(false)}>
                    Atrás
                  </button>
                </div>
              </>
            ) : (
              <div className="form-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    void run(async () => {
                      await resolveDeletion(deletion.id, 'eliminar', '')
                      await purgeNow(form.id).catch(() => undefined)
                      setSecret(null)
                    })
                  }
                >
                  Eliminar ahora
                </button>
                <button type="button" className="link-button" onClick={() => setAskKeep(true)}>
                  Debo conservarlos (excepción legal)
                </button>
              </div>
            )
          ) : (
            <p className="muted" style={{ margin: 0 }}>Lo resuelve quien creó el formulario.</p>
          )}
        </div>
      )}
      {problem && <p className="error">{problem}</p>}
    </GroupSheet>
  )
}
