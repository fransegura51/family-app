import { useEffect, useState } from 'react'

// Confirmación de dos toques antes de borrar cualquier cosa de la
// aplicación (petición real: "que tenga una mediana seguridad que haya
// que tocar dos veces para eliminar cualquier cosa, lo que sea de la
// aplicación") — un solo componente para que el mismo gesto se sienta
// igual en toda la app en vez de que cada pantalla lo haga a su manera.
// El primer toque solo enseña "¿Seguro?" con Confirmar/Cancelar; borrar
// de verdad requiere el segundo toque.
export function ConfirmButton({
  onConfirm,
  label = 'Borrar',
  confirmLabel = 'Confirmar',
  className = 'link-button',
  ariaLabel,
}: {
  onConfirm: () => void
  label?: string
  confirmLabel?: string
  className?: string
  ariaLabel?: string
}) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <span className="confirm-delete">
        <span className="muted">¿Seguro?</span>
        <button type="button" className={className} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className={className} onClick={() => setConfirming(false)}>
          Cancelar
        </button>
      </span>
    )
  }

  return (
    <button type="button" className={className} onClick={() => setConfirming(true)} aria-label={ariaLabel}>
      {label}
    </button>
  )
}

// Variante para botones pequeños de icono (la ✕ que flota encima de una
// foto, la ✕ de un chip...) donde el botón normal de arriba no cabe —
// expandirse a "¿Seguro? Confirmar Cancelar" ahí encima haría que varios
// botones diminutos con posición absoluta se amontonaran unos sobre
// otros en la misma esquina. En su lugar, el mismo botón cambia de
// icono al primer toque (armado, con un aro de aviso) y solo borra al
// segundo — se desarma solo a los 3s si no se confirma, para no dejarlo
// "cargado" sin querer.
export function ConfirmIconButton({
  onConfirm,
  icon = '✕',
  className = '',
  ariaLabel,
}: {
  onConfirm: () => void
  icon?: string
  className?: string
  ariaLabel?: string
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <button
      type="button"
      className={className + (armed ? ' confirm-icon-armed' : '')}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      aria-label={armed ? `Confirmar: ${ariaLabel ?? 'borrar'}` : ariaLabel}
    >
      {armed ? '✓' : icon}
    </button>
  )
}
