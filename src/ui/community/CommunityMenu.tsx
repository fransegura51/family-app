import { useState } from 'react'
import { COMMUNITY_MENU_META, moveMenuKey, type CommunityMenuKey } from '@/state/communityMenu'
import { paths } from '@/ui/community/communityNav'

// Menú desplegable «☰ Menú» de Comunidad. Es el MISMO diseño y comportamiento que el de Compras/Economía/Alimentación (mismas clases .economia-menu-*): el nombre cambia de
// pantalla y cierra el menú, «📌 Sacar» deja ese acceso a la vista en la pantalla (como botón), «✏️ Editar» permite subir/bajar y la opción actual va resaltada.
// Aquí solo hay tres destinos (Portada, Recetas y cocina, Hogar y familia): sin categorías propias. «🛠️ Administración» NO es un destino más: es un enlace pequeño
// y discreto al final, que solo se pinta para la administración.
export function CommunityMenu({
  order,
  pinned,
  activeKey,
  isAdmin,
  onOrderChange,
  onTogglePin,
  onGo,
  onClose,
}: {
  order: CommunityMenuKey[]
  pinned: CommunityMenuKey[]
  activeKey: CommunityMenuKey | null
  isAdmin: boolean
  onOrderChange: (next: CommunityMenuKey[]) => void
  onTogglePin: (key: CommunityMenuKey) => void
  onGo: (to: string) => void
  onClose: () => void
}) {
  const [editMode, setEditMode] = useState(false)
  return (
    <div className="economia-menu-dropdown community-menu-dropdown" id="community-menu" role="menu" aria-label="Menú de Comunidad">
      <button type="button" className="link-button economia-menu-edit-toggle" onClick={() => setEditMode((v) => !v)}>
        {editMode ? '✓ Listo' : '✏️ Editar'}
      </button>

      {order.map((key, i) => {
        const meta = COMMUNITY_MENU_META[key]
        const isPinned = pinned.includes(key)
        return (
          <div key={key} className={'economia-menu-row' + (activeKey === key ? ' active' : '')}>
            {editMode ? (
              <span className="economia-menu-item">
                <span aria-hidden="true">{meta.icon}</span>
                {meta.label}
              </span>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="economia-menu-item"
                aria-current={activeKey === key ? 'page' : undefined}
                onClick={() => {
                  onGo(meta.to)
                  onClose()
                }}
              >
                <span aria-hidden="true">{meta.icon}</span>
                {meta.label}
              </button>
            )}

            {editMode ? (
              <span className="economia-menu-edit-controls">
                <button
                  type="button"
                  className="link-button"
                  style={{ padding: '2px 6px' }}
                  disabled={i === 0}
                  onClick={() => onOrderChange(moveMenuKey(order, key, -1))}
                  aria-label={`Subir ${meta.label}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="link-button"
                  style={{ padding: '2px 6px' }}
                  disabled={i === order.length - 1}
                  onClick={() => onOrderChange(moveMenuKey(order, key, 1))}
                  aria-label={`Bajar ${meta.label}`}
                >
                  ↓
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="economia-menu-pin"
                onClick={() => onTogglePin(key)}
                aria-label={isPinned ? `Quitar ${meta.label} de la pantalla de Comunidad` : `Sacar ${meta.label} a la pantalla de Comunidad`}
              >
                {isPinned ? '📍 Quitar' : '📌 Sacar'}
              </button>
            )}
          </div>
        )
      })}

      {isAdmin && !editMode && (
        <>
          <hr className="economia-menu-divider" />
          <button
            type="button"
            role="menuitem"
            className="link-button community-menu-admin"
            onClick={() => {
              onGo(paths.admin)
              onClose()
            }}
          >
            🛠️ Administración
          </button>
        </>
      )}

      <button type="button" className="link-button community-menu-close" onClick={onClose}>
        Cerrar
      </button>
    </div>
  )
}
