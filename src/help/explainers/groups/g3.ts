import type { HelpExplainer } from '@/help/explainers/types'
import { EXPLAINERS_COCINA } from '@/help/explainers/g3/cocina'
import { EXPLAINERS_PEQUENOS } from '@/help/explainers/g3/pequenos'

// Explicaciones «Cómo funciona PEPA» del grupo g3: La cocina de Pepa y Pequeños Grandes.
export const EXPLAINERS_G3: HelpExplainer[] = [...EXPLAINERS_COCINA, ...EXPLAINERS_PEQUENOS]
