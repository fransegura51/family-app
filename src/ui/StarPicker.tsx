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
          {n <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}
