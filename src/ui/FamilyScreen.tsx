import { ChangeEvent, FormEvent, lazy, PointerEvent as ReactPointerEvent, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  addFamilyMember,
  DEFAULT_BABY_UNTIL_MONTHS,
  deleteFamilyMember,
  generateMemberInviteCode,
  getBabyUntilMonths,
  listFamilyMembers,
  reorderFamilyMembers,
  updateAccountsMode,
  updateFamilyMember,
  uploadMemberPhoto,
  type AccountsMode,
} from '@/data/family'
import { getMyAccount, listFamilyAccountEmails, type FamilyAccountEmail } from '@/data/account'
import { ChangeEmailPanel } from '@/ui/ChangeEmailPanel'
import { listGuardianships } from '@/data/invitations'
import { canDeclareGuardianship, canGiveAccess, GUARDIAN_RELATIONSHIP_LABELS, guardianNamesOf, myMember, type GuardianLink } from '@/domain/guardianship'
import { AccessInvitePanel } from '@/ui/AccessInvitePanel'
import { GuardianshipPanel } from '@/ui/GuardianshipPanel'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { DateField } from '@/ui/DateField'
import { useSectionHome } from '@/ui/useSectionHome'
import { effectiveMemberType } from '@/domain/growth'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { canSeeDietarySection, FamilyDietarySection } from '@/ui/FamilyDietarySection'
import type { FamilyMember, MemberSex, MemberType, Profile } from '@/domain/types'
import { NAV_TABS, navSectionId } from '@/domain/navTabs'
import familiaHeaderImg from '@/assets/familia/familia-header.jpg'
import { errorMessage } from '@/domain/errorMessage'
import { InviteFriendsButton } from '@/ui/InviteFriendsButton'

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
  // "Familia" del breadcrumb siempre vuelve a Miembros, incluso ya estando en /familia — clave distinta
  // de state.tab de arriba (el redirect de /peso), conviven sin pisarse.
  useSectionHome(() => setTab('Miembros'))
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

  // Correos de las cuentas (solo las fichas con cuenta propia tienen): la administradora ve los de toda la familia (una llamada a la base de datos, solo para
  // ella); el resto, solo el suyo (sale de la sesión, sin llamada). Los miembros sin cuenta (bebés, niños sin acceso…) no tienen correo: no se enseña nada.
  const [emails, setEmails] = useState<Record<string, FamilyAccountEmail>>({})
  function loadEmails() {
    if (isAdmin) {
      listFamilyAccountEmails()
        .then((rows) => setEmails(Object.fromEntries(rows.map((r) => [r.profileId, r]))))
        .catch(() => {})
    } else {
      getMyAccount()
        .then((a) => setEmails({ [profile.id]: { profileId: profile.id, email: a.email, confirmed: a.confirmed, changePending: Boolean(a.pendingEmail) } }))
        .catch(() => {})
    }
  }
  useEffect(loadEmails, [isAdmin, profile.id])

  // Vínculos «madre/padre/tutor» de los menores (solo los ven personas adultas y administradoras; lo decide la base de datos). Solo se piden si hay alguna ficha de niño o bebé.
  const [links, setLinks] = useState<GuardianLink[]>([])
  const [guardianFor, setGuardianFor] = useState<string | null>(null)
  const canSeeLinks = profile.role === 'admin' || profile.role === 'adult'
  function loadLinks() {
    listGuardianships()
      .then(setLinks)
      .catch(() => {})
  }

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
        if (canSeeLinks && m.some((x) => x.memberType === 'child' || x.memberType === 'baby')) loadLinks()
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  // Se carga una vez al abrir; el rol de la persona no cambia mientras la pantalla está abierta.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const me = myMember(order, profile)

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
      <SectionBreadcrumb subsection={tab === 'Miembros' ? 'Inicio' : tab} />
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
      </div>
      <InviteFriendsButton />
      {/* 16/10/2026: el cierre de sesión, los avisos, el permiso «Permitir siempre», la guía de batería, las preferencias de Pepa y el borrado de cuenta no son de la
          familia: viven en Configuración (☰ Menú → Configuración), en los temas «Avisos», «Pepa» y «Mi cuenta». */}
      {/* Permisos de Comunidad de las personas de 15 a 17 años: solo para administradores de la familia; consulta solo al abrirla. */}
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
                {m.linkedProfileId && emails[m.linkedProfileId]?.email && (
                  <span className="muted" style={{ display: 'block', fontSize: 12, overflowWrap: 'anywhere' }}>
                    ✉️ {emails[m.linkedProfileId].email}
                    {!emails[m.linkedProfileId].confirmed && ' · sin confirmar'}
                    {emails[m.linkedProfileId].changePending && ' · cambio pendiente'}
                  </span>
                )}
                {m.linkedProfileId === profile.id && <ChangeEmailPanel compact onChanged={loadEmails} />}
                {/* Ficha SIN cuenta: se dice claro y se ofrece «Dar acceso a PEPA» a la vista (antes solo estaba en el menú ⋯). Los bebés no tienen cuenta. */}
                {!m.linkedProfileId && m.memberType !== 'baby' && (
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                    Sin acceso a PEPA
                  </span>
                )}
                {canGiveAccess(m, profile, me, links) && <AccessInvitePanel member={m} inviterName={profile.displayName} />}
                {/* Madres/padres/tutores declarados de un menor (cada vínculo es una declaración individual; sin límite de personas). */}
                {guardianNamesOf(m, order, links).length > 0 && (
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                    👪 {guardianNamesOf(m, order, links).map((g) => `${g.name} (${GUARDIAN_RELATIONSHIP_LABELS[g.relationship].toLowerCase()})`).join(', ')}
                  </span>
                )}
                {canDeclareGuardianship(m, profile, me, links) &&
                  (guardianFor === m.id ? (
                    <GuardianshipPanel
                      child={m}
                      onCancel={() => setGuardianFor(null)}
                      onDone={() => {
                        setGuardianFor(null)
                        loadLinks()
                      }}
                    />
                  ) : (
                    <button type="button" className="link-button" onClick={() => setGuardianFor(m.id)}>
                      👪 Es mi hijo/a
                    </button>
                  ))}
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
                  {/* Solo tiene sentido para quien todavía no tiene su
                      propia cuenta — ligado hoy a la sesión de otro (p. ej.
                      Paco entrando siempre como Jennifer). El código enlaza
                      la cuenta nueva a ESTE perfil ya existente, en vez de
                      crear una familia aparte. */}
                  {!m.linkedProfileId && <InviteCodeButton memberId={m.id} memberName={m.name} />}
                  {m.linkedProfileId !== profile.id && <ConfirmButton label="🗑 Borrar" onConfirm={() => handleDelete(m.id)} />}
                </div>
              )}
              {/* Alergias e intolerancias (datos de salud): ficha privada, opcional y plegada. Plegada no consulta nada al servidor. */}
              {canSeeDietarySection(profile, m) && <FamilyDietarySection memberId={m.id} memberName={m.name} />}
            </div>
          ),
        )}
        {order.length === 0 && <p className="muted">Todavía no hay miembros.</p>}
      </div>

      {isAdmin &&
        (addingMember ? (
          <>
            <AddMemberForm
              inviterName={profile.displayName}
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
        <DateField value={birthDate} onChange={setBirthDate} placeholder="Sin fecha de nacimiento" />
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

export function AddMemberForm({ onAdded, existingMembers, inviterName }: { onAdded: () => void; existingMembers: FamilyMember[]; inviterName?: string }) {
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
  // Tras crear la ficha se ofrece darle acceso a PEPA al momento (no a bebés). `proceed` es lo que se hacía antes (pregunta de cuentas / recargar la lista).
  const [offer, setOffer] = useState<{ member: Pick<FamilyMember, 'id' | 'name'>; proceed: () => void } | null>(null)
  const [offerAccepted, setOfferAccepted] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const newId = await addFamilyMember({
        name,
        memberType,
        color,
        birthDate: birthDate || null,
        sex: sex || null,
        allowedSections: canRestrictSections(memberType) ? allowedSections : null,
      })
      const createdName = name
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
      const proceed = () => {
        if (isFinancialAdult(memberType) && existingAdults === 1) setShowModePrompt(true)
        else onAdded()
      }
      // «¿Quieres darle acceso ahora?»: crear la ficha NO crea ninguna cuenta; el acceso es otra cosa (una invitación de un solo uso). No se ofrece a bebés.
      if (memberType !== 'baby') {
        setOffer({ member: { id: newId, name: createdName }, proceed })
        setOfferAccepted(false)
      } else {
        proceed()
      }
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir el miembro'))
    } finally {
      setSaving(false)
    }
  }

  function finishOffer() {
    if (!offer) return
    const next = offer.proceed
    setOffer(null)
    next()
  }

  if (offer) {
    return (
      <div className="card member-form">
        {showModePrompt && (
          <AccountsModePromptModal
            onClose={() => {
              setShowModePrompt(false)
              onAdded()
            }}
          />
        )}
        <h2>Ficha creada: {offer.member.name}</h2>
        <p>¿Quieres darle acceso a PEPA ahora?</p>
        <p className="muted" style={{ fontSize: 13 }}>
          Crear la ficha no crea ninguna cuenta. PEPA es privada: para tener cuenta hace falta una invitación de un solo uso (24 horas) que puedes copiar o compartir.
        </p>
        {!offerAccepted ? (
          <div className="form-actions">
            <button type="button" onClick={() => setOfferAccepted(true)}>
              Sí, dar acceso
            </button>
            <button type="button" className="link-button" onClick={finishOffer}>
              Ahora no
            </button>
          </div>
        ) : (
          <AccessInvitePanel member={offer.member} inviterName={inviterName} autoStart onClose={finishOffer} />
        )}
      </div>
    )
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
        <DateField value={birthDate} onChange={setBirthDate} placeholder="Sin fecha de nacimiento" />
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
