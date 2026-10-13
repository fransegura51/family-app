// Las últimas ideas de «¿Qué cocino hoy?» (de la pestaña o de Pepa por voz), para poder decir después «la primera» y para que la pestaña las enseñe al
// abrirse. Solo en memoria del navegador y solo un rato: nada se guarda en ningún servidor.
import type { CookIdeaData } from '@/domain/cookIdeas'

export interface CookIdeasResult {
  ingredients: string[]
  servings: number
  ideas: CookIdeaData[]
}

const VOICE_PICK_MS = 5 * 60 * 1000
const TAB_SHOW_MS = 30 * 60 * 1000
const EVENT = 'family-app:cook-ideas'

let latest: (CookIdeasResult & { at: number }) | null = null

export function rememberCookIdeas(result: CookIdeasResult): void {
  latest = { ...result, at: Date.now() }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT))
}

// Para elegir por voz («la primera»): solo si se acaban de contar.
export function recentCookIdeasForVoice(nowMs: number = Date.now()): CookIdeasResult | null {
  return latest && nowMs - latest.at <= VOICE_PICK_MS ? latest : null
}

// Para la pestaña: lo último, aunque hayan pasado unos minutos.
export function latestCookIdeas(nowMs: number = Date.now()): CookIdeasResult | null {
  return latest && nowMs - latest.at <= TAB_SHOW_MS ? latest : null
}

export function forgetCookIdeas(): void {
  latest = null
}

export function onCookIdeas(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
