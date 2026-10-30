import { useEffect, useMemo, useState } from 'react'
import { createForm, deleteTemplate, listTemplates, saveTemplate, setFormRetention, updateForm, type SavedTemplate } from '@/data/groupForms'
import { groupsErrorMessage } from '@/data/groups'
import {
  addDays,
  BUILTIN_TEMPLATES,
  changeFieldType,
  compatibleMaps,
  FIELD_EXAMPLE,
  FIELD_TYPE_LABEL,
  FIELD_TYPES,
  isChoice,
  fieldsFromTemplate,
  hasSensitive,
  MAPS_TO_OPTION_LABEL,
  MAX_FIELDS,
  MAX_RETENTION_DAYS,
  moveField,
  newField,
  normalizeFields,
  retentionMaxError,
  todayIn,
  type FieldType,
  type FormField,
  type FormItem,
  type MapsTo,
} from '@/domain/groupForms'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { DateField } from '@/ui/DateField'
import { FormFiller, type PublicFormView } from '@/ui/groups/GroupFormPublicScreen'
import { Field } from '@/ui/groups/GroupSheet'

/** Qué plantilla se usa para empezar un formulario nuevo. */
export interface StartTemplate {
  title: string
  purpose: string
  intro: string
  fields: FormField[]
}

export function TemplatePicker({ onPick }: { onPick: (t: StartTemplate) => void }) {
  const [saved, setSaved] = useState<SavedTemplate[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const load = () =>
    listTemplates()
      .then(setSaved)
      .catch((e) => setProblem(groupsErrorMessage(e)))
  useEffect(() => {
    void load()
  }, [])
  return (
    <div data-help-id="grupos.formulario-plantillas">
      <button type="button" className="grp-big-button" onClick={() => onPick({ title: '', purpose: '', intro: '', fields: [] })}>
        <span>✏️ Empezar desde cero</span>
        <span aria-hidden="true">›</span>
      </button>
      <p className="grp-section">Plantillas de partida</p>
      {BUILTIN_TEMPLATES.map((t) => (
        <button key={t.key} type="button" className="grp-row" onClick={() => onPick({ title: t.title, purpose: t.purpose, intro: t.intro, fields: fieldsFromTemplate(t) })}>
          <span aria-hidden="true">📋</span>
          <span className="grp-row-main">
            <span className="grp-row-title">{t.name}</span>
          </span>
        </button>
      ))}
      {saved.length > 0 && <p className="grp-section">Mis plantillas</p>}
      {saved.map((t) => (
        <div key={t.id} className="grp-folder-head" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="grp-row"
            style={{ marginBottom: 0 }}
            onClick={() =>
              onPick({
                title: t.definition.title,
                purpose: t.definition.purpose,
                intro: t.definition.intro ?? '',
                fields: t.definition.fields.map((f) => ({ ...f, id: newField(f.type).id })),
              })
            }
          >
            <span aria-hidden="true">⭐</span>
            <span className="grp-row-main">
              <span className="grp-row-title">{t.name}</span>
            </span>
          </button>
          <ConfirmButton label="Borrar" confirmMessage="¿Borrar esta plantilla?" onConfirm={() => void deleteTemplate(t.id).then(load)} />
        </div>
      ))}
      {problem && <p className="error">{problem}</p>}
    </div>
  )
}

/** Editor de opciones (elegir una / varias): una fila por opción, con subir, bajar y quitar. Las filas vacías se avisan y no se guardan; no se pierde nada al editar. */
function OptionsEditor({ options, onChange }: { options: string[]; onChange: (o: string[]) => void }) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= options.length) return
    const next = [...options]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="grp-opts" data-help-id="grupos.formulario-opciones">
      <span className="grp-opts-label">Opciones</span>
      {options.map((o, i) => (
        <div key={i} className="grp-opt-row">
          <input
            className={'grp-input' + (!o.trim() ? ' grp-input-warn' : '')}
            value={o}
            maxLength={100}
            placeholder={`Opción ${i + 1}`}
            aria-label={`Opción ${i + 1}`}
            onChange={(e) => onChange(options.map((x, k) => (k === i ? e.target.value : x)))}
          />
          <button type="button" className="chip" disabled={i === 0} aria-label={`Subir la opción ${i + 1}`} onClick={() => move(i, -1)}>
            ↑
          </button>
          <button type="button" className="chip" disabled={i === options.length - 1} aria-label={`Bajar la opción ${i + 1}`} onClick={() => move(i, 1)}>
            ↓
          </button>
          <button type="button" className="chip" disabled={options.length <= 2} aria-label={`Quitar la opción ${i + 1}`} onClick={() => onChange(options.filter((_, k) => k !== i))}>
            ✕
          </button>
        </div>
      ))}
      {options.some((o) => !o.trim()) && <p className="muted grp-opts-warn">Rellena o quita las opciones vacías: no se guardan.</p>}
      {options.length < 30 && (
        <button type="button" className="link-button" onClick={() => onChange([...options, ''])}>
          ＋ Añadir opción
        </button>
      )}
    </div>
  )
}

function QuestionEditor({
  field,
  index,
  total,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  field: FormField
  index: number
  total: number
  open: boolean
  onToggle: () => void
  onChange: (f: FormField) => void
  onMove: (d: -1 | 1) => void
  onRemove: () => void
}) {
  const choice = isChoice(field.type)
  const maps = field.sensitive ? [] : compatibleMaps(field.type)
  // Una asociación antigua que ya no es coherente se sigue enseñando (para poder quitarla), pero no se ofrece para elegir.
  const mapOptions = field.mapsTo && !maps.includes(field.mapsTo) ? [field.mapsTo, ...maps] : maps
  const n = index + 1
  return (
    <div className={'grp-card grp-q' + (open ? ' grp-q-open' : '')} data-help-id="grupos.formulario-pregunta-editor">
      <div className="grp-q-head">
        <button type="button" className="grp-q-toggle" aria-expanded={open} onClick={onToggle}>
          <span className="grp-q-num">{n}</span>
          <span className="grp-q-text">
            <span className="grp-q-title">{field.label.trim() || 'Pregunta sin título'}</span>
            <span className="grp-q-meta">
              {FIELD_TYPE_LABEL[field.type]}
              {field.required ? ' · Obligatoria' : ''}
              {field.sensitive ? ' · 🔒 Delicada' : ''}
            </span>
          </span>
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        <span className="grp-q-move">
          <button type="button" className="chip" disabled={index === 0} aria-label={`Subir la pregunta ${n}`} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" className="chip" disabled={index === total - 1} aria-label={`Bajar la pregunta ${n}`} onClick={() => onMove(1)}>
            ↓
          </button>
        </span>
      </div>
      {open && (
        <div className="grp-q-body">
          <Field label="Pregunta">
            <input className="grp-input" value={field.label} maxLength={200} placeholder={FIELD_EXAMPLE[field.type]} onChange={(e) => onChange({ ...field, label: e.target.value })} aria-label={`Texto de la pregunta ${n}`} />
          </Field>
          <Field label="Tipo de respuesta">
            <select className="grp-input" value={field.type} onChange={(e) => onChange(changeFieldType(field, e.target.value as FieldType))} aria-label={`Tipo de la pregunta ${n}`}>
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Explicación (opcional)">
            <input className="grp-input" value={field.help ?? ''} maxLength={300} onChange={(e) => onChange({ ...field, help: e.target.value || null })} aria-label={`Explicación de la pregunta ${n}`} />
          </Field>
          {choice && <OptionsEditor options={field.options} onChange={(options) => onChange({ ...field, options })} />}
          <label className="grp-check-row">
            <input type="checkbox" checked={field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} />
            <span>Obligatoria</span>
          </label>
          <label className="grp-check-row" data-help-id="grupos.formulario-delicado">
            <input type="checkbox" checked={field.sensitive} onChange={(e) => onChange({ ...field, sensitive: e.target.checked, mapsTo: e.target.checked ? null : field.mapsTo })} />
            <span>Dato delicado (DNI, pasaporte, salud…): se guarda protegido y caduca</span>
          </label>
          {mapOptions.length > 0 && (
            <Field label="Guardar la respuesta también en la ficha de la persona (opcional)" hint="Solo se completa si ese dato estaba vacío; si ya hay otro, te pregunto antes de cambiarlo.">
              <select className="grp-input" value={field.mapsTo ?? ''} onChange={(e) => onChange({ ...field, mapsTo: (e.target.value || null) as MapsTo | null })} aria-label={`Ficha de la pregunta ${n}`}>
                <option value="">No guardar en la ficha</option>
                {mapOptions.map((m) => (
                  <option key={m} value={m}>
                    {MAPS_TO_OPTION_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {!field.sensitive && mapOptions.length === 0 && field.type !== 'archivo' && (
            <p className="muted">Esta respuesta se queda en el formulario: la ficha de la persona no tiene un campo de este tipo.</p>
          )}
          <ConfirmButton label="Quitar esta pregunta" confirmMessage="¿Quitar la pregunta?" onConfirm={onRemove} />
        </div>
      )}
    </div>
  )
}

/** «＋ Añadir pregunta»: un solo botón que abre el selector con los nueve tipos, cada uno con un ejemplo orientativo. */
function AddQuestion({ onAdd }: { onAdd: (t: FieldType) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="grp-add-q">
      <button type="button" className="grp-secondary" aria-expanded={open} data-help-id="grupos.formulario-anadir-pregunta" onClick={() => setOpen((v) => !v)}>
        ＋ Añadir pregunta
      </button>
      {open && (
        <div className="grp-card grp-type-picker" role="menu" aria-label="Tipo de pregunta">
          {FIELD_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              className="grp-type-item"
              onClick={() => {
                onAdd(t)
                setOpen(false)
              }}
            >
              <span className="grp-type-name">{FIELD_TYPE_LABEL[t]}</span>
              <span className="grp-type-ex">{FIELD_EXAMPLE[t].replace('Por ejemplo: ', '')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Crear o editar un formulario: quién solicita los datos, para qué, las preguntas (reordenables, obligatorias, delicadas) y la fecha máxima de conservación si hay datos delicados.
 * Se puede guardar como plantilla y ver tal como lo verá quien responda.
 */
export function FormEditor({
  groupId,
  groupName,
  defaultRequester,
  form,
  start,
  onSaved,
  onCancel,
}: {
  groupId: string
  groupName: string
  defaultRequester: string
  form: FormItem | null
  start?: StartTemplate
  onSaved: (id: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(form?.title ?? start?.title ?? '')
  const [requester, setRequester] = useState(form?.requesterName ?? defaultRequester)
  const [contact, setContact] = useState(form?.requesterContact ?? '')
  const [purpose, setPurpose] = useState(form?.purpose ?? start?.purpose ?? '')
  const [intro, setIntro] = useState(form?.intro ?? start?.intro ?? '')
  const [fields, setFields] = useState<FormField[]>(form?.fields ?? start?.fields ?? [])
  const [deadline, setDeadline] = useState(form?.deadline ?? '')
  const [retention, setRetention] = useState(form?.retentionMax ?? '')
  const [templateName, setTemplateName] = useState('')
  const [preview, setPreview] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const toggleOpen = (id: string) =>
    setOpenIds((o) => {
      const n = new Set(o)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const today = todayIn(new Date())
  const sensitive = hasSensitive(fields)
  const change = (id: string, f: FormField) => setFields((fs) => fs.map((x) => (x.id === id ? f : x)))

  const validate = (): { ok: true; fields: FormField[] } | { ok: false; message: string } => {
    if (!title.trim()) return { ok: false, message: 'Ponle un título al formulario.' }
    if (!requester.trim()) return { ok: false, message: 'Indica quién solicita los datos (tu nombre o el de la organización).' }
    if (!purpose.trim()) return { ok: false, message: 'Indica para qué se piden los datos: es lo primero que verá quien responda.' }
    const blank = fields.find((f) => isChoice(f.type) && f.options.some((o) => !o.trim()))
    if (blank) return { ok: false, message: `Hay opciones vacías en «${blank.label.trim() || 'una pregunta'}»: rellénalas o quítalas.` }
    const n = normalizeFields(fields)
    if (n.errors.length > 0) return { ok: false, message: n.errors[0] }
    if (sensitive) {
      const e = retentionMaxError(retention || null, today)
      if (e) return { ok: false, message: e }
    }
    return { ok: true, fields: n.fields }
  }

  const input = (fs: FormField[]) => ({ title, requesterName: requester, requesterContact: contact || null, purpose, intro: intro || null, fields: fs, deadline: deadline || null })

  const save = async () => {
    if (busy) return
    const v = validate()
    if (!v.ok) return setProblem(v.message)
    setBusy(true)
    setProblem(null)
    try {
      let id = form?.id
      if (id) await updateForm(id, input(v.fields))
      else id = await createForm(groupId, input(v.fields))
      if (sensitive && retention && retention !== form?.retentionMax) {
        const shortened = await setFormRetention(id, retention)
        if (shortened > 0) setNote(`Se ha acortado la conservación de ${shortened} ${shortened === 1 ? 'dato ya recogido' : 'datos ya recogidos'}.`)
      }
      emitHelpEvent('grupos.form-saved') // el formulario YA está guardado
      onSaved(id)
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setBusy(false)
    }
  }
  const asTemplate = async () => {
    const v = validate()
    if (!templateName.trim()) return setProblem('Ponle un nombre a la plantilla.')
    if (!v.ok && v.message !== 'Indica para qué se piden los datos: es lo primero que verá quien responda.') return setProblem(v.message)
    try {
      await saveTemplate(templateName, { title, purpose, intro: intro || null, fields: normalizeFields(fields).fields })
      setTemplateName('')
      setNote('Plantilla guardada. La verás al crear un formulario nuevo.')
    } catch (e) {
      setProblem(groupsErrorMessage(e))
    }
  }

  const previewView: PublicFormView = useMemo(
    () => ({
      kind: 'participante',
      title: title || 'Título del formulario',
      requesterName: requester || 'Quien solicita',
      requesterContact: contact || null,
      groupName,
      purpose: purpose || 'Para qué se piden los datos',
      intro: intro || null,
      deadline: deadline || null,
      closed: false,
      personName: 'Nombre de la persona',
      fields: normalizeFields(fields).fields.map((f) => ({ id: f.id, type: f.type, label: f.label, help: f.help, required: f.required, options: f.options, sensitive: f.sensitive })),
      retention: sensitive && retention ? { max: retention, today } : null,
      answered: false,
      previous: null,
      agreedExpires: null,
      retentionChangedSinceAnswer: false,
      retentionMax: retention || null,
      deletion: null,
    }),
    [title, requester, contact, groupName, purpose, intro, deadline, fields, sensitive, retention, today],
  )

  if (preview)
    return (
      <div>
        <button type="button" className="link-button" onClick={() => setPreview(false)}>
          ← Seguir editando
        </button>
        <FormFiller view={previewView} preview />
      </div>
    )

  return (
    <div data-help-id="grupos.formulario-editor">
      <p className="muted">Lo que escribas en las tres primeras casillas es lo primero que verá quien responda: quién pide los datos, para qué y a quién preguntar. PEPA no aparece como solicitante.</p>
      <Field label="Título del formulario">
        <input className="grp-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Por ejemplo: Datos para la excursión" data-help-id="grupos.formulario-titulo" />
      </Field>
      <Field label="Quién solicita los datos" hint="Tu nombre o el de la organización (el colegio, el club…).">
        <input className="grp-input" value={requester} maxLength={120} onChange={(e) => setRequester(e.target.value)} data-help-id="grupos.formulario-solicitante" />
      </Field>
      <Field label="Para qué se piden (finalidad)">
        <textarea className="grp-input grp-textarea" rows={2} value={purpose} maxLength={500} onChange={(e) => setPurpose(e.target.value)} data-help-id="grupos.formulario-finalidad" />
      </Field>
      <Field label="Contacto para consultas (opcional)" hint="Un correo o teléfono al que preguntar dudas.">
        <input className="grp-input" value={contact} maxLength={200} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <Field label="Instrucciones (opcional)">
        <textarea className="grp-input grp-textarea" rows={2} value={intro} maxLength={1000} onChange={(e) => setIntro(e.target.value)} />
      </Field>
      <Field label="Fecha límite (opcional)">
        <DateField value={deadline} onChange={setDeadline} placeholder="Sin fecha límite" min={today} />
      </Field>

      <p className="grp-section">Preguntas</p>
      {fields.length === 0 && <p className="muted">Todavía no hay preguntas. Pulsa «＋ Añadir pregunta».</p>}
      {fields.map((f, i) => (
        <QuestionEditor
          key={f.id}
          field={f}
          index={i}
          total={fields.length}
          open={openIds.has(f.id)}
          onToggle={() => toggleOpen(f.id)}
          onChange={(nf) => change(f.id, nf)}
          onMove={(d) => setFields((fs) => moveField(fs, f.id, d))}
          onRemove={() => setFields((fs) => fs.filter((x) => x.id !== f.id))}
        />
      ))}
      {fields.length < MAX_FIELDS && (
        <AddQuestion
          onAdd={(t) => {
            const nf = newField(t)
            setFields((fs) => [...fs, nf])
            setOpenIds((o) => new Set(o).add(nf.id)) // una pregunta nueva se abre sola para escribirla
          }}
        />
      )}

      {sensitive && (
        <div className="grp-card" style={{ marginTop: 12 }} data-help-id="grupos.formulario-retencion">
          <p style={{ marginTop: 0 }}>
            <strong>🔒 Conservación de los datos delicados</strong>
          </p>
          <p className="muted">
            Se guardan protegidos (solo tú puedes verlos, y queda constancia de cada vez), nunca van a las notas ni a las exportaciones y se eliminan solos en la fecha que indiques. Quien responde puede elegir una fecha anterior y verá la fecha exacta.
          </p>
          <Field label={`Conservarlos como máximo hasta (tope provisional de ${MAX_RETENTION_DAYS} días)`} hint="Pon la fecha más cercana que te baste para lo que pides: puede ser mucho antes del tope.">
            <DateField value={retention} onChange={setRetention} placeholder="Elige la fecha" min={addDays(today, 1)} max={addDays(today, MAX_RETENTION_DAYS)} />
          </Field>
          {form && form.retentionMax && retention && retention !== form.retentionMax && (
            <p className="muted">
              {retention < form.retentionMax
                ? 'Al acortar la fecha, los datos ya recogidos se eliminarán antes y se avisará a quien respondió.'
                : 'Al alargar la fecha, los datos ya recogidos NO se alargan: cada persona aceptó la suya. Solo afecta a las respuestas nuevas.'}
            </p>
          )}
          <p className="muted">Conserva los datos solo para la finalidad que has explicado a las familias. Si una obligación legal te exige guardar algo más tiempo, hazlo tú fuera de PEPA y con la base legal que corresponda.</p>
          <p className="muted">PEPA solo elimina lo que guarda ella. Si descargas o envías esos datos a otra parte (Google Drive, una agencia…), esas copias las tienes que borrar tú.</p>
        </div>
      )}

      {problem && <p className="error">{problem}</p>}
      {note && <p className="muted" role="status">{note}</p>}
      <div className="form-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void save()} data-help-id="grupos.formulario-guardar">
          {form ? 'Guardar cambios' : 'Guardar formulario'}
        </button>
        <button type="button" className="grp-secondary" onClick={() => setPreview(true)} data-help-id="grupos.formulario-vista-previa">
          Ver cómo queda
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>

      <p className="grp-section">Guardar como plantilla</p>
      <div className="grp-field-row">
        <input className="grp-input" value={templateName} placeholder="Nombre de la plantilla" onChange={(e) => setTemplateName(e.target.value)} aria-label="Nombre de la plantilla" />
        <button type="button" className="grp-secondary" onClick={() => void asTemplate()}>
          Guardar plantilla
        </button>
      </div>
      <p className="muted">La plantilla guarda solo las preguntas y los textos, nunca respuestas de nadie.</p>
    </div>
  )
}
