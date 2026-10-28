import { useState } from 'react'
import { renameBudgetCategory } from '@/data/finance'
import { errorMessage } from '@/domain/errorMessage'
import type { BudgetCategory } from '@/domain/types'

// CAT-2 — cambiar el nombre y el icono de una categoría (general o propia). Una categoría general sigue siendo la misma para PEPA aunque la familia la
// llame de otra forma (la identidad es su clave del catálogo, no el nombre): el cambio solo afecta a esta familia y se aplica a todos sus movimientos,
// tickets y presupuestos a la vez. Las categorías que PEPA usa para sus cálculos (Movimientos internos, Ingreso…) solo admiten cambiar el icono.
const REJECTIONS: Record<string, string> = {
  protected_name: 'PEPA usa esta categoría para sus cálculos: puedes cambiarle el icono, pero no el nombre.',
  name_in_use: 'Ya tienes otra categoría con ese nombre.',
  name_too_long: 'El nombre es demasiado largo.',
  icon_too_long: 'El icono es demasiado largo.',
}

export function CategoryEditInline({ category, onSaved }: { category: BudgetCategory; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(category.name)
  const [icon, setIcon] = useState(category.icon)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const nextName = name.trim()
    if (nextName === '') {
      setError('El nombre no puede estar vacío.')
      return
    }
    const patch = { ...(nextName !== category.name ? { name: nextName } : {}), ...(icon.trim() !== category.icon && icon.trim() !== '' ? { icon: icon.trim() } : {}) }
    if (Object.keys(patch).length === 0) {
      setOpen(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await renameBudgetCategory(category.id, patch)
      if (result.status === 'ok') {
        setOpen(false)
        onSaved()
      } else if (result.status === 'rejected') {
        setError(REJECTIONS[result.reason] ?? 'No se pudo cambiar.')
      } else {
        setError('La categoría ya no existe.')
        onSaved()
      }
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar la categoría'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="link-button" data-help-id="finance.category-edit" style={{ fontSize: 13, padding: '4px 0' }} onClick={() => setOpen(true)}>
        ✎ Cambiar nombre o icono
      </button>
    )
  }
  return (
    <div className="category-edit-inline" data-help-id="finance.category-edit" onClick={(e) => e.stopPropagation()}>
      <div className="inline-fields" style={{ gap: 6 }}>
        <label style={{ flex: 'none', width: 72 }}>
          Icono
          <input type="text" value={icon} maxLength={8} aria-label="Icono de la categoría" onChange={(e) => setIcon(e.target.value)} />
        </label>
        <label style={{ flex: 1 }}>
          Nombre
          <input type="text" value={name} maxLength={60} aria-label="Nombre de la categoría" onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
        El cambio vale solo para tu familia y se aplica a todos los movimientos, tickets y presupuestos de esta categoría.
      </p>
      {error && <p className="error" style={{ margin: '4px 0' }}>{error}</p>}
      <div className="form-actions">
        <button type="button" disabled={busy} onClick={save}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          className="link-button"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setName(category.name)
            setIcon(category.icon)
            setError(null)
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
