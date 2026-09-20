import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { NAV_TAB_BY_PATH, NAV_TAB_PATHS, type NavTab } from '@/domain/navTabs'
import { loadTabOrder, resolveTabOrder, saveTabOrder } from '@/state/tabOrder'
import { openManager, type ManagerKind } from '@/state/managers'
import { loadMovementColorMode, saveMovementColorMode, type MovementColorMode } from '@/state/movementColorMode'
import {
  getChartColorTheme,
  getColorTheme,
  saveChartColorTheme,
  saveColorTheme,
  type ChartColorTheme,
  type ColorTheme,
} from '@/state/colorTheme'
import { pastelPalette } from '@/domain/colors'
import {
  getAccountsMode,
  getFamilyName,
  getFinanceMonthStartDay,
  updateAccountsMode,
  updateFamilyName,
  updateFinanceMonthStartDay,
  type AccountsMode,
} from '@/data/family'
import { listAppUsage } from '@/data/appUsage'
import { BankAccountsModal } from '@/ui/BankAccountsModal'
import {
  clearOwnPin,
  deleteWebauthnCredential,
  hasOwnPin,
  listWebauthnCredentials,
  registerPasskey,
  setOwnPin,
  type WebauthnCredentialInfo,
} from '@/data/appLock'
import configuracionHeaderImg from '@/assets/configuracion/configuracion-header.jpg'
import { errorMessage } from '@/domain/errorMessage'

const PINNED_COUNT = 4

// Petición real: "familia Hepburn... que se pueda editar y poner lo
// que se quiera" — el nombre de familia no se podía cambiar en ningún
// sitio. Solo un admin puede guardar de verdad (RLS "families: admin
// update", ver 0001_init.sql); si falla se explica en vez de fallar en
// silencio.
function FamilyNameSection() {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getFamilyName()
      .then((n) => {
        setName(n)
        setDraft(n)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!draft.trim()) return
    setSaving(true)
    setError(null)
    try {
      await updateFamilyName(draft)
      setName(draft.trim())
      setEditing(false)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar — puede que solo un admin de la familia pueda cambiar el nombre.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="card event-card" style={{ marginBottom: 16 }}>
      {editing ? (
        <div className="member-form">
          <label>
            Nombre de familia
            <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="inline-fields">
            <button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setDraft(name)
                setEditing(false)
                setError(null)
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ flex: 1 }}>👨‍👩‍👧‍👦 {name}</strong>
          <button type="button" className="link-button" onClick={() => setEditing(true)}>
            ✏️ Cambiar nombre
          </button>
        </div>
      )}
    </div>
  )
}

// Petición real: "para mí contablemente el mes empieza el último día
// de cada mes... quiero que se pueda definir una preferencia de cuándo
// se quiere que empiece el mes... y así cuando le dé a filtrar este
// mes, me tome los datos desde esa fecha" — afecta al filtro "Este
// mes" en toda Economía (ver domain/dateRanges.ts). 31 se recorta
// solo al último día real de cada mes, así que cubre justo el caso
// que pedían sin necesitar una casilla aparte de "último día".
function AccountingMonthSection() {
  const [day, setDay] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getFinanceMonthStartDay()
      .then(setDay)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleChange(next: number) {
    setDay(next)
    setSaving(true)
    setError(null)
    try {
      await updateFinanceMonthStartDay(next)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="card event-card" style={{ marginBottom: 16 }}>
      <strong>📅 Inicio del mes contable</strong>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        El filtro "Este mes" de Economía cuenta desde este día del mes. Pon 31 para que empiece el último día de
        cada mes. Es solo tuyo — cada persona de la familia puede tener el suyo, sin afectar al de los demás.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        Día
        <input
          type="number"
          min={1}
          max={31}
          value={day}
          style={{ width: 70 }}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (n >= 1 && n <= 31) handleChange(n)
          }}
        />
        {saving && <span className="muted">Guardando…</span>}
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

// Piso compartido — petición real: "que se pueda elegir desde el momento
// de añadir un segundo miembro... y que se pueda cambiar de modo en un
// futuro". El primer momento vive en FamilyScreen (ventana emergente al
// crear el 2º miembro); este es el sitio para cambiarlo después. Mismo
// patrón que AccountingMonthSection (card, carga y guarda solo).
function AccountsModeSection() {
  const [mode, setMode] = useState<AccountsMode>('compartido')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAccountsMode()
      .then(setMode)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleChange(next: AccountsMode) {
    if (next === mode) return
    setMode(next)
    setSaving(true)
    setError(null)
    try {
      await updateAccountsMode(next)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="card event-card" style={{ marginBottom: 16 }}>
      <strong>🔐 Modo de cuentas</strong>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        Compartidas: todo el mundo ve los movimientos y saldos de todos, como hasta ahora. Separadas: cada uno ve
        solo los suyos (ni el admin ve los de otro), con una pestaña Común para lo que se comparta a propósito.
      </p>
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="button" className={'chip' + (mode === 'compartido' ? ' chip-active' : '')} onClick={() => handleChange('compartido')}>
          Compartidas
        </button>
        <button type="button" className={'chip' + (mode === 'separado' ? ' chip-active' : '')} onClick={() => handleChange('separado')}>
          Separadas
        </button>
      </div>
      {saving && <span className="muted">Guardando…</span>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

// Petición real: extender el pastel a Movimientos — por dispositivo
// (localStorage, no Supabase, mismo motivo que el orden de pestañas:
// cada persona de la familia puede preferir una vista distinta), no
// hace falta cargar/guardar nada async como en AccountsModeSection.
function MovementColorModeSection() {
  const [mode, setMode] = useState<MovementColorMode>(() => loadMovementColorMode())

  function handleChange(next: MovementColorMode) {
    setMode(next)
    saveMovementColorMode(next)
  }

  return (
    <div className="card event-card" style={{ marginBottom: 16 }}>
      <strong>🎨 Colorear movimientos por</strong>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        La lista de Movimientos puede colorear cada fila según su categoría, según su etiqueta, o quedarse sin
        colorear.
      </p>
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="button" className={'chip' + (mode === 'categoria' ? ' chip-active' : '')} onClick={() => handleChange('categoria')}>
          Categoría
        </button>
        <button type="button" className={'chip' + (mode === 'etiqueta' ? ' chip-active' : '')} onClick={() => handleChange('etiqueta')}>
          Etiqueta
        </button>
        <button type="button" className={'chip' + (mode === 'ninguno' ? ' chip-active' : '')} onClick={() => handleChange('ninguno')}>
          Sin color
        </button>
      </div>
    </div>
  )
}

// Petición real: "Esta parte de las cuentas quiero que la pongas en una
// página emergente accesible desde el menú arriba con Configuración
// cuentas" — conectar bancos, asignar de quién es cada cuenta y
// desconectar vivía mezclado dentro de Economía → Banco; ahora se
// gestiona desde aquí (y también desde un botón dentro de esa misma
// pestaña, para quien ya esté ahí). Un solo componente, BankAccountsModal,
// para no duplicar la lógica.
function BankAccountsSection() {
  const [open, setOpen] = useState(false)
  return (
    <div className="card event-card" style={{ marginBottom: 16 }}>
      <strong>🏦 Cuentas bancarias</strong>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        Conecta o desconecta bancos y define de quién es cada cuenta.
      </p>
      <button type="button" className="link-button" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        Gestionar cuentas
      </button>
      {open && <BankAccountsModal onClose={() => setOpen(false)} />}
    </div>
  )
}

// Enlace al panel de uso de la app (quién se ha dado de alta, cuándo
// entró por última vez...) — solo para Jennifer y Paco
// (profiles.is_app_owner). No hay forma de saber eso en el cliente sin
// preguntar al servidor, así que se intenta cargar el panel una vez y
// solo se muestra el enlace si de verdad ha devuelto algo; para
// cualquier otra persona (incluidos admins de otras familias de
// prueba) esto no aparece.
function AdminUsageLink() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    listAppUsage()
      .then((rows) => setVisible(rows.length > 0))
      .catch(() => {})
  }, [])

  if (!visible) return null

  return (
    <Link to="/admin-uso" className="link-button" style={{ display: 'block', margin: '12px 0 16px' }}>
      📊 Panel de uso de la app
    </Link>
  )
}

// Petición real: "que te dé la opción de poder bloquearla y
// desbloquearla con... un PIN... hazlo opcional, si alguien no lo
// quiere poner que no lo ponga". Es por login (auth.uid()), no por
// family_member — cada adulto tiene su propia cuenta en su propio
// móvil (ver 0083_profile_app_lock.sql), así que esta sección solo
// afecta al PIN de quien la está viendo ahora mismo.
function AppLockSection() {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [mode, setMode] = useState<'idle' | 'setup' | 'confirm-remove'>('idle')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [passkeys, setPasskeys] = useState<WebauthnCredentialInfo[]>([])
  const [addingPasskey, setAddingPasskey] = useState(false)
  const [passkeyLabel, setPasskeyLabel] = useState('')
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  function reload() {
    hasOwnPin()
      .then(setEnabled)
      .catch(() => {})
      .finally(() => setLoading(false))
    listWebauthnCredentials()
      .then(setPasskeys)
      .catch(() => {})
  }

  useEffect(reload, [])

  async function handleAddPasskey(e: FormEvent) {
    e.preventDefault()
    setPasskeyBusy(true)
    setPasskeyError(null)
    try {
      await registerPasskey(passkeyLabel.trim() || 'Este dispositivo')
      setAddingPasskey(false)
      setPasskeyLabel('')
      setPasskeys(await listWebauthnCredentials())
    } catch (err) {
      setPasskeyError(errorMessage(err, 'No se pudo activar la huella/Face ID'))
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function handleDeletePasskey(id: string) {
    setPasskeyBusy(true)
    setPasskeyError(null)
    try {
      await deleteWebauthnCredential(id)
      setPasskeys(await listWebauthnCredentials())
    } catch (err) {
      setPasskeyError(errorMessage(err, 'No se pudo quitar'))
    } finally {
      setPasskeyBusy(false)
    }
  }

  function startSetup() {
    setPin('')
    setPinConfirm('')
    setError(null)
    setMode('setup')
  }

  async function handleSetup(e: FormEvent) {
    e.preventDefault()
    if (!/^[0-9]{4,6}$/.test(pin)) {
      setError('El PIN debe tener entre 4 y 6 dígitos')
      return
    }
    if (pin !== pinConfirm) {
      setError('Los dos PIN no coinciden')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await setOwnPin(pin)
      setEnabled(true)
      setMode('idle')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo activar el PIN'))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    setSaving(true)
    setError(null)
    try {
      await clearOwnPin()
      setEnabled(false)
      setMode('idle')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo quitar el PIN'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="card event-card" style={{ marginBottom: 16 }}>
      <strong>🔒 Bloqueo de la app</strong>
      <p className="muted" style={{ marginTop: 4 }}>
        {enabled
          ? 'Tienes un PIN activado: se pedirá cada vez que abras la app.'
          : 'Desactivado — cualquiera con el móvil desbloqueado puede entrar directamente.'}
      </p>

      {mode === 'setup' && (
        <form onSubmit={handleSetup} className="member-form">
          <label>
            Nuevo PIN (4-6 dígitos)
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </label>
          <label>
            Repite el PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="inline-fields">
            <button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Activar PIN'}
            </button>
            <button type="button" className="link-button" onClick={() => setMode('idle')}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {mode === 'confirm-remove' && (
        <div className="inline-fields" style={{ marginTop: 8 }}>
          <span className="muted">¿Quitar el PIN?</span>
          <button type="button" onClick={handleRemove} disabled={saving}>
            {saving ? 'Quitando…' : 'Sí, quitar'}
          </button>
          <button type="button" className="link-button" onClick={() => setMode('idle')}>
            Cancelar
          </button>
        </div>
      )}

      {mode === 'idle' && (
        <div style={{ marginTop: 8 }}>
          {enabled ? (
            <button type="button" className="link-button" onClick={() => setMode('confirm-remove')}>
              Quitar PIN
            </button>
          ) : (
            <button type="button" className="link-button" onClick={startSetup}>
              Activar PIN
            </button>
          )}
        </div>
      )}

      {enabled && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-color, #eee)' }}>
          <strong style={{ fontSize: 14 }}>👆 Huella / Face ID</strong>
          <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            Capa opcional además del PIN — si falla o la quitas, siempre puedes seguir usando el PIN.
          </p>

          {passkeys.length > 0 && (
            <div className="event-list" style={{ marginTop: 8 }}>
              {passkeys.map((p) => (
                <div key={p.id} className="inline-fields">
                  <span className="muted" style={{ flex: 1 }}>{p.deviceLabel || 'Dispositivo'}</span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleDeletePasskey(p.id)}
                    disabled={passkeyBusy}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingPasskey ? (
            <form onSubmit={handleAddPasskey} className="member-form" style={{ marginTop: 8 }}>
              <label>
                Nombre de este dispositivo (opcional)
                <input
                  type="text"
                  value={passkeyLabel}
                  onChange={(e) => setPasskeyLabel(e.target.value)}
                  placeholder="Mi móvil"
                  autoFocus
                />
              </label>
              {passkeyError && <p className="error">{passkeyError}</p>}
              <div className="inline-fields">
                <button type="submit" disabled={passkeyBusy}>
                  {passkeyBusy ? 'Comprobando…' : 'Activar'}
                </button>
                <button type="button" className="link-button" onClick={() => setAddingPasskey(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div style={{ marginTop: 8 }}>
              <button type="button" className="link-button" onClick={() => setAddingPasskey(true)}>
                + Activar huella/Face ID en este dispositivo
              </button>
              {passkeyError && <p className="error">{passkeyError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Petición real: "darle al usuario a elegir qué clases de tonos quiere:
// pastel, saturados... y según la elección general cambiar todos los
// colores de la app". Cambiar de estilo recarga la app (los colores se
// calculan al cargar cada pantalla, y esa es la única forma de que TODO
// se repinte a la vez).
type ColorOption<T extends ColorTheme> = { key: T; label: string; text: string }

const UI_THEME_OPTIONS: ColorOption<ColorTheme>[] = [
  { key: 'pastel', label: 'Pastel', text: 'Suave y clarito (el de siempre).' },
  { key: 'vivo', label: 'Vivo', text: 'Más saturado, colores con más presencia.' },
  { key: 'neutro', label: 'Neutro', text: 'Fondos casi grises, con una franja fina de color para reconocer cada cosa.' },
]

const CHART_THEME_OPTIONS: ColorOption<ChartColorTheme>[] = [
  { key: 'pastel', label: 'Pastel', text: 'Porciones y barras en tonos suaves.' },
  { key: 'vivo', label: 'Vivo', text: 'Porciones y barras más saturadas, se distinguen mejor.' },
]

// Selector con una muestra de cada estilo. Cambiar de estilo recarga la app
// (los colores se calculan al cargar cada pantalla, y esa es la única forma
// de que TODO se repinte a la vez).
function ColorThemePicker<T extends ColorTheme>({
  title,
  text,
  options,
  current,
  onChoose,
}: {
  title: string
  text: string
  options: ColorOption<T>[]
  current: T
  onChoose: (next: T) => void
}) {
  return (
    <div className="card event-card" style={{ marginBottom: 12 }}>
      <strong>{title}</strong>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        {text}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => {
              if (o.key !== current) onChoose(o.key)
            }}
            aria-pressed={current === o.key}
            style={{
              textAlign: 'left',
              background: '#fff',
              color: 'var(--text)',
              border: current === o.key ? '2px solid var(--primary)' : '1px solid #dee2e6',
              borderRadius: 12,
              padding: '10px 12px',
            }}
          >
            <strong>
              {current === o.key ? '✓ ' : ''}
              {o.label}
            </strong>
            <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 2, fontWeight: 400 }}>
              {o.text}
            </span>
            <span style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {pastelPalette(8, o.key).map((c) => (
                <span key={c} style={{ flex: 1, height: 18, borderRadius: 6, background: c }} />
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ColorThemeSection() {
  const [uiTheme] = useState<ColorTheme>(() => getColorTheme())
  const [chartTheme] = useState<ChartColorTheme>(() => getChartColorTheme())

  return (
    <>
      <ColorThemePicker
        title="🎨 Menús y pantallas"
        text="Los colores de Inicio, los menús ☰, tarjetas, filas, calendario, compras y cocina en este móvil. Al elegir otro estilo la app se recarga."
        options={UI_THEME_OPTIONS}
        current={uiTheme}
        onChoose={(next) => {
          saveColorTheme(next)
          window.location.reload()
        }}
      />
      <ColorThemePicker
        title="📊 Estadísticas y gráficos"
        text="Los colores de los dónuts, sus leyendas y las barras (Economía y Estadística compras), aparte del estilo de las pantallas."
        options={CHART_THEME_OPTIONS}
        current={chartTheme}
        onChoose={(next) => {
          saveChartColorTheme(next)
          window.location.reload()
        }}
      />
    </>
  )
}

// Gestión de categorías, etiquetas y clases de alimentos — petición real:
// "categorías y etiquetas de Economía [y] las clases de alimentos... a
// Configuración, pero es imprescindible que en cada lugar donde se
// utilicen haya un acceso directo a la gestión". Aquí solo está el botón
// (la ventana de gestión es global, ver state/managers.ts).
function ManagerLinkSection({ icon, title, text, kind }: { icon: string; title: string; text: string; kind: ManagerKind }) {
  return (
    <div className="card event-card" style={{ marginBottom: 12 }}>
      <strong>
        {icon} {title}
      </strong>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        {text}
      </p>
      <button type="button" className="link-button" style={{ marginTop: 8 }} onClick={() => openManager(kind)}>
        Gestionar
      </button>
    </div>
  )
}

// Un tema de Configuración: una fila que al tocarla despliega su
// contenido (misma mecánica que las tarjetas de Ayuda).
function SettingsGroup({
  icon,
  title,
  summary,
  color,
  open,
  onToggle,
  children,
}: {
  icon: string
  title: string
  summary: string
  color: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="card ayuda-card" style={{ marginBottom: 8, background: color }}>
      <button type="button" className="ayuda-card-header" onClick={onToggle} aria-expanded={open}>
        <span style={{ fontSize: 22 }} aria-hidden="true">
          {icon}
        </span>
        <div className="ayuda-card-main">
          <strong>{title}</strong>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {summary}
          </p>
        </div>
        <span className="ayuda-card-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="ayuda-card-detail settings-group-body">{children}</div>}
    </div>
  )
}

// Reordenar el menú con flechas arriba/abajo en vez de arrastrar con
// el dedo — petición real, tras varios intentos de arrastre táctil
// poco fiable justo en esta barra (compite con los propios gestos del
// borde inferior del iPhone): "si cambiarle el orden allí mismo es un
// problema, igual sería mejor hacer una pestaña de configuración para
// ello". Sin gracia, pero infalible — a diferencia del arrastre, que
// depende de un gesto que aquí llevaba todo el día fallando. Los
// primeros 4 de esta lista son los que se quedan fijos abajo; el
// resto vive detrás del botón "Menú".
//
// Petición real: "la organización del menú principal debe ser más
// compacta, arriba, lo primero justo debajo del nombre de familia" —
// filas de una línea en vez de una tarjeta grande por sección.
function MenuOrderSection() {
  const [order, setOrder] = useState(() => resolveTabOrder(NAV_TAB_PATHS, loadTabOrder('bottom-nav')))
  const orderedTabs = order.map((path) => NAV_TAB_BY_PATH.get(path)).filter((t): t is NavTab => !!t)

  function move(index: number, direction: -1 | 1) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= order.length) return
    const next = [...order]
    ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
    setOrder(next)
    saveTabOrder('bottom-nav', next)
  }

  return (
    <div>
      <p className="muted" style={{ margin: '10px 0 4px', fontSize: 12 }}>
        Los {PINNED_COUNT} primeros se quedan fijos abajo del todo; el resto aparece al tocar "☰ Menú".
      </p>
      {orderedTabs.map((tab, i) => (
        <div
          key={tab.to}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 0',
            borderTop: i === PINNED_COUNT ? '2px solid var(--primary)' : i > 0 ? '1px solid #f0f0f0' : undefined,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 18, width: 24, textAlign: 'center' }}>
            {tab.icon}
          </span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: i < PINNED_COUNT ? 600 : 400 }}>
            {tab.label}
            {i < PINNED_COUNT && <span title="Fijo abajo"> 📌</span>}
          </span>
          <button
            type="button"
            className="link-button"
            style={{ padding: '2px 10px' }}
            disabled={i === 0}
            onClick={() => move(i, -1)}
            aria-label={`Subir ${tab.label}`}
          >
            ↑
          </button>
          <button
            type="button"
            className="link-button"
            style={{ padding: '2px 10px' }}
            disabled={i === orderedTabs.length - 1}
            onClick={() => move(i, 1)}
            aria-label={`Bajar ${tab.label}`}
          >
            ↓
          </button>
        </div>
      ))}
    </div>
  )
}

type SettingsGroupId = 'menu' | 'colores' | 'economia' | 'compras' | 'seguridad'

export function MenuSettingsScreen() {
  // Un solo tema abierto a la vez — la pantalla queda como una lista
  // limpia y recogida, y al tocar un tema se abre su sección.
  const location = useLocation()
  const [openGroup, setOpenGroup] = useState<SettingsGroupId | null>(
    () => (location.state as { group?: SettingsGroupId } | null)?.group ?? null,
  )
  const toggle = (id: SettingsGroupId) => setOpenGroup((cur) => (cur === id ? null : id))
  // Un color por tema, con el estilo elegido en Colores.
  const groupColors = pastelPalette(5)

  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-familia">
        <img src={configuracionHeaderImg} alt="Configuración" className="kitchen-header-img" />
      </div>

      <FamilyNameSection />

      <SettingsGroup color={groupColors[0]} icon="🧭" title="Organizar menú" summary="Qué secciones van fijas abajo y en qué orden" open={openGroup === 'menu'} onToggle={() => toggle('menu')}>
        <MenuOrderSection />
      </SettingsGroup>

      <SettingsGroup color={groupColors[1]} icon="🎨" title="Colores" summary="Estilo de las pantallas y de las estadísticas" open={openGroup === 'colores'} onToggle={() => toggle('colores')}>
        <ColorThemeSection />
      </SettingsGroup>

      <SettingsGroup
        color={groupColors[2]}
        icon="💶"
        title="Economía"
        summary="Mes contable, cuentas, categorías, etiquetas y colores"
        open={openGroup === 'economia'}
        onToggle={() => toggle('economia')}
      >
        <AccountingMonthSection />
        <AccountsModeSection />
        <BankAccountsSection />
        <ManagerLinkSection
          icon="🗂️"
          title="Categorías"
          text="Crea, renombra o ordena las categorías y subcategorías de gasto e ingreso."
          kind="categorias"
        />
        <ManagerLinkSection icon="🏷️" title="Etiquetas" text="Crea, cambia de color o borra las etiquetas de los movimientos." kind="etiquetas" />
        <MovementColorModeSection />
      </SettingsGroup>

      <SettingsGroup
        color={groupColors[3]}
        icon="🛒"
        title="Compras y cocina"
        summary="Clases de alimentos y de otros productos"
        open={openGroup === 'compras'}
        onToggle={() => toggle('compras')}
      >
        <ManagerLinkSection
          icon="🥕"
          title="Clases de productos"
          text="Crea o edita las clases (Fruta, Lácteos, Limpieza…) con las que se agrupan los productos de la lista, el historial y los tickets."
          kind="clases"
        />
      </SettingsGroup>

      <SettingsGroup color={groupColors[4]} icon="🔒" title="Seguridad" summary="PIN, huella y Face ID" open={openGroup === 'seguridad'} onToggle={() => toggle('seguridad')}>
        <AppLockSection />
      </SettingsGroup>

      <AdminUsageLink />
    </div>
  )
}
