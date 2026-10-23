import { EXPLAINERS_COMUNIDAD } from '@/help/explainers/g4/comunidad'
import { EXPLAINERS_EVENTOS } from '@/help/explainers/g4/eventos'
import type { HelpExplainer } from '@/help/explainers/types'

// Explicaciones «Cómo funciona PEPA» del grupo g4: Eventos y Comunidad.
export const EXPLAINERS_G4: HelpExplainer[] = [...EXPLAINERS_EVENTOS, ...EXPLAINERS_COMUNIDAD]
