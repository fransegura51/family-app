import { ReactNode, useState } from 'react'
import { getStoreIcon } from '@/domain/storeIcons'

// Fase 6 (plan de pendientes) — fondo blanco detrás del logo (bug real: un logo mayormente blanco o
// transparente se volvía ilegible sobre una cabecera de color o un fondo oscuro, porque el <img> se
// pintaba suelto, sin ningún respaldo de contraste). El tamaño del respaldo es siempre el del icono más
// un margen fijo — nunca cambia el tamaño del logo en sí ni cómo se recorta.
const LOGO_BACKDROP_PADDING = 2

function LogoBackdrop({ size, children }: { size: number; children: ReactNode }) {
  const boxSize = size + LOGO_BACKDROP_PADDING * 2
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: boxSize,
        height: boxSize,
        background: '#fff',
        borderRadius: 6,
        verticalAlign: 'middle',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </span>
  )
}

// Icono de tienda sin comportamiento propio (no navega a ningún sitio
// al tocarlo) — para usarlo en sitios donde el propio elemento que lo
// envuelve ya hace algo al tocarse (p. ej. la carpeta de tickets en
// Dinero, que se pliega/despliega). Compras usa su propia versión
// (StoreIconBadge) que además navega a la lista de esa tienda.
export function StoreIcon({ name, size = 18, logoAsset }: { name: string; size?: number; logoAsset?: string | null }) {
  const icon = getStoreIcon(name, logoAsset)
  const [broken, setBroken] = useState(false)

  if (icon.kind === 'image') {
    return (
      <LogoBackdrop size={size}>
        <img
          src={icon.src}
          alt={name}
          width={size}
          height={size}
          style={{ borderRadius: 4, objectFit: 'cover' }}
        />
      </LogoBackdrop>
    )
  }
  if (icon.kind === 'logo' && !broken) {
    return (
      <LogoBackdrop size={size}>
        <img
          src={`https://www.google.com/s2/favicons?domain=${icon.domain}&sz=${size * 2}`}
          alt={name}
          width={size}
          height={size}
          style={{ borderRadius: 4 }}
          onError={() => setBroken(true)}
        />
      </LogoBackdrop>
    )
  }
  return <span style={{ fontSize: size }}>{icon.kind === 'emoji' ? icon.icon : '🏬'}</span>
}
