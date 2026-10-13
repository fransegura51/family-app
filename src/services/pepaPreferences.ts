// Preferencias de Pepa que se eligen por aparato (se guardan en el propio móvil, no en la cuenta).
import { isNativeApp } from '@/services/nativeApp'

const AUTO_CONFIRM_KEY = 'pepa:auto-confirm'

// «Pepa, apunta leche»: ¿se hace directamente, o se enseña antes una tarjeta para confirmar? Vale para todo lo que Pepa prepara (compra, calendario, menú,
// lugares…), salvo lo que toca dinero (pepa/autoConfirm.ts). Petición real (13/10/2026): quitar la tarjeta en la app nativa, y poder elegirlo.
// Por defecto: directo en la app nativa, con tarjeta en la web (donde ya se conoce así); cada persona lo cambia en Familia.
export function getAutoConfirm(): boolean {
  try {
    const saved = localStorage.getItem(AUTO_CONFIRM_KEY)
    if (saved === 'on') return true
    if (saved === 'off') return false
  } catch {
    // Sin localStorage se usa la opción por defecto.
  }
  return isNativeApp()
}

export function setAutoConfirm(value: boolean): void {
  try {
    localStorage.setItem(AUTO_CONFIRM_KEY, value ? 'on' : 'off')
  } catch {
    // Sin localStorage no se puede recordar: se queda la opción por defecto.
  }
}
