// Ilustraciones animadas para las diapositivas de "hoy" e "info" de la
// portada — petición real: "ponlas más elaboradas... que no se vea tan
// soso". SVG a mano (sin librería) para que quepan en el bundle sin
// peso extra; la animación va por CSS (ver .home-slide-art-* en
// styles.css) para no depender de JS.
export function ShoppingCartArt() {
  return (
    <svg viewBox="0 0 120 120" className="home-slide-art" aria-hidden="true">
      <g className="home-slide-art-walk">
        {/* persona empujando el carro */}
        <circle cx="46" cy="30" r="10" fill="#ffd8a8" />
        <path d="M38 42 Q46 38 56 44 L60 78 L34 78 Z" fill="#ff922b" />
        <path d="M34 78 L30 100" stroke="#495057" strokeWidth="6" strokeLinecap="round" />
        <path d="M50 78 L54 100" stroke="#495057" strokeWidth="6" strokeLinecap="round" />
        {/* brazo hasta el manillar */}
        <path d="M56 50 L78 46" stroke="#ffd8a8" strokeWidth="7" strokeLinecap="round" />
      </g>
      {/* carro de la compra */}
      <g>
        <path d="M76 44 L108 44 L100 74 L82 74 Z" fill="none" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
        <path d="M70 40 L76 40 L82 74" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        <g className="home-slide-art-wheel-spin" style={{ transformOrigin: '85px 90px' }}>
          <circle cx="85" cy="90" r="5" fill="#fff" />
        </g>
        <g className="home-slide-art-wheel-spin" style={{ transformOrigin: '99px 90px' }}>
          <circle cx="99" cy="90" r="5" fill="#fff" />
        </g>
      </g>
    </svg>
  )
}

export function TaskArt() {
  return (
    <svg viewBox="0 0 120 120" className="home-slide-art" aria-hidden="true">
      {/* tablero */}
      <rect x="70" y="20" width="34" height="70" rx="3" fill="#e9c46a" />
      <line x1="70" y1="40" x2="104" y2="40" stroke="#c48a3a" strokeWidth="2" />
      <line x1="70" y1="60" x2="104" y2="60" stroke="#c48a3a" strokeWidth="2" />
      {/* persona */}
      <circle cx="34" cy="34" r="10" fill="#ffd8a8" />
      <path d="M26 46 Q34 42 44 48 L46 82 L20 82 Z" fill="#4dabf7" />
      <path d="M20 82 L16 104" stroke="#495057" strokeWidth="6" strokeLinecap="round" />
      <path d="M36 82 L40 104" stroke="#495057" strokeWidth="6" strokeLinecap="round" />
      {/* brazo + taladro, con vibración */}
      <g className="home-slide-art-drill-shake">
        <path d="M44 54 L64 52" stroke="#ffd8a8" strokeWidth="7" strokeLinecap="round" />
        <rect x="62" y="46" width="18" height="12" rx="3" fill="#495057" />
        <rect x="79" y="50" width="8" height="4" rx="1" fill="#868e96" />
        <g className="home-slide-art-sparks">
          <circle cx="90" cy="52" r="1.6" fill="#ffd43b" />
          <circle cx="94" cy="48" r="1.2" fill="#ffd43b" />
          <circle cx="93" cy="56" r="1" fill="#ffd43b" />
        </g>
      </g>
    </svg>
  )
}
