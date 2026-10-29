// Cálculo de un bote compartido (Gestión de grupos). Módulo PURO (sin dependencias): lo usan la aplicación (src/domain/groupFunds.ts) y las funciones del servidor, así lo que ve
// una persona en la app y lo que ve una familia en su enlace salen del MISMO cálculo. Los importes se calculan siempre desde los apuntes (no hay totales guardados).
// Se trabaja en céntimos enteros para no arrastrar errores de coma flotante.

export type ContributionType = 'igual' | 'variable' | 'voluntaria'
export type MemberState = 'participa' | 'no_participa' | 'exento'
export type EntryKind = 'aportacion' | 'gasto' | 'entrega' | 'reembolso' | 'devolucion' | 'traspaso_in' | 'traspaso_out'

export interface FundConfig {
  contributionType: ContributionType
  defaultAmount: number | null
}
export interface FundMemberInput {
  participantId: string
  state: MemberState
  requiredAmount: number | null
}
export interface FundEntryInput {
  id: string
  kind: EntryKind
  amount: number
  voided: boolean
}
export interface AllocationInput {
  entryId: string
  participantId: string
  amount: number
}

export type ParticipantFundStatus = 'pagado' | 'parcial' | 'pendiente' | 'sobrepago' | 'exento' | 'no_participa' | 'aporto' | 'sin_aportar'

export interface ParticipantFundRow {
  participantId: string
  state: MemberState
  required: number
  paid: number
  pending: number
  surplus: number
  status: ParticipantFundStatus
}

export interface FundSummary {
  rows: ParticipantFundRow[]
  /** Suma de lo exigido a quienes participan. */
  expected: number
  /** Suma de las aportaciones (identificadas o no). */
  collected: number
  /** Lo que falta por cobrar (suma de pendientes individuales; nunca negativo por persona). */
  pending: number
  /** Parte de lo recaudado repartida entre participantes. */
  identified: number
  /** Parte de lo recaudado sin asignar a nadie: suma al saldo, no marca a nadie como pagado. */
  unidentified: number
  /** Gastos, entregas, reembolsos, devoluciones y traspasos que salen. */
  spent: number
  /** Traspasos recibidos de otros botes. */
  transferredIn: number
  /** Saldo disponible = aportaciones + traspasos recibidos − salidas. */
  balance: number
  counts: { pagado: number; parcial: number; pendiente: number; exento: number; noParticipa: number; sobrepago: number }
}

const cents = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100)
const euros = (c: number): number => c / 100

export const INCOME_KINDS: readonly EntryKind[] = ['aportacion', 'traspaso_in']

/** Lo que se le exige a un participante en este bote (en euros). */
export function requiredFor(cfg: FundConfig, member: FundMemberInput): number {
  if (member.state !== 'participa') return 0
  if (cfg.contributionType === 'voluntaria') return 0
  const own = member.requiredAmount
  if (own !== null && own !== undefined) return Math.max(0, own)
  return cfg.contributionType === 'igual' ? Math.max(0, cfg.defaultAmount ?? 0) : 0
}

export function summarizeFund(cfg: FundConfig, members: FundMemberInput[], entries: FundEntryInput[], allocations: AllocationInput[]): FundSummary {
  const live = new Map<string, FundEntryInput>()
  for (const e of entries) if (!e.voided) live.set(e.id, e)

  const paidBy = new Map<string, number>()
  let allocated = 0
  for (const a of allocations) {
    const e = live.get(a.entryId)
    if (!e || e.kind !== 'aportacion') continue
    const c = cents(a.amount)
    paidBy.set(a.participantId, (paidBy.get(a.participantId) ?? 0) + c)
    allocated += c
  }

  let collected = 0
  let spent = 0
  let transferredIn = 0
  for (const e of live.values()) {
    const c = cents(e.amount)
    if (e.kind === 'aportacion') collected += c
    else if (e.kind === 'traspaso_in') transferredIn += c
    else spent += c
  }

  const counts = { pagado: 0, parcial: 0, pendiente: 0, exento: 0, noParticipa: 0, sobrepago: 0 }
  let expected = 0
  let pending = 0
  const rows: ParticipantFundRow[] = members.map((m) => {
    const req = cents(requiredFor(cfg, m))
    const paid = paidBy.get(m.participantId) ?? 0
    let status: ParticipantFundStatus
    if (m.state === 'no_participa') status = 'no_participa'
    else if (m.state === 'exento') status = 'exento'
    else if (cfg.contributionType === 'voluntaria') status = paid > 0 ? 'aporto' : 'sin_aportar'
    else if (paid > req) status = 'sobrepago'
    else if (paid >= req) status = 'pagado'
    else if (paid > 0) status = 'parcial'
    else status = 'pendiente'
    const owes = m.state === 'participa' && cfg.contributionType !== 'voluntaria' ? Math.max(0, req - paid) : 0
    if (m.state === 'participa') expected += req
    pending += owes
    if (status === 'pagado') counts.pagado += 1
    else if (status === 'sobrepago') {
      counts.sobrepago += 1
      counts.pagado += 1
    } else if (status === 'parcial') counts.parcial += 1
    else if (status === 'pendiente') counts.pendiente += 1
    else if (status === 'exento') counts.exento += 1
    else if (status === 'no_participa') counts.noParticipa += 1
    return {
      participantId: m.participantId,
      state: m.state,
      required: euros(req),
      paid: euros(paid),
      pending: euros(owes),
      surplus: euros(m.state === 'participa' && cfg.contributionType !== 'voluntaria' ? Math.max(0, paid - req) : 0),
      status,
    }
  })

  return {
    rows,
    expected: euros(expected),
    collected: euros(collected),
    pending: euros(pending),
    identified: euros(Math.min(allocated, collected)),
    unidentified: euros(Math.max(0, collected - allocated)),
    spent: euros(spent),
    transferredIn: euros(transferredIn),
    balance: euros(collected + transferredIn - spent),
    counts,
  }
}

/** ¿Puede una aportación de `amount` repartirse así? (la suma del reparto no puede superar el importe). */
export function allocationFits(amount: number, parts: number[]): boolean {
  return parts.reduce((s, p) => s + cents(p), 0) <= cents(amount)
}

/** Reparto a partes iguales de una aportación entre n participantes, sin perder céntimos (el resto va a los primeros). */
export function splitEvenly(amount: number, n: number): number[] {
  if (n <= 0) return []
  const total = cents(amount)
  const base = Math.floor(total / n)
  const extra = total - base * n
  return Array.from({ length: n }, (_, i) => euros(base + (i < extra ? 1 : 0)))
}
