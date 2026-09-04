import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { addContact, deleteContact, listContacts, updateContact, updateContactBirthDate } from '@/data/contacts'
import { isContactPickerSupported, pickContacts, type PickedContact } from '@/services/contactPicker'
import { parseIcs } from '@/domain/icsParser'
import { parseVcf } from '@/domain/vcardParser'
import { ConfirmIconButton } from '@/ui/ConfirmButton'
import { normalize } from '@/domain/voiceQuery'
import type { Contact } from '@/domain/types'

// Categorías de partida — ya no es una lista cerrada: cualquier
// contacto puede llevar una categoría nueva escrita a mano (petición
// real: "haz que se puedan añadir nuevas categorías de contactos"), y
// en cuanto se guarda uno con ella, esa categoría nueva ya sale como
// sugerencia para el resto (ver availableCategories más abajo) —
// mismo patrón que ya se usa para las tiendas de Compras.
const CATEGORIES = ['Colegio', 'Médico', 'Emergencia', 'Familia', 'Otros']

function collectCategories(contacts: Contact[]): string[] {
  const set = new Set(CATEGORIES)
  for (const c of contacts) {
    if (c.category?.trim()) set.add(c.category.trim())
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

function formatBirthDate(d: string): string {
  return new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
}

export function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Todas')
  // Botón flotante "Nuevo contacto", tocable desde cualquier parte de
  // la pestaña sin tener que bajar hasta el final de la lista —
  // petición real: "pon un botón Nuevo contacto... el formulario se
  // abra en una ventana emergente que se cierra cuando se haya
  // guardado el contacto".
  const [addingContact, setAddingContact] = useState(false)

  // Solo pone "Cargando…" en la primera carga — si se vuelve a llamar
  // tras guardar una edición, reemplazar TODA la pantalla por ese
  // aviso (aunque sea un instante) hacía que el navegador perdiera la
  // posición del scroll y volviera arriba del todo (bug real:
  // "cuando se edita un contacto y se guarda no debe volver a saltar
  // al inicio, sino quedarse a la altura del contacto editado").
  function reload() {
    listContacts()
      .then(setContacts)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  if (loading) return <div className="screen">Cargando contactos…</div>

  const availableCategories = collectCategories(contacts)
  const normalizedSearch = normalize(search)
  const filteredContacts = contacts.filter((c) => {
    if (categoryFilter !== 'Todas' && (c.category ?? 'Otros') !== categoryFilter) return false
    if (normalizedSearch && !normalize(c.name).includes(normalizedSearch)) return false
    return true
  })

  return (
    <div className="screen">
      <h1>Contactos</h1>
      {error && <p className="error">{error}</p>}
      <datalist id="contact-categories">
        {availableCategories.map((cat) => (
          <option key={cat} value={cat} />
        ))}
      </datalist>

      {/* Petición real: "que se pueda filtrar por categorías y poder
          buscar por nombres". */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Buscar por nombre…"
        style={{ marginBottom: 8 }}
      />
      <div className="filter-row">
        <button
          type="button"
          className={'chip' + (categoryFilter === 'Todas' ? ' chip-active' : '')}
          onClick={() => setCategoryFilter('Todas')}
        >
          Todas
        </button>
        {availableCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={'chip' + (categoryFilter === cat ? ' chip-active' : '')}
            onClick={() => setCategoryFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="event-list">
        {filteredContacts.map((c) => (
          <ContactCard key={c.id} contact={c} onChanged={reload} />
        ))}
        {filteredContacts.length === 0 && <p className="muted">No hay contactos que coincidan.</p>}
      </div>
      <ImportContactsForm onAdded={reload} />
      <ImportVcfContactsForm existingContacts={contacts} onAdded={reload} />
      <ImportIcsBirthdaysForm existingContacts={contacts} onAdded={reload} />

      <button type="button" className="screen-fab" onClick={() => setAddingContact(true)}>
        + Nuevo contacto
      </button>

      {addingContact && (
        <div className="modal-overlay" onClick={() => setAddingContact(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Nuevo contacto
              </h2>
              <button type="button" className="modal-close" onClick={() => setAddingContact(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <AddContactForm
              existingContacts={contacts}
              onAdded={() => {
                reload()
                setAddingContact(false)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ContactCard({ contact: c, onChanged }: { contact: Contact; onChanged: () => void }) {
  const [editingBirthday, setEditingBirthday] = useState(false)
  const [editingAll, setEditingAll] = useState(false)
  const [birthDate, setBirthDate] = useState(c.birthDate ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSaveBirthday() {
    setSaving(true)
    try {
      await updateContactBirthDate(c.id, birthDate || null)
      setEditingBirthday(false)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  if (editingAll) {
    return (
      <EditContactForm
        contact={c}
        onDone={() => {
          setEditingAll(false)
          onChanged()
        }}
        onCancel={() => setEditingAll(false)}
      />
    )
  }

  return (
    <div className="card task-card contact-card">
      <div className="task-card-main">
        <strong>{c.name}</strong>
        <p className="muted contact-card-detail">
          {c.category}
          {c.phone && ` · ${c.phone}`}
          {c.email && ` · ${c.email}`}
        </p>
        {c.notes && <p className="muted contact-card-detail">{c.notes}</p>}
        {editingBirthday ? (
          <div className="inline-fields">
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            <button type="button" className="link-button" onClick={handleSaveBirthday} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="link-button" onClick={() => setEditingBirthday(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button type="button" className="link-button contact-card-birthday" onClick={() => setEditingBirthday(true)}>
            {c.birthDate ? `🎂 ${formatBirthDate(c.birthDate)}` : '🎂 Añadir cumpleaños'}
          </button>
        )}
      </div>
      {/* Antes solo se podía borrar o llamar — si el teléfono estaba mal
          o quería cambiar la categoría, había que borrar y volver a
          crear el contacto entero (bug/petición real). Los tres juntos
          como iconos, en vez de repartidos en texto (petición real:
          "los tres botones de comandos que sustituiría el texto por
          los símbolos habituales"). */}
      <div className="task-card-actions">
        {c.phone && (
          <a href={`tel:${c.phone}`} className="link-button" aria-label="Llamar">
            📞
          </a>
        )}
        <button type="button" className="link-button" onClick={() => setEditingAll(true)} aria-label="Editar">
          ✏️
        </button>
        <ConfirmIconButton icon="✕" className="link-button" ariaLabel="Eliminar" onConfirm={() => deleteContact(c.id).then(onChanged)} />
      </div>
    </div>
  )
}

function EditContactForm({
  contact,
  onDone,
  onCancel,
}: {
  contact: Contact
  onDone: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(contact.name)
  const [category, setCategory] = useState(contact.category ?? CATEGORIES[0])
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [email, setEmail] = useState(contact.email ?? '')
  const [notes, setNotes] = useState(contact.notes ?? '')
  const [birthDate, setBirthDate] = useState(contact.birthDate ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateContact(contact.id, { name, category, phone, email, notes, birthDate: birthDate || null })
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
        Categoría
        <input
          type="text"
          list="contact-categories"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Familia"
        />
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
        Cumpleaños (opcional)
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </label>
      <label>
        Notas
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
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

// Contact Picker API (Skill: agenda) — solo Chrome/Edge en Android, así
// que si el navegador no la soporta (iPhone, ordenador…) directamente
// no se muestra el botón en vez de fallar al pulsarlo.
function ImportContactsForm({ onAdded }: { onAdded: () => void }) {
  const [picked, setPicked] = useState<PickedContact[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [category, setCategory] = useState(CATEGORIES[0])
  const [picking, setPicking] = useState(false)
  const [pickedOnce, setPickedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!isContactPickerSupported()) return null

  async function handlePick() {
    setError(null)
    setPicking(true)
    try {
      const results = await pickContacts()
      setPicked(results)
      setSelected(new Set(results.map((_, i) => i)))
      setPickedOnce(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la agenda del teléfono')
    } finally {
      setPicking(false)
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
      setPickedOnce(false)
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
        <>
          <button type="button" onClick={handlePick} disabled={picking}>
            {picking ? 'Abriendo tu agenda…' : '📱 Elegir de mis contactos'}
          </button>
          {/* Sin esto, si el selector del teléfono se cierra sin traer
              ningún contacto (se sale atrás, o no se marca ninguno), no
              pasaba nada visible y parecía que el botón no hacía nada
              (bug real reportado: "no me pone el contacto"). */}
          {pickedOnce && picked.length === 0 && !error && (
            <p className="muted">No se ha compartido ningún contacto. Vuelve a intentarlo y marca al menos uno antes de tocar "Hecho".</p>
          )}
        </>
      ) : (
        <>
          <p className="muted">Marca los que quieras guardar en la app:</p>
          <div className="event-list">
            {picked.map((p, i) => (
              <label key={i} className="checkbox-label">
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                {p.name || '(sin nombre)'} {p.phone && `· ${p.phone}`}
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

// La Contact Picker API de arriba (ImportContactsForm) solo la
// soportan Chrome/Edge en Android — en iPhone no existe ese botón.
// Petición real: "¿se puede hacer algo similar [al de cumpleaños] para
// poder importar contactos desde el iPhone?" — mismo mecanismo:
// exportar un archivo (en Contactos del iPhone, o en icloud.com,
// seleccionar contactos → Compartir/Exportar vCard) y subirlo aquí,
// con casillas para marcar cuáles dar de alta de golpe.
interface ContactCandidate {
  name: string
  phone: string
  email: string
  birthDate: string | null
  selected: boolean
}

function ImportVcfContactsForm({ existingContacts, onAdded }: { existingContacts: Contact[]; onAdded: () => void }) {
  const [candidates, setCandidates] = useState<ContactCandidate[]>([])
  const [category, setCategory] = useState(CATEGORIES[0])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      const parsed = parseVcf(text)
      const existingNames = new Set(existingContacts.map((c) => c.name.trim().toLowerCase()))
      const seen = new Set<string>()
      const list: ContactCandidate[] = []
      for (const card of parsed) {
        const key = card.name.trim().toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        list.push({
          name: card.name,
          phone: card.phone ?? '',
          email: card.email ?? '',
          birthDate: card.birthDate,
          selected: !existingNames.has(key),
        })
      }
      list.sort((a, b) => a.name.localeCompare(b.name))
      if (list.length === 0) setError('No se ha encontrado ningún contacto en ese archivo.')
      setCandidates(list)
    } catch {
      setError('No se pudo leer ese archivo — asegúrate de que es un .vcf exportado de Contactos.')
    }
  }

  function toggle(i: number) {
    setCandidates((prev) => prev.map((c, idx) => (idx === i ? { ...c, selected: !c.selected } : c)))
  }

  async function handleImport() {
    setSaving(true)
    setError(null)
    try {
      for (const c of candidates) {
        if (!c.selected) continue
        const existing = existingContacts.find((ec) => ec.name.trim().toLowerCase() === c.name.trim().toLowerCase())
        if (existing) {
          await updateContact(existing.id, {
            name: existing.name,
            category: existing.category ?? category,
            phone: existing.phone || c.phone,
            email: existing.email || c.email,
            notes: existing.notes ?? '',
            birthDate: existing.birthDate ?? c.birthDate,
          })
        } else {
          await addContact({ name: c.name, category, phone: c.phone, email: c.email, notes: '', birthDate: c.birthDate })
        }
      }
      setCandidates([])
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron importar')
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = candidates.filter((c) => c.selected).length

  return (
    <div className="card member-form">
      <h2>Importar contactos desde el móvil (.vcf)</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        En Contactos del iPhone (o en icloud.com → Contactos), selecciona los que quieras → Compartir/Exportar vCard,
        y sube aquí el archivo. Se añaden todos de golpe, en vez de uno a uno.
      </p>
      <input type="file" accept=".vcf,text/vcard" onChange={handleFile} />
      {error && <p className="error">{error}</p>}
      {candidates.length > 0 && (
        <>
          <p className="muted">
            {candidates.length} contactos encontrados — desmarca los que no quieras añadir:
          </p>
          <label>
            Categoría (para los nuevos)
            <input type="text" list="contact-categories" value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <div className="event-list">
            {candidates.map((c, i) => (
              <label key={`${c.name}-${i}`} className="checkbox-label">
                <input type="checkbox" checked={c.selected} onChange={() => toggle(i)} />
                {c.name} {c.phone && `· ${c.phone}`}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" onClick={handleImport} disabled={saving || selectedCount === 0}>
              {saving ? 'Importando…' : `Importar ${selectedCount}`}
            </button>
            <button type="button" className="link-button" onClick={() => setCandidates([])}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// El calendario "Cumpleaños" de Google (el que rellena solo desde tus
// Contactos) no tiene enlace para compartir por URL, a diferencia de
// los calendarios normales — solo se puede EXPORTAR a un archivo .ics
// suelto ("Exportar calendario" en su configuración). Petición real:
// "son muchos y no quiero tener que añadirlos a mano" — se lee ese
// archivo y se ofrece darlos de alta todos de golpe como cumpleaños de
// contactos, en vez de uno a uno.
function toLocalDateStr(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function cleanBirthdayName(rawTitle: string): string {
  let s = rawTitle.trim()
  s = s.replace(/^fiesta\s+/i, '')
  s = s.replace(/\bcumplea[ñn]os\s+de\s+/gi, '')
  s = s.replace(/^cumplea[ñn]os\s+/gi, '')
  s = s.replace(/\s+cumplea[ñn]os\b/gi, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s || rawTitle
}

interface BirthdayCandidate {
  name: string
  date: string
  selected: boolean
}

function ImportIcsBirthdaysForm({ existingContacts, onAdded }: { existingContacts: Contact[]; onAdded: () => void }) {
  const [candidates, setCandidates] = useState<BirthdayCandidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      const parsed = parseIcs(text)
      const existingNames = new Set(existingContacts.map((c) => c.name.trim().toLowerCase()))
      const seen = new Set<string>()
      const list: BirthdayCandidate[] = []
      for (const ev of parsed) {
        const name = cleanBirthdayName(ev.title)
        const date = toLocalDateStr(ev.startAt)
        const key = `${name.toLowerCase()}|${date.slice(5)}`
        if (seen.has(key)) continue
        seen.add(key)
        list.push({ name, date, selected: !existingNames.has(name.trim().toLowerCase()) })
      }
      list.sort((a, b) => a.name.localeCompare(b.name))
      if (list.length === 0) setError('No se ha encontrado ningún cumpleaños en ese archivo.')
      setCandidates(list)
    } catch {
      setError('No se pudo leer ese archivo — asegúrate de que es el .ics exportado de Google Calendar.')
    }
  }

  function toggle(i: number) {
    setCandidates((prev) => prev.map((c, idx) => (idx === i ? { ...c, selected: !c.selected } : c)))
  }

  async function handleImport() {
    setSaving(true)
    setError(null)
    try {
      for (const c of candidates) {
        if (!c.selected) continue
        const existing = existingContacts.find((ec) => ec.name.trim().toLowerCase() === c.name.trim().toLowerCase())
        if (existing) {
          await updateContactBirthDate(existing.id, c.date)
        } else {
          await addContact({ name: c.name, category: 'Familia', phone: '', email: '', notes: '', birthDate: c.date })
        }
      }
      setCandidates([])
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron importar')
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = candidates.filter((c) => c.selected).length

  return (
    <div className="card member-form">
      <h2>Importar cumpleaños desde Google (.ics)</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        En Google Calendar, en "Otros calendarios" → Cumpleaños → Configuración → "Exportar calendario", descarga el
        archivo y súbelo aquí. Se añaden todos de golpe, en vez de uno a uno.
      </p>
      <input type="file" accept=".ics,text/calendar" onChange={handleFile} />
      {error && <p className="error">{error}</p>}
      {candidates.length > 0 && (
        <>
          <p className="muted">
            {candidates.length} cumpleaños encontrados — desmarca los que no quieras añadir:
          </p>
          <div className="event-list">
            {candidates.map((c, i) => (
              <label key={`${c.name}-${c.date}`} className="checkbox-label">
                <input type="checkbox" checked={c.selected} onChange={() => toggle(i)} />
                {c.name} — {formatBirthDate(c.date)}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" onClick={handleImport} disabled={saving || selectedCount === 0}>
              {saving ? 'Importando…' : `Importar ${selectedCount}`}
            </button>
            <button type="button" className="link-button" onClick={() => setCandidates([])}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function AddContactForm({ existingContacts, onAdded }: { existingContacts: Contact[]; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Autocompletado a partir de contactos ya creados — si el nombre
  // coincide con uno que ya existe, se rellena el resto solo (categoría,
  // teléfono, email, notas, cumpleaños) para no tener que volver a
  // escribirlo, dejando que se pueda seguir editando antes de guardar.
  function handleNameChange(value: string) {
    setName(value)
    const match = existingContacts.find((c) => c.name.trim().toLowerCase() === value.trim().toLowerCase())
    if (match) {
      setCategory(match.category ?? CATEGORIES[0])
      setPhone(match.phone ?? '')
      setEmail(match.email ?? '')
      setNotes(match.notes ?? '')
      setBirthDate(match.birthDate ?? '')
    }
  }

  const uniqueNames = Array.from(new Set(existingContacts.map((c) => c.name)))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addContact({ name, category, phone, email, notes, birthDate: birthDate || null })
      setName('')
      setPhone('')
      setEmail('')
      setNotes('')
      setBirthDate('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="member-form">
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
        <input
          type="text"
          list="contact-categories"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Familia"
        />
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
        Cumpleaños (opcional)
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
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
