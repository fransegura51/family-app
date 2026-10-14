import { Capacitor } from '@capacitor/core'

// ¿PEPA se está ejecutando dentro de la app nativa (Android/iPhone) y no en un navegador? La app nativa es una cáscara que abre esta misma
// web (ver capacitor.config.ts); solo cambian las piezas que el navegador no puede hacer, como la ubicación con el móvil bloqueado.
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

// ¿Es la app de iPhone? iOS no tiene el servicio de Android que sigue mandando la ubicación con la app cerrada (ver services/nativeUpload.ts):
// allí la ubicación llega por el camino de siempre, mientras iOS mantiene viva la app en segundo plano.
export function isIosApp(): boolean {
  return Capacitor.getPlatform() === 'ios'
}
