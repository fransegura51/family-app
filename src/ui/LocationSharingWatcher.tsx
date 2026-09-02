import { useEffect } from 'react'
import { resumeFromStorage } from '@/services/locationSharing'

// Componente sin UI, montado una sola vez a nivel de la app (fuera de
// las rutas, igual que ReminderWatcher) — retoma el compartir ubicación
// tras recargar la página o volver a abrir la PWA, si la persona ya
// había elegido antes "este dispositivo es el mío". El watch en sí vive
// en services/locationSharing.ts, no aquí.
export function LocationSharingWatcher() {
  useEffect(() => {
    resumeFromStorage()
  }, [])

  return null
}
