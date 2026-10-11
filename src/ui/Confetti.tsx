import { useState } from 'react'

// PG-PUNTOS-FINANZAS (Parte A5/B2) — "breve celebración + confeti, no excesivo". Sin ninguna librería de
// confeti en el proyecto (se comprobó antes de empezar) — unas pocas piezas de CSS puro son suficientes
// para una app familiar, sin añadir una dependencia nueva solo para esto. Respeta prefers-reduced-motion
// (styles.css oculta `.confetti-burst` entero, nunca solo ralentiza la animación).
const CONFETTI_COLORS = ['#f59f00', '#e03131', '#2f9e44', '#1971c2', '#9c36b5', '#f06595']

export function Confetti({ pieceCount = 20 }: { pieceCount?: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: pieceCount }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 1.2 + Math.random() * 0.7,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.round(Math.random() * 360),
    })),
  )

  return (
    <div className="confetti-burst" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  )
}
