// Interruptor de COMPILACIÓN de la sincronización nueva (B1 / CONFIG-01). ENCENDIDO el 22/10/2026, con la migración 0305 aplicada en producción y Realtime activado.
// Para volver al mecanismo anterior (sin perder preferencias): ponerlo en false y desplegar (ver docs/CONFIG_01_SINCRONIZACION_PREFERENCIAS.md).
export const PREFS_V2_ENABLED = true

let override: boolean | null = null

export function isPrefsV2(): boolean {
  return override ?? PREFS_V2_ENABLED
}

// Solo para pruebas.
export function setPrefsV2ForTests(value: boolean | null): void {
  override = value
}
