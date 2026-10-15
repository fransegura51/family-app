// Comunidad PEPA — lógica pura de perfiles, ajustes de Comunidad, medallas y novedades (sin red, sin React).
// Las reglas de verdad las aplica el servidor; aquí viven los textos y los cálculos pequeños que las pantallas necesitan.
import type { FollowMode, MedalInfo, MedalsView, MyCommunityProfile, NewsBreakdownItem } from '@/domain/community'
import { COMMUNITY_SUGGESTION_MAX_HOURS, COMMUNITY_SUGGESTION_MIN_HOURS, isValidTime } from '@/domain/notificationPrefs'

// ---- Avatar: icono/emoji si lo hay; si no, iniciales del alias (nunca nombres reales: solo existe el alias)
export function avatarText(alias: string | null | undefined, emoji: string | null | undefined): string {
  if (emoji) return emoji
  const words = (alias ?? '').trim().split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = Array.from(words[0])[0] ?? '?'
  const second = words.length > 1 ? (Array.from(words[1])[0] ?? '') : ''
  return (first + second).toUpperCase()
}

// ---- Seguir personas: tres modos de aviso (el inteligente es el de por defecto)
export const FOLLOW_MODES: { id: FollowMode; label: string; help: string }[] = [
  { id: 'smart', label: 'Aviso inteligente', help: 'Te avisamos de lo nuevo de esta persona sin saturarte (es lo recomendado).' },
  { id: 'every', label: 'Cada publicación', help: 'Un aviso cada vez que publique algo.' },
  { id: 'off', label: 'Sin avisos', help: 'La sigues, pero sin avisos. Su contenido puede aparecer en «Para mí».' },
]

export const DEFAULT_FOLLOW_MODE: FollowMode = 'smart'

export function followModeLabel(mode: FollowMode): string {
  return FOLLOW_MODES.find((m) => m.id === mode)?.label ?? FOLLOW_MODES[0].label
}

// ---- Franja horaria de los avisos personales (COM-144)
export type PersonalMode = 'any' | 'window'

// El servidor admite franjas que cruzan la medianoche (22:00 → 07:00) pero NO una franja vacía (inicio = fin): no llegaría nunca ningún aviso.
export function isOvernightWindow(start: string, end: string): boolean {
  return isValidTime(start) && isValidTime(end) && start > end
}

export function validateWindow(start: string, end: string): string | null {
  if (!isValidTime(start) || !isValidTime(end)) return 'Elige una hora de inicio y una de fin.'
  if (start === end) return 'La hora de inicio y la de fin no pueden ser la misma: no te llegaría ningún aviso.'
  return null
}

// «A cualquier hora» o «De 08:00 a 21:00» (con «hasta el día siguiente» si cruza la medianoche).
export function windowSummary(mode: PersonalMode, start: string, end: string): string {
  if (mode === 'any') return 'A cualquier hora'
  if (validateWindow(start, end)) return 'Franja sin definir'
  return isOvernightWindow(start, end) ? `De ${start} a ${end} (del día siguiente)` : `De ${start} a ${end}`
}

// ---- Sugerencias de Comunidad: cada N horas (6-720)
export function parseSuggestionHours(raw: string): number | null {
  if (!/^\d{1,4}$/.test(raw.trim())) return null
  const n = Number(raw.trim())
  return n >= COMMUNITY_SUGGESTION_MIN_HOURS && n <= COMMUNITY_SUGGESTION_MAX_HOURS ? n : null
}

export function suggestionEveryLabel(hours: number): string {
  if (hours < 24) return `cada ${hours} horas`
  if (hours % 24 === 0) {
    const days = hours / 24
    return days === 1 ? 'cada día' : `cada ${days} días`
  }
  return `cada ${hours} horas (unos ${Math.round((hours / 24) * 10) / 10} días)`.replace('.', ',')
}

export const SUGGESTION_WINDOW_TEXT = 'Las sugerencias solo te llegan entre las 08:00 y las 21:00 de tu zona horaria, nunca de madrugada ni de golpe.'

// ---- Medallas
export const MEDAL_FAMILIES: { id: MedalInfo['family']; title: string; icon: string }[] = [
  { id: 'cocina', title: 'Cocina y recetas', icon: '🍲' },
  { id: 'participacion', title: 'Participación', icon: '💬' },
  { id: 'ayuda', title: 'Ayuda a la comunidad', icon: '🤝' },
]

export function groupMedals(medals: MedalInfo[]): { family: (typeof MEDAL_FAMILIES)[number]; medals: MedalInfo[] }[] {
  return MEDAL_FAMILIES.map((family) => ({ family, medals: medals.filter((m) => m.family === family.id) }))
}

// Solo las conseguidas (perfil público).
export function earnedMedals(view: MedalsView | null | undefined): MedalInfo[] {
  return (view?.medals ?? []).filter((m) => m.earned)
}

// «3 de 5» (nunca más que el total: el servidor puede devolver un número mayor que el objetivo si ya se superó).
export function medalProgressLabel(progress: [number, number] | null): string {
  if (!progress || progress[1] <= 0) return ''
  const [current, total] = progress
  return `${Math.max(0, Math.min(current, total))} de ${total}`
}

export function medalProgressPercent(progress: [number, number] | null): number {
  if (!progress || progress[1] <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((progress[0] / progress[1]) * 100)))
}

export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function medalStatusText(m: MedalInfo): string {
  if (m.earned) {
    const date = formatLongDate(m.awardedAt)
    return date ? `Conseguida el ${date}` : 'Conseguida'
  }
  const progress = medalProgressLabel(m.progress)
  return progress ? `Llevas ${progress}` : 'Aún por conseguir'
}

// ---- Nivel de constancia (COM-131): solo se enseña el nivel actual; sube y baja solo
export const CONSTANCY_LEVELS: { level: number; name: string; weeks: number }[] = [
  { level: 1, name: 'De vuelta por PEPA', weeks: 1 },
  { level: 2, name: 'Visitante habitual', weeks: 2 },
  { level: 3, name: 'Siempre por aquí', weeks: 3 },
  { level: 4, name: 'Colaborador habitual', weeks: 4 },
]

export const CONSTANCY_RULE_TEXT =
  'La constancia mira las últimas 4 semanas. Una semana cuenta como activa si has publicado, comentado o valorado una receta al menos una vez. ' +
  'No basta con abrir la aplicación y no hace falta participar días seguidos. Tu nivel sube o baja solo según cuántas de esas 4 semanas hayas estado activa.'

export function constancyText(c: MedalsView['constancy']): string {
  if (!c) return 'Ahora mismo no tienes nivel de constancia. Participa una vez (publicar, comentar o valorar una receta) y aparecerá.'
  const weeks = c.weeksActive === 1 ? '1 semana activa' : `${c.weeksActive} semanas activas`
  return `${c.name} · ${weeks} de las últimas 4`
}

// ---- Novedades (comentarios sin ver en conversaciones que sigo)
export function commentsLabel(n: number): string {
  return n === 1 ? '1 comentario nuevo' : `${n} comentarios nuevos`
}

export function newsSummary(items: NewsBreakdownItem[]): string {
  const total = items.reduce((sum, i) => sum + i.count, 0)
  if (items.length === 0) return ''
  const conv = items.length === 1 ? '1 conversación' : `${items.length} conversaciones`
  return `${commentsLabel(total)} en ${conv}`
}

// ---- Expulsión y readmisión: qué se le dice a la persona en «Mi perfil»
export type BanNotice = { tone: 'banned' | 'readmission' | 'requested' | 'rejected'; title: string; text: string; canRequest: boolean }

export function banNotice(me: MyCommunityProfile | null): BanNotice | null {
  if (!me || !me.banState || me.banState === 'ok') return null
  if (me.banState === 'banned') {
    const until = formatLongDate(me.banEndsAt)
    return {
      tone: 'banned',
      title: 'Tu acceso para participar está en pausa',
      text:
        `Puedes seguir leyendo${until ? `, y podrás participar de nuevo a partir del ${until}` : ''}. ` +
        'Tu cuenta de PEPA y los datos de tu familia no se ven afectados.',
      canRequest: false,
    }
  }
  if (me.readmissionStatus === 'requested') {
    return { tone: 'requested', title: 'Readmisión pedida', text: 'Tu solicitud está pendiente de revisión. Puedes seguir leyendo mientras tanto.', canRequest: false }
  }
  if (me.readmissionStatus === 'rejected') {
    return {
      tone: 'rejected',
      title: 'Readmisión no aprobada',
      text: 'La administración no ha aprobado todavía tu vuelta. Puedes seguir leyendo y, si quieres, volver a pedirla.',
      canRequest: true,
    }
  }
  return {
    tone: 'readmission',
    title: 'Ya puedes pedir volver a participar',
    text: 'Ha pasado el plazo de pausa. Para volver a publicar y comentar tienes que pedir la readmisión; la revisará la administración.',
    canRequest: true,
  }
}

// ---- Derecho de supresión: «Pedir que se elimine un contenido»
export type RemovalScope = 'all_my_content' | 'specific'

export type RemovalTargetKind = 'post' | 'comment'

export function validateRemovalRequest(scope: RemovalScope, targetId: string | null, detail: string, targetKind: RemovalTargetKind = 'post'): string | null {
  if (scope === 'specific' && !targetId) return targetKind === 'comment' ? 'Elige qué comentario quieres que se elimine.' : 'Elige qué publicación quieres que se elimine.'
  if (scope === 'specific' && detail.trim().length < 5) return 'Cuéntanos en pocas palabras por qué (mínimo 5 letras).'
  if (detail.length > 2000) return 'El detalle es demasiado largo (máximo 2000 caracteres).'
  return null
}

export const REMOVAL_SENT_TEXT = 'Solicitud enviada: está pendiente de revisión. La administración la revisará y, cuando la resuelva, te llegará un aviso en la campana de Inicio.'

// Estado PERSISTENTE de una solicitud (lo que guarda el servidor): pendiente, hecha o rechazada.
export type RemovalStatus = 'open' | 'done' | 'rejected'

export function removalStatusLabel(status: RemovalStatus): string {
  if (status === 'done') return 'Hecha'
  if (status === 'rejected') return 'Rechazada'
  return 'Pendiente de revisión'
}

// Qué pedí, en una frase: «Todo lo que he publicado», «Un comentario» o «Una publicación».
export function removalRequestTitle(r: { scope: RemovalScope; targetType: 'post' | 'comment' | null }): string {
  if (r.scope === 'all_my_content') return 'Todo lo que he publicado'
  return r.targetType === 'comment' ? 'Un comentario' : 'Una publicación'
}

// Texto de una opción del selector de comentarios: extracto corto y publicación donde está.
export function commentOptionLabel(c: { excerpt: string; postTitle: string | null }): string {
  const text = c.excerpt.replace(/\s+/g, ' ').trim()
  const short = text.length > 60 ? `${text.slice(0, 57)}…` : text || '(comentario con foto)'
  return c.postTitle ? `${short} — en «${c.postTitle.length > 40 ? `${c.postTitle.slice(0, 37)}…` : c.postTitle}»` : short
}
