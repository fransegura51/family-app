// Comunidad PEPA — denunciar contenido (publicación, comentario o reseña de receta): lógica PURA, sin red ni pantalla.
// Dos caminos hacia el servidor (migración 0268):
//   · «member»: `community_report` (personas que pueden participar y tienen alias). Cuenta como denuncia de un miembro (puede ocultar solo con 3 denuncias graves
//     de personas distintas, ver CMN moderación).
//   · «visitor»: `community_visitor_report` (personas con sesión pero SIN poder participar —solo lectura, sin alias, expulsadas— y visitantes sin cuenta). Nunca
//     oculta nada por sí sola: avisa a la administración.
import type { RecipeReview } from '@/domain/community'

export type ReportableType = 'post' | 'comment' | 'review'
export type ReportChannel = 'member' | 'visitor'

export interface ReportChannelInput {
  // Acceso por edad y permisos de la familia (`useCommunityAccess().canParticipate`).
  canParticipate: boolean
  // Tiene alias público y ha aceptado las normas (`me.hasProfile`).
  hasAlias: boolean
  // Estado de expulsión del perfil, si lo hay (`ok` o ausente = sin expulsión).
  banState?: string | null
}

// Quien puede participar, tiene alias y no está expulsado/a usa la denuncia de miembro; todos los demás, el aviso de lector. Así nadie se queda sin poder
// avisar de algo grave por tener un permiso de solo lectura (decisión de la dueña, orden 2.4).
export function reportChannel(i: ReportChannelInput): ReportChannel {
  if (!i.canParticipate || !i.hasAlias) return 'visitor'
  if (i.banState && i.banState !== 'ok') return 'visitor'
  return 'member'
}

export const REPORT_TARGET_TEXT: Record<ReportableType, string> = {
  post: 'esta publicación',
  comment: 'este comentario',
  review: 'esta reseña',
}

export const REPORT_DONE_TEXT = 'Gracias, la administración lo revisará.'
export const REPORT_ALREADY_TEXT = 'Ya habías denunciado esto. La administración lo revisará.'
export const REPORT_INTRO_TEXT = 'Cuéntanos qué pasa. No se borra nada por una denuncia: la revisa la administración. Nadie sabrá que has sido tú.'
export const REPORT_DETAIL_MAX = 500

// El servidor solo admite denunciar reseñas AJENAS, publicadas y CON TEXTO (una valoración solo con estrellas no tiene nada que denunciar).
export function isReviewReportable(r: Pick<RecipeReview, 'id' | 'review' | 'mine' | 'blockedByMe'>): boolean {
  return !r.blockedByMe && !r.mine && typeof r.id === 'string' && r.id !== '' && typeof r.review === 'string' && r.review.trim() !== ''
}

// Aviso para la autora cuya reseña ha ocultado la administración: sus estrellas siguen contando en la media.
export const MY_REVIEW_HIDDEN_TEXT = 'Tu reseña está oculta por moderación; las estrellas se conservan.'
