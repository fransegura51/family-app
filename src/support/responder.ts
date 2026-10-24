import type { SupportMessage, SupportTicket } from '@/support/types'

// PREPARACIÓN PARA UN AGENTE DE IA (no activada). Este archivo solo define CONTRATOS; no hay ningún proveedor de IA, ninguna llamada de red y ningún endpoint público. Sirve para
// que, el día que se decida activar un agente de primer nivel, se añada sin rehacer el modelo de Soporte:
//
//  · La incidencia, su conversación y sus mensajes ya distinguen el autor (usuario / administración humana / agente IA / sistema) y llevan `responder` y `meta` abiertos (0310).
//  · El agente escribiría en el MISMO hilo que ve la persona (un solo hilo por incidencia), con un autor 'ai' claramente identificado en pantalla, sin suplantar a una persona de soporte.
//  · Una persona de la administración puede tomar el control en cualquier momento (asignarse la incidencia, o cambiar su estado) y el agente deja de contestar en ella.
//  · Un agente real tendría límites ANTES de poder contestar (ver AGENT_LIMITS_REQUIRED) y solo podría citar fuentes de conocimiento de la lista cerrada de KnowledgeSource.
//
// Mientras no exista una implementación registrada, `getSupportResponder()` devuelve null y nada contesta automáticamente. Registrar una implementación exige un cambio de código
// revisado (y, en el servidor, una función con sus propios controles): no hay forma de activarlo por configuración desde la web.

/** Fuente de conocimiento que un motor de respuesta podría consultar. Lista cerrada: nada fuera de estas fuentes. */
export type KnowledgeSourceKind = 'help-card' | 'explainer' | 'feature-inventory' | 'ticket-history'

export interface KnowledgeSnippet {
  source: KnowledgeSourceKind
  /** Identificador estable de la ficha/explicación/función (para citarla y para auditar de dónde salió una respuesta). */
  id: string
  title: string
  text: string
}

export interface KnowledgeSource {
  kind: KnowledgeSourceKind
  /** Busca fragmentos relevantes. Debe ser de solo lectura y no enviar nada fuera. */
  search: (query: string, limit: number) => KnowledgeSnippet[]
}

/** Lo que un motor recibe para contestar: la incidencia, lo que la persona VE (nunca notas internas) y el contexto técnico mínimo ya existente. */
export interface ResponderInput {
  ticket: Pick<SupportTicket, 'id' | 'kind' | 'section' | 'subject' | 'status' | 'context'>
  visibleMessages: Pick<SupportMessage, 'authorKind' | 'body' | 'createdAt'>[]
  knowledge: KnowledgeSource[]
}

export interface ResponderOutput {
  /** Texto para la persona. */
  body: string
  /** Fuentes que respaldan la respuesta; sin ninguna fuente, una respuesta automática NO debe enviarse. */
  citations: Array<Pick<KnowledgeSnippet, 'source' | 'id'>>
  /** Si el motor no está seguro, pasa a una persona en vez de contestar. */
  handoffToHuman: boolean
}

export interface SupportResponder {
  /** Identificador que se guarda en `support_messages.responder` (p. ej. 'ai:primer-nivel'). Solo [a-z0-9:_.-], máximo 40. */
  id: string
  respond: (input: ResponderInput) => Promise<ResponderOutput>
}

/**
 * Límites que cualquier agente real debería cumplir antes de activarse (se comprobarían en el servidor, no en la web):
 *  - máximo de respuestas automáticas por incidencia y por día;
 *  - nunca contestar con datos privados de otras familias ni del resto de la conversación de otras incidencias;
 *  - nunca ejecutar acciones en la cuenta (borrar, cambiar permisos, pagar): solo texto;
 *  - pasar a una persona ante dudas, quejas, seguridad, datos personales o cuando la persona lo pida;
 *  - dejar rastro: autor 'ai', `responder`, fuentes citadas y coste, visibles para la administración.
 */
export const AGENT_LIMITS_REQUIRED = ['respuestas-por-incidencia', 'respuestas-por-dia', 'solo-texto', 'traspaso-a-persona', 'rastro-y-fuentes', 'sin-datos-de-otras-familias'] as const

let registered: SupportResponder | null = null

/** Hoy no hay ningún motor registrado. */
export function getSupportResponder(): SupportResponder | null {
  return registered
}

/** Solo para pruebas y para la futura activación revisada. */
export function registerSupportResponder(r: SupportResponder | null): void {
  registered = r
}
