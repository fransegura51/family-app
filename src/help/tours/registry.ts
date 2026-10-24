import { bienvenida } from '@/help/tours/defs/bienvenida'
import { calCrearEvento } from '@/help/tours/defs/calCrearEvento'
import { calCrearTarea } from '@/help/tours/defs/calCrearTarea'
import { comAnadirProducto } from '@/help/tours/defs/comAnadirProducto'
import { famAnadirMiembro } from '@/help/tours/defs/famAnadirMiembro'
import { visitaAyuda } from '@/help/tours/defs/visitaAyuda'
import { TOURS_G1 } from '@/help/tours/defs/groups/g1'
import { TOURS_G2 } from '@/help/tours/defs/groups/g2'
import { TOURS_G3 } from '@/help/tours/defs/groups/g3'
import { TOURS_G4 } from '@/help/tours/defs/groups/g4'
import { TOURS_G5 } from '@/help/tours/defs/groups/g5'
import { TOURS_G6 } from '@/help/tours/defs/groups/g6'
import { TOURS_G7 } from '@/help/tours/defs/groups/g7'
import type { TourDef } from '@/help/tours/types'

// Registro de visitas guiadas («Conoce esta sección») y tutoriales «Enséñame» (B4 + ampliación). Cada uno se define en su archivo (defs/) y se registra aquí. Lo que no esté aquí no se
// ofrece en ninguna parte. AYUDA-01: si cambia la pantalla que recorre, se revisa su definición (una prueba comprueba que cada control señalado existe en el código).
export const TOURS: readonly TourDef[] = [
  calCrearEvento,
  calCrearTarea,
  comAnadirProducto,
  famAnadirMiembro,
  bienvenida,
  visitaAyuda,
  ...TOURS_G1,
  ...TOURS_G2,
  ...TOURS_G3,
  ...TOURS_G4,
  ...TOURS_G5,
  ...TOURS_G6,
  ...TOURS_G7,
]

export const TOUR_IDS: readonly string[] = TOURS.map((t) => t.id)

export function getTour(id: string | undefined): TourDef | undefined {
  return id ? TOURS.find((t) => t.id === id) : undefined
}

export function hasTour(id: string | undefined): boolean {
  return getTour(id) !== undefined
}
