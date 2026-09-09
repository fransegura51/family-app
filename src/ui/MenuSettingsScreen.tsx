import { FormEvent, useEffect, useState } from 'react'
import { NAV_TAB_BY_PATH, NAV_TAB_PATHS, type NavTab } from '@/domain/navTabs'
import { loadTabOrder, resolveTabOrder, saveTabOrder } from '@/state/tabOrder'
import { getFamilyName, updateFamilyName } from '@/data/family'
import {
  clearOwnPin,
  deleteWebauthnCredential,
  hasOwnPin,
  listWebauthnCredentials,
  registerPasskey,
  setOwnPin,
  type WebauthnCredentialInfo,
} from '@/data/appLock'

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
      setError(err instanceof Error ? err.message : 'No se pudo guardar — puede que solo un admin de la familia pueda cambiar el nombre.')
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
      setPasskeyError(err instanceof Error ? err.message : 'No se pudo activar la huella/Face ID')
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
      setPasskeyError(err instanceof Error ? err.message : 'No se pudo quitar')
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
      setError(err instanceof Error ? err.message : 'No se pudo activar el PIN')
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
      setError(err instanceof Error ? err.message : 'No se pudo quitar el PIN')
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

// Reordenar el menú con flechas arriba/abajo en vez de arrastrar con
// el dedo — petición real, tras varios intentos de arrastre táctil
// poco fiable justo en esta barra (compite con los propios gestos del
// borde inferior del iPhone): "si cambiarle el orden allí mismo es un
// problema, igual sería mejor hacer una pestaña de configuración para
// ello". Sin gracia, pero infalible — a diferencia del arrastre, que
// depende de un gesto que aquí llevaba todo el día fallando. Los
// primeros 4 de esta lista son los que se quedan fijos abajo; el
// resto vive detrás del botón "Menú".
export function MenuSettingsScreen() {
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
    <div className="screen">
      <h1>Organizar menú</h1>

      <FamilyNameSection />
      <AppLockSection />

      <p className="muted">
        Los 4 primeros se quedan fijos abajo del todo; el resto aparece al tocar el botón "☰ Menú".
      </p>
      <div className="event-list">
        {orderedTabs.map((tab, i) => (
          <div key={tab.to} className="card task-card">
            <span className="nav-item-icon" style={{ fontSize: 22 }}>
              {tab.icon}
            </span>
            <div className="task-card-main">
              <strong>{tab.label}</strong>
              <p className="muted">{i < PINNED_COUNT ? 'Fijo abajo' : 'Dentro del menú'}</p>
            </div>
            <button
              type="button"
              className="link-button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Subir ${tab.label}`}
            >
              ↑
            </button>
            <button
              type="button"
              className="link-button"
              disabled={i === orderedTabs.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Bajar ${tab.label}`}
            >
              ↓
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
