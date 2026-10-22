import { prefSet } from '@/state/prefs/prefsWrite'

// Preferencias de la Ayuda de la persona (B3/B4). Viajan con la cuenta entre dispositivos por el sistema de preferencias existente (CONFIG-01) en cuanto la migración de la
// lista de claves (0306) esté aplicada y se encienda HELP_PREFS_SYNC_ENABLED (src/state/prefs/prefsRegistry.ts); mientras tanto se guardan solo en este dispositivo.
//  - Modo de voz de la Ayuda: INDEPENDIENTE de «Hablar con PEPA» (otra clave: familyapp:voice-response-mode).
//  - Progreso de los tutoriales «Enséñame»: solo el estado de cada uno (nunca lo que la persona escribió ni dónde va).
export type HelpVoiceMode = 'voice' | 'text'

export const HELP_VOICE_KEY = 'pepa:help-voice-mode'
export const HELP_WELCOME_KEY = 'pepa:help-welcome'
export const tourProgressKey = (tourId: string) => `pepa:help-tour:${tourId}`
export const moduleHintKey = (moduleId: string) => `pepa:help-hint:${moduleId}`

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function getHelpVoiceMode(): HelpVoiceMode {
  return read(HELP_VOICE_KEY) === 'voice' ? 'voice' : 'text'
}

export function setHelpVoiceMode(mode: HelpVoiceMode): void {
  prefSet(HELP_VOICE_KEY, mode)
}

// ---- Bienvenida («recorrido inicial opcional»): visto | omitido | hecho
export type WelcomeState = 'pending' | 'done' | 'skipped'

export function getWelcomeState(): WelcomeState {
  const v = read(HELP_WELCOME_KEY)
  return v === 'done' || v === 'skipped' ? v : 'pending'
}

export function setWelcomeState(state: Exclude<WelcomeState, 'pending'>): void {
  prefSet(HELP_WELCOME_KEY, state)
}

// ---- Sugerencias discretas de primera visita a un módulo: una sola vez por módulo.
export function hasSeenModuleHint(moduleId: string): boolean {
  return read(moduleHintKey(moduleId)) === '1'
}

export function markModuleHintSeen(moduleId: string): void {
  prefSet(moduleHintKey(moduleId), '1')
}

// ---- Progreso de tutoriales
export type TourStatus = 'started' | 'completed' | 'dismissed'
export interface TourProgress {
  status: TourStatus
  /** Cuándo (AAAA-MM-DD). */
  at: string
  /** Versión del tutorial con la que se completó (si la interfaz cambia, se puede ofrecer repetirlo). */
  version: number
}

export function getTourProgress(tourId: string): TourProgress | null {
  const raw = read(tourProgressKey(tourId))
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as TourProgress
    return v && (v.status === 'started' || v.status === 'completed' || v.status === 'dismissed') ? v : null
  } catch {
    return null
  }
}

export function setTourProgress(tourId: string, progress: TourProgress): void {
  prefSet(tourProgressKey(tourId), JSON.stringify(progress))
}
