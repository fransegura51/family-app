import { legacyIdsOf } from '@/help/tours/aliases'
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

// ---- Bienvenida («recorrido inicial opcional»). Solo se ofrece a las cuentas NUEVAS: el alta (crear familia o unirse con un código) la deja en «pending». Una cuenta anterior no
// tiene valor (null): no se le ofrece nada por sorpresa (el recorrido sigue disponible a mano en Ayuda).
export type WelcomeState = 'pending' | 'done' | 'skipped'

export function getWelcomeState(): WelcomeState | null {
  const v = read(HELP_WELCOME_KEY)
  return v === 'pending' || v === 'done' || v === 'skipped' ? v : null
}

// Al terminar el alta: se marca para ofrecer la bienvenida una vez (nunca pisa un «hecho» ni un «omitido» anteriores).
export function offerWelcomeToNewAccount(): void {
  if (getWelcomeState() === null) prefSet(HELP_WELCOME_KEY, 'pending')
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

function readProgress(tourId: string): TourProgress | null {
  const raw = read(tourProgressKey(tourId))
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as TourProgress
    return v && (v.status === 'started' || v.status === 'completed' || v.status === 'dismissed') ? v : null
  } catch {
    return null
  }
}

const RANK: Record<TourStatus, number> = { dismissed: 0, started: 1, completed: 2 }

// Progreso de un tutorial/capítulo. Si el capítulo sustituye a tutoriales antiguos (alias, src/help/tours/aliases), cuenta también lo que se había hecho con el identificador antiguo:
// quien ya completó «tut-compras-tiendas» sigue viéndolo como hecho aunque ahora sea un capítulo. Gana lo más avanzado (completado > empezado > descartado) y, a igual estado, lo más reciente.
export function getTourProgress(tourId: string): TourProgress | null {
  let best = readProgress(tourId)
  for (const old of legacyIdsOf(tourId)) {
    const p = readProgress(old)
    if (p && (!best || RANK[p.status] > RANK[best.status] || (RANK[p.status] === RANK[best.status] && p.at > best.at))) best = p
  }
  return best
}

export function setTourProgress(tourId: string, progress: TourProgress): void {
  prefSet(tourProgressKey(tourId), JSON.stringify(progress))
}

// «Empezado» o «descartado» NUNCA pisan un «completado» de la misma versión (repetir un recorrido hecho y salir a mitad no debe quitar el ✓). Un completado de una versión anterior sí se
// puede sustituir (la interfaz cambió y se vuelve a ofrecer).
export function markTourProgress(tourId: string, status: Exclude<TourStatus, 'completed'>, version: number): void {
  const cur = getTourProgress(tourId)
  if (cur?.status === 'completed' && cur.version >= version) return
  setTourProgress(tourId, { status, at: new Date().toISOString().slice(0, 10), version })
}

/** ¿Completado con la versión actual? (✓). */
export function isTourDone(tourId: string, version: number): boolean {
  const p = getTourProgress(tourId)
  return p?.status === 'completed' && p.version >= version
}
