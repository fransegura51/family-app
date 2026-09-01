import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { addFamilyMember, deleteFamilyMember, listFamilyMembers, updateFamilyMember } from '@/data/family'
import type { FamilyMember, FamilyRole, MemberType } from '@/domain/types'

const MEMBER_TYPES: { value: MemberType; label: string }[] = [
  { value: 'adult', label: 'Adulto' },
  { value: 'child', label: 'Niño/a' },
  { value: 'baby', label: 'Bebé' },
]

export function FamilyScreen({ role }: { role: FamilyRole }) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const isAdmin = role === 'admin'

  function reload() {
    setLoading(true)
    listFamilyMembers()
      .then(setMembers)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function handleDelete(id: string) {
    try {
      await deleteFamilyMember(id)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar el miembro')
    }
  }

  if (loading) return <div className="screen">Cargando familia…</div>

  return (
    <div className="screen">
      <h1>Familia</h1>
      <Link to="/actividad" className="link-button">
        Ver actividad reciente
      </Link>
      {error && <p className="error">{error}</p>}
      <div className="card-grid">
        {members.map((m) =>
          editingId === m.id ? (
            <EditMemberForm
              key={m.id}
              member={m}
              onDone={() => {
                setEditingId(null)
                reload()
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={m.id} className="card member-card" style={{ borderColor: m.color }}>
              <span className="avatar" style={{ background: m.color }}>
                {m.name.charAt(0)}
              </span>
              <div className="member-card-body">
                <strong>{m.name}</strong>
                <p className="muted">{m.memberType}</p>
              </div>
              {isAdmin && m.memberType !== 'admin' && (
                <div className="member-card-actions">
                  <button type="button" className="link-button" onClick={() => setEditingId(m.id)}>
                    Editar
                  </button>
                  <button type="button" className="link-button" onClick={() => handleDelete(m.id)}>
                    Borrar
                  </button>
                </div>
              )}
            </div>
          ),
        )}
        {members.length === 0 && <p className="muted">Todavía no hay miembros.</p>}
      </div>

      {isAdmin && <AddMemberForm onAdded={reload} />}
    </div>
  )
}

function EditMemberForm({
  member,
  onDone,
  onCancel,
}: {
  member: FamilyMember
  onDone: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(member.name)
  const [memberType, setMemberType] = useState<MemberType>(member.memberType)
  const [color, setColor] = useState(member.color)
  const [birthDate, setBirthDate] = useState(member.birthDate ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateFamilyMember(member.id, { name, memberType, color, birthDate: birthDate || null })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <label>
        Nombre
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Tipo
        <select value={memberType} onChange={(e) => setMemberType(e.target.value as MemberType)}>
          {MEMBER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Color
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <label>
        Fecha de nacimiento (opcional)
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function AddMemberForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [memberType, setMemberType] = useState<MemberType>('child')
  const [color, setColor] = useState('#4C6EF5')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addFamilyMember({ name, memberType, color, birthDate: birthDate || null })
      setName('')
      setBirthDate('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir el miembro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Añadir miembro</h2>
      <label>
        Nombre
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Tipo
        <select value={memberType} onChange={(e) => setMemberType(e.target.value as MemberType)}>
          {MEMBER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Color
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <label>
        Fecha de nacimiento (opcional)
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Añadiendo…' : 'Añadir'}
      </button>
    </form>
  )
}
