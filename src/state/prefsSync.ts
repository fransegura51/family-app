import { isPrefsV2 } from '@/state/prefs/flags'
import { isSyncedPrefKey } from '@/state/prefs/prefsRegistry'
import { startPrefsV2 } from '@/state/prefs/prefsRuntime'
import { startPrefsSync as startPrefsSyncLegacy } from '@/state/prefsSyncLegacy'

// Preferencias de pantalla que siguen a la PERSONA entre dispositivos (web, Android, iPhone). Dos implementaciones:
//  · PREFS_V2 apagado (hoy): el mecanismo anterior (state/prefsSyncLegacy.ts, tabla user_ui_prefs), sin cambios.
//  · PREFS_V2 encendido: una fila por preferencia en `user_prefs`, tiempo real, cola de pendientes y conflictos con aviso (state/prefs/*).
export { isSyncedPrefKey }

// Devuelve la función que la para (con el mecanismo anterior no hay nada que parar).
export function startPrefsSync(userId: string): () => void {
  if (isPrefsV2()) return startPrefsV2(userId)
  startPrefsSyncLegacy(userId)
  return () => {}
}
