// Soporte técnico (migración 0310). Tipos del lado de la web. El autor de cada mensaje está tipificado desde el principio ('user' | 'admin' | 'ai' | 'system') para que un agente de IA
// futuro escriba en el MISMO hilo que una persona de soporte, sin cambiar el modelo (ver src/support/responder.ts). Hoy nada crea mensajes 'ai'.
export type SupportStatus = 'recibida' | 'en_revision' | 'esperando_usuario' | 'resuelta' | 'cerrada'
export type SupportPriority = 'baja' | 'normal' | 'alta'
export type SupportKind = 'tecnico' | 'error' | 'resultado_incorrecto' | 'clasificacion' | 'sincronizacion' | 'solicitud_producto' | 'otra'
export type SupportAuthorKind = 'user' | 'admin' | 'ai' | 'system'
export type SupportVisibility = 'public' | 'internal'

export interface SupportTicket {
  id: string
  requesterId: string
  familyId: string
  kind: SupportKind
  section: string
  subject: string
  status: SupportStatus
  priority: SupportPriority
  assigneeId: string | null
  context: Record<string, string>
  userUnread: boolean
  adminUnread: boolean
  messageCount: number
  createdAt: string
  updatedAt: string
  lastMessageAt: string
}

export interface SupportMessage {
  id: string
  ticketId: string
  authorKind: SupportAuthorKind
  authorId: string | null
  visibility: SupportVisibility
  body: string
  /** 'human' hoy; un motor futuro dirá cuál (p. ej. 'ai:nombre'). */
  responder: string
  createdAt: string
}

export interface SupportAttachment {
  id: string
  ticketId: string
  messageId: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export interface SupportEvent {
  id: string
  ticketId: string
  actorKind: SupportAuthorKind
  event: string
  fromValue: string | null
  toValue: string | null
  visibleToUser: boolean
  createdAt: string
}

export interface SupportAdminRow {
  id: string
  requesterName: string | null
  familyName: string | null
  kind: SupportKind
  section: string
  subject: string
  status: SupportStatus
  priority: SupportPriority
  assigneeId: string | null
  assigneeName: string | null
  createdAt: string
  lastMessageAt: string
  adminUnread: boolean
  messageCount: number
  duplicateOf: string | null
}

export interface SupportStats {
  total: number
  abiertas: number
  sinLeer: number
  porEstado: Record<string, number>
  porSeccion: Record<string, number>
  creadas30Dias: number
  horasPrimeraRespuesta: number | null
}
