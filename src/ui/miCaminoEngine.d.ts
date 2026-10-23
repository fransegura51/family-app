import type { MiCaminoFigureSlot } from '@/domain/miCamino'

export interface MiCaminoEngineKid {
  id: string
  name: string
  /** Inicial que se dibuja en la cabeza si el miembro no tiene foto (o aún no ha cargado). */
  letter: string
  color: string
  /** Total de puntos GANADOS alguna vez (nunca el saldo canjeable). */
  points: number
  photo?: HTMLImageElement | null
}

export interface MiCaminoEngineHooks {
  /** Se llama cuando cambia el mundo que se está viendo (0 Golosinas, 1 Submarino, 2 Espacio). */
  onWorldShown?: (world: number) => void
  /** Se llama al pulsar un planeta del mundo espacial. */
  onPlanet?: (name: string) => void
  /** Reparte a los niños que coinciden en posición (ver domain/miCamino.ts → miCaminoFigureSlots). */
  figureSlots?: (positions: number[]) => MiCaminoFigureSlot[]
  onError?: (error: unknown) => void
}

export interface MiCaminoEngine {
  setKids(list: MiCaminoEngineKid[], selectedId: string | null): void
  select(id: string): void
  start(): void
  stop(): void
  destroy(): void
}

export const PLANET_FACTS: Record<string, string[]>

export function createMiCaminoEngine(canvas: HTMLCanvasElement, hooks?: MiCaminoEngineHooks, reducedMotion?: boolean): MiCaminoEngine
