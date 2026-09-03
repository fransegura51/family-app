import { useState } from 'react'
import { getStoreIcon } from '@/domain/storeIcons'

// Icono de tienda sin comportamiento propio (no navega a ningún sitio
// al tocarlo) — para usarlo en sitios donde el propio elemento que lo
// envuelve ya hace algo al tocarse (p. ej. la carpeta de tickets en
// Dinero, que se pliega/despliega). Compras usa su propia versión
// (StoreIconBadge) que además navega a la lista de esa tienda.
export function StoreIcon({ name, size = 18 }: { name: string; size?: number }) {
  const icon = getStoreIcon(name)
  const [broken, setBroken] = useState(false)

  if (icon.kind === 'logo' && !broken) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${icon.domain}&sz=${size * 2}`}
        alt={name}
        width={size}
        height={size}
        style={{ borderRadius: 4, verticalAlign: 'middle' }}
        onError={() => setBroken(true)}
      />
    )
  }
  return <span style={{ fontSize: size }}>{icon.kind === 'emoji' ? icon.icon : '🏬'}</span>
}
