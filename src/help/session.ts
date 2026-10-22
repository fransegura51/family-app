import type { SearchConfidence, SearchHit } from '@/help/search/searchEngine'

// Conversación de la Ayuda: vive SOLO en la memoria de la aplicación (estado de React) mientras la Ayuda está abierta o minimizada. Nunca se escribe en el
// dispositivo (ni localStorage, ni IndexedDB) ni se manda a ningún servidor: al cerrar la Ayuda, o al recargar o cerrar la aplicación, desaparece. Una prueba comprueba
// que este módulo no toca almacenamiento ni red.
export type HelpMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'pepa'; kind: 'answer'; query: string; hits: SearchHit[]; confidence: SearchConfidence; usedAi: boolean }
  | { id: number; role: 'pepa'; kind: 'text'; text: string }

export interface HelpSession {
  messages: HelpMessage[]
  nextId: number
}

export const MAX_MESSAGES = 40

export const emptySession = (): HelpSession => ({ messages: [], nextId: 1 })

export function addUserMessage(s: HelpSession, text: string): HelpSession {
  return push(s, { id: s.nextId, role: 'user', text })
}

export function addAnswer(s: HelpSession, query: string, hits: SearchHit[], confidence: SearchConfidence, usedAi = false): HelpSession {
  return push(s, { id: s.nextId, role: 'pepa', kind: 'answer', query, hits, confidence, usedAi })
}

export function addPepaText(s: HelpSession, text: string): HelpSession {
  return push(s, { id: s.nextId, role: 'pepa', kind: 'text', text })
}

function push(s: HelpSession, m: HelpMessage): HelpSession {
  const messages = [...s.messages, m].slice(-MAX_MESSAGES)
  return { messages, nextId: s.nextId + 1 }
}

// Las últimas consultas de la persona (solo texto, para que la IA —si se usa— entienda el hilo): nunca se guardan fuera de la memoria.
export function recentQueries(s: HelpSession, n = 3): string[] {
  return s.messages.filter((m): m is Extract<HelpMessage, { role: 'user' }> => m.role === 'user').slice(-n).map((m) => m.text)
}
