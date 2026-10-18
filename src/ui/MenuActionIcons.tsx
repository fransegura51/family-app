// Iconos de interfaz del menú semanal (carrito, lápiz, papelera): trazo uniforme de 24×24 dibujado a 17 px, mismo estilo de SVG en línea que el resto de PEPA (sin emojis grandes).
// El botón que los lleva mantiene su zona táctil de 40×40 px (ver .menu-icon-btn): el icono se ve pequeño, el toque no.
const common = { viewBox: '0 0 24 24', width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const

export function CartIcon() {
  return (
    <svg {...common}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3.5h3l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2" />
    </svg>
  )
}

export function PencilIcon() {
  return (
    <svg {...common}>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M14.5 7.5l3 3" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg {...common}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}
