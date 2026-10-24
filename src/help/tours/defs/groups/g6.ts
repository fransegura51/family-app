import type { TourDef } from '@/help/tours/types'
import { visitaCumpleanos, visitaContactos, visitaDocumentos, visitaGaleria, visitaInicio } from '@/help/tours/defs/g6/visitas'
import {
  tutCumpleanosCambiarFecha,
  tutCumpleanosFavorito,
  tutContactosAnadir,
  tutContactosBuscar,
  tutDocumentosCarpeta,
  tutDocumentosSubirVencimiento,
  tutGaleriaSubirFoto,
  tutInicioOrganizar,
  tutNotificacionesCampana,
} from '@/help/tours/defs/g6/tutoriales'

// Visitas guiadas («Conoce esta sección») y tutoriales («Enséñame») del grupo g6: Inicio, Documentos, Galería, Contactos y Cumpleaños (más la campana de avisos).
export const TOURS_G6: TourDef[] = [
  visitaInicio,
  visitaDocumentos,
  visitaGaleria,
  visitaContactos,
  visitaCumpleanos,
  tutInicioOrganizar,
  tutNotificacionesCampana,
  tutDocumentosCarpeta,
  tutDocumentosSubirVencimiento,
  tutGaleriaSubirFoto,
  tutContactosAnadir,
  tutContactosBuscar,
  tutCumpleanosFavorito,
  tutCumpleanosCambiarFecha,
]
