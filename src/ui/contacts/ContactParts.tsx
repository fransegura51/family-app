import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteContact, updateContactBirthDate, type ContactExtras } from '@/data/contacts'
import { listLinksOfContact, type ContactLinkInfo } from '@/data/groupContacts'
import { allCategories, allEmails, allPhones, contactFullName, RELATION_LABEL } from '@/domain/contactsModel'
import type { Contact } from '@/domain/types'
import { formatDateFromTimestamp } from '@/domain/dateFormat'
import { errorMessage } from '@/domain/errorMessage'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { DateField } from '@/ui/DateField'

// Piezas de la ficha ampliada de Contactos (0354). Todo lo nuevo es OPCIONAL: no se obliga a rellenar nada y los contactos de siempre se ven y editan igual.

export interface ExtraState {
  surname: string
  nickname: string
  whatsappName: string
  extraPhones: string[]
  extraEmails: string[]
  extraCategories: string[]
  address: string
}

export const emptyExtras = (): ExtraState => ({ surname: '', nickname: '', whatsappName: '', extraPhones: [], extraEmails: [], extraCategories: [], address: '' })

export const extrasFromContact = (c: Contact): ExtraState => ({
  surname: c.surname ?? '',
  nickname: c.nickname ?? '',
  whatsappName: c.whatsappName ?? '',
  extraPhones: c.extraPhones ?? [],
  extraEmails: c.extraEmails ?? [],
  extraCategories: c.extraCategories ?? [],
  address: c.address ?? '',
})

export const hasExtras = (e: ExtraState) => !!(e.surname || e.nickname || e.whatsappName || e.extraPhones.length || e.extraEmails.length || e.extraCategories.length || e.address)

export const toExtras = (e: ExtraState): ContactExtras => ({
  surname: e.surname,
  nickname: e.nickname,
  whatsappName: e.whatsappName,
  extraPhones: e.extraPhones,
  extraEmails: e.extraEmails,
  extraCategories: e.extraCategories,
  address: e.address,
})

function ListField({ label, values, onChange, type, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; type: 'tel' | 'email' | 'text'; placeholder: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) return setDraft('')
    onChange([...values, v])
    setDraft('')
  }
  return (
    <div className="contact-listfield">
      <span>{label}</span>
      {values.map((v) => (
        <div key={v} className="inline-fields">
          <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{v}</span>
          <button type="button" className="link-button" aria-label={`Quitar ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
            ✕
          </button>
        </div>
      ))}
      <div className="inline-fields">
        <input
          type={type}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="link-button" onClick={add} disabled={!draft.trim()}>
          Añadir
        </button>
      </div>
    </div>
  )
}

/** Campos extra de la ficha, plegados por defecto («＋ Más datos») para que dar de alta un contacto siga siendo rápido. */
export function ExtraFields({ value, onChange, defaultOpen }: { value: ExtraState; onChange: (v: ExtraState) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen || hasExtras(value))
  const set = <K extends keyof ExtraState>(k: K, v: ExtraState[K]) => onChange({ ...value, [k]: v })
  if (!open)
    return (
      <button type="button" className="link-button" data-help-id="contactos.mas-datos" onClick={() => setOpen(true)}>
        ＋ Más datos (apellidos, varios teléfonos y correos, dirección…)
      </button>
    )
  return (
    <div data-help-id="contactos.mas-datos-campos" className="contact-extras">
      <label>
        Apellidos
        <input type="text" value={value.surname} onChange={(e) => set('surname', e.target.value)} />
      </label>
      <label>
        Apodo o nombre habitual
        <input type="text" value={value.nickname} onChange={(e) => set('nickname', e.target.value)} />
      </label>
      <label>
        Nombre original de WhatsApp
        <input type="text" value={value.whatsappName} onChange={(e) => set('whatsappName', e.target.value)} />
      </label>
      <ListField label="Otros teléfonos" values={value.extraPhones} onChange={(v) => set('extraPhones', v)} type="tel" placeholder="Otro teléfono" />
      <ListField label="Otros correos" values={value.extraEmails} onChange={(v) => set('extraEmails', v)} type="email" placeholder="Otro correo" />
      <ListField label="Otras categorías" values={value.extraCategories} onChange={(v) => set('extraCategories', v)} type="text" placeholder="Otra categoría" />
      <label>
        Dirección
        <input type="text" value={value.address} onChange={(e) => set('address', e.target.value)} />
      </label>
    </div>
  )
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Añadido a mano',
  whatsapp: 'Captura de WhatsApp',
  vcf: 'Archivo de contactos (.vcf)',
  telefono: 'Agenda del teléfono',
  grupo: 'Creado desde un grupo',
  formulario: 'Formulario de datos',
}

function formatBirthDate(d: string): string {
  return new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
}

/**
 * Ficha completa de un contacto (se abre al tocar su tarjeta): todos los datos, relaciones con alumnos y grupos, y las acciones (llamar, compartir, editar, eliminar).
 * Los grupos solo aparecen si la persona es responsable de ellos.
 */
export function ContactSheet({
  contact: c,
  onClose,
  onChanged,
  onEdit,
  onShare,
}: {
  contact: Contact
  onClose: () => void
  onChanged: () => void
  onEdit: () => void
  onShare: () => Promise<void>
}) {
  const [links, setLinks] = useState<ContactLinkInfo[]>([])
  const [editingBirthday, setEditingBirthday] = useState(false)
  const [birthDate, setBirthDate] = useState(c.birthDate ?? '')
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listLinksOfContact(c.id)
      .then(setLinks)
      .catch(() => setLinks([]))
  }, [c.id])

  const phones = allPhones(c)
  const emails = allEmails(c)
  const cats = allCategories(c)
  const row = (label: string, body: React.ReactNode) => (
    <div className="contact-sheet-row">
      <span className="muted">{label}</span>
      <div>{body}</div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label={contactFullName(c)} data-help-id="contactos.ficha" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0, overflowWrap: 'anywhere' }}>
            {contactFullName(c)}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {c.nickname && <p className="muted" style={{ margin: '0 0 6px' }}>«{c.nickname}»</p>}
        {cats.length > 0 && row('Categorías', cats.join(' · '))}
        {phones.length > 0 &&
          row(
            phones.length === 1 ? 'Teléfono' : 'Teléfonos',
            phones.map((p) => (
              <div key={p}>
                <a href={`tel:${p}`}>{p}</a>
              </div>
            )),
          )}
        {emails.length > 0 &&
          row(
            emails.length === 1 ? 'Correo' : 'Correos',
            emails.map((m) => (
              <div key={m} style={{ overflowWrap: 'anywhere' }}>
                <a href={`mailto:${m}`}>{m}</a>
              </div>
            )),
          )}
        {c.address && row('Dirección', <span style={{ overflowWrap: 'anywhere' }}>{c.address}</span>)}
        {c.whatsappName && row('Nombre en WhatsApp', <span style={{ overflowWrap: 'anywhere' }}>{c.whatsappName}</span>)}
        {c.notes && row('Notas', <span style={{ overflowWrap: 'anywhere' }}>{c.notes}</span>)}
        {row(
          'Cumpleaños',
          editingBirthday ? (
            <div className="inline-fields">
              <DateField value={birthDate} onChange={setBirthDate} placeholder="Sin cumpleaños" />
              <button
                type="button"
                className="link-button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  try {
                    await updateContactBirthDate(c.id, birthDate || null)
                    setEditingBirthday(false)
                    onChanged()
                  } catch (err) {
                    setError(errorMessage(err, 'No se pudo guardar'))
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" className="link-button" onClick={() => setEditingBirthday(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button type="button" className="link-button contact-card-birthday" data-help-id="contactos.cumple-ficha" onClick={() => setEditingBirthday(true)}>
              {c.birthDate ? `🎂 ${formatBirthDate(c.birthDate)}` : '🎂 Añadir cumpleaños'}
            </button>
          ),
        )}
        {links.length > 0 &&
          row(
            'Familiar de',
            links.map((l) => (
              <div key={`${l.participantId}`}>
                {RELATION_LABEL[l.relation]} de <strong>{l.participantName}</strong> · <Link to={`/grupos/${l.groupId}/participantes`}>{l.groupName}</Link>
              </div>
            )),
          )}
        {c.source?.kind && row('Procedencia', `${SOURCE_LABEL[c.source.kind] ?? c.source.kind}${c.source.at ? ` · ${formatDateFromTimestamp(c.source.at)}` : ''}`)}
        {error && <p className="error">{error}</p>}

        <div className="contact-sheet-actions" data-help-id="contactos.acciones">
          {phones[0] && (
            <a href={`tel:${phones[0]}`} className="link-button" data-help-id="contactos.llamar" aria-label="Llamar">
              📞 Llamar
            </a>
          )}
          <button
            type="button"
            className="link-button"
            data-help-id="contactos.compartir-uno"
            disabled={sharing}
            onClick={async () => {
              setSharing(true)
              try {
                await onShare()
              } finally {
                setSharing(false)
              }
            }}
          >
            {sharing ? '…' : '📤 Compartir'}
          </button>
          <button type="button" className="link-button" data-help-id="contactos.editar" onClick={onEdit}>
            ✏️ Editar
          </button>
          <ConfirmButton label="✕ Eliminar" className="link-button" confirmMessage="¿Eliminar este contacto?" onConfirm={() => void deleteContact(c.id).then(() => (onChanged(), onClose()))} />
        </div>
      </div>
    </div>
  )
}
