import { bienvenida } from '@/help/tours/defs/bienvenida'
import { calCrearEvento } from '@/help/tours/defs/calCrearEvento'
import { calCrearTarea } from '@/help/tours/defs/calCrearTarea'
import { comAnadirProducto } from '@/help/tours/defs/comAnadirProducto'
import { famAnadirMiembro } from '@/help/tours/defs/famAnadirMiembro'
import type { TourDef } from '@/help/tours/types'

// Registro de tutoriales «Enséñame» (B4). Cada tutorial se define en su archivo (defs/) y se registra aquí. Un tutorial que no esté aquí no se ofrece en ninguna ficha.
// AYUDA-01: si cambia la pantalla que recorre un tutorial, se revisa su definición (una prueba comprueba que cada control señalado existe en el código).
export const TOURS: readonly TourDef[] = [calCrearEvento, calCrearTarea, comAnadirProducto, famAnadirMiembro, bienvenida]

export const TOUR_IDS: readonly string[] = TOURS.map((t) => t.id)

export function getTour(id: string | undefined): TourDef | undefined {
  return id ? TOURS.find((t) => t.id === id) : undefined
}

export function hasTour(id: string | undefined): boolean {
  return getTour(id) !== undefined
}
