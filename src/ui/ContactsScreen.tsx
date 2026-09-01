import { FormEvent, useEffect, useState } from 'react'
import { addContact, deleteContact, listContacts } from '@/data/contacts'
import type { Contact } from '@/domain/types'

const CATEGORIES = ['Colegio', 'Médico', 'Emergencia', 'Familia', 'Otros']

export function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    listContacts()
      .then(setContacts)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  if (loading) return <div className="screen">Cargando contactos…</div>

  return (
    <div className="screen">
      <h1>Contactos</h1>
      {error && <p className="error">{error}</p>}
      <div className="event-list">
        {contacts.map((c) => (
          <div key={c.id} className="card task-card">
            <div className="task-card-main">
              <strong>{c.name}</strong>
              <p className="muted">
                {c.category}
                {c.phone && ` · ${c.phone}`}
                {c.email && ` · ${c.email}`}
              </p>
              {c.notes && <p className="muted">{c.notes}</p>}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="link-button">
                  Llamar
                </a>
              )}
            </div>
            <button type="button" className="link-button" onClick={() => deleteContact(c.id).then(reload)}>
              Eliminar
            </button>
          </div>
        ))}
        {contacts.length === 0 && <p className="muted">No hay contactos guardados.</p>}
      </div>
      <AddContactForm onAdded={reload} />
    </div>
  )
}

function AddContactForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addContact({ name, category, phone, email, notes })
      setName('')
      setPhone('')
      setEmail('')
      setNotes('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo contacto</h2>
      <label>
        Nombre
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Colegio Los Álamos" required />
      </label>
      <label>
        Categoría
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        Teléfono
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Notas
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Añadir'}
      </button>
    </form>
  )
}
