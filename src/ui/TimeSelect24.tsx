import { useId } from 'react'

// Selector de hora en formato de 24 horas (HH:mm) con horas y minutos por separado. A diferencia de <input type="time"> NO depende de cómo tenga el móvil la hora (AM/PM):
// siempre se ve «08:00», «21:30». Permite elegir cualquier minuto. `value` y `onChange` usan «HH:MM».
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

export function splitTime(value: string): { h: string; m: string } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value)
  return m ? { h: m[1], m: m[2] } : { h: '08', m: '00' }
}

export function TimeSelect24({ label, value, onChange, disabled, helpId }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; helpId?: string }) {
  const id = useId()
  const { h, m } = splitTime(value)
  return (
    <fieldset className="time-select-24" disabled={disabled} data-help-id={helpId}>
      <legend>{label}</legend>
      <div className="time-select-24-row">
        <select aria-label={`${label}: hora`} id={`${id}-h`} value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)}>
          {HOURS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <span aria-hidden="true">:</span>
        <select aria-label={`${label}: minutos`} id={`${id}-m`} value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
          {MINUTES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  )
}
