import { BYDAY_CODES } from '@/domain/recurrence'
import { WEEKDAY_LABELS } from '@/domain/calendar'

// Chips L M X J V S D para elegir en qué días de la semana se repite
// algo (tarea o evento) — "los martes", "de lunes a viernes".
export function WeekdayPicker({ selected, onToggle }: { selected: string[]; onToggle: (code: string) => void }) {
  return (
    <div className="filter-row">
      {BYDAY_CODES.map((code, i) => (
        <button
          type="button"
          key={code}
          className={'chip' + (selected.includes(code) ? ' chip-active' : '')}
          onClick={() => onToggle(code)}
        >
          {WEEKDAY_LABELS[i]}
        </button>
      ))}
    </div>
  )
}
