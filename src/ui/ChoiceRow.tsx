// Fila de opciones tipo «chips» (una elegida): misma pieza que usa todo el configurador de Eventos.
export function ChoiceRow<T extends string>({
  options,
  value,
  disabled,
  onSelect,
}: {
  options: { value: T; label: string }[]
  value: T | undefined
  disabled: boolean
  onSelect: (value: T) => void
}) {
  return (
    <div className="filter-row" style={{ flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button key={o.value} type="button" className={'chip' + (value === o.value ? ' chip-active' : '')} disabled={disabled} onClick={() => onSelect(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
