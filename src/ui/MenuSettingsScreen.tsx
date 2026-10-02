import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { pastelPalette, solidPalette } from '@/domain/colors'
import {
  createCalendarCategory,
  deleteCalendarCategory,
  getCalendarPreferences,
  listCalendarCategories,
  updateCalendarCategory,
  updateCalendarColorMode,
  updateCalendarTaskOrder,
  type CalendarColorMode,
  type CalendarTaskOrder,
} from '@/data/calendar'
import type { CalendarCategory } from '@/domain/types'
import { ConfirmIconButton } from '@/ui/ConfirmButton'
import {
  DEFAULT_BABY_UNTIL_MONTHS,
  getBabyUntilMonths,
  updateBabyUntilMonths,
  getAccountsMode,
  getDateFilterPreferences,
  getFamilyName,
  getFinanceMonthStartDay,
  updateAccountsMode,
  updateDateFilterDisabled,
  updateDateFilterFavorite,
  updateFamilyName,
  updateFinanceMonthStartDay,
  type AccountsMode,
  type DateFilterPreferences,
} from '@/data/family'
import { DISABLEABLE_SPEND_RANGE_PRESETS, PRESET_LABELS, type SpendRangePreset } from '@/domain/dateRanges'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
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

// "Configuración → Filtros temporales" — validación real en iPhone: el favorito vivía dentro del propio
// desplegable "📅 Fecha" como un texto que había que descubrir que era tocable, y no existía forma de
// activar/desactivar qué filtros aparecen. Ahora se administra aquí, en un solo sitio — el desplegable
// (DateFilterTab, FinanceScreen.tsx) solo SELECCIONA el periodo de esta sesión y enseña el favorito como
// información, nunca como acción. FAVORITO != FILTRO ACTUAL: el favorito no cambia solo por elegir un
// filtro distinto en una pantalla concreta, solo desde aquí. Por usuario real (profiles), mismo patrón que
// AccountingMonthSection — cada persona de la familia puede tener sus propios filtros activos/favorito.
function DateFilterSettingsSection() {
  const [prefs, setPrefs] = useState<DateFilterPreferences>({ favorite: null, disabled: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDateFilterPreferences()
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleFavorite(preset: SpendRangePreset) {
    const next = prefs.favorite === preset ? null : preset
    setPrefs((p) => ({ ...p, favorite: next }))
    setSaving(true)
    setError(null)
    try {
      await updateDateFilterFavorite(next)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  // "Desactivar" oculta el filtro de los desplegables compartidos — nunca lo borra del sistema; reactivarlo
  // lo devuelve exactamente igual. Si el favorito se desactiva, se queda como favorito (solo oculto) — para
  // quitarlo del todo hace falta desmarcarlo aparte, tocando "★ Favorito" otra vez.
  async function handleToggleActive(preset: SpendRangePreset) {
    const isDisabled = prefs.disabled.includes(preset)
    const nextDisabled = isDisabled ? prefs.disabled.filter((p) => p !== preset) : [...prefs.disabled, preset]
    setPrefs((p) => ({ ...p, disabled: nextDisabled }))
    setSaving(true)
    setError(null)
    try {
      await updateDateFilterDisabled(nextDisabled)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="card event-card" style={{ marginBottom: 16 }}>
      <strong>📅 Filtros temporales</strong>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        Qué filtros de fecha ("Hoy", "Mes contable"...) aparecen en los desplegables "📅 Fecha" de Economía y
        Compras, y cuál usar como favorito — es solo tuyo, cada persona de la familia puede tener el suyo.
        Desactivar uno lo oculta, nunca lo borra: puedes reactivarlo cuando quieras. El favorito es el punto
        de partida de una pantalla nueva — elegir otro filtro para esta vez en una pantalla concreta nunca
        lo cambia.
      </p>
      <div className="event-list" style={{ marginTop: 8 }}>
        {DISABLEABLE_SPEND_RANGE_PRESETS.map((p) => {
          const disabled = prefs.disabled.includes(p)
          const isFavorite = prefs.favorite === p
          // Auditoría real: "Mes contable" (id 'mes') SÍ estaba en la lista — solo se veía como "Este mes"
          // (PRESET_LABELS['mes'], el rótulo genérico que también usan Compras/Tickets sin distinción
          // mes contable/real, ver el comentario junto a SpendRangePreset en dateRanges.ts) y por eso
          // parecía ausente frente a "Mes contable anterior", que sí lleva ese texto en PRESET_LABELS. Se
          // reutiliza tal cual el mismo rótulo local que ya usa DateFilterTab (FinanceScreen.tsx, `label`) —
          // mismo id, mismo filtro, ninguna definición nueva ni duplicada; PRESET_LABELS no se toca (lo
          // sigue usando Compras con "Este mes", sin cambios).
          const label = p === 'mes' ? 'Mes contable' : PRESET_LABELS[p]
          return (
            <div key={p} className="inline-fields" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1, opacity: disabled ? 0.6 : 1 }}>{label}</span>
              <button type="button" className={'chip' + (isFavorite ? ' chip-active' : '')} onClick={() => handleFavorite(p)} disabled={disabled}>
                {isFavorite ? '★ Favorito' : '☆ Favorito'}
              </button>
              <button type="button" className={'chip' + (!disabled ? ' chip-active' : '')} onClick={() => handleToggleActive(p)}>
                {disabled ? 'Desactivado' : 'Activo'}
              </button>
            </div>
          )
        })}
      </div>
      {saving && <span className="muted">Guardando…</span>}
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

// Enlace al panel de admin (uso de la app — quién se ha dado de alta,
// cuándo entró por última vez... — y, desde la reorganización
// "Familia / Panel de admin", también las Automatizaciones de tickets
// por email) — solo para Jennifer y Paco (profiles.is_app_owner). No
// hay forma de saber eso en el cliente sin preguntar al servidor, así
// que se intenta cargar el panel una vez y solo se muestra el enlace
// si de verdad ha devuelto algo; para cualquier otra persona
// (incluidos admins de otras familias de prueba) esto no aparece.
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
      🛠️ Panel de admin
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

// Petición real: "una configuración que a los 2 años cambie la ficha
// automáticamente a niño" — los percentiles solo son de bebés, y el resto
// de niños usa el medidor ilustrado.
const BABY_UNTIL_OPTIONS = [12, 18, 24, 30, 36]

function BabyUntilSection() {
  const [months, setMonths] = useState(DEFAULT_BABY_UNTIL_MONTHS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getBabyUntilMonths()
      .then(setMonths)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function choose(next: number) {
    if (next === months) return
    const previous = months
    setMonths(next)
    setSaving(true)
    setError(null)
    try {
      await updateBabyUntilMonths(next)
    } catch (err) {
      setMonths(previous)
      setError(errorMessage(err, 'No se pudo guardar — puede que solo un admin de la familia pueda cambiarlo.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null
  const label = (m: number) => (m % 12 === 0 ? `${m / 12} ${m === 12 ? 'año' : 'años'}` : `${m} meses`)

  return (
    <div className="card event-card" style={{ marginBottom: 12 }}>
      <strong>👶 De bebé a niño</strong>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        Los percentiles de crecimiento son solo para bebés. Cuando un bebé cumple esta edad, su ficha pasa sola a niño/a (con el medidor de altura ilustrado).
      </p>
      <div className="filter-row" style={{ marginTop: 8 }}>
        {BABY_UNTIL_OPTIONS.map((m) => (
          <button key={m} type="button" className={'chip' + (months === m ? ' chip-active' : '')} onClick={() => choose(m)}>
            {label(m)}
          </button>
        ))}
      </div>
      {saving && <span className="muted">Guardando…</span>}
      {error && <p className="error">{error}</p>}
    </div>
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

// FASE CALENDARIO — Parte 8/28: modo de color y orden Eventos/Tareas, POR USUARIO real (profiles, mismo
// patrón exacto que DateFilterSettingsSection arriba — nunca families/localStorage).
function CalendarPreferencesSection() {
  const [colorMode, setColorMode] = useState<CalendarColorMode>('miembros')
  const [taskOrder, setTaskOrder] = useState<CalendarTaskOrder>('eventos_primero')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCalendarPreferences()
      .then((prefs) => {
        setColorMode(prefs.colorMode)
        setTaskOrder(prefs.taskOrder)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleColorMode(mode: CalendarColorMode) {
    setColorMode(mode)
    setSaving(true)
    setError(null)
    try {
      await updateCalendarColorMode(mode)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  async function handleTaskOrder(order: CalendarTaskOrder) {
    setTaskOrder(order)
    setSaving(true)
    setError(null)
    try {
      await updateCalendarTaskOrder(order)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="card event-card" style={{ marginBottom: 16 }}>
      <strong>🎨 Colores del calendario</strong>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        Es solo tuyo — cada persona de la familia puede ver el calendario a su manera.
      </p>
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="button" className={'chip' + (colorMode === 'miembros' ? ' chip-active' : '')} onClick={() => handleColorMode('miembros')}>
          Ver colores de miembros
        </button>
        <button type="button" className={'chip' + (colorMode === 'categorias' ? ' chip-active' : '')} onClick={() => handleColorMode('categorias')}>
          Ver colores de categorías
        </button>
      </div>
      <strong style={{ display: 'block', marginTop: 16 }}>📋 Orden en el calendario</strong>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        Cuando Eventos y Tareas aparecen el mismo día, cuál va primero.
      </p>
      <div className="filter-row" style={{ marginTop: 8 }}>
        <button type="button" className={'chip' + (taskOrder === 'eventos_primero' ? ' chip-active' : '')} onClick={() => handleTaskOrder('eventos_primero')}>
          Eventos primero
        </button>
        <button type="button" className={'chip' + (taskOrder === 'tareas_primero' ? ' chip-active' : '')} onClick={() => handleTaskOrder('tareas_primero')}>
          Tareas primero
        </button>
      </div>
      {saving && <span className="muted">Guardando…</span>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

// CORRECCIÓN QUIRÚRGICA — auditoría previa (reutilización): PEPA no tenía ningún selector de emoji
// reutilizable tal cual — el único picker de emoji real (InvitationDesigner.tsx) está soldado al lienzo
// de invitaciones (crea una capa arrastrable, no un valor de formulario) y su librería grande
// (INVITATION_EMOJI_CATEGORIES, domain/events.ts) es para buscar entre cientos de emoji de boda/fiesta —
// desproporcionado para "elige un icono de categoría". Se construye uno ligero nuevo, pero reutilizando
// el ÚNICO patrón visual que la app ya usa para "elegir una opción de una lista con una ventana propia"
// (modal-overlay + modal-sheet + chip, el mismo lenguaje que WhoDropdown/CategoryDropdown en
// CalendarScreen.tsx) — nunca un componente nuevo de overlay.
const CALENDAR_CATEGORY_EMOJI_SUGGESTIONS = ['🏥', '🩺', '🏫', '🎒', '⚽', '🎂', '💼', '🏠', '🚗', '✈️', '🎵', '💇', '🐶', '❤️']

function CalendarCategoryEmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')

  function pick(next: string) {
    onChange(next)
    setCustom('')
    setOpen(false)
  }

  function handleCustomSubmit(e: FormEvent) {
    e.preventDefault()
    // stopPropagation es imprescindible: aunque el <div className="modal-overlay"> esté en un portal
    // (otro punto del DOM), React sigue burbujeando los eventos sintéticos según el árbol de React, no
    // el del DOM — así que el submit de este formulario interno llegaba también al onSubmit del
    // formulario exterior (alta o edición de categoría) con el emoji todavía desactualizado (closure
    // obsoleta), guardando el emoji antiguo en silencio y sin que el usuario lo notara.
    e.stopPropagation()
    if (custom.trim()) pick(custom.trim())
  }

  return (
    <>
      <button
        type="button"
        className="calendar-category-emoji-toggle"
        onClick={() => setOpen(true)}
        aria-label={value ? `Emoji de la categoría: ${value}. Tocar para cambiarlo` : 'Elegir emoji de la categoría'}
      >
        {value || '🙂'}
      </button>
      {open &&
        // Portal, no inline: este picker vive dentro del <form> de alta/edición de
        // categoría, y su propio "Otro emoji" también es un <form> — dos <form>
        // anidados es HTML inválido y el submit interno burbujeaba hasta disparar
        // también el onSubmit del formulario exterior (closures con el valor viejo,
        // por eso el emoji elegido "se perdía" y el acordeón de Calendario se
        // cerraba). Mismo patrón ya usado en FinanceScreen.tsx para ProductTypesModal.
        createPortal(
          <div className="modal-overlay" onClick={() => setOpen(false)}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="section-title" style={{ margin: 0 }}>
                  Elegir emoji
                </h2>
                <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Cerrar">
                  ✕
                </button>
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                Algunos habituales, o escribe/pega cualquier otro emoji abajo.
              </p>
              <div className="filter-row" role="group" aria-label="Emoji sugeridos">
                {CALENDAR_CATEGORY_EMOJI_SUGGESTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={'chip' + (value === e ? ' chip-active' : '')}
                    style={{ fontSize: 18 }}
                    onClick={() => pick(e)}
                    aria-label={`Usar ${e}`}
                    aria-pressed={value === e}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <form onSubmit={handleCustomSubmit} className="inline-fields" style={{ marginTop: 12 }}>
                <label style={{ flex: 1 }}>
                  Otro emoji
                  <input
                    type="text"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="Escríbelo o pégalo aquí"
                    autoFocus
                  />
                </label>
                <button type="submit" disabled={!custom.trim()} style={{ alignSelf: 'flex-end' }}>
                  Usar este
                </button>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

// ACLARACIÓN DEL USUARIO (tras la primera versión) — el color de categoría NO debe tener una paleta
// propia: PEPA ya tiene en Configuración → Colores → Menús y pantallas el ajuste global Pastel/Vivo/
// Neutro (src/state/colorTheme.ts, ColorTheme), y SU paleta (domain/colors.ts: toneFor/pastelPalette,
// la misma que usan tarjetas, calendario y categorías de Economía) es la única fuente de verdad —
// nunca una lista fija independiente para Calendario. Ningún selector de muestras/círculos existía en
// PEPA (auditado: miembros, etiquetas de Economía e InvitationDesigner usan todos un <input
// type="color"> nativo suelto; InvitationDesigner es el único que lo viste como círculo —
// .invitation-color-swatch-btn/-input, SÍ reutilizado tal cual abajo para el hueco "otro color").
//
// El color GUARDADO (calendar_categories.color) sigue siendo siempre un hex plano, como ya exige
// readableTextColor() en domain/calendar.ts (espera hex, nunca hsl(...) ni el degradado de "neutro")
// — por eso las muestras salen de domain/colors.ts#solidPalette, que reutiliza la MISMA toneFor() de
// siempre (pastel/vivo/neutro) convertida a hex, en vez de un tono nuevo sin relación.
//
// Cambiar el estilo global NUNCA reescribe colores ya guardados (nunca se reinterpreta el índice): si
// el color de la categoría no está entre las muestras del estilo ACTUAL (p. ej. era Pastel y ahora la
// app está en Vivo), se enseña aparte como "Color actual" — se sigue viendo y se conserva tal cual
// hasta que el usuario elija otro a propósito.
const CALENDAR_CATEGORY_COLOR_COUNT = 8

const CALENDAR_CATEGORY_COLOR_THEME_LABEL: Record<ColorTheme, string> = {
  pastel: 'Colores del estilo Pastel',
  vivo: 'Colores del estilo Vivo',
  neutro: 'Colores del estilo Neutro',
}

function CalendarCategoryColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const theme = getColorTheme()
  const swatches = solidPalette(CALENDAR_CATEGORY_COLOR_COUNT, theme)
  const currentOutsidePalette = value !== '' && !swatches.includes(value)

  return (
    <div className="calendar-category-color-field">
      {currentOutsidePalette && (
        <div className="calendar-category-color-current">
          <span className="muted" style={{ fontSize: 12 }}>
            Color actual
          </span>
          <span
            className="calendar-category-color-swatch calendar-category-color-swatch-active"
            style={{ background: value, cursor: 'default' }}
            aria-hidden="true"
          />
        </div>
      )}
      <span className="muted" style={{ fontSize: 12 }}>
        {CALENDAR_CATEGORY_COLOR_THEME_LABEL[theme]}
      </span>
      <div className="calendar-category-color-row" role="group" aria-label="Color de la categoría">
        {swatches.map((c, i) => (
          <button
            key={c}
            type="button"
            className={'calendar-category-color-swatch' + (value === c ? ' calendar-category-color-swatch-active' : '')}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={`Color ${i + 1}`}
            aria-pressed={value === c}
          />
        ))}
        {/* Mismo círculo que ya usa InvitationDesigner.tsx para "otro color" (.invitation-color-swatch-btn
            por fuera, siempre neutro; .invitation-color-swatch-input, el <input type="color"> real,
            encogido dentro) — el escape hatch para cualquier color fuera de las muestras del estilo. */}
        <span className="invitation-color-swatch-btn" title="Otro color">
          <input
            type="color"
            className="invitation-color-swatch-input"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#9ca3af'}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Elegir otro color"
          />
        </span>
      </div>
      {value && (
        <button type="button" className="link-button" onClick={() => onChange('')} style={{ alignSelf: 'flex-start' }}>
          Sin color
        </button>
      )}
    </div>
  )
}

// FASE CALENDARIO — Parte 27: gestión de categorías propias del Calendario (nunca budget_categories ni
// tags de otro dominio). Crear/editar nombre+emoji+color opcional/borrar — borrar nunca se lleva los
// Eventos/Tareas que la llevaban (category_id queda en null, on delete set null, migración 0184).
function CalendarCategoryRow({ category, onSaved, onDeleted }: { category: CalendarCategory; onSaved: () => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [emoji, setEmoji] = useState(category.emoji)
  const [color, setColor] = useState(category.color ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    // CORRECCIÓN QUIRÚRGICA — Parte 3: el botón nunca debe parecer que no responde. emoji ya no es un
    // <input required> nativo (ahora es el selector, ver CalendarCategoryEmojiPicker), así que la
    // validación se hace aquí, con un mensaje visible — nunca un botón mudo que no explica nada.
    if (!emoji.trim() || !name.trim()) {
      setError('Elige un emoji y escribe un nombre para la categoría.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateCalendarCategory(category.id, { name: name.trim(), emoji: emoji.trim(), color: color.trim() || null, sortOrder: category.sortOrder })
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="inline-fields" style={{ alignItems: 'center' }}>
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Color PRIMERO, antes del emoji — visible sin entrar en Editar, en vez de al final de la
              línea como antes (fácil de pasar por alto). Hueco reservado también sin color, para que
              las filas con y sin color no "bailen" en la lista. */}
          <span
            aria-hidden="true"
            style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: category.color ?? '#e5e7eb', flexShrink: 0 }}
          />
          <span>
            {category.emoji} {category.name}
          </span>
        </span>
        <button type="button" className="link-button" onClick={() => setEditing(true)}>
          Editar
        </button>
        {/* Corrección visual (validación real iPhone) — sin className, ConfirmIconButton heredaba el
            <button> por defecto de toda la app (fondo azul, padding 14px, 16px) y aparecía como un
            bloque desproporcionado junto a "Editar". icon-button es el mismo patrón ya usado en
            EventosScreen.tsx junto a su propio "Editar" — compacto, sin tocar la lógica de confirmación. */}
        <ConfirmIconButton onConfirm={onDeleted} ariaLabel={`Borrar categoría ${category.name}`} className="icon-button" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="calendar-category-form">
      <div className="calendar-category-form-fields">
        <CalendarCategoryEmojiPicker value={emoji} onChange={setEmoji} />
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
      </div>
      <CalendarCategoryColorPicker value={color} onChange={setColor} />
      <div className="inline-fields" style={{ alignItems: 'center' }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function CalendarCategoriesSection() {
  const [categories, setCategories] = useState<CalendarCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [color, setColor] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    return listCalendarCategories()
      .then((cats) => {
        setCategories(cats)
        // Color predeterminado — Parte 5: "no quiero obligar a elegir color, pero debe existir uno
        // válido, y debe salir de la paleta del estilo global actual, no un azul fijo". Nunca pisa una
        // elección ya hecha por el usuario (prev ||): solo rellena si el campo sigue vacío, tanto en el
        // primer montaje como justo después de crear una categoría (handleAdd vacía color a propósito
        // para que la siguiente reciba una muestra distinta de la paleta del estilo activo).
        setColor((prev) => prev || solidPalette(CALENDAR_CATEGORY_COLOR_COUNT, getColorTheme())[cats.length % CALENDAR_CATEGORY_COLOR_COUNT])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    // CORRECCIÓN QUIRÚRGICA — Parte 3: causa real de "el botón no hace nada" — antes el envío se
    // ignoraba en silencio si faltaba emoji o nombre, sin ningún aviso (y el propio botón estaba
    // `disabled` sin explicar por qué, indistinguible de "no funciona"). Ahora SIEMPRE responde: si
    // falta algo, lo dice.
    if (!name.trim() || !emoji.trim()) {
      setError('Elige un emoji y escribe un nombre para la categoría.')
      return
    }
    setAdding(true)
    setError(null)
    try {
      await createCalendarCategory({ name: name.trim(), emoji: emoji.trim(), color: color.trim() || null, sortOrder: categories.length })
      setName('')
      setEmoji('')
      setColor('')
      await reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear la categoría'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteCalendarCategory(id)
      await reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar'))
    }
  }

  if (loading) return null

  return (
    <div className="card event-card" style={{ marginBottom: 16 }}>
      <strong>🗂️ Categorías del calendario</strong>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        Opcionales, para Eventos y Tareas — por ejemplo 🩺 Médico, ⚽ Deporte, 🎒 Colegio. Borrar una categoría nunca borra
        lo que la llevaba, solo le quita la categoría.
      </p>
      <div className="event-list" style={{ marginTop: 8 }}>
        {categories.map((c) => (
          <CalendarCategoryRow key={c.id} category={c} onSaved={reload} onDeleted={() => handleDelete(c.id)} />
        ))}
        {categories.length === 0 && <p className="muted">Todavía no hay categorías.</p>}
      </div>
      {/* CORRECCIÓN QUIRÚRGICA — Parte 1: antes esto era un único .inline-fields (flex sin wrap) con 3
          controles — en iPhone (375px) la suma de sus anchos mínimos no cabía, y como <body> tiene
          overflow-x:hidden A PROPÓSITO en toda la app (para que nada se desplace de lado), el botón
          quedaba recortado fuera del viewport en vez de provocar scroll horizontal — ni visible del
          todo ni, en la práctica, tocable. Apilado en móvil (campos arriba, botón ancho completo
          abajo); en pantallas ≥640px (mismo punto de corte que .modal-sheet) vuelve a la línea. */}
      <form onSubmit={handleAdd} className="calendar-category-form">
        <div className="calendar-category-form-fields">
          <CalendarCategoryEmojiPicker value={emoji} onChange={setEmoji} />
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la categoría" />
        </div>
        <CalendarCategoryColorPicker value={color} onChange={setColor} />
        <button type="submit" className="calendar-category-form-submit" disabled={adding}>
          {adding ? 'Creando…' : '+ Añadir categoría'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

type SettingsGroupId = 'menu' | 'colores' | 'familia' | 'economia' | 'compras' | 'seguridad' | 'filtros_temporales' | 'calendario'

export function MenuSettingsScreen() {
  // Un solo tema abierto a la vez — la pantalla queda como una lista
  // limpia y recogida, y al tocar un tema se abre su sección.
  const location = useLocation()
  const [openGroup, setOpenGroup] = useState<SettingsGroupId | null>(
    () => (location.state as { group?: SettingsGroupId } | null)?.group ?? null,
  )
  const toggle = (id: SettingsGroupId) => setOpenGroup((cur) => (cur === id ? null : id))
  // Un color por tema, con el estilo elegido en Colores.
  const groupColors = pastelPalette(8)

  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-familia">
        <img src={configuracionHeaderImg} alt="Configuración" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection="Inicio" />

      <FamilyNameSection />

      <SettingsGroup color={groupColors[0]} icon="🧭" title="Organizar menú" summary="Qué secciones van fijas abajo y en qué orden" open={openGroup === 'menu'} onToggle={() => toggle('menu')}>
        <MenuOrderSection />
      </SettingsGroup>

      <SettingsGroup color={groupColors[1]} icon="🎨" title="Colores" summary="Estilo de las pantallas y de las estadísticas" open={openGroup === 'colores'} onToggle={() => toggle('colores')}>
        <ColorThemeSection />
      </SettingsGroup>

      <SettingsGroup
        color={groupColors[5]}
        icon="👨‍👩‍👧‍👦"
        title="Familia"
        summary="Cuándo un bebé pasa a niño"
        open={openGroup === 'familia'}
        onToggle={() => toggle('familia')}
      >
        <BabyUntilSection />
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

      <SettingsGroup
        color={groupColors[6]}
        icon="📅"
        title="Filtros temporales"
        summary="Qué filtros de fecha ves en Economía y Compras, y cuál es tu favorito"
        open={openGroup === 'filtros_temporales'}
        onToggle={() => toggle('filtros_temporales')}
      >
        <DateFilterSettingsSection />
      </SettingsGroup>

      <SettingsGroup
        color={groupColors[7]}
        icon="🗓️"
        title="Calendario"
        summary="Colores, orden de Eventos/Tareas y categorías"
        open={openGroup === 'calendario'}
        onToggle={() => toggle('calendario')}
      >
        <CalendarPreferencesSection />
        <CalendarCategoriesSection />
      </SettingsGroup>

      <AdminUsageLink />
    </div>
  )
}
