// Preparativos: quién aparece como responsable de una tarea, en texto. Pura: la usan la tarjeta y el editor, así que
// nunca hay dos reglas distintas. Los colores del calendario NO pasan por aquí (solo son de miembros familiares).
import type { EventTask, EventTaskHelper, FamilyMember } from '@/domain/types'

export function describeHelper(h: Pick<EventTaskHelper, 'name' | 'label'>): string {
  return h.label ? `${h.name} · ${h.label}` : h.name
}

// Familiares (en el orden de la familia) + personas externas activas + referencias históricas («ya no está en el
// evento»). Sin responsables → lista vacía (nunca se inventa «Sin asignar» como persona).
export function taskResponsibleNames(task: EventTask, familyMembers: FamilyMember[]): string[] {
  const ids = task.responsibleMemberIds && task.responsibleMemberIds.length > 0 ? task.responsibleMemberIds : task.assignedMemberId ? [task.assignedMemberId] : []
  const family = familyMembers.filter((m) => ids.includes(m.id)).map((m) => m.name)
  const helpers = (task.helpers ?? []).map(describeHelper)
  return [...family, ...helpers]
}

export const PRIORITY_LABELS: Record<'alta' | 'media' | 'baja', string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }
