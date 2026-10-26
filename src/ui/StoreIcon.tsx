import { ReactNode, useState } from 'react'
import { DEFAULT_STORE_EMOJI, getStoreIcon } from '@/domain/storeIcons'
import { storeBadge } from '@/domain/storeBadge'

// Icono de tienda. Reglas (logotipos, 27/10/2026 — nunca más un recuadro vacío):
//  · Los logotipos de las cadenas conocidas están EMPAQUETADOS en la app (imágenes con hash de Vite), así que no dependen de ningún servicio externo.
//  · Mientras una imagen no se ha cargado, o si falla, se ve una INSIGNIA DE TEXTO (iniciales sobre un color estable por tienda), nunca una caja blanca vacía.
//  · Las tiendas sin logotipo ni icono propio (una tienda nueva, «Chino»…) también usan la insignia; los iconos con significado (🏮 chino, 💊 farmacia…) se conservan.
// El logo va sobre un respaldo blanco (un logo mayormente blanco o transparente sería ilegible sobre una cabecera de color) del tamaño del icono más un margen fijo.
const LOGO_BACKDROP_PADDING = 2

function Box({ size, background, children }: { size: number; background: string; children: ReactNode }) {
  const boxSize = size + LOGO_BACKDROP_PADDING * 2
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: boxSize,
        height: boxSize,
        background,
        borderRadius: 6,
        verticalAlign: 'middle',
        boxSizing: 'border-box',
        overflow: 'hidden',
        flex: '0 0 auto',
      }}
    >
      {children}
    </span>
  )
}

export function StoreBadge({ name, size }: { name: string; size: number }) {
  const b = storeBadge(name)
  return (
    <Box size={size} background={b.background}>
      <span aria-hidden="true" style={{ color: b.color, fontWeight: 700, fontSize: Math.max(8, Math.round(size * (b.text.length > 1 ? 0.5 : 0.6))), lineHeight: 1, letterSpacing: '-0.02em' }}>
        {b.text}
      </span>
    </Box>
  )
}

// Imagen con respaldo: la insignia de texto se pinta mientras la imagen no ha cargado; si falla, se queda la insignia.
function LogoImage({ name, size, src }: { name: string; size: number; src: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  if (state === 'error') return <StoreBadge name={name} size={size} />
  return (
    <Box size={size} background="#fff">
      {state === 'loading' && (
        <span style={{ position: 'absolute', inset: 0 }}>
          <StoreBadge name={name} size={size} />
        </span>
      )}
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{ borderRadius: 4, objectFit: 'contain', opacity: state === 'ok' ? 1 : 0 }}
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
      />
    </Box>
  )
}

// Icono de tienda sin comportamiento propio (no navega a ningún sitio
// al tocarlo) — para usarlo en sitios donde el propio elemento que lo
// envuelve ya hace algo al tocarse (p. ej. la carpeta de tickets en
// Dinero, que se pliega/despliega). Compras usa su propia versión
// (StoreIconBadge) que además navega a la lista de esa tienda.
export function StoreIcon({ name, size = 18, logoAsset }: { name: string; size?: number; logoAsset?: string | null }) {
  const icon = getStoreIcon(name, logoAsset)
  if (icon.kind === 'image') return <LogoImage name={name} size={size} src={icon.src} />
  if (icon.kind === 'logo') return <LogoImage name={name} size={size} src={`https://www.google.com/s2/favicons?domain=${icon.domain}&sz=${size * 2}`} />
  if (icon.icon === DEFAULT_STORE_EMOJI) return <StoreBadge name={name} size={size} />
  return <span style={{ fontSize: size }}>{icon.icon}</span>
}
