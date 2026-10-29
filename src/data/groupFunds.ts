import { supabase } from '@/data/supabaseClient'
import { fetchAllRows } from '@/data/paginate'
import { compressImageFile } from '@/domain/imageCompression'
import type { ContributionType, EntryKind, FundEntry, FundItem, MemberState } from '@/domain/groupFunds'

// Botes compartidos de un grupo (migraciones 0350 y 0352). Los importes NO se guardan: se calculan siempre desde los apuntes (src/domain/groupFunds.ts).

/* eslint-disable @typescript-eslint/no-explicit-any */
export const toFund = (r: any): FundItem => ({
  id: r.id,
  groupId: r.group_id,
  name: r.name,
  contributionType: r.contribution_type,
  defaultAmount: r.default_amount === null ? null : Number(r.default_amount),
  status: r.status,
  closedAt: r.closed_at,
  closeNote: r.close_note,
  leftoverAmount: r.leftover_amount === null ? null : Number(r.leftover_amount),
  leftoverDestination: r.leftover_destination,
  reopenedCount: Number(r.reopened_count ?? 0),
  readonlyHistory: !!r.readonly_history,
  history: r.history ?? null,
  createdAt: r.created_at,
})
export const toEntry = (r: any): FundEntry => ({
  id: r.id,
  fundId: r.fund_id,
  kind: r.kind,
  amount: Number(r.amount),
  entryDate: r.entry_date,
  payerLabel: r.payer_label,
  method: r.method,
  concept: r.concept,
  receiptPath: r.receipt_path,
  hadReceipt: !!r.had_receipt,
  bankTransactionId: r.bank_transaction_id,
  transferId: r.transfer_id,
  counterpartFundId: r.counterpart_fund_id,
  voidedAt: r.voided_at,
  voidReason: r.void_reason,
  createdAt: r.created_at,
})
/* eslint-enable @typescript-eslint/no-explicit-any */

const FUND_COLS = 'id, group_id, name, contribution_type, default_amount, status, closed_at, close_note, leftover_amount, leftover_destination, reopened_count, readonly_history, history, created_at'
const ENTRY_COLS = 'id, fund_id, kind, amount, entry_date, payer_label, method, concept, receipt_path, had_receipt, bank_transaction_id, transfer_id, counterpart_fund_id, voided_at, void_reason, created_at'

export async function listFunds(groupId: string): Promise<FundItem[]> {
  const { data, error } = await supabase.from('group_funds').select(FUND_COLS).eq('group_id', groupId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toFund)
}

/** Botes abiertos de todos los grupos que gestiona esta persona (para traspasos y para la lista de «Botes»). */
export async function listOpenFundsAcrossGroups(): Promise<(FundItem & { groupName: string })[]> {
  const { data, error } = await supabase.from('group_funds').select(`${FUND_COLS}, groups(name)`).eq('status', 'abierto').eq('readonly_history', false).order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as (Record<string, unknown> & { groups: { name: string } | null })[]).map((r) => ({ ...toFund(r), groupName: r.groups?.name ?? '' }))
}

export interface FundMemberRow {
  participantId: string
  state: MemberState
  requiredAmount: number | null
}
export interface AllocationRow {
  entryId: string
  participantId: string
  amount: number
}
export interface FundDetail {
  fund: FundItem
  members: FundMemberRow[]
  entries: FundEntry[]
  allocations: AllocationRow[]
  /** Avisos «Ya he pagado» pendientes de verificar. */
  notices: { id: string; participantId: string; note: string | null; createdAt: string; status: 'pendiente' | 'revisado' }[]
}

export async function loadFund(fundId: string): Promise<FundDetail | null> {
  const { data: f, error } = await supabase.from('group_funds').select(FUND_COLS).eq('id', fundId).maybeSingle()
  if (error) throw error
  if (!f) return null
  const [members, entries, notices] = await Promise.all([
    fetchAllRows((from, to) => supabase.from('fund_members').select('participant_id, state, required_amount').eq('fund_id', fundId).order('participant_id').range(from, to)),
    fetchAllRows((from, to) => supabase.from('fund_entries').select(ENTRY_COLS).eq('fund_id', fundId).order('entry_date', { ascending: false }).order('id').range(from, to)),
    supabase.from('fund_payment_notices').select('id, participant_id, note, created_at, status').eq('fund_id', fundId).order('created_at', { ascending: false }).limit(200),
  ])
  if (notices.error) throw notices.error
  const ids = entries.map((e) => e.id as string)
  const allocations: AllocationRow[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: ae } = await supabase.from('fund_entry_allocations').select('entry_id, participant_id, amount').in('entry_id', ids.slice(i, i + 200))
    if (ae) throw ae
    for (const a of data ?? []) allocations.push({ entryId: a.entry_id as string, participantId: a.participant_id as string, amount: Number(a.amount) })
  }
  return {
    fund: toFund(f),
    members: members.map((m) => ({ participantId: m.participant_id as string, state: m.state as MemberState, requiredAmount: m.required_amount === null ? null : Number(m.required_amount) })),
    entries: entries.map(toEntry),
    allocations,
    notices: (notices.data ?? []).map((n) => ({ id: n.id, participantId: n.participant_id, note: n.note, createdAt: n.created_at, status: n.status })),
  }
}

export async function createFund(groupId: string, name: string, type: ContributionType, amount: number | null): Promise<string> {
  const { data, error } = await supabase.rpc('create_group_fund', { p_group: groupId, p_name: name, p_type: type, p_amount: amount })
  if (error) throw error
  return data as string
}

export async function updateFund(id: string, patch: { name?: string; contributionType?: ContributionType; defaultAmount?: number | null }): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.contributionType !== undefined) row.contribution_type = patch.contributionType
  if (patch.defaultAmount !== undefined) row.default_amount = patch.defaultAmount
  const { error } = await supabase.from('group_funds').update(row).eq('id', id)
  if (error) throw error
}

export async function deleteEmptyFund(id: string): Promise<void> {
  const { error } = await supabase.from('group_funds').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------------------------------------------------------- participación en ESTE bote
export async function setMembersState(fundId: string, participantIds: string[], state: MemberState): Promise<void> {
  if (participantIds.length === 0) return
  for (let i = 0; i < participantIds.length; i += 200) {
    const { error } = await supabase.from('fund_members').update({ state }).eq('fund_id', fundId).in('participant_id', participantIds.slice(i, i + 200))
    if (error) throw error
  }
}
export async function setMemberRequired(fundId: string, participantId: string, amount: number | null): Promise<void> {
  const { error } = await supabase.from('fund_members').update({ required_amount: amount }).eq('fund_id', fundId).eq('participant_id', participantId)
  if (error) throw error
}
/** Incorporar a este bote a participantes que no estaban (por ejemplo, los dados de alta después). */
export async function addMembers(fundId: string, participantIds: string[]): Promise<void> {
  if (participantIds.length === 0) return
  const { error } = await supabase.from('fund_members').upsert(participantIds.map((id) => ({ fund_id: fundId, participant_id: id, state: 'participa' })), { onConflict: 'fund_id,participant_id', ignoreDuplicates: true })
  if (error) throw error
}
export async function removeMember(fundId: string, participantId: string): Promise<void> {
  const { error } = await supabase.from('fund_members').delete().eq('fund_id', fundId).eq('participant_id', participantId)
  if (error) throw error
}

// ------------------------------------------------------------------------------------------------------------- apuntes
export interface NewEntry {
  fundId: string
  kind: Exclude<EntryKind, 'traspaso_in' | 'traspaso_out'>
  amount: number
  entryDate: string
  payerLabel?: string | null
  method?: 'efectivo' | 'bizum' | 'transferencia' | 'tarjeta' | 'otro' | null
  concept?: string | null
  receiptPath?: string | null
  bankTransactionId?: string | null
  allocations?: { participantId: string; amount: number }[]
}

export async function addEntry(e: NewEntry): Promise<string> {
  const { data, error } = await supabase.rpc('add_fund_entry', {
    p_fund: e.fundId,
    p_kind: e.kind,
    p_amount: e.amount,
    p_date: e.entryDate,
    p_payer: e.payerLabel ?? null,
    p_method: e.method ?? null,
    p_concept: e.concept ?? null,
    p_receipt: e.receiptPath ?? null,
    p_bank_tx: e.bankTransactionId ?? null,
    p_allocs: (e.allocations ?? []).filter((a) => a.amount > 0).map((a) => ({ participant_id: a.participantId, amount: a.amount })),
  })
  if (error) throw error
  return data as string
}

export async function updateEntry(id: string, patch: { amount?: number; entryDate?: string; payerLabel?: string | null; method?: NewEntry['method']; concept?: string | null; receiptPath?: string | null }): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.amount !== undefined) row.amount = patch.amount
  if (patch.entryDate !== undefined) row.entry_date = patch.entryDate
  if (patch.payerLabel !== undefined) row.payer_label = patch.payerLabel && patch.payerLabel.trim() ? patch.payerLabel.trim() : null
  if (patch.method !== undefined) row.method = patch.method
  if (patch.concept !== undefined) row.concept = patch.concept && patch.concept.trim() ? patch.concept.trim() : null
  if (patch.receiptPath !== undefined) row.receipt_path = patch.receiptPath
  const { error } = await supabase.from('fund_entries').update(row).eq('id', id)
  if (error) throw error
}

/** Anular (no borrar): el apunte queda en el historial con su motivo y deja de contar. */
export async function voidEntry(id: string, reason: string): Promise<void> {
  const { error } = await supabase.from('fund_entries').update({ voided_at: new Date().toISOString(), void_reason: reason.trim() }).eq('id', id)
  if (error) throw error
}

export async function setAllocations(entryId: string, allocations: { participantId: string; amount: number }[]): Promise<void> {
  const { error } = await supabase.rpc('set_entry_allocations', { p_entry: entryId, p_allocs: allocations.filter((a) => a.amount > 0).map((a) => ({ participant_id: a.participantId, amount: a.amount })) })
  if (error) throw error
}

// ------------------------------------------------------------------------------------------------------------- cierre, reapertura, traspasos
export async function transferBetweenFunds(from: string, to: string, amount: number, note: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_between_funds', { p_from: from, p_to: to, p_amount: amount, p_note: note })
  if (error) throw error
}
export async function closeFund(fundId: string, option: 'traspaso' | 'devolucion' | 'archivado', targetFundId: string | null, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('close_group_fund', { p_fund: fundId, p_option: option, p_target: targetFundId, p_note: note })
  if (error) throw error
  return Number(data)
}
export async function reopenFund(fundId: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_group_fund', { p_fund: fundId })
  if (error) throw error
}

// ------------------------------------------------------------------------------------------------------------- justificantes
const RECEIPTS_BUCKET = 'group-receipts'

/** Sube un justificante (imagen o PDF) a la carpeta del grupo y devuelve su ruta. */
export async function uploadFundReceipt(groupId: string, file: File): Promise<string> {
  const isImage = file.type.startsWith('image/')
  const body = isImage ? await compressImageFile(file) : file
  const ext = isImage ? 'jpg' : file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
  const path = `${groupId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, body, { contentType: isImage ? 'image/jpeg' : file.type || 'application/pdf', upsert: false })
  if (error) throw error
  return path
}
export async function getFundReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

// ------------------------------------------------------------------------------------------------------------- movimientos bancarios (opcional)
export interface IncomingBankTx {
  id: string
  date: string
  amount: number
  description: string | null
}
/** Ingresos bancarios recientes de ESTA persona (la RLS de su cuenta manda) que aún no están asignados a ningún apunte de bote. */
export async function listIncomingBankTx(days = 120): Promise<IncomingBankTx[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('bank_transactions')
    .select('id, transaction_date, amount, description')
    .eq('credit_debit', 'CRDT')
    .gte('transaction_date', since)
    .order('transaction_date', { ascending: false })
    .limit(300)
  if (error) throw error
  const ids = (data ?? []).map((r) => r.id as string)
  const taken = new Set<string>()
  if (ids.length) {
    const { data: used, error: ue } = await supabase.from('fund_entries').select('bank_transaction_id').in('bank_transaction_id', ids)
    if (ue) throw ue
    for (const u of used ?? []) if (u.bank_transaction_id) taken.add(u.bank_transaction_id as string)
  }
  return (data ?? []).filter((r) => !taken.has(r.id as string)).map((r) => ({ id: r.id as string, date: r.transaction_date as string, amount: Number(r.amount), description: (r.description as string | null) ?? null }))
}

// ------------------------------------------------------------------------------------------------------------- enlaces de consulta
export interface ShareLink {
  id: string
  token: string
  kind: 'general' | 'participante'
  participantId: string | null
  active: boolean
}
export async function listShareLinks(fundId: string): Promise<ShareLink[]> {
  const { data, error } = await supabase.from('fund_share_links').select('id, token, kind, participant_id, active').eq('fund_id', fundId).eq('active', true)
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, token: r.token, kind: r.kind, participantId: r.participant_id, active: r.active }))
}
export async function createShareLink(fundId: string, kind: 'general' | 'participante', participantId: string | null): Promise<ShareLink> {
  const { data, error } = await supabase.from('fund_share_links').insert({ fund_id: fundId, kind, participant_id: participantId }).select('id, token, kind, participant_id, active').single()
  if (error) throw error
  return { id: data.id, token: data.token, kind: data.kind, participantId: data.participant_id, active: data.active }
}
export async function revokeShareLink(id: string): Promise<void> {
  const { error } = await supabase.from('fund_share_links').update({ active: false }).eq('id', id)
  if (error) throw error
}
export async function markNoticeReviewed(id: string): Promise<void> {
  const { error } = await supabase.from('fund_payment_notices').update({ status: 'revisado' }).eq('id', id)
  if (error) throw error
}
export function fundShareUrl(token: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`
  return `${base}?bote=${token}`
}
