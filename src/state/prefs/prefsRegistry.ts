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

const SYNCED_KEY_PATTERNS: RegExp[] = SYNCED_KEY_PATTERN_SOURCES.map((s) => new RegExp(s))

// Tamaño máximo de un valor (igual que el límite de la tabla): más grande se rechaza antes de intentar subirlo.
export const MAX_PREF_VALUE_CHARS = 8000
export const MAX_PREF_KEY_CHARS = 120

export function isSyncedPrefKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_PREF_KEY_CHARS && SYNCED_KEY_PATTERNS.some((re) => re.test(key))
}

// Preferencias cuyo cambio remoto NO se aplica solo porque exigen recargar la app para repintarse todo: se avisa y se deja decidir (tema de color).
export const RELOAD_TO_APPLY_KEYS: readonly string[] = ['familyapp:color-theme', 'familyapp:chart-color-theme']
