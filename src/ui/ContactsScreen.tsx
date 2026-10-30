import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { addContact, addContactReturningId, applyContactPatch, listContacts, updateContact, updateContactBirthDate } from '@/data/contacts'
import { isContactPickerSupported, pickContacts, type PickedContact } from '@/services/contactPicker'
import { parseIcs } from '@/domain/icsParser'
import { parseVcf } from '@/domain/vcardParser'
import { DateField } from '@/ui/DateField'
import { normalize } from '@/domain/voiceQuery'
import type { Contact } from '@/domain/types'
import contactosHeaderImg from '@/assets/contactos/contactos-header.jpg'
import { errorMessage } from '@/domain/errorMessage'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { shareText } from '@/services/share'
import { ShareFallbackModal } from '@/ui/ShareFallbackModal'
import { paletteByName } from '@/domain/colors'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { allCategories, allEmails, allPhones, applyContactMerge, contactFullName, hasPatch, planContactMerge, type ContactMergePlan, type Resolution } from '@/domain/contactsModel'
import { ContactSheet, emptyExtras, ExtraFields, extrasFromContact, toExtras, type ExtraState } from '@/ui/contacts/ContactParts'

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
    for (const cat of allCategories(c)) set.add(cat)
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
  // Tocar una tarjeta abre la ficha completa (con todas las acciones); la lista se queda compacta.
  const [openId, setOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Petición real: "Contactos: compartir uno o varios contactos" — el
  // icono 📤 de cada ficha comparte solo ese; este modo aparte es para
  // elegir varios de golpe y mandarlos en un único archivo .vcf.
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Bug real reportado: "Contacto sigue sin poderse compartir" — no era
  // que fallara, era que sin menú nativo (ordenador, o el navegador no
  // sabe compartir un .vcf) caía en copiar al portapapeles EN SILENCIO,
  // sin avisar nada — parecía que no había pasado nada. Mismo aviso que
  // ya tienen Compras/Recetas.
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  function flashShareNotice(msg: string) {
    setShareNotice(msg)
    setTimeout(() => setShareNotice(null), 5000)
  }
  // Bug real reportado: "en Android y en ordenador no funciona, en
  // iPhone sí" (confirmado en dos Android distintos) — cuando ni el
  // menú nativo ni el portapapeles funcionan aquí, en vez de un aviso
  // sin más se abre una ventana con el texto listo para copiar a mano
  // o mandar directo por WhatsApp/email — nunca se queda sin ninguna
  // forma de compartir.
  const [manualShare, setManualShare] = useState<{ title: string; text: string } | null>(null)

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function shareAndReport(chosen: Contact[]) {
    try {
      const outcome = await shareContacts(chosen)
      if (outcome.kind === 'clipboard') flashShareNotice('Copiado al portapapeles.')
      else if (outcome.kind === 'manual') setManualShare({ title: outcome.title, text: outcome.text })
    } catch (err) {
      setError(errorMessage(err, 'No se pudo compartir'))
    }
  }

  async function handleShareSelected() {
    const chosen = contacts.filter((c) => selectedIds.has(c.id))
    if (chosen.length === 0) return
    await shareAndReport(chosen)
    setSelecting(false)
    setSelectedIds(new Set())
  }

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

  const availableCategories = useMemo(() => collectCategories(contacts), [contacts])
  // Petición real: "Contactos ya tienen clasificación, ponemos un
  // color por clase" — mismo criterio que las clases de producto de
  // Compras (paletteByName): nombre de categoría -> color estable,
  // calculado una vez aquí, no por tarjeta.
  const categoryColors = useMemo(() => paletteByName(availableCategories), [availableCategories])

  if (loading) return <div className="screen">Cargando contactos…</div>

  const normalizedSearch = normalize(search)
  const filteredContacts = contacts.filter((c) => {
    if (categoryFilter !== 'Todas' && !allCategories(c).includes(categoryFilter) && !(categoryFilter === 'Otros' && allCategories(c).length === 0)) return false
    if (
      normalizedSearch &&
      !normalize([contactFullName(c), c.nickname, c.whatsappName].filter(Boolean).join(' ')).includes(normalizedSearch)
    )
      return false
    return true
  })
  const open = contacts.find((c) => c.id === openId) ?? null
  const editing = contacts.find((c) => c.id === editingId) ?? null

  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-wide">
        <img src={contactosHeaderImg} alt="Contactos" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection="Inicio" />
      {error && <p className="error">{error}</p>}
      {shareNotice && <p className="points-badge">{shareNotice}</p>}
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
        data-help-id="contactos.buscar"
        style={{ marginBottom: 8 }}
      />
      <button
        type="button"
        className="link-button"
        data-help-id="contactos.compartir-varios"
        style={{ marginBottom: 8 }}
        onClick={() => {
          setSelecting((v) => !v)
          setSelectedIds(new Set())
        }}
      >
        {selecting ? 'Cancelar selección' : '📤 Compartir varios'}
      </button>
      <div className="filter-row" data-help-id="contactos.categorias">
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

      {selecting && selectedIds.size > 0 && (
        <button type="button" data-help-id="contactos.mandar-seleccion" onClick={handleShareSelected} style={{ marginBottom: 8 }}>
          📤 Compartir {selectedIds.size} contacto{selectedIds.size === 1 ? '' : 's'}
        </button>
      )}

      <div className="event-list contact-list" data-help-id="contactos.lista">
        {filteredContacts.map((c) => (
          <ContactListCard
            key={c.id}
            contact={c}
            color={categoryColors.get(c.category || 'Otros')}
            selecting={selecting}
            selected={selectedIds.has(c.id)}
            onToggleSelect={() => toggleSelected(c.id)}
            onOpen={() => setOpenId(c.id)}
          />
        ))}
        {filteredContacts.length === 0 && <p className="muted">No hay contactos que coincidan.</p>}
      </div>
      <ImportContactsForm onAdded={reload} />
      <ImportVcfContactsForm existingContacts={contacts} onAdded={reload} />
      <ImportIcsBirthdaysForm existingContacts={contacts} onAdded={reload} />

      <button type="button" className="screen-fab" data-help-id="contactos.nuevo" onClick={() => setAddingContact(true)}>
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

      {open && !editing && (
        <ContactSheet
          contact={open}
          onClose={() => setOpenId(null)}
          onChanged={reload}
          onEdit={() => setEditingId(open.id)}
          onShare={() => shareAndReport([open])}
        />
      )}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditingId(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Editar contacto
              </h2>
              <button type="button" className="modal-close" onClick={() => setEditingId(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <EditContactForm
              contact={editing}
              onDone={() => {
                setEditingId(null)
                reload()
              }}
              onCancel={() => setEditingId(null)}
            />
          </div>
        </div>
      )}

      {manualShare && (
        <ShareFallbackModal title={manualShare.title} text={manualShare.text} onClose={() => setManualShare(null)} />
      )}
    </div>
  )
}

// Un contacto suelto o varios en un único .vcf — formato válido para
// Contactos de iPhone/Android tanto con uno como con muchos (petición
// real: "Contactos: compartir uno o varios contactos"). Sin soporte de
// compartir archivos (típico en ordenador, o en Android con tipos de
// archivo que ninguna app reclama), se manda como texto plano — y si
// eso TAMBIÉN falla, la pantalla debe caer a la ventana de respaldo
// (ShareFallbackModal) en vez de darse por vencida.
type ShareOutcome = { kind: 'shared' } | { kind: 'clipboard' } | { kind: 'manual'; title: string; text: string }

async function shareContacts(contacts: Contact[]): Promise<ShareOutcome> {
  // Bug real reportado, varias veces, en Android y ordenador (nunca en
  // iPhone): compartir el .vcf como ARCHIVO abría el menú nativo, pero
  // WhatsApp/Instagram/etc. no aparecían como destino — la mayoría de
  // apps de Android no se registran para recibir vcard, así que
  // canShare()/share() podían "tener éxito" técnicamente sin ofrecer
  // ningún sitio real donde mandarlo. Texto plano sí lo acepta
  // cualquier app de mensajería, así que ahora se comparte siempre así
  // — se pierde el "añadir directo a Contactos" de un vCard real, pero
  // se gana que el menú "con quién compartir" salga siempre poblado.
  const title = contacts.length === 1 ? contactFullName(contacts[0]) : `${contacts.length} contactos`
  const text = contacts
    .map((c) => [contactFullName(c), ...allPhones(c), ...allEmails(c)].join(' · '))
    .join('\n')
  try {
    const shownText = await shareText({ title, text })
    return shownText ? { kind: 'shared' } : { kind: 'clipboard' }
  } catch {
    // Ni el menú nativo ni el portapapeles han podido usarse aquí — la
    // pantalla ofrece la ventana de respaldo (copiar / WhatsApp / email).
    return { kind: 'manual', title, text }
  }
}

/**
 * Tarjeta compacta: nombre destacado, categoría y teléfono en una línea, y el correo en su propia línea SIN cortar (si es largo ocupa varias líneas). Sin botones repetidos:
 * al tocarla se abre la ficha completa. En modo «Compartir varios» tocarla marca o desmarca.
 */
function ContactListCard({
  contact: c,
  color,
  selecting,
  selected,
  onToggleSelect,
  onOpen,
}: {
  contact: Contact
  color?: string
  selecting: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
}) {
  const phones = allPhones(c)
  const emails = allEmails(c)
  return (
    <button
      type="button"
      className="card contact-card contact-card-compact"
      data-help-id="contactos.tarjeta"
      style={{ background: color }}
      onClick={selecting ? onToggleSelect : onOpen}
      aria-label={selecting ? `Seleccionar ${contactFullName(c)}` : `Abrir la ficha de ${contactFullName(c)}`}
    >
      {selecting && <input type="checkbox" checked={selected} readOnly tabIndex={-1} aria-hidden="true" data-help-id="contactos.casilla" style={{ marginRight: 4 }} />}
      <span className="contact-card-body">
        <strong className="contact-card-name">
          {contactFullName(c)}
          {c.nickname ? <span className="muted"> «{c.nickname}»</span> : null}
        </strong>
        <span className="muted contact-card-line">
          {[c.category, phones[0] ? phones[0] + (phones.length > 1 ? ` (+${phones.length - 1})` : '') : null].filter(Boolean).join(' · ')}
        </span>
        {emails[0] && <span className="muted contact-card-email">{emails[0]}{emails.length > 1 ? ` (+${emails.length - 1})` : ''}</span>}
        {c.birthDate && <span className="muted contact-card-line">🎂 {formatBirthDate(c.birthDate)}</span>}
      </span>
    </button>
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
  const [extras, setExtras] = useState<ExtraState>(() => extrasFromContact(contact))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateContact(contact.id, { name, category, phone, email, notes, birthDate: birthDate || null, ...toExtras(extras) })
      emitHelpEvent('contacts.contact-edited') // para los tutoriales «Enséñame»: los cambios del contacto YA están guardados
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form" data-help-id="contactos.editar-form">
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
        <DateField value={birthDate} onChange={setBirthDate} placeholder="Sin cumpleaños" />
      </label>
      <label>
        Notas
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <ExtraFields value={extras} onChange={setExtras} />
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving} data-help-id="contactos.editar-guardar">
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
      setError(errorMessage(err, 'No se pudo abrir la agenda del teléfono'))
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
      setError(errorMessage(err, 'No se pudieron guardar los contactos'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form" data-help-id="contactos.importar-telefono">
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

const RESOLUTION_LABEL: Record<Resolution, string> = { anadir: 'Añadir como adicional', sustituir: 'Sustituir el anterior', conservar: 'Conservar el anterior' }

function ImportVcfContactsForm({ existingContacts, onAdded }: { existingContacts: Contact[]; onAdded: () => void }) {
  const [candidates, setCandidates] = useState<ContactCandidate[]>([])
  const [category, setCategory] = useState(CATEGORIES[0])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Decisiones ante datos distintos de un contacto que ya existe: «índice:campo» → qué hacer. Sin decisión = conservar (nunca se pisa nada por defecto).
  const [decisions, setDecisions] = useState<Record<string, Resolution>>({})

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
      setDecisions({})
    } catch {
      setError('No se pudo leer ese archivo — asegúrate de que es un .vcf exportado de Contactos.')
    }
  }

  function toggle(i: number) {
    setCandidates((prev) => prev.map((c, idx) => (idx === i ? { ...c, selected: !c.selected } : c)))
  }

  // Para cada candidato que ya existe en la agenda: qué datos nuevos trae y cuáles chocan con los que ya hay.
  const plans = useMemo(() => {
    const m = new Map<number, { existing: Contact; plan: ContactMergePlan }>()
    candidates.forEach((c, i) => {
      const existing = existingContacts.find((ec) => ec.name.trim().toLowerCase() === c.name.trim().toLowerCase())
      if (existing) m.set(i, { existing, plan: planContactMerge(existing, { phone: c.phone, email: c.email, birthDate: c.birthDate }, true) })
    })
    return m
  }, [candidates, existingContacts])

  async function handleImport() {
    setSaving(true)
    setError(null)
    try {
      for (const [i, c] of candidates.entries()) {
        if (!c.selected) continue
        const found = plans.get(i)
        if (found) {
          // Un dato nuevo sobre un campo vacío se completa; si choca con uno que ya hay, solo se cambia si la persona lo decidió.
          const mine: Record<string, Resolution | undefined> = {}
          for (const cf of found.plan.conflicts) mine[cf.key] = decisions[`${i}:${cf.key}`]
          const patch = applyContactMerge(found.existing, found.plan, mine)
          if (hasPatch(patch)) await applyContactPatch(found.existing.id, patch)
        } else {
          await addContactReturningId({ name: c.name, category, phone: c.phone, email: c.email, notes: '', birthDate: c.birthDate, source: { kind: 'vcf', at: new Date().toISOString() } })
        }
      }
      setCandidates([])
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron importar'))
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = candidates.filter((c) => c.selected).length

  return (
    <div className="card member-form" data-help-id="contactos.importar-vcf">
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
            {candidates.map((c, i) => {
              const found = plans.get(i)
              return (
                <div key={`${c.name}-${i}`}>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={c.selected} onChange={() => toggle(i)} />
                    {c.name} {c.phone && `· ${c.phone}`}
                  </label>
                  {c.selected &&
                    found?.plan.conflicts.map((cf) => (
                      <div key={cf.key} className="grp-banner" style={{ margin: '2px 0 6px' }}>
                        <p style={{ margin: '0 0 4px' }}>
                          Ya existe en tu agenda con otro dato — {cf.label}: ahora «{cf.existing}», el archivo trae «{cf.incoming}».
                        </p>
                        <div className="filter-row">
                          {cf.options.map((o) => (
                            <button key={o} type="button" className={'chip' + ((decisions[`${i}:${cf.key}`] ?? 'conservar') === o ? ' chip-active' : '')} onClick={() => setDecisions((d) => ({ ...d, [`${i}:${cf.key}`]: o }))}>
                              {RESOLUTION_LABEL[o]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )
            })}
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
      setError(errorMessage(err, 'No se pudieron importar'))
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = candidates.filter((c) => c.selected).length

  return (
    <div className="card member-form" data-help-id="contactos.importar-ics">
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
  const [extras, setExtras] = useState<ExtraState>(emptyExtras())
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
      await addContactReturningId({ name, category, phone, email, notes, birthDate: birthDate || null, ...toExtras(extras) })
      emitHelpEvent('contacts.contact-added') // para los tutoriales «Enséñame»: el contacto YA está guardado
      setName('')
      setPhone('')
      setEmail('')
      setNotes('')
      setBirthDate('')
      setExtras(emptyExtras())
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
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
          data-help-id="contactos.nombre"
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
          data-help-id="contactos.categoria"
        />
      </label>
      <label>
        Teléfono
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-help-id="contactos.telefono" />
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-help-id="contactos.email" />
      </label>
      <label data-help-id="contactos.cumpleanos">
        Cumpleaños (opcional)
        <DateField value={birthDate} onChange={setBirthDate} placeholder="Sin cumpleaños" />
      </label>
      <label>
        Notas
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} data-help-id="contactos.notas" />
      </label>
      <ExtraFields value={extras} onChange={setExtras} />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving} data-help-id="contactos.anadir">
        {saving ? 'Guardando…' : 'Añadir'}
      </button>
    </form>
  )
}
