import type { TourDef } from '@/help/tours/types'

// Pequeños Grandes (grupo g9): antes tenía «Mi Camino» y «El monedero», que eran recorridos solo para mirar (nivel A/C, no «Enséñame»). Ya no hay tutoriales aquí:
//  - «Mi Camino» y «Camino o Carrera» son ahora el capítulo `tut-pequenos-camino-carrera` (src/help/tours/defs/g3/pequenos.ts) y su explicación vive en «Entiende cómo funciona».
//  - «El monedero» pasó a la visita «Conoce Pequeños Grandes» y a la explicación `exp-pequenos-monedero`. «Educación financiera» no tiene tutorial hasta que sus formularios
//    lleven marcas de Ayuda (src/help/tours/planned/c.ts). Sus identificadores antiguos están en src/help/tours/aliases/c.ts.
// Se mantiene el archivo vacío para no tocar el registro compartido (groups/g9.ts).
export const TOURS_G9_PEQUENOS: TourDef[] = []
