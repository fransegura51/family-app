import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addFamilyMember,
  deleteFamilyMember,
  generateMemberInviteCode,
  listFamilyMembers,
  updateFamilyMember,
  uploadMemberPhoto,
} from '@/data/family'
import { supabase } from '@/data/supabaseClient'
import { MemberAvatar } from '@/ui/MemberAvatar'
import type { FamilyMember, MemberType, Profile } from '@/domain/types'

const MEMBER_TYPES: { value: MemberType; label: string }[] = [
  { value: 'admin', label: 'Administrador/a' },
  { value: 'adult', label: 'Adulto' },
  { value: 'child', label: 'Niño/a' },
  { value: 'baby', label: 'Bebé' },
]

export function FamilyScreen({ profile }: { profile: Profile }) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const isAdmin = profile.role === 'admin'

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
      {/* Hace falta para que cada persona pueda tener su PROPIA cuenta en
          su propio móvil en vez de compartir el login de otra (p. ej.
          Paco entrando siempre como Jennifer, lo que confundía su
          ubicación con la de ella) — cierra esta sesión para poder
          entrar con la cuenta nueva creada con el código de invitación. */}
      <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>
        Cerrar sesión ({profile.displayName})
      </button>
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
              <MemberAvatar member={m} size={40} />
              <div className="member-card-body">
                <strong>{m.name}</strong>
                <p className="muted">{m.memberType}</p>
              </div>
              {isAdmin && (
                <div className="member-card-actions">
                  <PhotoUploadButton memberId={m.id} onUploaded={reload} />
                  <button type="button" className="link-button" onClick={() => setEditingId(m.id)}>
                    Editar
                  </button>
                  {m.linkedProfileId !== profile.id && (
                    <button type="button" className="link-button" onClick={() => handleDelete(m.id)}>
                      Borrar
                    </button>
                  )}
                </div>
              )}
              {/* Solo tiene sentido para quien todavía no tiene su
                  propia cuenta — ligado hoy a la sesión de otro (p. ej.
                  Paco entrando siempre como Jennifer). El código enlaza
                  la cuenta nueva a ESTE perfil ya existente, en vez de
                  crear una familia aparte. */}
              {isAdmin && !m.linkedProfileId && <InviteCodeButton memberId={m.id} memberName={m.name} />}
            </div>
          ),
        )}
        {members.length === 0 && <p className="muted">Todavía no hay miembros.</p>}
      </div>

      {isAdmin && <AddMemberForm onAdded={reload} />}
    </div>
  )
}

function PhotoUploadButton({ memberId, onUploaded }: { memberId: string; onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false)

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await uploadMemberPhoto(memberId, file)
      onUploaded()
    } catch {
      // Se queda como estaba: no hay sitio para un error aquí sin
      // complicar la tarjeta, y reintentar es tan fácil como volver a tocar.
    } finally {
      setUploading(false)
    }
  }

  return (
    <label className="link-button" style={{ cursor: 'pointer' }}>
      {uploading ? 'Subiendo…' : '📷 Foto'}
      <input type="file" accept="image/*" onChange={handleChange} style={{ display: 'none' }} disabled={uploading} />
    </label>
  )
}

function InviteCodeButton({ memberId, memberName }: { memberId: string; memberName: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      setCode(await generateMemberInviteCode(memberId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el código')
    } finally {
      setGenerating(false)
    }
  }

  if (code) {
    return (
      <div className="card" style={{ marginTop: 8, padding: 12 }}>
        <p className="muted">
          Código para que {memberName} se cree su propia cuenta (válido 24h, un solo uso):
        </p>
        <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>{code}</p>
        <p className="muted">
          Dile que entre en la app, toque "¿No tienes cuenta? Crear una", ponga su propio email y
          contraseña — y al terminar, en la pantalla siguiente, toque "Ya tengo un código de
          invitación" y escriba este código.
        </p>
      </div>
    )
  }

  return (
    <div className="member-card-actions">
      <button type="button" className="link-button" onClick={handleGenerate} disabled={generating}>
        {generating ? 'Generando…' : '🔑 Generar código de acceso'}
      </button>
      {error && <p className="error">{error}</p>}
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
