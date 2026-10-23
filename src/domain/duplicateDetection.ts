// DETECCIÓN DE DUPLICADOS entre compras manuales, tickets, apuntes de Economía y movimientos del banco.
//
// REGLA DE ORO: solo SUGIERE. Nada se borra ni se fusiona por una coincidencia aproximada; quien decide es la familia (y una decisión «son
// distintos» se recuerda para no volver a preguntar). Se distinguen dos situaciones muy distintas:
//   · 'link_bank' — NO es un duplicado: es el pago bancario de una compra legítima. Se ofrece VINCULAR (un solo gasto, el de la compra).
//   · 'duplicate' — la misma compra apuntada dos veces (p. ej. un gasto a mano en Economía y la compra a mano en Compras). Se ofrece quitar
//                   uno, con confirmación.
// Datos fiables que se usan: importe (al céntimo), fecha, comercio y forma de pago. El efectivo no se empareja nunca con el banco.
// Dos cargos iguales del banco (dos cafés el mismo día) NO se marcan: pueden ser compras distintas.
import type { PurchaseCandidate } from './manualPurchase'

export interface DupExpense {
  id: string
  expenseDate: string
  amount: number
  store: string | null
  source: 'manual' | 'ticket' | 'banco' | 'ticket_banco'
  isIncome: boolean
  paymentMethod?: string | null
  /** true = hay una compra (receipts) enlazada a este gasto. */
  hasPurchase: boolean
  /** true = hay un movimiento de cartera de efectivo enlazado (traspaso o pago). */
  hasCashLink?: boolean
}

export type DuplicateKind = 'link_bank' | 'duplicate'

export interface DuplicateSuggestion {
  kind: DuplicateKind
  a: DupExpense
  b: DupExpense
  /** Para link_bank: a = la compra propia, b = el apunte del banco. Para duplicate: a = el que se conserva por defecto, b = el que sobraría. */
  reasons: string[]
}

function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

function normStore(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Misma tienda si coinciden, o si una contiene a la otra (p. ej. «FERRETERIA PEPE-ALMORADI» y «Ferretería Pepe»); si falta una, no contradice. */
export function storesCompatible(a: string | null, b: string | null): { compatible: boolean; known: boolean } {
  const x = normStore(a)
  const y = normStore(b)
  if (!x || !y) return { compatible: true, known: false }
  const firstWord = (s: string) => s.split(' ')[0]
  return { compatible: x === y || x.includes(y) || y.includes(x) || firstWord(x) === firstWord(y), known: true }
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const isCashLike = (e: DupExpense) => e.paymentMethod === 'efectivo' || e.paymentMethod === 'mixto'
const sameAmount = (a: DupExpense, b: DupExpense) => Math.abs(a.amount - b.amount) < 0.01

export function findDuplicateSuggestions(expenses: readonly DupExpense[], dismissedPairs: readonly [string, string][] = []): DuplicateSuggestion[] {
  const dismissed = new Set(dismissedPairs.map(([a, b]) => pairKey(a, b)))
  const candidates = expenses.filter((e) => !e.isIncome && e.amount > 0)
  const out: DuplicateSuggestion[] = []
  const seen = new Set<string>()

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const x = candidates[i]
      const y = candidates[j]
      const key = pairKey(x.id, y.id)
      if (seen.has(key) || dismissed.has(key) || !sameAmount(x, y)) continue
      const days = Math.abs(dayNumber(x.expenseDate) - dayNumber(y.expenseDate))
      const store = storesCompatible(x.store, y.store)

      // Compra propia (manual/ticket) ↔ apunte del banco: el pago de una compra, no un duplicado.
      const own = [x, y].find((e) => e.source === 'manual' || e.source === 'ticket')
      const bank = [x, y].find((e) => e.source === 'banco')
      if (own && bank && own.id !== bank.id) {
        if (isCashLike(own) || bank.hasCashLink || bank.hasPurchase) continue // efectivo ↔ banco no se empareja; un apunte con datos propios no se retira
        if (days > 7 || !store.compatible) continue
        seen.add(key)
        out.push({ kind: 'link_bank', a: own, b: bank, reasons: ['mismo importe', days === 0 ? 'mismo día' : `con ${days} ${days === 1 ? 'día' : 'días'} de diferencia`, ...(store.known ? ['mismo comercio'] : [])] })
        continue
      }

      // Dos apuntes propios de la misma compra: manual + manual, manual + ticket. Exige comercio compatible y fecha muy cercana.
      const bothOwn = (x.source === 'manual' || x.source === 'ticket') && (y.source === 'manual' || y.source === 'ticket')
      if (bothOwn) {
        if (days > 2 || !store.compatible) continue
        // Sin comercio en ninguno de los dos y con un día de diferencia puede ser perfectamente otra compra: solo se sugiere con comercio conocido o el mismo día.
        if (!store.known && days > 0) continue
        // Un efectivo y una tarjeta del mismo importe y día son pagos distintos salvo que se diga lo contrario.
        if (x.paymentMethod && y.paymentMethod && x.paymentMethod !== y.paymentMethod) continue
        seen.add(key)
        const keep = x.hasPurchase && !y.hasPurchase ? x : y.hasPurchase && !x.hasPurchase ? y : x.source === 'ticket' ? x : y.source === 'ticket' ? y : x
        const drop = keep === x ? y : x
        if (drop.hasPurchase || drop.hasCashLink) continue // el que sobraría tiene datos propios: no se ofrece quitarlo
        out.push({ kind: 'duplicate', a: keep, b: drop, reasons: ['mismo importe', days === 0 ? 'mismo día' : `con ${days} ${days === 1 ? 'día' : 'días'} de diferencia`, ...(store.known ? ['mismo comercio'] : ['sin comercio en alguno'])] })
      }
    }
  }
  return out
}

/**
 * Al guardar una compra manual: ¿hay ya en Economía un gasto apuntado a mano que sea esta misma compra? Solo gastos manuales sin compra enlazada,
 * importe exacto, ±3 días y comercio compatible. Se OFRECE vincularla a él (no se crea otro gasto); nunca se decide sola.
 */
export function findExistingEconomyExpense(
  purchase: { amount: number; date: string; store: string; paymentMethod?: string | null },
  expenses: readonly DupExpense[],
): DupExpense[] {
  return expenses
    .filter((e) => e.source === 'manual' && !e.isIncome && !e.hasPurchase && !e.hasCashLink)
    .filter((e) => Math.abs(e.amount - purchase.amount) < 0.01)
    .filter((e) => Math.abs(dayNumber(e.expenseDate) - dayNumber(purchase.date)) <= 3)
    .filter((e) => storesCompatible(e.store, purchase.store).compatible)
    .filter((e) => !(e.paymentMethod && purchase.paymentMethod && e.paymentMethod !== purchase.paymentMethod))
    .sort((a, b) => Math.abs(dayNumber(a.expenseDate) - dayNumber(purchase.date)) - Math.abs(dayNumber(b.expenseDate) - dayNumber(purchase.date)))
}

export type { PurchaseCandidate }
