import { useEffect, useState } from 'react'

// Ajuste "Colorear movimientos por" (petición real: extender el
// pastel también a Movimientos) — por dispositivo, en localStorage,
// mismo patrón que tabOrder.ts: cada persona de la familia puede
// preferir ver la lista por categoría, por etiqueta, o sin colorear.
export type MovementColorMode = 'categoria' | 'etiqueta' | 'ninguno'

const STORAGE_KEY = 'familyapp:movement-color-mode'
const DEFAULT_MODE: MovementColorMode = 'categoria'

export function loadMovementColorMode(): MovementColorMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'categoria' || raw === 'etiqueta' || raw === 'ninguno' ? raw : DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

export function saveMovementColorMode(mode: MovementColorMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // localStorage no disponible (privado/bloqueado): se pierde
    // recordar el ajuste entre visitas, no es crítico.
  }
  window.dispatchEvent(new CustomEvent('family-app:movement-color-mode-changed'))
}

// Movimientos vive en más de una pestaña (Movimientos, Banco) — cada
// una escucha el mismo aviso, igual que NavShell hace con
// "family-app:tab-order-changed", para reflejar el cambio al momento
// sin tener que recargar la pantalla entera.
export function useMovementColorMode(): MovementColorMode {
  const [mode, setMode] = useState(loadMovementColorMode)
  useEffect(() => {
    const handler = () => setMode(loadMovementColorMode())
    window.addEventListener('family-app:movement-color-mode-changed', handler)
    return () => window.removeEventListener('family-app:movement-color-mode-changed', handler)
  }, [])
  return mode
}
