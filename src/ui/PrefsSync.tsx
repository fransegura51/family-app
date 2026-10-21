import { useEffect } from 'react'
import { startPrefsSync } from '@/state/prefsSync'

// Componente sin UI: lleva las preferencias de pantalla de la persona de un dispositivo a otro (ver state/prefsSync.ts).
export function PrefsSync({ userId }: { userId: string }) {
  useEffect(() => startPrefsSync(userId), [userId])
  return null
}
