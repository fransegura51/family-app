// Al subir un ticket: ¿ya existe un gasto de esa misma compra al que unirlo, en vez de crear otro? (bug real 17/10/2026: Hiperber 20,65 € salía dos veces — un gasto
// apuntado a mano que el banco ya había enlazado («ticket_banco», sin ticket propio) y el gasto nuevo que crea el ticket; antes solo se miraban los de origen «banco»).
// Mismo criterio que enable-banking-sync-transactions al revés (banco→ticket): importe exacto y ±7 días.

export const TICKET_MATCH_WINDOW_DAYS = 7
// Orígenes a los que un ticket puede unirse: solo banco, ya enlazado a un apunte sin ticket (ticket_banco) o apuntado a mano.
export const TICKET_MATCH_SOURCES = ['banco', 'ticket_banco', 'manual'] as const

export interface TicketMatchCandidate {
  id: string
  amount: number | string
  expense_date: string
  source: string
}

function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

// Devuelve el gasto candidato más cercano en fecha al ticket (mismo importe, sin ticket ya enlazado) o null si no hay ninguno.
export function pickTicketExpenseMatch(
  candidates: TicketMatchCandidate[],
  ticket: { amount: number; receiptDate: string },
  alreadyLinkedExpenseIds: ReadonlySet<string>,
): TicketMatchCandidate | null {
  const eligible = candidates
    .filter((c) => (TICKET_MATCH_SOURCES as readonly string[]).includes(c.source))
    .filter((c) => !alreadyLinkedExpenseIds.has(c.id))
    .filter((c) => Math.abs(Number(c.amount) - ticket.amount) < 0.01)
    .filter((c) => Math.abs(dayNumber(c.expense_date) - dayNumber(ticket.receiptDate)) <= TICKET_MATCH_WINDOW_DAYS)
    .sort((a, b) => Math.abs(dayNumber(a.expense_date) - dayNumber(ticket.receiptDate)) - Math.abs(dayNumber(b.expense_date) - dayNumber(ticket.receiptDate)))
  return eligible[0] ?? null
}

// El origen del gasto tras unirle el ticket: con banco ya enlazado sigue siendo «ticket_banco»; uno apuntado a mano sin banco pasa a «ticket».
export function sourceAfterTicketMatch(current: string): 'ticket_banco' | 'ticket' {
  return current === 'manual' ? 'ticket' : 'ticket_banco'
}
