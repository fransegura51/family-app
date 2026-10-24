import { EXPLAINERS_G1 } from '@/help/explainers/groups/g1'
import { EXPLAINERS_G2 } from '@/help/explainers/groups/g2'
import { EXPLAINERS_G3 } from '@/help/explainers/groups/g3'
import { EXPLAINERS_G4 } from '@/help/explainers/groups/g4'
import { EXPLAINERS_G5 } from '@/help/explainers/groups/g5'
import { EXPLAINERS_G6 } from '@/help/explainers/groups/g6'
import type { HelpExplainer } from '@/help/explainers/types'

// Registro de las explicaciones «Cómo funciona PEPA». Cada grupo de módulos aporta su archivo (groups/); aquí solo se reúnen. Una explicación que no esté aquí no se muestra.
export const EXPLAINERS: readonly HelpExplainer[] = [...EXPLAINERS_G1, ...EXPLAINERS_G2, ...EXPLAINERS_G3, ...EXPLAINERS_G4, ...EXPLAINERS_G5, ...EXPLAINERS_G6]

export const EXPLAINER_BY_ID = new Map(EXPLAINERS.map((e) => [e.id, e]))
