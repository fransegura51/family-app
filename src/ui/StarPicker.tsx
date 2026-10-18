// Cinco estrellas tocables (de 1 a 5), cada una un botón con su nombre y estado, de 44 px. Las usan la pantalla de Reseñas y la invitación a valorar de Inicio.
export function StarPicker({ value, label, onPick, disabled }: { value: number; label: string; onPick: (stars: number) => void; disabled?: boolean }) {
  return (
    <div className="review-stars" role="group" aria-label={`Estrellas: ${label}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? 'review-star review-star-on' : 'review-star'}
          aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
          aria-pressed={n === value}
          disabled={disabled}
          onClick={() => onPick(n)}
        >
          <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" focusable="false">
            <path
              d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z"
              fill={n <= value ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}
    </div>
  )
}
