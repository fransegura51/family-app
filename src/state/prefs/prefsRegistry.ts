// Lista CERRADA de preferencias de la persona que viajan con su cuenta entre dispositivos (CONFIG-01, tabla `user_prefs`, migración 0305).
// Solo preferencias de pantalla/elección de la persona. NUNCA estado del aparato (quién comparte ubicación en ESTE móvil, la parada de visita en curso,
// permisos del sistema, cachés, contadores, posición de botones flotantes…): sincronizarlo mezclaría dispositivos.
// IMPORTANTE: esta lista debe coincidir con la función SQL `private.user_pref_key_allowed` de supabase/migrations/0305_user_prefs.sql (hay una prueba que lo comprueba).
export const SYNCED_KEY_PATTERN_SOURCES: readonly string[] = [
  '^familyapp:(alimentacion|calendario|compras|economia|ubicacion)-menu-layout$',
  '^familyapp:(alimentacion|calendario|community|compras|economia|ubicacion)-pinned-tabs$',
  '^familyapp:community-menu-order$',
  '^familyapp:(color-theme|chart-color-theme|home-card-order|home-carousel|movement-color-mode|voice-response-mode)$',
  '^familyapp:tab-order:[A-Za-z0-9_-]+$',
  '^pepa:(auto-confirm|show-classic-buttons)$',
  // Añadidas en B1 (inventario de la Fase A: E01-E05).
  '^familyapp:calendar-onboarding-seen:[A-Za-z0-9_-]+$',
  '^familyapp:kids-(theme|sprite):[A-Za-z0-9_-]+$',
  '^pepa\.eventMenuView$',
  '^pepa\.reviewInvite\.until$',
]

// Preferencias de la Ayuda y de los tutoriales (B3/B4): modo de voz de la Ayuda, bienvenida, sugerencias de primera visita y progreso de tutoriales. Estas claves NO están en la
// lista cerrada del servidor hasta aplicar la migración 0306 (supabase/pending-migrations/0306_help_feedback_and_prefs.sql). Por eso viajan entre dispositivos SOLO cuando se
// enciende este interruptor (después de aplicar la migración y desplegar); apagado, se guardan únicamente en el dispositivo. Una prueba exige que, encendido, la migración exista.
export const HELP_PREFS_SYNC_ENABLED = false

export const HELP_PREF_PATTERN_SOURCES: readonly string[] = [
  '^pepa:help-voice-mode$',
  '^pepa:help-welcome$',
  '^pepa:help-hint:[a-z0-9-]+$',
  '^pepa:help-tour:[a-z0-9-]+$',
]

// Modo y ordenación del Comparador de precios (NORM-3). Igual que las de Ayuda: el servidor NO las acepta hasta aplicar la migración 0337 (supabase/pending-migrations/0337_compare_view_prefs.sql).
// Por eso viajan entre dispositivos SOLO cuando se enciende este interruptor (después de aplicar la migración y desplegar); apagado, se recuerdan en el dispositivo. Una prueba exige que,
// encendido, la migración exista en supabase/migrations.
export const COMPARE_PREFS_SYNC_ENABLED = false

export const COMPARE_PREF_PATTERN_SOURCES: readonly string[] = ['^familyapp:compras-compare-(mode|sort)$']

const SYNCED_KEY_PATTERNS: RegExp[] = [...SYNCED_KEY_PATTERN_SOURCES, ...(HELP_PREFS_SYNC_ENABLED ? HELP_PREF_PATTERN_SOURCES : []), ...(COMPARE_PREFS_SYNC_ENABLED ? COMPARE_PREF_PATTERN_SOURCES : [])].map((s) => new RegExp(s))

// Tamaño máximo de un valor (igual que el límite de la tabla): más grande se rechaza antes de intentar subirlo.
export const MAX_PREF_VALUE_CHARS = 8000
export const MAX_PREF_KEY_CHARS = 120

export function isSyncedPrefKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_PREF_KEY_CHARS && SYNCED_KEY_PATTERNS.some((re) => re.test(key))
}

// Preferencias cuyo cambio remoto NO se aplica solo porque exigen recargar la app para repintarse todo: se avisa y se deja decidir (tema de color).
export const RELOAD_TO_APPLY_KEYS: readonly string[] = ['familyapp:color-theme', 'familyapp:chart-color-theme']
