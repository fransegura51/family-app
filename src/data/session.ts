import { supabase } from '@/data/supabaseClient'

// Estado de la sesión de ESTE dispositivo. Solo lo usa la pantalla de bienvenida (quien aún no tiene familia): «Cerrar sesión» de la persona con familia sigue estando solo
// en Configuración → Mi cuenta (MenuSettingsScreen), sin duplicarse en Seguridad.

// ¿Sigue existiendo en el servidor la cuenta de esta sesión? Si se borró (p. ej. una cuenta de prueba), la sesión que queda guardada en el móvil ya no sirve para nada.
// Un fallo de red NO cuenta como «no existe»: sin conexión no se cierra la sesión de nadie.
export async function accountStillExists(): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    const e = error as { status?: number; code?: string; message?: string }
    const gone = e.status === 401 || e.status === 403 || e.status === 404 || /user_not_found|does not exist|sub claim/i.test(`${e.code ?? ''} ${e.message ?? ''}`)
    return !gone
  }
  return data.user !== null
}

// Cierra la sesión SOLO en este dispositivo (decisión 20/10/2026: no se cierran las de los demás móviles de la misma persona).
export async function signOutThisDevice(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' })
}
