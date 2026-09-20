import { ChangeEvent, FormEvent, lazy, PointerEvent as ReactPointerEvent, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  addFamilyMember,
  DEFAULT_BABY_UNTIL_MONTHS,
  deleteFamilyMember,
  generateMemberInviteCode,
  getBabyUntilMonths,
  getAmazonWebhookToken,
  listFamilyMembers,
  regenerateAmazonWebhookToken,
  reorderFamilyMembers,
  updateAccountsMode,
  updateFamilyMember,
  uploadMemberPhoto,
  type AccountsMode,
} from '@/data/family'
import { adminResetProfilePin } from '@/data/appLock'
import { effectiveMemberType } from '@/domain/growth'
import { supabase } from '@/data/supabaseClient'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton } from '@/ui/ConfirmButton'
import type { FamilyMember, MemberSex, MemberType, Profile } from '@/domain/types'
import { NAV_TABS, navSectionId } from '@/domain/navTabs'
import familiaHeaderImg from '@/assets/familia/familia-header.jpg'
import { errorMessage } from '@/domain/errorMessage'

const MEMBER_TYPES: { value: MemberType; label: string }[] = [
  { value: 'admin', label: 'Administrador/a' },
  { value: 'adult', label: 'Adulto' },
  { value: 'child', label: 'Niño/a' },
  { value: 'baby', label: 'Bebé' },
  { value: 'guest', label: 'Invitado/a' },
]

// Secciones elegibles para un invitado o un hijo con su propia cuenta —
// todo NAV_TABS salvo "Inicio", que siempre es visible (Skill de
// invitados; reutilizado tal cual para "restringir Economía a un hijo").
const RESTRICTABLE_SECTIONS = NAV_TABS.filter((t) => t.to !== '/')

// Petición real: "poder limitar la información que pueden ver los hijos
// en la app... como los invitados" — mismo checklist de allowed_sections,
// ahora también para 'child' (antes solo 'guest'). Por defecto sigue
// siendo null (acceso total) para cualquier miembro ya existente; es el
// admin quien desmarcaría "Economía" a mano.
function canRestrictSections(memberType: MemberType): boolean {
  return memberType === 'guest' || memberType === 'child'
}

// Petición real: "los nombres de las clases de cuentas vienen en
// inglés" — la ficha de cada miembro pintaba memberType tal cual
// ('admin', 'child'...) en vez de pasarlo por MEMBER_TYPES.
function memberTypeLabel(memberType: MemberType): string {
  return MEMBER_TYPES.find((t) => t.value === memberType)?.label ?? memberType
}

function SectionsChecklist({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="filter-row" style={{ flexWrap: 'wrap' }}>
      {RESTRICTABLE_SECTIONS.map((t) => {
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

type FamilyTab = 'Miembros' | 'Peso y medidas'

// Peso y medidas se descarga solo al abrir esa pestaña.
const BodyTab = lazy(() => import('@/ui/BodyScreen').then((m) => ({ default: m.BodyTab })))

export function FamilyScreen({ profile }: { profile: Profile }) {
  const location = useLocation()
  const [tab, setTab] = useState<FamilyTab>(() => ((location.state as { tab?: FamilyTab } | null)?.tab === 'Peso y medidas' ? 'Peso y medidas' : 'Miembros'))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [addingMember, setAddingMember] = useState(false)
  const [babyUntilMonths, setBabyUntilMonths] = useState(DEFAULT_BABY_UNTIL_MONTHS)
  useEffect(() => {
    getBabyUntilMonths()
      .then(setBabyUntilMonths)
      .catch(() => {})
  }, [])
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
      setError(errorMessage(err, 'No se pudo borrar el miembro'))
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
      <div className="kitchen-header">
        <img src={familiaHeaderImg} alt="Familia" className="kitchen-header-img" />
      </div>
      <div className="segmented" role="tablist" style={{ margin: '4px 0 12px' }}>
        {(['Miembros', 'Peso y medidas'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'segmented-active' : ''} onClick={() => setTab(t)}>
            {t === 'Miembros' ? '👨‍👩‍👧‍👦 Miembros' : '⚖️ Peso y medidas'}
          </button>
        ))}
      </div>

      {tab === 'Peso y medidas' && (
        <Suspense fallback={<p className="muted">Cargando…</p>}>
          <BodyTab />
        </Suspense>
      )}

      {tab === 'Miembros' && (
        <>
      <div className="family-toolbar">
        <Link to="/actividad" className="link-button">
          🕘 Actividad reciente
        </Link>
      {/* Hace falta para que cada persona pueda tener su PROPIA cuenta en
          su propio móvil en vez de compartir el login de otra (p. ej.
          Paco entrando siempre como Jennifer, lo que confundía su
          ubicación con la de ella) — cierra esta sesión para poder
          entrar con la cuenta nueva creada con el código de invitación. */}
        <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>
          Cerrar sesión ({profile.displayName})
        </button>
      </div>
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
              className={'card member-row' + (draggingId === m.id ? ' shopping-item-dragging' : '')}
              style={{ borderLeftColor: m.color, ...(draggingId === m.id ? { transform: `translateY(${dragOffset}px)` } : {}) }}
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
              <MemberAvatar member={m} size={38} />
              <div className="member-row-body">
                <strong>{m.name}</strong>
                <span className="member-role-pill">
                  {memberTypeLabel(effectiveMemberType(m.memberType, m.birthDate, babyUntilMonths, new Date().toISOString().slice(0, 10)))}
                </span>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  className="member-row-more"
                  aria-label={`Acciones de ${m.name}`}
                  aria-expanded={menuOpenId === m.id}
                  onClick={() => setMenuOpenId((cur) => (cur === m.id ? null : m.id))}
                >
                  ⋯
                </button>
              )}
              {isAdmin && menuOpenId === m.id && (
                <div className="member-row-actions">
                  <PhotoUploadButton memberId={m.id} onUploaded={reload} />
                  <button type="button" className="link-button" onClick={() => setEditingId(m.id)}>
                    ✏️ Editar
                  </button>
                  {m.linkedProfileId && <ResetPinButton profileId={m.linkedProfileId} />}
                  {/* Solo tiene sentido para quien todavía no tiene su
                      propia cuenta — ligado hoy a la sesión de otro (p. ej.
                      Paco entrando siempre como Jennifer). El código enlaza
                      la cuenta nueva a ESTE perfil ya existente, en vez de
                      crear una familia aparte. */}
                  {!m.linkedProfileId && <InviteCodeButton memberId={m.id} memberName={m.name} />}
                  {m.linkedProfileId !== profile.id && <ConfirmButton label="🗑 Borrar" onConfirm={() => handleDelete(m.id)} />}
                </div>
              )}
            </div>
          ),
        )}
        {order.length === 0 && <p className="muted">Todavía no hay miembros.</p>}
      </div>

      {isAdmin &&
        (addingMember ? (
          <>
            <AddMemberForm
              onAdded={() => {
                setAddingMember(false)
                reload()
              }}
              existingMembers={order}
            />
            <button type="button" className="link-button" onClick={() => setAddingMember(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className="family-add-btn" onClick={() => setAddingMember(true)}>
            + Añadir miembro
          </button>
        ))}
      {isAdmin && (
        <details className="family-advanced">
          <summary>⚙️ Automatizaciones de tickets por email</summary>
          <AmazonWebhookSettings />
        </details>
      )}
        </>
      )}
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
      setError(errorMessage(err, 'No se pudo regenerar el token'))
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
      setError(errorMessage(err, 'No se pudo reiniciar el PIN'))
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
      setError(errorMessage(err, 'No se pudo generar el código'))
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
  const [sex, setSex] = useState<MemberSex | ''>(member.sex ?? '')
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
        sex: sex || null,
        allowedSections: canRestrictSections(memberType) ? allowedSections : null,
      })
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
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
      <label>
        Sexo (opcional, solo para las curvas de crecimiento)
        <select value={sex} onChange={(e) => setSex(e.target.value as MemberSex | '')}>
          <option value="">Sin indicar</option>
          <option value="female">Mujer / niña</option>
          <option value="male">Hombre / niño</option>
        </select>
      </label>
      {canRestrictSections(memberType) && (
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

// Piso compartido — se abre justo al crear el 2º miembro de la familia.
// Compartidas preseleccionada (mismo valor por defecto que ya tiene la
// familia); cerrar sin elegir deja el modo tal cual está (Compartidas).
function AccountsModePromptModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<AccountsMode>('compartido')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePick(picked: AccountsMode) {
    setMode(picked)
    setSaving(true)
    setError(null)
    try {
      await updateAccountsMode(picked)
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            ¿Cómo lleváis las cuentas?
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Compartidas: todo el mundo ve los movimientos y saldos de todos, como hasta ahora. Separadas: cada uno ve
          solo los suyos, con una pestaña Común para lo que se comparta a propósito. Se puede cambiar más adelante
          desde Configuración.
        </p>
        <div className="filter-row">
          <button type="button" className={'chip' + (mode === 'compartido' ? ' chip-active' : '')} disabled={saving} onClick={() => handlePick('compartido')}>
            Compartidas
          </button>
          <button type="button" className={'chip' + (mode === 'separado' ? ' chip-active' : '')} disabled={saving} onClick={() => handlePick('separado')}>
            Separadas
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}

// "Adulto" a efectos de Piso compartido: admin (quien crea la familia)
// cuenta igual que un 'adult' normal — ambos pueden tener sus propias
// cuentas bancarias; niños/bebés/invitados no.
function isFinancialAdult(memberType: MemberType): boolean {
  return memberType === 'admin' || memberType === 'adult'
}

export function AddMemberForm({ onAdded, existingMembers }: { onAdded: () => void; existingMembers: FamilyMember[] }) {
  const [name, setName] = useState('')
  const [memberType, setMemberType] = useState<MemberType>('child')
  const [color, setColor] = useState('#4C6EF5')
  const [birthDate, setBirthDate] = useState('')
  const [sex, setSex] = useState<MemberSex | ''>('')
  const [allowedSections, setAllowedSections] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Piso compartido — petición real: "que se pueda elegir... al añadir
  // un segundo miembro" y, tras probarlo con un 2º miembro Niño: "que
  // al crear una segunda cuenta ADULTA pregunte" — un hijo/bebé/invitado
  // no tiene cuentas propias, así que no cuenta para esta pregunta; solo
  // tiene sentido la primera vez que la familia pasa de 1 a 2 adultos
  // (admin cuenta como adulto) — añadir un 3º, 4º adulto no repregunta.
  const [showModePrompt, setShowModePrompt] = useState(false)

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
        sex: sex || null,
        allowedSections: canRestrictSections(memberType) ? allowedSections : null,
      })
      setName('')
      setBirthDate('')
      setAllowedSections([])
      const existingAdults = existingMembers.filter((m) => isFinancialAdult(m.memberType)).length
      // Bug real encontrado probando en vivo ("sigue sin preguntar"): si
      // aquí mismo se llamaba a onAdded() (recarga la lista del padre),
      // FamilyScreen pasaba un instante por su "Cargando familia…" — un
      // return anticipado que DESMONTA este formulario entero, llevándose
      // por delante el showModePrompt recién puesto a true antes de que
      // llegara a pintarse. Con la ventana abierta, onAdded() se retrasa
      // hasta que se cierra (ver AccountsModePromptModal más abajo); sin
      // ventana, se llama aquí mismo como siempre.
      if (isFinancialAdult(memberType) && existingAdults === 1) setShowModePrompt(true)
      else onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir el miembro'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      {showModePrompt && (
        <AccountsModePromptModal
          onClose={() => {
            setShowModePrompt(false)
            onAdded()
          }}
        />
      )}
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
      <label>
        Sexo (opcional, solo para las curvas de crecimiento)
        <select value={sex} onChange={(e) => setSex(e.target.value as MemberSex | '')}>
          <option value="">Sin indicar</option>
          <option value="female">Mujer / niña</option>
          <option value="male">Hombre / niño</option>
        </select>
      </label>
      {canRestrictSections(memberType) && (
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
