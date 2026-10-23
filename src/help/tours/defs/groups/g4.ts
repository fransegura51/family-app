import { TOURS_COMUNIDAD } from '@/help/tours/defs/g4/comunidad'
import { TOURS_COMUNIDAD_PENDIENTES } from '@/help/tours/defs/g4/comunidadPendientes'
import { TOURS_EVENTOS } from '@/help/tours/defs/g4/eventos'
import type { TourDef } from '@/help/tours/types'

// Visitas guiadas («Conoce esta sección») y tutoriales («Enséñame») del grupo g4: Eventos y Comunidad.
// Los tutoriales de Comunidad que pasan por /comunidad/p/:id y /comunidad/nueva (defs/g4/comunidadPendientes.ts) se registran con `paths: ['/comunidad/*']`: el motor acepta ese comodín (src/help/tours/paths.ts).
export const TOURS_G4: TourDef[] = [...TOURS_EVENTOS, ...TOURS_COMUNIDAD, ...TOURS_COMUNIDAD_PENDIENTES]
