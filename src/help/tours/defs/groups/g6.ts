import type { TourDef } from '@/help/tours/types'
import { visitaCumpleanos, visitaContactos, visitaDocumentos, visitaGaleria, visitaInicio } from '@/help/tours/defs/g6/visitas'
import { TOURS_CUMPLEANOS } from '@/help/tours/defs/g6/cumpleanos'
import { TOURS_DOCUMENTOS } from '@/help/tours/defs/g6/documentos'
import { tutInicioOrganizar } from '@/help/tours/defs/g6/tutoriales'

// Visitas guiadas («Conoce esta sección») y tutoriales («Enséñame») del grupo g6: Inicio, Documentos, Galería, Contactos y Cumpleaños (más la campana de avisos).
export const TOURS_G6: TourDef[] = [
  visitaInicio,
  visitaDocumentos,
  visitaGaleria,
  visitaContactos,
  visitaCumpleanos,
  tutInicioOrganizar,
  ...TOURS_DOCUMENTOS,
  ...TOURS_CUMPLEANOS,
]
