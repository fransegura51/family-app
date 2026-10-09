import { Capacitor } from '@capacitor/core'

// ¿PEPA se está ejecutando dentro de la app nativa (Android/iPhone) y no en un navegador? La app nativa es una cáscara que abre esta misma
// web (ver capacitor.config.ts); solo cambian las piezas que el navegador no puede hacer, como la ubicación con el móvil bloqueado.
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}
