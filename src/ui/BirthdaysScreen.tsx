import { useEffect, useMemo, useState } from 'react'
import { listFamilyMembers, setFamilyMemberBirthdayFavorite, updateFamilyMemberBirthDate } from '@/data/family'
import { listContacts, setContactBirthdayFavorite, updateContactBirthDate } from '@/data/contacts'
import { nextBirthday, sortByDaysUntil, type UpcomingBirthday } from '@/domain/birthdays'
import { MemberAvatar } from '@/ui/MemberAvatar'
import type { Contact, FamilyMember } from '@/domain/types'

interface UpcomingItem extends UpcomingBirthday {
  name: string
  member: FamilyMember | null
  contact: Contact | null
  favorite: boolean
}

const TABS = ['Próximos', 'Favoritos'] as const
type Tab = (typeof TABS)[number]

export function BirthdaysScreen() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('Próximos')
  const [editingId, setEditingId] = useState<string | null>(null)

  function reload() {
    return Promise.all([listFamilyMembers(), listContacts()])
      .then(([m, c]) => {
        setMembers(m)
        setContacts(c)
      })
      .catch((e: Error) => setError(e.message))
  }

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [])

  // Cumpleaños de la familia y de los contactos (p. ej. la abuela o un
  // amigo guardado como contacto, no como miembro) en una sola lista.
  const upcoming = useMemo<UpcomingItem[]>(() => {
    const fromMembers = members
      .filter((m) => m.birthDate)
      .map((m) => ({ ...nextBirthday(m.id, m.birthDate!), name: m.name, member: m, contact: null, favorite: m.birthdayFavorite }))
    const fromContacts = contacts
      .filter((c) => c.birthDate)
      .map((c) => ({ ...nextBirthday(c.id, c.birthDate!), name: c.name, member: null, contact: c, favorite: c.birthdayFavorite }))
    return sortByDaysUntil([...fromMembers, ...fromContacts])
  }, [members, contacts])

  const visible = tab === 'Favoritos' ? upcoming.filter((b) => b.favorite) : upcoming

  async function handleToggleFavorite(item: UpcomingItem) {
    try {
      if (item.member) await setFamilyMemberBirthdayFavorite(item.member.id, !item.favorite)
      else if (item.contact) await setContactBirthdayFavorite(item.contact.id, !item.favorite)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar')
    }
  }

  async function handleSaveDate(item: UpcomingItem, newDate: string) {
    try {
      if (item.member) await updateFamilyMemberBirthDate(item.member.id, newDate)
      else if (item.contact) await updateContactBirthDate(item.contact.id, newDate)
      setEditingId(null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  async function handleRemove(item: UpcomingItem) {
    if (!confirm(`¿Quitar el cumpleaños de ${item.name}?`)) return
    try {
      if (item.member) await updateFamilyMemberBirthDate(item.member.id, null)
      else if (item.contact) await updateContactBirthDate(item.contact.id, null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar')
    }
  }

  if (loading) return <div className="screen">Cargando cumpleaños…</div>

  return (
    <div className="screen">
      <h1>Cumpleaños</h1>
      {error && <p className="error">{error}</p>}

      <div className="filter-row">
        {TABS.map((t) => (
          <button key={t} type="button" className={'chip' + (tab === t ? ' chip-active' : '')} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="event-list">
        {visible.map((b) => {
          const label = b.daysUntil === 0 ? '¡Hoy!' : b.daysUntil === 1 ? 'Mañana' : `En ${b.daysUntil} días`
          const isEditing = editingId === b.memberId
          return (
            <div key={b.memberId} className="card task-card">
              {b.member ? (
                <MemberAvatar member={b.member} size={40} />
              ) : (
                <span className="member-avatar member-avatar-fallback" style={{ width: 40, height: 40, fontSize: 18, background: '#9ca3af' }}>
                  {b.name.charAt(0)}
                </span>
              )}
              <div className="task-card-main">
                <strong>{b.name}</strong>
                {isEditing ? (
                  <BirthdayDateEditor
                    initialValue={b.birthDate}
                    onCancel={() => setEditingId(null)}
                    onSave={(date) => handleSaveDate(b, date)}
                  />
                ) : (
                  <p className="muted">
                    {label} · cumple {b.turningAge} ·{' '}
                    {new Date(b.nextDate + 'T00:00').toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                    })}
                    {!b.member && ' · contacto'}
                  </p>
                )}
              </div>
              {!isEditing && (
                <div className="task-card-actions">
                  <button type="button" className="link-button" onClick={() => handleToggleFavorite(b)} aria-label="Favorito">
                    {b.favorite ? '⭐' : '☆'}
                  </button>
                  <button type="button" className="link-button" onClick={() => setEditingId(b.memberId)} aria-label="Editar">
                    ✏️
                  </button>
                  <button type="button" className="link-button" onClick={() => handleRemove(b)} aria-label="Quitar">
                    ✕
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {visible.length === 0 && tab === 'Próximos' && (
          <p className="muted">
            Nadie tiene fecha de nacimiento guardada todavía — añádela desde Familia o Contactos.
          </p>
        )}
        {visible.length === 0 && tab === 'Favoritos' && (
          <p className="muted">Marca alguno con ⭐ para que aparezca aquí.</p>
        )}
      </div>
    </div>
  )
}

function BirthdayDateEditor({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string
  onSave: (date: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <div className="inline-form-row">
      <input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="button" onClick={() => onSave(value)}>
        Guardar
      </button>
      <button type="button" className="link-button" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}
