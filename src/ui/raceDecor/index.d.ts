// Tipos de la capa de decoración mensual de la Carrera (el dibujo vive en JavaScript, igual que miCaminoEngine.js:
// son ~3000 líneas de trazos de canvas del prototipo aprobado; lo que decide algo —el mes, las fechas— está probado).
import type { RaceDecorator } from '@/ui/RaceTrack'

export interface MonthInfo {
  name: string
  emoji: string
  note: string
}
export const MONTH_INFO: MonthInfo[]

/** Fecha local de España (Europe/Madrid): mes 0-11 y día 1-31. */
export function spainDate(date?: Date): { month: number; day: number }
export function currentMonthInSpain(date?: Date): number
/** Enero: del 1 al 6 → 'reyes' (Reyes Magos); del 7 al 31 → 'nieve' (niños en la nieve). */
export function januaryVariantInSpain(date?: Date): 'reyes' | 'nieve'

export interface RaceDecoratorControl extends RaceDecorator {
  setMonth(month: number, variant?: 'reyes' | 'nieve'): void
  getMonth(): number
  getVariant(): 'reyes' | 'nieve'
  setEnabled(enabled: boolean): void
  isEnabled(): boolean
  setPaused(paused: boolean): void
  isPaused(): boolean
  getError(): unknown
  debugClock(): number
}
export function createRaceDecorator(options?: { month?: number; variant?: 'reyes' | 'nieve'; enabled?: boolean }): RaceDecoratorControl
