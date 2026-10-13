// Auditoría "campos de fecha vacíos" — un input[type=date] nativo, vacío, no enseña NADA en
// Safari/iPhone (en escritorio al menos Chrome pinta "dd/mm/aaaa" en gris; iOS no pinta nada,
// un simple rectángulo en blanco). Este componente es un reemplazo directo del <input type="date">
// suelto que ya se usaba en todas partes (mismo value/onChange/required, CERO cambio de lógica):
// el input nativo sigue ahí, totalmente funcional (tocarlo abre el selector de siempre), pero su
// propio texto se vuelve transparente y un <span> por encima pinta el texto que corresponda —
// la fecha en formato español cuando hay valor, o el texto orientativo cuando está vacío. Al
// lector de pantalla le sigue leyendo el <input> real (su valor/accesibilidad no cambian), el
// <span> de encima lleva aria-hidden.
import type { ChangeEvent, InputHTMLAttributes } from 'react'

export interface DateFieldProps {
  value: string
  onChange?: (value: string) => void
  placeholder: string
  required?: boolean
  // Por defecto, solo un campo OPCIONAL con valor ya puesto enseña "✕ Quitar" — uno obligatorio
  // nunca se puede dejar vacío desde aquí, ni aunque se fuerce con clearable.
  clearable?: boolean
  min?: string
  max?: string
  id?: string
  className?: string
  disabled?: boolean
  autoFocus?: boolean
  onBlur?: InputHTMLAttributes<HTMLInputElement>['onBlur']
  // Algún formulario suelto ya guardaba este campo sin estado propio — defaultValue + onBlur, sin
  // value/onChange — para no tocar esa lógica, el input nativo se queda sin controlar (value sigue
  // marcando qué enseña el texto de encima cuando no está enfocado); sin botón "✕ Quitar" aquí, el
  // original tampoco lo tenía.
  uncontrolled?: boolean
}

// Mismo criterio en toda la app: fecha corta en formato español (13/10/2026) — nunca el formato
// nativo del dispositivo (que en inglés/US sería 10/13/2026 y confundiría).
function formatDateFieldValue(value: string): string {
  const d = new Date(value + 'T00:00')
  if (Number.isNaN(d.getTime())) return value
  // Explícito (day/month/year '2-digit'/'numeric') en vez del formato por defecto de
  // toLocaleDateString('es-ES') — sin options, algunos motores no rellenan con cero el día/mes de un
  // dígito (p. ej. "3/5/2020" en vez de "03/05/2020"), inconsistente con el resto de la app.
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function DateField({
  value,
  onChange,
  placeholder,
  required,
  clearable,
  min,
  max,
  id,
  className,
  disabled,
  autoFocus,
  onBlur,
  uncontrolled,
}: DateFieldProps) {
  const effectiveClearable = !uncontrolled && (clearable ?? !required) && !!value && !disabled
  const valueProps = uncontrolled ? { defaultValue: value } : { value, onChange: (e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value) }
  return (
    <span className={'date-field' + (className ? ' ' + className : '')}>
      <input
        id={id}
        type="date"
        className="date-field-input"
        {...valueProps}
        required={required}
        min={min}
        max={max}
        disabled={disabled}
        autoFocus={autoFocus}
        onBlur={onBlur}
      />
      <span className={'date-field-display' + (value ? '' : ' date-field-display-placeholder')} aria-hidden="true">
        {value ? formatDateFieldValue(value) : placeholder}
      </span>
      {effectiveClearable && (
        <button
          type="button"
          className="date-field-clear"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onChange?.('')
          }}
          aria-label="Quitar fecha"
        >
          ✕
        </button>
      )}
    </span>
  )
}
