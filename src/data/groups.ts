import { supabase } from '@/data/supabaseClient'
import { fetchAllRows } from '@/data/paginate'
import { errorMessage } from '@/domain/errorMessage'
import type { GroupFolder, GroupItem, Participant } from '@/domain/groups'

// Gestión de grupos (migraciones 0349–0352). Los permisos los hace cumplir el servidor (RLS): aquí solo se pide y se pinta lo que llega.

/* eslint-disable @typescript-eslint/no-explicit-any */
const toGroup = (r: any, folderId: string | null): GroupItem => ({
  id: r.id,
  familyId: r.family_id,
  name: r.name,
  periodLabel: r.period_label,
  createdBy: r.created_by,
  archivedAt: r.archived_at,
  copiedFrom: r.copied_from ?? null,
  createdAt: r.created_at,
  folderId,
  nameFormat: r.name_format ?? 'full',
  sortBy: r.sort_by ?? 'name',
  contactSharePresets: Array.isArray(r.contact_share_presets) ? r.contact_share_presets : [],
})
const toFolder = (r: any): GroupFolder => ({ id: r.id, name: r.name, sortOrder: Number(r.sort_order) })
export const toParticipant = (r: any): Participant => ({
  id: r.id,
  groupId: r.group_id,
  name: r.name,
  surname: r.surname,
  guardianName: r.guardian_name,
  phone: r.phone,
  email: r.email,
  payerAlias: r.payer_alias,
  notes: r.notes,
  leftAt: r.left_at,
  createdAt: r.created_at,
  personId: r.person_id ?? null,
})
/* eslint-enable @typescript-eslint/no-explicit-any */

const GROUP_COLS = 'id, family_id, name, period_label, created_by, archived_at, copied_from, created_at, name_format, sort_by, contact_share_presets'
const PARTICIPANT_COLS = 'id, group_id, name, surname, guardian_name, phone, email, payer_alias, notes, left_at, created_at, person_id'

/** Mensajes comprensibles para los códigos que devuelve el servidor. */
export function groupsErrorMessage(err: unknown, fallback = 'No se ha podido completar la operación.'): string {
  const raw = errorMessage(err, fallback)
  const map: [RegExp, string][] = [
    [/INSUFFICIENT_BALANCE/, 'El bote no tiene saldo suficiente para ese traspaso.'],
    [/HISTORY_READONLY|FUND_IMMUTABLE/, 'Este historial es de solo lectura: no se puede modificar.'],
    [/DECLARATION_REQUIRED/, 'Marca la casilla que confirma que puedes compartir estos datos.'],
    [/INVALID_CODE/, 'Ese código no existe, ya se usó o ha caducado.'],
    [/TOO_MANY_ATTEMPTS/, 'Demasiados intentos. Espera un rato y vuelve a probar.'],
    [/SELF_INVITE/, 'Este código lo has creado tú: dáselo a la persona que va a ser responsable.'],
    [/ALREADY_MANAGER/, 'Ya eres responsable de este grupo.'],
    [/SELF_TRANSFER/, 'Este código lo has creado tú: dáselo a la persona que va a recibir el grupo.'],
    [/TOO_MANY_PENDING/, 'Ya hay demasiados códigos pendientes de este grupo. Cancela alguno.'],
    [/ALLOCATION_EXCEEDS_AMOUNT/, 'El reparto no puede superar el importe de la aportación.'],
    [/VOID_REASON_REQUIRED/, 'Indica el motivo para anular el apunte.'],
    [/ENTRY_VOIDED/, 'Un apunte anulado no se puede modificar.'],
    [/BANK_TRANSACTION_NOT_VISIBLE/, 'Ese movimiento bancario no está disponible para ti.'],
    [/bank_transaction_id/, 'Ese movimiento bancario ya está asignado a otro apunte.'],
    [/violates foreign key constraint.*participant|participant_id/, 'Esta persona tiene historial en algún bote: no se puede borrar, solo darla de baja.'],
    [/violates foreign key constraint.*group_funds|group_funds/, 'Este grupo tiene botes: no se puede borrar, solo archivar.'],
    [/NOT_AUTHORIZED|row-level security|permission denied/, 'No tienes permiso para hacer esto en este grupo.'],
    [/uq_group_funds_origin/, 'Ese historial ya está en este espacio.'],
    [/duplicate key value.*group_managers/, 'Esa persona ya es responsable.'],
  ]
  for (const [re, msg] of map) if (re.test(raw)) return msg
  return raw
}

// ------------------------------------------------------------------------------------------------------------- pantalla principal
export interface GroupsHomeData {
  groups: GroupItem[]
  folders: GroupFolder[]
  participantCounts: Record<string, number>
  userId: string
}

export async function loadGroupsHome(): Promise<GroupsHomeData> {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) throw new Error('No autenticado')
  const [groups, placements, folders, parts] = await Promise.all([
    supabase.from('groups').select(GROUP_COLS).order('created_at', { ascending: false }).limit(1000),
    supabase.from('group_placements').select('group_id, folder_id').limit(5000),
    supabase.from('group_folders').select('id, name, sort_order').order('sort_order').limit(500),
    fetchAllRows((from, to) => supabase.from('group_participants').select('id, group_id').is('left_at', null).order('id').range(from, to)),
  ])
  if (groups.error) throw groups.error
  if (placements.error) throw placements.error
  if (folders.error) throw folders.error
  const place = new Map((placements.data ?? []).map((p) => [p.group_id as string, (p.folder_id as string | null) ?? null]))
  const counts: Record<string, number> = {}
  for (const p of parts) counts[p.group_id as string] = (counts[p.group_id as string] ?? 0) + 1
  return {
    groups: (groups.data ?? []).map((g) => toGroup(g, place.get(g.id as string) ?? null)),
    folders: (folders.data ?? []).map(toFolder),
    participantCounts: counts,
    userId: u.user.id,
  }
}

export async function createGroup(name: string, folderId: string | null, periodLabel: string | null = null): Promise<string> {
  const { data, error } = await supabase.from('groups').insert({ name: name.trim(), period_label: periodLabel }).select('id').single()
  if (error) throw error
  if (folderId) await moveGroupToFolder(data.id as string, folderId)
  return data.id as string
}

export async function updateGroup(
  id: string,
  patch: { name?: string; periodLabel?: string | null; archived?: boolean; nameFormat?: GroupItem['nameFormat']; sortBy?: GroupItem['sortBy']; contactSharePresets?: unknown[] },
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.nameFormat !== undefined) row.name_format = patch.nameFormat
  if (patch.sortBy !== undefined) row.sort_by = patch.sortBy
  if (patch.contactSharePresets !== undefined) row.contact_share_presets = patch.contactSharePresets
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.periodLabel !== undefined) row.period_label = patch.periodLabel
  if (patch.archived !== undefined) row.archived_at = patch.archived ? new Date().toISOString() : null
  const { error } = await supabase.from('groups').update(row).eq('id', id)
  if (error) throw error
}

/** Solo si el grupo no tiene botes (si los tiene, el servidor lo impide y hay que archivarlo). */
export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------------------------------------------------------- carpetas (personales)
export async function createFolder(name: string): Promise<string> {
  const { data, error } = await supabase.from('group_folders').insert({ name: name.trim(), sort_order: Date.now() }).select('id').single()
  if (error) throw error
  return data.id as string
}
export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('group_folders').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}
/** Borrar una carpeta NUNCA borra grupos: sus colocaciones quedan sin carpeta (y se ven sueltos). */
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from('group_folders').delete().eq('id', id)
  if (error) throw error
}
export async function moveGroupToFolder(groupId: string, folderId: string | null): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) throw new Error('No autenticado')
  const { error } = await supabase.from('group_placements').upsert({ user_id: u.user.id, group_id: groupId, folder_id: folderId }, { onConflict: 'user_id,group_id' })
  if (error) throw error
}

// ------------------------------------------------------------------------------------------------------------- un grupo
export async function loadGroup(id: string): Promise<GroupItem | null> {
  const { data, error } = await supabase.from('groups').select(GROUP_COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toGroup(data, null) : null
}

export interface Manager {
  userId: string
  name: string
  isCreator: boolean
}

export async function listManagers(group: GroupItem): Promise<Manager[]> {
  // Por función de servidor: un responsable de OTRO espacio no se ve en la tabla de perfiles de este.
  const { data, error } = await supabase.rpc('group_manager_names', { p_group: group.id })
  if (error) throw error
  return ((data ?? []) as { user_id: string; display_name: string }[]).map((r) => ({ userId: r.user_id, name: r.display_name, isCreator: r.user_id === group.createdBy }))
}

// ------------------------------------------------------------------------------------------------------------- invitar a un responsable con código (0355)
export interface ManagerInvitePreview {
  groupName: string
  fromName: string
  participants: number
  funds: number
  alreadyManager: boolean
}
export interface PendingInvite {
  id: string
  code: string
  expiresAt: string
}
export async function createManagerInvite(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_group_manager_invite', { p_group: groupId })
  if (error) throw error
  return data as string
}
export async function listManagerInvites(groupId: string): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from('group_manager_invites')
    .select('id, code, expires_at')
    .eq('group_id', groupId)
    .eq('status', 'pendiente')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id as string, code: r.code as string, expiresAt: r.expires_at as string }))
}
export async function revokeManagerInvite(id: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_group_manager_invite', { p_id: id })
  if (error) throw error
}
export async function previewManagerInvite(code: string): Promise<ManagerInvitePreview> {
  const { data, error } = await supabase.rpc('preview_group_manager_invite', { p_code: code })
  if (error) throw error
  return data as ManagerInvitePreview
}
export async function acceptManagerInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_group_manager_invite', { p_code: code })
  if (error) throw error
  return (data as { groupId: string }).groupId
}

/** Personas del mismo espacio que aún no son responsables. */
export async function listManagerCandidates(group: GroupItem): Promise<{ userId: string; name: string }[]> {
  const [{ data: profiles, error }, { data: current, error: ce }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, role').eq('family_id', group.familyId).in('role', ['admin', 'adult', 'child']),
    supabase.from('group_managers').select('user_id').eq('group_id', group.id),
  ])
  if (error) throw error
  if (ce) throw ce
  const have = new Set((current ?? []).map((r) => r.user_id as string))
  return (profiles ?? []).filter((p) => !have.has(p.id as string)).map((p) => ({ userId: p.id as string, name: (p.display_name as string) || 'Sin nombre' }))
}

export async function addManager(groupId: string, userId: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('group_managers').insert({ group_id: groupId, user_id: userId, added_by: u.user?.id })
  if (error) throw error
}
export async function removeManager(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('group_managers').delete().eq('group_id', groupId).eq('user_id', userId)
  if (error) throw error
}

// ------------------------------------------------------------------------------------------------------------- participantes
export async function listParticipants(groupId: string): Promise<Participant[]> {
  const rows = await fetchAllRows((from, to) => supabase.from('group_participants').select(PARTICIPANT_COLS).eq('group_id', groupId).order('name').order('id').range(from, to))
  return rows.map(toParticipant)
}

export interface ParticipantInput {
  name: string
  surname?: string | null
  guardianName?: string | null
  phone?: string | null
  email?: string | null
  payerAlias?: string | null
  notes?: string | null
}
const clean = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)
const toRow = (i: ParticipantInput) => ({
  name: i.name.trim(),
  surname: clean(i.surname),
  guardian_name: clean(i.guardianName),
  phone: clean(i.phone),
  email: clean(i.email),
  payer_alias: clean(i.payerAlias),
  notes: clean(i.notes),
})

export async function addParticipant(groupId: string, input: ParticipantInput): Promise<string> {
  const { data, error } = await supabase.from('group_participants').insert({ group_id: groupId, ...toRow(input) }).select('id').single()
  if (error) throw error
  return data.id as string
}

/** Alta masiva (importación). Devuelve los identificadores creados. */
export async function addParticipants(groupId: string, inputs: ParticipantInput[]): Promise<string[]> {
  if (inputs.length === 0) return []
  const out: string[] = []
  for (let i = 0; i < inputs.length; i += 200) {
    const { data, error } = await supabase.from('group_participants').insert(inputs.slice(i, i + 200).map((x) => ({ group_id: groupId, ...toRow(x) }))).select('id')
    if (error) throw error
    out.push(...(data ?? []).map((r) => r.id as string))
  }
  return out
}

export async function updateParticipant(id: string, input: Partial<ParticipantInput>): Promise<void> {
  const row: Record<string, unknown> = {}
  if (input.name !== undefined) row.name = input.name.trim()
  if (input.surname !== undefined) row.surname = clean(input.surname)
  if (input.guardianName !== undefined) row.guardian_name = clean(input.guardianName)
  if (input.phone !== undefined) row.phone = clean(input.phone)
  if (input.email !== undefined) row.email = clean(input.email)
  if (input.payerAlias !== undefined) row.payer_alias = clean(input.payerAlias)
  if (input.notes !== undefined) row.notes = clean(input.notes)
  const { error } = await supabase.from('group_participants').update(row).eq('id', id)
  if (error) throw error
}

/** Dar de baja (o reactivar): conserva el historial económico. */
export async function setParticipantLeft(id: string, left: boolean): Promise<void> {
  const { error } = await supabase.from('group_participants').update({ left_at: left ? new Date().toISOString() : null }).eq('id', id)
  if (error) throw error
}

/** Borrado real: el servidor lo rechaza si la persona figura en algún bote (entonces solo se da de baja). */
export async function deleteParticipant(id: string): Promise<void> {
  const { error } = await supabase.from('group_participants').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------------------------------------------------------- vínculos
export interface LinkedItem {
  id: string
  title: string
}

export async function listGroupLists(groupId: string): Promise<LinkedItem[]> {
  const { data, error } = await supabase.from('group_list_links').select('list_id, user_lists(id, title)').eq('group_id', groupId)
  if (error) throw error
  return (data as unknown as { user_lists: { id: string; title: string } | null }[]).flatMap((r) => (r.user_lists ? [{ id: r.user_lists.id, title: r.user_lists.title }] : []))
}
export async function linkListToGroup(groupId: string, listId: string): Promise<void> {
  const { error } = await supabase.from('group_list_links').upsert({ group_id: groupId, list_id: listId }, { onConflict: 'group_id,list_id', ignoreDuplicates: true })
  if (error) throw error
}
export async function unlinkListFromGroup(groupId: string, listId: string): Promise<void> {
  const { error } = await supabase.from('group_list_links').delete().eq('group_id', groupId).eq('list_id', listId)
  if (error) throw error
}

export async function listGroupEvents(groupId: string): Promise<LinkedItem[]> {
  const { data, error } = await supabase.from('group_event_links').select('event_id, events(id, title)').eq('group_id', groupId)
  if (error) throw error
  return (data as unknown as { events: { id: string; title: string } | null }[]).flatMap((r) => (r.events ? [{ id: r.events.id, title: r.events.title }] : []))
}
export async function linkEventToGroup(groupId: string, eventId: string): Promise<void> {
  const { error } = await supabase.from('group_event_links').upsert({ group_id: groupId, event_id: eventId }, { onConflict: 'group_id,event_id', ignoreDuplicates: true })
  if (error) throw error
}
export async function unlinkEventFromGroup(groupId: string, eventId: string): Promise<void> {
  const { error } = await supabase.from('group_event_links').delete().eq('group_id', groupId).eq('event_id', eventId)
  if (error) throw error
}
/** Grupos enlazados a un evento (para mostrarlos desde Eventos). */
export async function groupsLinkedToEvent(eventId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('group_event_links').select('group_id, groups(id, name)').eq('event_id', eventId)
  if (error) throw error
  return (data as unknown as { groups: { id: string; name: string } | null }[]).flatMap((r) => (r.groups ? [r.groups] : []))
}

// ------------------------------------------------------------------------------------------------------------- copia a otra persona
export interface TransferPreview {
  groupName: string
  fromName: string
  mode: 'participantes' | 'historial'
  includeContacts: boolean
  participants: number
  funds: number
}
export interface TransferResult {
  groupId: string
  participants: number
  funds: number
  skippedFunds: number
}
export interface PendingTransfer {
  id: string
  code: string
  mode: 'participantes' | 'historial'
  includeContacts: boolean
  status: 'pendiente' | 'aceptada' | 'cancelada'
  expiresAt: string
  createdAt: string
}

export async function createGroupTransfer(groupId: string, mode: 'participantes' | 'historial', includeContacts: boolean, declared: boolean): Promise<string> {
  const { data, error } = await supabase.rpc('create_group_transfer', { p_group: groupId, p_mode: mode, p_include_contacts: includeContacts, p_declared: declared })
  if (error) throw error
  return data as string
}
export async function listGroupTransfers(groupId: string): Promise<PendingTransfer[]> {
  const { data, error } = await supabase
    .from('group_transfers')
    .select('id, code, mode, include_contacts, status, expires_at, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, code: r.code, mode: r.mode, includeContacts: r.include_contacts, status: r.status, expiresAt: r.expires_at, createdAt: r.created_at }))
}
export async function cancelGroupTransfer(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_group_transfer', { p_id: id })
  if (error) throw error
}
export async function previewGroupTransfer(code: string): Promise<TransferPreview> {
  const { data, error } = await supabase.rpc('preview_group_transfer', { p_code: code })
  if (error) throw error
  return data as TransferPreview
}
export async function acceptGroupTransfer(code: string): Promise<TransferResult> {
  const { data, error } = await supabase.rpc('accept_group_transfer', { p_code: code })
  if (error) throw error
  return data as TransferResult
}

// ------------------------------------------------------------------------------------------------------------- registro de operaciones
export interface AuditEntry {
  id: number
  actorName: string
  action: string
  entity: string
  detail: Record<string, unknown> | null
  at: string
}
export async function listAudit(groupId: string, limit = 60): Promise<AuditEntry[]> {
  const { data, error } = await supabase.from('group_audit').select('id, actor_id, action, entity, detail, at').eq('group_id', groupId).order('at', { ascending: false }).limit(limit)
  if (error) throw error
  const ids = [...new Set((data ?? []).map((r) => r.actor_id as string | null).filter((x): x is string => !!x))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: ps } = await supabase.from('profiles').select('id, display_name').in('id', ids)
    for (const p of ps ?? []) names.set(p.id as string, (p.display_name as string) || 'Sin nombre')
  }
  return (data ?? []).map((r) => ({ id: Number(r.id), actorName: r.actor_id ? names.get(r.actor_id as string) ?? 'Otra persona' : 'Sistema', action: r.action, entity: r.entity, detail: r.detail, at: r.at }))
}
