// Interruptor de COMPILACIÓN de la sincronización nueva (B1 / CONFIG-01). Apagado hasta que la migración 0305 esté aplicada en producción y Realtime activado:
// apagado, la app se comporta exactamente como antes (prefsSyncLegacy.ts). Se enciende en el mismo cambio que se despliega, con autorización.
export const PREFS_V2_ENABLED = false

let override: boolean | null = null

export function isPrefsV2(): boolean {
  return override ?? PREFS_V2_ENABLED
}

// Solo para pruebas.
export function setPrefsV2ForTests(value: boolean | null): void {
  override = value
}
