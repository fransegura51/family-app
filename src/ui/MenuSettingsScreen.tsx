import { FormEvent, useEffect, useState } from 'react'
import { NAV_TAB_BY_PATH, NAV_TAB_PATHS, type NavTab } from '@/domain/navTabs'
import { loadTabOrder, resolveTabOrder, saveTabOrder } from '@/state/tabOrder'
import { getFamilyName, updateFamilyName } from '@/data/family'
import { createCustomMenuItem, deleteCustomMenuItem, listCustomMenuItems, updateCustomMenuItem } from '@/data/customMenu'
import { ConfirmIconButton } from '@/ui/ConfirmButton'
import type { CustomMenuItem } from '@/domain/types'

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

// Petición real (con captura de referencia de la app Wallet): "añade
// todas las subcarpetas que te he puesto en la foto... con la función
// de añadir más si queremos, o eliminar alguna" — la lista se
// autorrellena la primera vez desde NavShell (seedDefaultCustomMenuItems);
// aquí se gestiona: crear, renombrar (icono + nombre) y borrar.
function CustomMenuItemsSection() {
  const [items, setItems] = useState<CustomMenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [addIcon, setAddIcon] = useState('📌')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editIcon, setEditIcon] = useState('')

  function reload() {
    listCustomMenuItems()
      .then(setItems)
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!addLabel.trim()) return
    await createCustomMenuItem({ label: addLabel.trim(), icon: addIcon })
    setAddLabel('')
    setAddIcon('📌')
    setAdding(false)
    reload()
  }

  async function handleSave(id: string) {
    if (editLabel.trim()) await updateCustomMenuItem(id, { label: editLabel.trim(), icon: editIcon })
    setEditingId(null)
    reload()
  }

  if (loading) return null

  return (
    <>
      <h2 className="section-title">Tus accesos</h2>
      <p className="muted">
        Se ven dentro de "☰ Menú", debajo de las secciones normales — de momento son solo accesos (sin pantalla propia
        todavía). Tócalos para renombrarlos.
      </p>
      <button type="button" className="link-button" onClick={() => setAdding((v) => !v)}>
        {adding ? 'Cerrar' : '+ Añadir acceso'}
      </button>
      {adding && (
        <form onSubmit={handleAdd} className="inline-fields" style={{ margin: '8px 0' }}>
          <input
            type="text"
            value={addIcon}
            onChange={(e) => setAddIcon(e.target.value)}
            style={{ width: 48, textAlign: 'center', flex: 'none' }}
            maxLength={4}
            aria-label="Icono"
          />
          <input
            type="text"
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            placeholder="Nombre del acceso"
            style={{ flex: 1 }}
            autoFocus
          />
          <button type="submit">Crear</button>
        </form>
      )}
      <div className="event-list">
        {items.map((item) =>
          editingId === item.id ? (
            <form
              key={item.id}
              className="inline-fields"
              style={{ marginBottom: 6 }}
              onSubmit={(e) => {
                e.preventDefault()
                handleSave(item.id)
              }}
            >
              <input
                type="text"
                value={editIcon}
                onChange={(e) => setEditIcon(e.target.value)}
                style={{ width: 48, textAlign: 'center', flex: 'none' }}
                maxLength={4}
                autoFocus
              />
              <input type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={{ flex: 1 }} />
              <button type="submit">Guardar</button>
            </form>
          ) : (
            <div key={item.id} className="card task-card">
              <button
                type="button"
                className="task-card-main"
                style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--text)', fontWeight: 400 }}
                onClick={() => {
                  setEditingId(item.id)
                  setEditLabel(item.label)
                  setEditIcon(item.icon)
                }}
              >
                <strong>
                  {item.icon} {item.label}
                </strong>
              </button>
              <ConfirmIconButton icon="✕" className="link-button" ariaLabel={`Eliminar ${item.label}`} onConfirm={() => deleteCustomMenuItem(item.id).then(reload)} />
            </div>
          ),
        )}
        {items.length === 0 && <p className="muted">Sin accesos todavía.</p>}
      </div>
    </>
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

      <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #eee' }} />

      <CustomMenuItemsSection />
    </div>
  )
}
