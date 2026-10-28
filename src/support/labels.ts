import type { SupportKind, SupportPriority, SupportStatus } from '@/support/types'

// Textos de Soporte para las personas: estados, tipos y prioridades, en lenguaje sencillo.
export const STATUS_LABEL: Record<SupportStatus, string> = {
  recibida: 'Recibida',
  en_revision: 'En revisión',
  esperando_usuario: 'Esperando tu respuesta',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
}

// La administración ve el estado desde su lado (no «tu respuesta» sino «de la persona»).
export const STATUS_LABEL_ADMIN: Record<SupportStatus, string> = { ...STATUS_LABEL, esperando_usuario: 'Esperando a la persona' }

export const STATUS_ORDER: SupportStatus[] = ['recibida', 'en_revision', 'esperando_usuario', 'resuelta', 'cerrada']

export const STATUS_HINT: Record<SupportStatus, string> = {
  recibida: 'Hemos recibido tu incidencia. Te avisaremos cuando alguien la mire.',
  en_revision: 'Alguien del equipo de PEPA la está revisando.',
  esperando_usuario: 'Soporte necesita que contestes para poder seguir.',
  resuelta: 'Soporte la ha marcado como resuelta. Confirma si de verdad lo está.',
  cerrada: 'La incidencia está cerrada. Si vuelve a pasar, puedes escribir de nuevo en este mismo hilo.',
}

export const KIND_LABEL: Record<SupportKind, string> = {
  tecnico: 'Algo no funciona',
  error: 'Me ha salido un error',
  resultado_incorrecto: 'PEPA ha dado un resultado incorrecto',
  clasificacion: 'Una categoría o clasificación es incorrecta',
  sincronizacion: 'No se sincroniza (banco, calendario…)',
  solicitud_producto: 'Solicitud de producto',
  otra: 'Otra cosa',
}

export const PRIORITY_LABEL: Record<SupportPriority, string> = { baja: 'Baja', normal: 'Normal', alta: 'Alta' }

export const OPEN_STATUSES: SupportStatus[] = ['recibida', 'en_revision', 'esperando_usuario']
export const isOpenStatus = (s: SupportStatus) => OPEN_STATUSES.includes(s)
