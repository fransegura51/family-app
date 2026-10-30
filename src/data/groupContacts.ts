import { supabase } from '@/data/supabaseClient'
import { fetchAllRows } from '@/data/paginate'
import { toParticipant } from '@/data/groups'
import { phoneKey, type Relation } from '@/domain/contactsModel'
import type { LinkedContactRow } from '@/domain/contactShare'
import type { Participant } from '@/domain/groups'
import type { KnownPerson } from '@/domain/participantMatch'
import { groupKnownPeople } from '@/domain/participantMatch'

// Contactos ↔ participantes de grupos (0354). Los permisos los hace cumplir el servidor (RLS y funciones): un responsable solo ve de la agenda los contactos vinculados a SU grupo.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Contactos familiares vinculados a los alumnos de UN grupo (por función de servidor: sirve también a un responsable de otro espacio). */
export async function listLinkedContacts(groupId: string): Promise<LinkedContactRow[]> {
  const { data, error } = await supabase.rpc('group_linked_contacts', { p_group: groupId })
  if (error) throw error
  return ((data ?? []) as any[]).map((r) => ({
    participantId: r.participant_id,
    contactId: r.contact_id,
    relation: r.relation as Relation,
    name: r.name,
    surname: r.surname ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    extraPhones: r.extra_phones ?? [],
    extraEmails: r.extra_emails ?? [],
  }))
}

export async function linkContactToParticipant(participantId: string, contactId: string, relation: Relation): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('group_participant_contacts')
    .upsert({ participant_id: participantId, contact_id: contactId, relation, created_by: u.user?.id }, { onConflict: 'participant_id,contact_id' })
  if (error) throw error
}
export async function unlinkContactFromParticipant(participantId: string, contactId: string): Promise<void> {
  const { error } = await supabase.from('group_participant_contacts').delete().eq('participant_id', participantId).eq('contact_id', contactId)
  if (error) throw error
}

/** Grupos y alumnos a los que está vinculado un contacto (para su ficha en Contactos). Solo salen los grupos de los que eres responsable. */
export interface ContactLinkInfo {
  participantId: string
  participantName: string
  groupId: string
  groupName: string
  relation: Relation
}
export async function listLinksOfContact(contactId: string): Promise<ContactLinkInfo[]> {
  const { data, error } = await supabase
    .from('group_participant_contacts')
    .select('participant_id, group_id, relation, group_participants(name, surname), groups(name)')
    .eq('contact_id', contactId)
  if (error) throw error
  return ((data ?? []) as any[]).map((r) => ({
    participantId: r.participant_id,
    participantName: [r.group_participants?.name, r.group_participants?.surname].filter(Boolean).join(' '),
    groupId: r.group_id,
    groupName: r.groups?.name ?? '',
    relation: r.relation as Relation,
  }))
}

// ------------------------------------------------------------------------------------------------------------- personas conocidas (otros grupos)
/** Todas las fichas de tus grupos (incluidas las de baja), agrupadas por identidad, con sus contactos familiares. */
export async function loadKnownPeople(): Promise<KnownPerson[]> {
  const [groups, parts, links] = await Promise.all([
    supabase.from('groups').select('id, name').limit(1000),
    fetchAllRows((from, to) =>
      supabase
        .from('group_participants')
        .select('id, group_id, name, surname, guardian_name, phone, email, payer_alias, notes, left_at, created_at, person_id')
        .order('id')
        .range(from, to),
    ),
    supabase.from('group_participant_contacts').select('participant_id, relation, contacts(name)').limit(20000),
  ])
  if (groups.error) throw groups.error
  if (links.error) throw links.error
  const names = new Map((groups.data ?? []).map((g) => [g.id as string, g.name as string]))
  const sheets = parts.map((r) => ({ participant: toParticipant(r), groupName: names.get(r.group_id as string) ?? 'Otro grupo' }))
  const linkRows = ((links.data ?? []) as any[]).flatMap((l) => (l.contacts?.name ? [{ participantId: l.participant_id as string, name: l.contacts.name as string, relation: l.relation as string }] : []))
  return groupKnownPeople(sheets, linkRows)
}

/**
 * Crea fichas REUTILIZANDO una identidad: comparten `person_id` con la ficha de origen (que se marca si aún no lo tenía) y copian sus datos personales. NO se traslada nada de
 * botes, pagos, permisos ni observaciones; los contactos familiares vinculados se vinculan también a la ficha nueva (son los mismos contactos de la agenda).
 */
export async function createReusedParticipants(
  groupId: string,
  items: { sourceId: string; sourcePersonId: string | null; data: { name: string; surname: string | null; guardianName: string | null; phone: string | null; email: string | null; personId: string } }[],
): Promise<string[]> {
  if (items.length === 0) return []
  // 1) Marca la identidad en las fichas de origen que aún no la tenían.
  const needMark = items.filter((i) => !i.sourcePersonId).map((i) => i.sourceId)
  for (let k = 0; k < needMark.length; k += 100) {
    const ids = needMark.slice(k, k + 100)
    for (const id of ids) {
      const { error } = await supabase.from('group_participants').update({ person_id: id }).eq('id', id).is('person_id', null)
      if (error) throw error
    }
  }
  // 2) Fichas nuevas con la misma identidad.
  const created: string[] = []
  for (let k = 0; k < items.length; k += 200) {
    const batch = items.slice(k, k + 200)
    const { data, error } = await supabase
      .from('group_participants')
      .insert(batch.map((i) => ({ group_id: groupId, name: i.data.name, surname: i.data.surname, guardian_name: i.data.guardianName, phone: i.data.phone, email: i.data.email, person_id: i.data.personId })))
      .select('id')
    if (error) throw error
    created.push(...(data ?? []).map((r) => r.id as string))
  }
  // 3) Los mismos contactos familiares de la ficha de origen, vinculados a la nueva.
  const { data: u } = await supabase.auth.getUser()
  const { data: srcLinks, error: le } = await supabase
    .from('group_participant_contacts')
    .select('participant_id, contact_id, relation')
    .in('participant_id', items.map((i) => i.sourceId))
  if (le) throw le
  const rows = (srcLinks ?? []).flatMap((l) => {
    const idx = items.findIndex((i) => i.sourceId === l.participant_id)
    return idx >= 0 && created[idx] ? [{ participant_id: created[idx], contact_id: l.contact_id, relation: l.relation, created_by: u.user?.id }] : []
  })
  if (rows.length > 0) {
    // Solo los contactos de MI agenda se pueden vincular (la política lo exige); los demás se ignoran sin romper la importación.
    for (const r of rows) await supabase.from('group_participant_contacts').upsert(r, { onConflict: 'participant_id,contact_id' })
  }
  return created
}

// ------------------------------------------------------------------------------------------------------------- pendientes de identificar (WhatsApp)
export interface PendingContact {
  id: string
  groupId: string
  whatsappName: string | null
  phone: string | null
  guardianHint: string | null
  studentHint: string | null
  status: 'pendiente' | 'vinculado' | 'descartado'
  contactId: string | null
  createdAt: string
}
const toPending = (r: any): PendingContact => ({
  id: r.id,
  groupId: r.group_id,
  whatsappName: r.whatsapp_name,
  phone: r.phone,
  guardianHint: r.guardian_hint,
  studentHint: r.student_hint,
  status: r.status,
  contactId: r.contact_id,
  createdAt: r.created_at,
})

export async function listPendingContacts(groupId: string): Promise<PendingContact[]> {
  const { data, error } = await supabase.from('group_pending_contacts').select('*').eq('group_id', groupId).neq('status', 'descartado').order('created_at', { ascending: false }).limit(1000)
  if (error) throw error
  return (data ?? []).map(toPending)
}

export async function addPendingContacts(groupId: string, rows: { whatsappName: string | null; phone: string | null; guardianHint: string | null; studentHint: string | null }[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase.from('group_pending_contacts').insert(
    rows.map((r) => ({ group_id: groupId, whatsapp_name: r.whatsappName, phone: r.phone, guardian_hint: r.guardianHint, student_hint: r.studentHint, source: { kind: 'whatsapp', at: new Date().toISOString() } })),
  )
  if (error) throw error
}

/** Marca un pendiente como vinculado a un contacto de la agenda (o como descartado). Nunca borra el nombre original de WhatsApp. */
export async function resolvePending(id: string, status: 'vinculado' | 'descartado', contactId: string | null): Promise<void> {
  const { error } = await supabase.from('group_pending_contacts').update({ status, contact_id: contactId }).eq('id', id)
  if (error) throw error
}

export const pendingPhoneKeys = (list: PendingContact[]): Set<string> => new Set(list.map((p) => phoneKey(p.phone)).filter((k): k is string => !!k))

export type { Participant }

/** Deja de compartir la identidad: la ficha conserva sus datos de ahora, pero ya no se sincroniza con las demás. */
export async function unlinkParticipantPerson(participantId: string): Promise<void> {
  const { error } = await supabase.from('group_participants').update({ person_id: null }).eq('id', participantId)
  if (error) throw error
}
