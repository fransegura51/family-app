import { FEATURE_INVENTORY } from '@/admin/features/featureInventory'
import { HELP_CARDS, HELP_MODULES } from '@/help/catalog'
import { isKnownHelpPath } from '@/help/routes'
import { hasTour, TOUR_IDS } from '@/help/tours/registry'
import type { HelpCard, HelpModuleId } from '@/help/types'

// Salud de la Ayuda para el Centro de Administración: qué fichas están completas, qué rutas de «Llévame» están rotas, qué tutoriales hay y cuáles faltan. Todo se calcula con el
// propio catálogo (sin consultas al servidor). Las comprobaciones contra el CÓDIGO (botones citados, marcas de los tutoriales) las hacen las pruebas automáticas (AYUDA-01).
export type CardCompleteness = 'completa' | 'parcial' | 'pendiente'

// Una ficha está completa si explica los pasos Y lleva a la pantalla real; una función desactivada solo necesita su explicación (no se ofrece nada que hacer).
export function cardCompleteness(card: HelpCard): CardCompleteness {
  if (card.state === 'desactivada') return card.quick.trim() ? 'completa' : 'pendiente'
  const hasSteps = (card.steps?.length ?? 0) > 0
  const hasGo = Boolean(card.go)
  if (hasSteps && hasGo) return 'completa'
  if (hasSteps || hasGo) return 'parcial'
  return 'pendiente'
}

export interface ModuleHealth {
  id: HelpModuleId
  cards: number
  complete: number
  partial: number
  pending: number
  switchedOff: number
  tours: number
}

export interface HelpHealth {
  modules: ModuleHealth[]
  totals: { cards: number; complete: number; partial: number; pending: number }
  brokenRoutes: { cardId: string; path: string }[]
  unknownFeatures: { cardId: string; featureId: string }[]
  unknownTours: { cardId: string; tour: string }[]
  modulesWithoutCards: HelpModuleId[]
  /** Fichas disponibles con pasos y destino que todavía no tienen tutorial «Enséñame». */
  tourCandidates: HelpCard[]
  toursAvailable: string[]
}

export function computeHelpHealth(cards: HelpCard[] = HELP_CARDS): HelpHealth {
  const featureIds = new Set(FEATURE_INVENTORY.map((f) => f.id))
  const modules: ModuleHealth[] = HELP_MODULES.map((m) => {
    const mine = cards.filter((c) => c.module === m.id)
    const comp = mine.map(cardCompleteness)
    return {
      id: m.id,
      cards: mine.length,
      complete: comp.filter((c) => c === 'completa').length,
      partial: comp.filter((c) => c === 'parcial').length,
      pending: comp.filter((c) => c === 'pendiente').length,
      switchedOff: mine.filter((c) => c.state === 'desactivada').length,
      tours: mine.filter((c) => hasTour(c.tour)).length,
    }
  })
  return {
    modules,
    totals: {
      cards: cards.length,
      complete: modules.reduce((n, m) => n + m.complete, 0),
      partial: modules.reduce((n, m) => n + m.partial, 0),
      pending: modules.reduce((n, m) => n + m.pending, 0),
    },
    brokenRoutes: cards.filter((c) => c.go && !isKnownHelpPath(c.go.path)).map((c) => ({ cardId: c.id, path: c.go!.path })),
    unknownFeatures: cards.filter((c) => c.featureId && !featureIds.has(c.featureId)).map((c) => ({ cardId: c.id, featureId: c.featureId! })),
    unknownTours: cards.filter((c) => c.tour && !hasTour(c.tour)).map((c) => ({ cardId: c.id, tour: c.tour! })),
    modulesWithoutCards: modules.filter((m) => m.cards === 0).map((m) => m.id),
    tourCandidates: cards.filter((c) => c.state === 'disponible' && (c.steps?.length ?? 0) > 0 && c.go && !hasTour(c.tour)),
    toursAvailable: [...TOUR_IDS],
  }
}
