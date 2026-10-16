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

const CLASSIC_BUTTONS_KEY = 'pepa:show-classic-buttons'
export const CLASSIC_BUTTONS_EVENT = 'family-app:classic-buttons-changed'

// «Mostrar botones clásicos»: los cinco botones redondos de siempre (🐣 Pepa Calendario, 🐣 Pepa Compra, 🎤 Apuntar Calendario, 🎤 Apuntar Compra y
// 📍 Buscar sitio). El 💬 «Hablar con PEPA» se ve siempre. Petición real (15/10/2026): poder ocultarlos para no tener la barra de arriba tan cargada,
// y que cada persona lo elija en su móvil. Por defecto se ven, como hasta ahora.
export function getShowClassicButtons(): boolean {
  try {
    return localStorage.getItem(CLASSIC_BUTTONS_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setShowClassicButtons(value: boolean): void {
  try {
    localStorage.setItem(CLASSIC_BUTTONS_KEY, value ? 'on' : 'off')
  } catch {
    // Sin localStorage no se puede recordar: se quedan visibles.
  }
  // Aviso a quien dibuja los botones (VoiceCapture, redes sociales), para que cambien al momento, sin recargar.
  try {
    window.dispatchEvent(new CustomEvent(CLASSIC_BUTTONS_EVENT))
  } catch {
    // Sin window (pruebas, servidor) no hay nadie a quien avisar.
  }
}
