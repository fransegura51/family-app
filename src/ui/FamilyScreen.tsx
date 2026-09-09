import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addFamilyMember,
  deleteFamilyMember,
  generateMemberInviteCode,
  getAmazonWebhookToken,
  listFamilyMembers,
  regenerateAmazonWebhookToken,
  reorderFamilyMembers,
  updateFamilyMember,
  uploadMemberPhoto,
} from '@/data/family'
import { adminResetProfilePin } from '@/data/appLock'
import { supabase } from '@/data/supabaseClient'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton } from '@/ui/ConfirmButton'
import type { FamilyMember, MemberType, Profile } from '@/domain/types'
import { NAV_TABS, navSectionId } from '@/domain/navTabs'
import familiaHeaderImg from '@/assets/familia/familia-header.jpg'

const MEMBER_TYPES: { value: MemberType; label: string }[] = [
  { value: 'admin', label: 'Administrador/a' },
  { value: 'adult', label: 'Adulto' },
  { value: 'child', label: 'Niño/a' },
  { value: 'baby', label: 'Bebé' },
  { value: 'guest', label: 'Invitado/a' },
]

// Secciones elegibles para un invitado — todo NAV_TABS salvo "Inicio",
// que siempre es visible (Skill de invitados).
const GUEST_SECTIONS = NAV_TABS.filter((t) => t.to !== '/')

function SectionsChecklist({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="filter-row" style={{ flexWrap: 'wrap' }}>
      {GUEST_SECTIONS.map((t) => {
        const id = navSectionId(t)
        const checked = value.includes(id)
        return (
          <button
            key={id}
            type="button"
            className={'chip' + (checked ? ' chip-active' : '')}
            onClick={() => onChange(checked ? value.filter((s) => s !== id) : [...value, id])}
          >
            {t.icon} {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function FamilyScreen({ profile }: { profile: Profile }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const isAdmin = profile.role === 'admin'

  // Orden arrastrable con el dedo — petición real: "los miembros de la
  // familia los cojo y los puedo arrastrar y poner primero Jennifer,
  // luego Paco, luego Eric, luego Fernando, como yo quiera". Se piensa
  // como una lista de arriba a abajo, así que las tarjetas van en una
  // sola columna (antes dos) para que el arrastre vertical tenga
  // sentido — con dos columnas, "más abajo" sería ambiguo.
  const [order, setOrder] = useState<FamilyMember[]>([])
  const dragRef = useRef<{ id: string; startY: number; startIndex: number; itemHeight: number } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  function reload() {
    setLoading(true)
    listFamilyMembers()
      .then((m) => {
        if (!dragRef.current) setOrder(m)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  function handleDragStart(e: ReactPointerEvent, id: string, el: HTMLElement) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const index = order.findIndex((m) => m.id === id)
    dragRef.current = { id, startY: e.clientY, startIndex: index, itemHeight: el.offsetHeight + 12 }
    setDraggingId(id)
  }

  function handleDragMove(e: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dy = e.clientY - drag.startY
    setDragOffset(dy)
    const shift = Math.round(dy / drag.itemHeight)
    const newIndex = Math.min(order.length - 1, Math.max(0, drag.startIndex + shift))
    setOrder((prev) => {
      const currentIndex = prev.findIndex((m) => m.id === drag.id)
      if (currentIndex === -1 || currentIndex === newIndex) return prev
      const next = [...prev]
      const [moved] = next.splice(currentIndex, 1)
      next.splice(newIndex, 0, moved)
      return next
    })
  }

  function handleDragEnd() {
    const drag = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    setDragOffset(0)
    if (!drag) return
    reorderFamilyMembers(order.map((m) => m.id))
  }

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
      {/* Petición real, con imagen de referencia: "cabecera para
          sección Familia, como las anteriores" — esta sección no tiene
          menú ☰ (no tiene varias pestañas), así que solo se sustituye
          el <h1> de texto plano por la foto (ya trae el título
          "Familia" dibujado), sin botón encima. */}
      <div className="kitchen-header kitchen-header-familia">
        <img src={familiaHeaderImg} alt="Familia" className="kitchen-header-img" />
      </div>
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
      <div className="event-list">
        {order.map((m) =>
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
            <div
              key={m.id}
              className={'card member-card' + (draggingId === m.id ? ' shopping-item-dragging' : '')}
              style={{ borderColor: m.color, ...(draggingId === m.id ? { transform: `translateY(${dragOffset}px)` } : {}) }}
            >
              <span
                className="shopping-drag-handle"
                onPointerDown={(e) => handleDragStart(e, m.id, e.currentTarget.parentElement as HTMLElement)}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
                aria-label="Arrastrar para reordenar"
              >
                ⠿
              </span>
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
                  {m.linkedProfileId && <ResetPinButton profileId={m.linkedProfileId} />}
                  {m.linkedProfileId !== profile.id && (
                    <ConfirmButton label="Borrar" onConfirm={() => handleDelete(m.id)} />
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
        {order.length === 0 && <p className="muted">Todavía no hay miembros.</p>}
      </div>

      {isAdmin && <AddMemberForm onAdded={reload} />}
      {isAdmin && <AmazonWebhookSettings />}
    </div>
  )
}

// Muestra las URLs + el token secreto que hay que poner en los
// workflows de Pipedream (ver conversación con el usuario) para que los
// pedidos de Amazon, los tickets de Mercadona y los correos con
// eventos reenviados por Outlook lleguen aquí solos — mismo token para
// las tres automatizaciones, es el mismo mecanismo (identificar a la
// familia sin un login de verdad). "Regenerar" invalida el token
// anterior — útil si se ha compartido por error (rompe las TRES
// automatizaciones a la vez, hay que actualizar el token en los tres
// workflows de Pipedream si se regenera).
function AmazonWebhookSettings() {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    getAmazonWebhookToken()
      .then(setToken)
      .catch((e: Error) => setError(e.message))
  }, [])

  const base = import.meta.env.VITE_SUPABASE_URL as string
  const amazonUrl = `${base}/functions/v1/amazon-order-webhook`
  const mercadonaUrl = `${base}/functions/v1/mercadona-ticket-webhook`
  const eventEmailUrl = `${base}/functions/v1/import-event-email-webhook`

  async function handleRegenerate() {
    setBusy(true)
    setError(null)
    try {
      setToken(await regenerateAmazonWebhookToken())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo regenerar el token')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy(field: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1500)
    } catch {
      // Sin permiso de portapapeles: el texto ya está visible para copiar a mano.
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Automatizaciones de tickets por email
      </h2>
      <p className="muted">
        Datos para los workflows de Pipedream que reciben, reenviados desde Outlook, los pedidos de
        Amazon, los tickets digitales de Mercadona y correos con eventos (boletines del colegio,
        confirmaciones de citas...) para crearlos solos en el Calendario.
      </p>
      {error && <p className="error">{error}</p>}
      {token && (
        <>
          <label>
            URL del webhook — Amazon
            <input type="text" readOnly value={amazonUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('amazon', amazonUrl)}>
            {copiedField === 'amazon' ? '✓ Copiado' : 'Copiar URL'}
          </button>
          <label style={{ marginTop: 8, display: 'block' }}>
            URL del webhook — Mercadona
            <input type="text" readOnly value={mercadonaUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('mercadona', mercadonaUrl)}>
            {copiedField === 'mercadona' ? '✓ Copiado' : 'Copiar URL'}
          </button>
          <label style={{ marginTop: 8, display: 'block' }}>
            URL del webhook — Eventos por correo (Calendario)
            <input type="text" readOnly value={eventEmailUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('eventEmail', eventEmailUrl)}>
            {copiedField === 'eventEmail' ? '✓ Copiado' : 'Copiar URL'}
          </button>
          <label style={{ marginTop: 8, display: 'block' }}>
            Token de la familia (el mismo para las tres)
            <input type="text" readOnly value={token} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('token', token)}>
            {copiedField === 'token' ? '✓ Copiado' : 'Copiar token'}
          </button>
          <div style={{ marginTop: 8 }}>
            <ConfirmButton label={busy ? 'Regenerando…' : 'Regenerar token'} onConfirm={handleRegenerate} />
          </div>
        </>
      )}
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

// Solo admin — "reiniciar" (nunca ver ni mandar) el PIN de bloqueo de
// otra persona cuando se le olvida: la próxima vez que abra el
// bloqueo tendrá que crear uno nuevo (ver 0083_profile_app_lock.sql).
// Solo tiene sentido para quien tiene su propia cuenta (linkedProfileId).
function ResetPinButton({ profileId }: { profileId: string }) {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReset() {
    setError(null)
    try {
      await adminResetProfilePin(profileId)
      setDone(true)
      setTimeout(() => setDone(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reiniciar el PIN')
    }
  }

  if (done) return <span className="muted">✓ PIN reiniciado</span>
  return (
    <>
      <ConfirmButton label="🔓 Reiniciar PIN" confirmLabel="Reiniciar" onConfirm={handleReset} />
      {error && <p className="error">{error}</p>}
    </>
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
  const [allowedSections, setAllowedSections] = useState<string[]>(member.allowedSections ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateFamilyMember(member.id, {
        name,
        memberType,
        color,
        birthDate: birthDate || null,
        allowedSections: memberType === 'guest' ? allowedSections : null,
      })
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
      {memberType === 'guest' && (
        <label>
          Secciones a las que puede entrar
          <SectionsChecklist value={allowedSections} onChange={setAllowedSections} />
        </label>
      )}
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

export function AddMemberForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [memberType, setMemberType] = useState<MemberType>('child')
  const [color, setColor] = useState('#4C6EF5')
  const [birthDate, setBirthDate] = useState('')
  const [allowedSections, setAllowedSections] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addFamilyMember({
        name,
        memberType,
        color,
        birthDate: birthDate || null,
        allowedSections: memberType === 'guest' ? allowedSections : null,
      })
      setName('')
      setBirthDate('')
      setAllowedSections([])
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
      {memberType === 'guest' && (
        <label>
          Secciones a las que puede entrar
          <SectionsChecklist value={allowedSections} onChange={setAllowedSections} />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Añadiendo…' : 'Añadir'}
      </button>
    </form>
  )
}
