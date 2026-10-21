import { supabase } from '@/data/supabaseClient'

// Preferencias de pantalla que deben seguir a la PERSONA entre dispositivos (web, Android, iPhone): orden de menús, pestañas fijadas, tema,
// orden de Inicio... Antes vivían solo en localStorage de cada dispositivo (bug reportado: «los cambios que hice en la web no se trasladaron
// a la versión móvil»). localStorage sigue siendo la caché local; esta capa lo copia a user_ui_prefs y lo trae al abrir sesión.
// LISTA CERRADA: solo preferencias de pantalla de la persona. Nunca estado del aparato (quién comparte ubicación en ESTE móvil, la parada de visita
// en curso, permisos, contadores...): sincronizarlo mezclaría dispositivos. Una clave nueva solo se sincroniza si se añade aquí a propósito.
const SYNCED_KEY_PATTERNS: RegExp[] = [
  /^familyapp:(alimentacion|calendario|compras|economia|ubicacion)-menu-layout$/,
  /^familyapp:(alimentacion|calendario|community|compras|economia|ubicacion)-pinned-tabs$/,
  /^familyapp:community-menu-order$/,
  /^familyapp:(color-theme|chart-color-theme|home-card-order|home-carousel|movement-color-mode|voice-response-mode)$/,
  /^familyapp:tab-order:[\w-]+$/,
  /^pepa:(auto-confirm|show-classic-buttons)$/,
]

export function isSyncedPrefKey(key: string): boolean {
  return SYNCED_KEY_PATTERNS.some((re) => re.test(key))
}

const RELOAD_GUARD = 'familyapp:prefs-sync-reloaded' // sessionStorage; sin prefijo sincronizado a propósito (no es una preferencia)

let started = false

export function startPrefsSync(userId: string): void {
  if (started) return
  started = true
  void run(userId)
}

async function run(userId: string): Promise<void> {
  let remote: Record<string, string> = {}
  let hadJunk = false
  try {
    const { data } = await supabase.from('user_ui_prefs').select('prefs').eq('user_id', userId).maybeSingle()
    remote = (data?.prefs as Record<string, string> | null) ?? {}
    // Auto-reparación: lo que una versión anterior subió y ya no es sincronizable (estado del aparato) se descarta y se limpia en la nube.
    for (const key of Object.keys(remote)) {
      if (!isSyncedPrefKey(key)) {
        delete remote[key]
        hadJunk = true
      }
    }
  } catch {
    // Sin red o tabla no disponible: la app sigue con lo local.
  }

  // 1) Lo guardado en la cuenta manda sobre lo local (la última configuración hecha en cualquier dispositivo).
  let changed = false
  for (const [key, value] of Object.entries(remote)) {
    if (!isSyncedPrefKey(key) || typeof value !== 'string') continue
    try {
      if (localStorage.getItem(key) !== value) {
        localStorage.setItem(key, value)
        changed = true
      }
    } catch {
      /* almacenamiento bloqueado */
    }
  }
  // Un solo reinicio de pantalla para que los menús ya montados lean lo nuevo.
  if (changed) {
    try {
      if (sessionStorage.getItem(RELOAD_GUARD) !== userId) {
        sessionStorage.setItem(RELOAD_GUARD, userId)
        window.location.reload()
        return
      }
    } catch {
      /* sin sessionStorage: no se recarga */
    }
  }

  // 2) Lo local que la cuenta todavía no tenía (primera vez en este dispositivo) se sube.
  const current: Record<string, string> = { ...remote }
  let missing = false
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !isSyncedPrefKey(key) || key in current) continue
      const v = localStorage.getItem(key)
      if (v != null) {
        current[key] = v
        missing = true
      }
    }
  } catch {
    /* ignorar */
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  const push = () => {
    timer = null
    void supabase.from('user_ui_prefs').upsert({ user_id: userId, prefs: current, updated_at: new Date().toISOString() }).then(() => {})
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(push, 1500)
  }
  if (missing || hadJunk) schedule()

  // 3) A partir de ahora, cada cambio de una preferencia sincronizable se sube (con espera para agrupar cambios seguidos).
  try {
    const proto = Storage.prototype
    const originalSet = proto.setItem
    const originalRemove = proto.removeItem
    proto.setItem = function (this: Storage, key: string, value: string) {
      originalSet.call(this, key, value)
      if (this === localStorage && isSyncedPrefKey(key)) {
        current[key] = String(value)
        schedule()
      }
    }
    proto.removeItem = function (this: Storage, key: string) {
      originalRemove.call(this, key)
      if (this === localStorage && isSyncedPrefKey(key) && key in current) {
        delete current[key]
        schedule()
      }
    }
  } catch {
    /* no se puede enganchar: las preferencias siguen funcionando en local */
  }
}
