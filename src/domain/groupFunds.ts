// Botes compartidos de un grupo — dominio puro. El cálculo (recaudado, pendiente, saldo…) vive en el módulo compartido con el servidor.
import { foldText, participantName, type Participant } from '@/domain/groups'
import {
  allocationFits,
  requiredFor,
  splitEvenly,
  summarizeFund,
  INCOME_KINDS,
  type AllocationInput,
  type ContributionType,
  type EntryKind,
  type FundConfig,
  type FundEntryInput,
  type FundMemberInput,
  type FundSummary,
  type MemberState,
  type ParticipantFundRow,
  type ParticipantFundStatus,
} from '../../supabase/functions/_shared/groups/fundSummary'

export { allocationFits, requiredFor, splitEvenly, summarizeFund, INCOME_KINDS }
export type { AllocationInput, ContributionType, EntryKind, FundConfig, FundEntryInput, FundMemberInput, FundSummary, MemberState, ParticipantFundRow, ParticipantFundStatus }

export interface FundItem {
  id: string
  groupId: string
  name: string
  contributionType: ContributionType
  defaultAmount: number | null
  status: 'abierto' | 'cerrado'
  closedAt: string | null
  closeNote: string | null
  leftoverAmount: number | null
  leftoverDestination: 'traspaso' | 'devolucion' | 'archivado' | null
  reopenedCount: number
  readonlyHistory: boolean
  history: { responsible?: string; group?: string; from?: string | null; to?: string | null; copiedAt?: string; originalStatus?: string; chain?: unknown[] } | null
  createdAt: string
}

export interface FundEntry {
  id: string
  fundId: string
  kind: EntryKind
  amount: number
  entryDate: string
  payerLabel: string | null
  method: 'efectivo' | 'bizum' | 'transferencia' | 'tarjeta' | 'otro' | null
  concept: string | null
  receiptPath: string | null
  hadReceipt: boolean
  bankTransactionId: string | null
  transferId: string | null
  counterpartFundId: string | null
  voidedAt: string | null
  voidReason: string | null
  createdAt: string
}

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  aportacion: 'Aportación',
  gasto: 'Gasto',
  entrega: 'Entrega de dinero',
  reembolso: 'Reembolso',
  devolucion: 'Devolución',
  traspaso_in: 'Traspaso recibido',
  traspaso_out: 'Traspaso enviado',
}

export const CONTRIBUTION_LABEL: Record<ContributionType, string> = {
  igual: 'Misma cantidad para todos',
  variable: 'Cantidades diferentes',
  voluntaria: 'Aportaciones voluntarias',
}

export const STATUS_LABEL: Record<ParticipantFundStatus, string> = {
  pagado: 'Pagado',
  sobrepago: 'Pagó de más',
  parcial: 'Pago parcial',
  pendiente: 'Pendiente',
  exento: 'Exento',
  no_participa: 'No participa',
  aporto: 'Ha aportado',
  sin_aportar: 'Sin aportar',
}

export function toSummaryInputs(members: { participantId: string; state: MemberState; requiredAmount: number | null }[], entries: FundEntry[], allocations: { entryId: string; participantId: string; amount: number }[]) {
  return {
    members: members as FundMemberInput[],
    entries: entries.map((e) => ({ id: e.id, kind: e.kind, amount: e.amount, voided: !!e.voidedAt })) as FundEntryInput[],
    allocations: allocations as AllocationInput[],
  }
}

export function fmtEuro(n: number): string {
  const rounded = Math.round(n * 100) / 100
  const whole = Number.isInteger(rounded)
  return `${rounded.toLocaleString('es-ES', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })} €`
}

// ---------------------------------------------------------------------------------------------- Bizum: coincidencias SIN asignar nada solas
const NOISE = new Set(['bizum', 'de', 'del', 'a', 'la', 'el', 'los', 'las', 'pago', 'transferencia', 'recibida', 'recibido', 'por', 'concepto', 'y', 'e', 'mr', 'mrs', 'sra', 'sr'])

function tokens(s: string | null | undefined): string[] {
  return foldText(s)
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !NOISE.has(t))
}

export interface PayerCandidate {
  participantId: string
  /** 'alias' = coincide con un alias de pago guardado; 'tutor' = con el nombre de su madre/padre/tutor; 'nombre' = con el propio nombre. */
  reason: 'alias' | 'tutor' | 'nombre'
  score: number
}

/**
 * Sugiere a quién corresponde un pago por el nombre del pagador (p. ej. «Bizum de Ana Ruiz»). NUNCA asigna: devuelve candidatos ordenados y la interfaz exige confirmación.
 * Solo propone entre los participantes recibidos (los que siguen pendientes, si se quiere).
 */
export function suggestPayerMatches(payerLabel: string, participants: Participant[]): PayerCandidate[] {
  const label = tokens(payerLabel)
  if (label.length === 0) return []
  const labelSet = new Set(label)
  const out: PayerCandidate[] = []
  for (const p of participants) {
    let best: PayerCandidate | null = null
    const consider = (reason: PayerCandidate['reason'], score: number) => {
      if (!best || score > best.score) best = { participantId: p.id, reason, score }
    }
    for (const alias of (p.payerAlias ?? '').split(/[;\n]/)) {
      const a = tokens(alias)
      if (a.length > 0 && a.every((t) => labelSet.has(t))) consider('alias', 0.95)
    }
    const g = tokens(p.guardianName)
    if (g.length >= 2 && g.every((t) => labelSet.has(t))) consider('tutor', 0.8)
    else if (g.length === 1 && labelSet.has(g[0]) && label.length === 1) consider('tutor', 0.6)
    const n = tokens(participantName(p))
    if (n.length >= 2 && n.every((t) => labelSet.has(t))) consider('nombre', 0.7)
    if (best) out.push(best)
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Una coincidencia es «clara» solo si es única y por alias guardado: aun así se muestra para confirmar. */
export function isClearMatch(c: PayerCandidate[]): boolean {
  return c.length === 1 && c[0].reason === 'alias'
}

// ---------------------------------------------------------------------------------------------- informes para WhatsApp
export interface ReportRow {
  name: string
  row: ParticipantFundRow
}

export type ReportKind = 'pendientes' | 'pagados' | 'resumen'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Texto listo para WhatsApp. Solo nombres identificativos de los participantes (no de quienes hicieron el Bizum) e importes: nunca teléfonos, correos ni alias de pago.
 */
export function buildFundReport(kind: ReportKind, fundName: string, summary: FundSummary, rows: ReportRow[]): string {
  const title = `*${fundName}*`
  const obliged = rows.filter((r) => r.row.state === 'participa')
  if (kind === 'pendientes') {
    const pend = obliged.filter((r) => r.row.pending > 0).sort((a, b) => a.name.localeCompare(b.name, 'es'))
    if (pend.length === 0) return `${title}\n¡Todo cobrado! No queda ningún pago pendiente.`
    const lines = pend.map((r) => `• ${r.name}${r.row.paid > 0 ? ` — faltan ${fmtEuro(r.row.pending)} (ya pagó ${fmtEuro(r.row.paid)})` : ` — ${fmtEuro(r.row.pending)}`}`)
    return [`${title}`, `Pendientes de pago (${pend.length} de ${obliged.length}):`, ...lines, '', `Recaudado: ${fmtEuro(summary.collected)} de ${fmtEuro(summary.expected)}`].join('\n')
  }
  if (kind === 'pagados') {
    const paid = obliged.filter((r) => r.row.status === 'pagado' || r.row.status === 'sobrepago').sort((a, b) => a.name.localeCompare(b.name, 'es'))
    if (paid.length === 0) return `${title}\nTodavía no ha pagado nadie.`
    return [`${title}`, `Han pagado (${paid.length} de ${obliged.length}):`, ...paid.map((r) => `• ${r.name}`)].join('\n')
  }
  const exempt = rows.filter((r) => r.row.state === 'exento').length
  const out = rows.filter((r) => r.row.state === 'no_participa').length
  const lines = [
    title,
    `Previsto: ${fmtEuro(summary.expected)}`,
    `Recaudado: ${fmtEuro(summary.collected)}`,
    `Pendiente: ${fmtEuro(summary.pending)} (${plural(summary.counts.pendiente + summary.counts.parcial, 'persona', 'personas')})`,
  ]
  if (summary.unidentified > 0) lines.push(`Ingresos por identificar: ${fmtEuro(summary.unidentified)}`)
  if (summary.spent > 0) lines.push(`Gastado: ${fmtEuro(summary.spent)}`)
  lines.push(`Saldo disponible: ${fmtEuro(summary.balance)}`)
  if (exempt || out) lines.push(`${exempt ? plural(exempt, 'exento', 'exentos') : ''}${exempt && out ? ' · ' : ''}${out ? `${out} no participan` : ''}`)
  return lines.join('\n')
}

/** Informe detallado para quien gestiona: movimientos con fecha e importe (sin teléfonos ni correos). */
export function buildDetailedReport(fundName: string, summary: FundSummary, entries: FundEntry[]): string {
  const live = entries.filter((e) => !e.voidedAt).sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.createdAt.localeCompare(b.createdAt))
  const fmtDate = (d: string) => d.split('-').reverse().slice(0, 2).join('/')
  const lines = [`*${fundName}* — informe detallado`, `Previsto ${fmtEuro(summary.expected)} · Recaudado ${fmtEuro(summary.collected)} · Pendiente ${fmtEuro(summary.pending)}`, '']
  for (const e of live) {
    const sign = INCOME_KINDS.includes(e.kind) ? '+' : '−'
    lines.push(`${fmtDate(e.entryDate)} ${ENTRY_KIND_LABEL[e.kind]}${e.concept ? ` (${e.concept})` : ''}: ${sign}${fmtEuro(e.amount)}${e.receiptPath || e.hadReceipt ? ' 🧾' : ''}`)
  }
  lines.push('', `Saldo disponible: ${fmtEuro(summary.balance)}`)
  return lines.join('\n')
}

/** Aviso previo al cierre: qué queda sin resolver. */
export function closeWarnings(summary: FundSummary): string[] {
  const w: string[] = []
  const owing = summary.counts.pendiente + summary.counts.parcial
  if (owing > 0) w.push(`${plural(owing, 'persona tiene', 'personas tienen')} pagos pendientes (${fmtEuro(summary.pending)}).`)
  if (summary.unidentified > 0) w.push(`Hay ${fmtEuro(summary.unidentified)} de ingresos sin identificar.`)
  if (summary.balance > 0) w.push(`Queda un saldo de ${fmtEuro(summary.balance)}: elige qué hacer con él.`)
  if (summary.balance < 0) w.push(`El saldo es negativo (${fmtEuro(summary.balance)}): se ha gastado más de lo recaudado.`)
  return w
}
