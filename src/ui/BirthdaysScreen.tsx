import { useEffect, useMemo, useState } from 'react'
import { listFamilyMembers } from '@/data/family'
import { nextBirthday, sortByDaysUntil } from '@/domain/birthdays'
import type { FamilyMember } from '@/domain/types'

export function BirthdaysScreen() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listFamilyMembers()
      .then(setMembers)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const upcoming = useMemo(() => {
    const withBirthday = members.filter((m) => m.birthDate)
    return sortByDaysUntil(withBirthday.map((m) => nextBirthday(m.id, m.birthDate!)))
  }, [members])

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  if (loading) return <div className="screen">Cargando cumpleaños…</div>

  return (
    <div className="screen">
      <h1>Cumpleaños</h1>
      {error && <p className="error">{error}</p>}
      <div className="event-list">
        {upcoming.map((b) => {
          const member = memberById.get(b.memberId)
          if (!member) return null
          const label =
            b.daysUntil === 0
              ? '¡Hoy!'
              : b.daysUntil === 1
                ? 'Mañana'
                : `En ${b.daysUntil} días`
          return (
            <div key={b.memberId} className="card task-card">
              <span className="avatar" style={{ background: member.color }}>
                {member.name.charAt(0)}
              </span>
              <div className="task-card-main">
                <strong>{member.name}</strong>
                <p className="muted">
                  {label} · cumple {b.turningAge} ·{' '}
                  {new Date(b.nextDate + 'T00:00').toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
              </div>
            </div>
          )
        })}
        {upcoming.length === 0 && (
          <p className="muted">
            Nadie tiene fecha de nacimiento guardada todavía — añádela desde Familia.
          </p>
        )}
      </div>
    </div>
  )
}
