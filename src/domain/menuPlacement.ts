// Colocación de un menú desplegable «Más» (Comunidad: Denunciar, Bloquear, Editar…) para que NUNCA se salga de la pantalla: si no cabe debajo del botón se abre hacia arriba,
// se ajusta a los lados y, si aun así no cabe entero, se limita su alto y se desplaza por dentro. Sin DOM: recibe medidas y devuelve posición (fixed).
export interface MenuRect {
  top: number
  bottom: number
  left: number
  right: number
}

export interface MenuPlacement {
  top: number
  left: number
  maxHeight: number
  openUp: boolean
}

export function placeMenu(
  trigger: MenuRect,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  opts: { margin?: number; gap?: number; bottomReserve?: number; topReserve?: number } = {},
): MenuPlacement {
  const margin = opts.margin ?? 8
  const gap = opts.gap ?? 4
  // Reservas para la barra del sistema / zona segura de abajo y la franja de arriba (reloj, isla).
  const bottomReserve = opts.bottomReserve ?? 16
  const topReserve = opts.topReserve ?? 8
  const spaceBelow = viewport.height - trigger.bottom - gap - margin - bottomReserve
  const spaceAbove = trigger.top - gap - margin - topReserve
  const openUp = menu.height > spaceBelow && spaceAbove > spaceBelow
  const space = Math.max(openUp ? spaceAbove : spaceBelow, 96)
  const height = Math.min(menu.height, space)
  const top = openUp ? Math.max(trigger.top - gap - height, margin + topReserve) : trigger.bottom + gap
  // Alineado al borde derecho del botón, pero siempre dentro de la pantalla.
  const maxLeft = Math.max(viewport.width - menu.width - margin, margin)
  const left = Math.min(Math.max(trigger.right - menu.width, margin), maxLeft)
  return { top, left, maxHeight: space, openUp }
}
