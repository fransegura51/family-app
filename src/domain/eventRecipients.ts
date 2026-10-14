// ¿Me corresponde a MÍ el aviso de este evento o tarea? Es el mismo reparto que hace el servidor (private.event_notification_recipients, migración 0261),
// para los avisos locales de la app abierta (ReminderWatcher): así el ajuste familiar «Todos / Solo asignados» no se contradice con lo que se ve en pantalla.
//
// Con el ajuste familiar SIN elegir (null) no se filtra nada aquí (se conserva exactamente lo que ya hacía la app abierta).

import type { TaskNotifyMode } from '@/domain/notificationPrefs'

export interface RecipientProfile {
  id: string
  role: string
  allowedSections: string[] | null
}

export interface RecipientMember {
  id: string
  linkedProfileId: string | null
  memberType: string
}

export interface RecipientEvent {
  visibility: 'shared' | 'private'
  memberIds: string[]
  notifyFamily?: boolean
}

function hasCalendarAccess(profile: RecipientProfile): boolean {
  return profile.allowedSections === null || profile.allowedSections.includes('calendario')
}

export function isEventRecipient(event: RecipientEvent, profile: RecipientProfile, members: RecipientMember[], mode: TaskNotifyMode): boolean {
  // Un evento privado solo lo ve (y se avisa de él a) quien lo creó: el servidor ya no deja verlo a nadie más.
  if (event.visibility === 'private') return true
  if (mode === null) return true

  if (mode === 'all' || (mode === 'assigned' && event.notifyFamily === true)) return hasCalendarAccess(profile)

  const assigned = members.filter((m) => event.memberIds.includes(m.id))
  if (assigned.some((m) => m.linkedProfileId === profile.id)) return true

  // Excepción: lo asignado es un menor sin cuenta → todos los adultos con cuenta.
  const minorWithoutAccount = assigned.some((m) => m.linkedProfileId === null && (m.memberType === 'child' || m.memberType === 'baby'))
  return minorWithoutAccount && (profile.role === 'admin' || profile.role === 'adult')
}
