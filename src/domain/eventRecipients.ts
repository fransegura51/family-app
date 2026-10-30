// ¿Me corresponde a MÍ el aviso de este evento o tarea? Es el mismo reparto que hace el servidor (private.event_notification_recipients, migración 0261),
// para los avisos locales de la app abierta (ReminderWatcher): así el ajuste familiar «Todos / Solo asignados» no se contradice con lo que se ve en pantalla.
//
// Con el ajuste familiar SIN elegir (null) no se filtra nada aquí (se conserva exactamente lo que ya hacía la app abierta).

import type { TaskNotifyMode } from '@/domain/notificationPrefs'

// NOT-03: los destinatarios de las TAREAS y de los EVENTOS se ajustan por separado. Sin elegir: tareas → solo asignados; eventos → toda la familia (igual que el servidor).
export interface NotifyModes {
  task: TaskNotifyMode
  event: TaskNotifyMode
}
export function resolveNotifyMode(kind: 'event' | 'task', raw: TaskNotifyMode): 'all' | 'assigned' {
  return raw ?? (kind === 'task' ? 'assigned' : 'all')
}

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
  kind?: 'event' | 'task'
}

function hasCalendarAccess(profile: RecipientProfile): boolean {
  return profile.allowedSections === null || profile.allowedSections.includes('calendario')
}

export function isEventRecipient(event: RecipientEvent, profile: RecipientProfile, members: RecipientMember[], modeOrModes: TaskNotifyMode | NotifyModes): boolean {
  // Un evento privado solo lo ve (y se avisa de él a) quien lo creó: el servidor ya no deja verlo a nadie más.
  if (event.visibility === 'private') return true
  // Con los dos ajustes (tareas y eventos) manda el del tipo de este elemento; con un solo valor se conserva lo de siempre (null = sin filtrar).
  const mode: TaskNotifyMode = modeOrModes !== null && typeof modeOrModes === 'object' ? resolveNotifyMode(event.kind === 'task' ? 'task' : 'event', event.kind === 'task' ? modeOrModes.task : modeOrModes.event) : modeOrModes
  if (mode === null) return true

  if (mode === 'all' || (mode === 'assigned' && event.notifyFamily === true)) return hasCalendarAccess(profile)

  const assigned = members.filter((m) => event.memberIds.includes(m.id))
  if (assigned.some((m) => m.linkedProfileId === profile.id)) return true

  // Excepción: lo asignado es un menor sin cuenta → todos los adultos con cuenta.
  const minorWithoutAccount = assigned.some((m) => m.linkedProfileId === null && (m.memberType === 'child' || m.memberType === 'baby'))
  return minorWithoutAccount && (profile.role === 'admin' || profile.role === 'adult')
}
