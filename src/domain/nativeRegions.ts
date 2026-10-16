// Bordes de los lugares que vigila el iPhone con la app CERRADA (iOS «regiones»). Los cambios significativos de ubicación solo despiertan la app tras ~500 m, y
// casa y el cole pueden estar a menos (caso real 16/10/2026: 439 m, y no salió ningún aviso). Las regiones sí despiertan la app al cruzar el borde de un
// lugar, aunque sea cerca. Solo se vigilan los lugares con el aviso de llegada/salida activado: son los únicos para los que el servidor manda avisos.
import type { LocationPlace } from '@/domain/types'

export interface NativeRegion {
  id: string
  latitude: number
  longitude: number
  radius: number
}

// iOS no avisa de forma fiable con radios menores de ~100 m (el borde se calcula con wifi y antenas). El servidor sigue usando el radio real del lugar
// (50 m por defecto) para decidir si hay aviso: esto solo sirve para DESPERTAR la app, que entonces manda la posición continua hasta llegar.
export const NATIVE_REGION_MIN_RADIUS_M = 100
// iOS permite como máximo 20 regiones por app.
export const NATIVE_REGION_MAX = 20

export function placesToNativeRegions(places: readonly LocationPlace[]): NativeRegion[] {
  return places
    .filter((p) => p.notifyArrivals && Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, NATIVE_REGION_MAX)
    .map((p) => ({
      id: p.id,
      latitude: p.latitude,
      longitude: p.longitude,
      radius: Math.max(Number.isFinite(p.radiusM) ? p.radiusM : 0, NATIVE_REGION_MIN_RADIUS_M),
    }))
}
