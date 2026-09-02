import { useEffect, useMemo, useState } from 'react'
import { listFamilyMembers } from '@/data/family'
import { listContacts } from '@/data/contacts'
import { nextBirthday, sortByDaysUntil, type UpcomingBirthday } from '@/domain/birthdays'
import { MemberAvatar } from '@/ui/MemberAvatar'
import type { Contact, FamilyMember } from '@/domain/types'

interface UpcomingItem extends UpcomingBirthday {
  name: string
  member: FamilyMember | null
}

export function BirthdaysScreen() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listFamilyMembers(), listContacts()])
      .then(([m, c]) => {
        setMembers(m)
        setContacts(c)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Cumpleaños de la familia y de los contactos (p. ej. la abuela o un
  // amigo guardado como contacto, no como miembro) en una sola lista.
  const upcoming = useMemo<UpcomingItem[]>(() => {
    const fromMembers = members
      .filter((m) => m.birthDate)
      .map((m) => ({ ...nextBirthday(m.id, m.birthDate!), name: m.name, member: m }))
    const fromContacts = contacts
      .filter((c) => c.birthDate)
      .map((c) => ({ ...nextBirthday(c.id, c.birthDate!), name: c.name, member: null }))
    return sortByDaysUntil([...fromMembers, ...fromContacts])
  }, [members, contacts])

  if (loading) return <div className="screen">Cargando cumpleaños…</div>

  return (
    <div className="screen">
      <h1>Cumpleaños</h1>
      {error && <p className="error">{error}</p>}
      <div className="event-list">
        {upcoming.map((b) => {
          const label = b.daysUntil === 0 ? '¡Hoy!' : b.daysUntil === 1 ? 'Mañana' : `En ${b.daysUntil} días`
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
                <p className="muted">
                  {label} · cumple {b.turningAge} ·{' '}
                  {new Date(b.nextDate + 'T00:00').toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'long',
                  })}
                  {!b.member && ' · contacto'}
                </p>
              </div>
            </div>
          )
        })}
        {upcoming.length === 0 && (
          <p className="muted">
            Nadie tiene fecha de nacimiento guardada todavía — añádela desde Familia o Contactos.
          </p>
        )}
      </div>
    </div>
  )
}
