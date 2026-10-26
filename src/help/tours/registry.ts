import { bienvenida } from '@/help/tours/defs/bienvenida'
import { calCrearEvento } from '@/help/tours/defs/calCrearEvento'
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
import { TOURS_G8 } from '@/help/tours/defs/groups/g8'
import { TOURS_G9 } from '@/help/tours/defs/groups/g9'
import { TOURS_G10 } from '@/help/tours/defs/groups/g10'
import { TOURS_LISTAS } from '@/help/tours/defs/g11/listas'
import { TOUR_ALIASES } from '@/help/tours/aliases'
import type { TourDef } from '@/help/tours/types'

// Registro de visitas guiadas («Conoce esta sección») y tutoriales «Enséñame» (B4 + ampliación). Cada uno se define en su archivo (defs/) y se registra aquí. Lo que no esté aquí no se
// ofrece en ninguna parte. AYUDA-01: si cambia la pantalla que recorre, se revisa su definición (una prueba comprueba que cada control señalado existe en el código).
export const TOURS: readonly TourDef[] = [
  calCrearEvento,
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
  ...TOURS_G8,
  ...TOURS_G9,
  ...TOURS_G10,
  ...TOURS_LISTAS,
]

export const TOUR_IDS: readonly string[] = TOURS.map((t) => t.id)

// Un identificador ANTIGUO (tutorial fusionado en otro) se resuelve al capítulo que hoy cubre su contenido.
export function getTour(id: string | undefined): TourDef | undefined {
  if (!id) return undefined
  return TOURS.find((t) => t.id === id) ?? TOURS.find((t) => t.id === TOUR_ALIASES[id])
}

export function hasTour(id: string | undefined): boolean {
  return getTour(id) !== undefined
}
