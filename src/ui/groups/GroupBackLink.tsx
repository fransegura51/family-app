import { Link } from 'react-router-dom'

/** Desde qué grupo se abrió una lista o un evento vinculado. Viaja en el `state` de la navegación: no se guarda nada ni se duplica ninguna lista o evento. */
export interface FromGroup {
  id: string
  name: string
}

export function readFromGroup(state: unknown): FromGroup | null {
  const fg = state && typeof state === 'object' ? (state as { fromGroup?: unknown }).fromGroup : null
  if (!fg || typeof fg !== 'object') return null
  const { id, name } = fg as { id?: unknown; name?: unknown }
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) && typeof name === 'string' ? { id, name } : null
}

/** «← Volver a [nombre del grupo]»: solo aparece si se llegó desde Gestión de grupos; al entrar directo desde Eventos o Mis listas no sale. */
export function GroupBackLink({ from }: { from: FromGroup | null }) {
  if (!from) return null
  return (
    <Link to={`/grupos/${from.id}`} className="link-button" data-help-id="grupos.volver-al-grupo" style={{ display: 'inline-block', margin: '4px 0 8px' }}>
      ← Volver a {from.name}
    </Link>
  )
}
