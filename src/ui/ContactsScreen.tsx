import { FormEvent, useEffect, useState } from 'react'
import { addContact, deleteContact, listContacts } from '@/data/contacts'
import { isContactPickerSupported, pickContacts, type PickedContact } from '@/services/contactPicker'
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
      <ImportContactsForm onAdded={reload} />
      <AddContactForm existingContacts={contacts} onAdded={reload} />
    </div>
  )
}

// Contact Picker API (Skill: agenda) — solo Chrome/Edge en Android, así
// que si el navegador no la soporta (iPhone, ordenador…) directamente
// no se muestra el botón en vez de fallar al pulsarlo.
function ImportContactsForm({ onAdded }: { onAdded: () => void }) {
  const [picked, setPicked] = useState<PickedContact[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [category, setCategory] = useState(CATEGORIES[0])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!isContactPickerSupported()) return null

  async function handlePick() {
    setError(null)
    try {
      const results = await pickContacts()
      setPicked(results)
      setSelected(new Set(results.map((_, i) => i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la agenda del teléfono')
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      for (const i of selected) {
        const p = picked[i]
        await addContact({ name: p.name, category, phone: p.phone ?? '', email: p.email ?? '', notes: '' })
      }
      setPicked([])
      setSelected(new Set())
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los contactos')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form">
      <h2>Importar del teléfono</h2>
      {picked.length === 0 ? (
        <button type="button" onClick={handlePick}>
          📱 Elegir de mis contactos
        </button>
      ) : (
        <>
          <p className="muted">Marca los que quieras guardar en la app:</p>
          <div className="event-list">
            {picked.map((p, i) => (
              <label key={i} className="checkbox-label">
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                {p.name} {p.phone && `· ${p.phone}`}
              </label>
            ))}
          </div>
          <label>
            Categoría (para todos)
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button type="button" onClick={handleSave} disabled={saving || selected.size === 0}>
              {saving ? 'Guardando…' : `Añadir ${selected.size} contacto${selected.size === 1 ? '' : 's'}`}
            </button>
            <button type="button" className="link-button" onClick={() => setPicked([])}>
              Cancelar
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function AddContactForm({ existingContacts, onAdded }: { existingContacts: Contact[]; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Autocompletado a partir de contactos ya creados — si el nombre
  // coincide con uno que ya existe, se rellena el resto solo (categoría,
  // teléfono, email, notas) para no tener que volver a escribirlo,
  // dejando que se pueda seguir editando antes de guardar.
  function handleNameChange(value: string) {
    setName(value)
    const match = existingContacts.find((c) => c.name.trim().toLowerCase() === value.trim().toLowerCase())
    if (match) {
      setCategory(match.category ?? CATEGORIES[0])
      setPhone(match.phone ?? '')
      setEmail(match.email ?? '')
      setNotes(match.notes ?? '')
    }
  }

  const uniqueNames = Array.from(new Set(existingContacts.map((c) => c.name)))

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
        <input
          type="text"
          list="contact-names"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Colegio Los Álamos"
          required
        />
        <datalist id="contact-names">
          {uniqueNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
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
