import { PLANNED_A } from '@/help/tours/planned/a'
import { PLANNED_B } from '@/help/tours/planned/b'
import { PLANNED_C } from '@/help/tours/planned/c'
import { PLANNED_D } from '@/help/tours/planned/d'
import { PLANNED_E } from '@/help/tours/planned/e'
import { PLANNED_F } from '@/help/tours/planned/f'
import type { PlannedSeries } from '@/help/tours/planned/types'

export type { PlannedSeries }
export const PLANNED_SERIES: readonly PlannedSeries[] = [...PLANNED_A, ...PLANNED_B, ...PLANNED_C, ...PLANNED_D, ...PLANNED_E, ...PLANNED_F]
