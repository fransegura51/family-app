import type { HelpExplainer } from '@/help/explainers/types'
import {
  expContactosCompartir,
  expCumpleanosOrigen,
  expDocumentosAvisosVencimiento,
  expDocumentosCompartir,
  expGaleriaCompartir,
  expInicioCarrusel,
  expInicioPepaTeAvisa,
  expNotificacionesCampana,
} from '@/help/explainers/g6/explicaciones'

// Explicaciones «Cómo funciona PEPA» del grupo g6: Inicio, Documentos, Galería, Contactos y Cumpleaños (más la campana de avisos).
export const EXPLAINERS_G6: HelpExplainer[] = [
  expInicioCarrusel,
  expInicioPepaTeAvisa,
  expNotificacionesCampana,
  expDocumentosAvisosVencimiento,
  expDocumentosCompartir,
  expGaleriaCompartir,
  expContactosCompartir,
  expCumpleanosOrigen,
]
