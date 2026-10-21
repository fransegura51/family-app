import { useState } from 'react'
import { PASSWORD_MIN_LENGTH, PASSWORD_MISMATCH_MESSAGE, showPasswordMismatch } from '@/domain/passwordForm'

// Campo de contraseña común a TODA la app (también los PIN): oculta por defecto y con un ojo, DENTRO del campo y centrado en vertical con el texto, para verla u ocultarla.
// Cada campo tiene su propio ojo e interruptor. Pulsar el ojo no borra lo escrito ni quita el foco del campo (el botón no roba el foco al pulsarlo), y el campo sigue siendo
// un <input> normal con su autoComplete, así que los gestores de contraseñas y el autocompletado del móvil funcionan igual. Al mostrarla pasa de type="password" a type="text":
// se desactivan la mayúscula automática y el corrector para que no cambien lo escrito.
//
// El campo reserva a la derecha el hueco del ojo (padding) y los botones propios del navegador dentro de los campos de contraseña (el «ojo» de Edge y la llave/tarjeta de
// Safari) se ocultan en styles.css para que no queden encima. Ver .password-field.

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M3 3l18 18" />}
    </svg>
  )
}

interface PasswordFieldProps {
  // Texto visible encima del campo. Sin él (pantalla de bloqueo) hace falta ariaLabel.
  label?: string
  ariaLabel?: string
  value: string
  onChange: (value: string) => void
  autoComplete?: 'current-password' | 'new-password' | 'off'
  minLength?: number
  required?: boolean
  autoFocus?: boolean
  name?: string
  // PIN: solo dígitos, teclado numérico y 6 como máximo. Sigue siendo un campo de contraseña (oculto, con ojo).
  numeric?: boolean
  inputClassName?: string
}

export function PasswordField({ label, ariaLabel, value, onChange, autoComplete = 'off', minLength, required = true, autoFocus, name, numeric = false, inputClassName }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const box = (
    <span className="password-field">
      <input
        className={inputClassName ? `password-input ${inputClassName}` : 'password-input'}
        type={visible ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/\D/g, '') : e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        minLength={minLength}
        required={required}
        autoFocus={autoFocus}
        aria-label={label ? undefined : ariaLabel}
        {...(numeric ? { inputMode: 'numeric' as const, pattern: '[0-9]*', maxLength: 6 } : {})}
      />
      <button
        type="button"
        className="password-eye"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        // El botón no roba el foco: así el teclado del móvil no se cierra ni se pierde la posición del cursor.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
      >
        <EyeIcon open={visible} />
      </button>
    </span>
  )
  return label ? (
    <label>
      {label}
      {box}
    </label>
  ) : (
    box
  )
}

interface NewPasswordFieldsProps {
  password: string
  confirm: string
  onPasswordChange: (value: string) => void
  onConfirmChange: (value: string) => void
  passwordLabel?: string
  confirmLabel?: string
  autoFocus?: boolean
}

// Contraseña + Repetir contraseña, cada una con su ojo. Avisa en vivo si no coinciden; quien lo usa comprueba además passwordsMatch al enviar y NO envía mientras no coincidan.
export function NewPasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  passwordLabel = 'Contraseña',
  confirmLabel = 'Repetir contraseña',
  autoFocus,
}: NewPasswordFieldsProps) {
  return (
    <>
      <PasswordField label={passwordLabel} value={password} onChange={onPasswordChange} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} autoFocus={autoFocus} />
      <PasswordField label={confirmLabel} value={confirm} onChange={onConfirmChange} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} />
      {showPasswordMismatch(password, confirm) && (
        <p className="error" role="alert">
          {PASSWORD_MISMATCH_MESSAGE}
        </p>
      )}
    </>
  )
}
