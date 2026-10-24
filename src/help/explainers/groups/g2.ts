import { EXPLAINERS_COMPRAS } from '@/help/explainers/g2/compras'
import { EXPLAINERS_ECONOMIA } from '@/help/explainers/g2/economia'
import type { HelpExplainer } from '@/help/explainers/types'

// Explicaciones «Cómo funciona PEPA» del grupo g2: Compras y Economía.
export const EXPLAINERS_G2: HelpExplainer[] = [...EXPLAINERS_COMPRAS, ...EXPLAINERS_ECONOMIA]
