// «Tendencia del saldo» con EFECTIVO: evolución de una cartera a partir de sus movimientos reales.
//
// A diferencia de una cuenta bancaria (de la que solo se conoce el saldo ACTUAL y se reconstruye hacia atrás), una cartera guarda su saldo inicial y todos sus
// movimientos, así que su saldo de cualquier día es saldo inicial + movimientos hasta ese día. Reglas para no inventar nada:
//   · Antes del día en que se creó la cartera NO hay saldo (no se dibuja, ni se interpreta el saldo actual como si hubiera sido siempre el mismo).
//   · Un movimiento con fecha anterior a la creación cuenta desde el día de creación (así el último punto coincide siempre con el saldo actual de la cartera).
//   · Un traspaso con el banco aparece en las dos series (el banco baja y la cartera sube la misma cantidad): al sumar bancos + efectivo no se duplica ni se pierde dinero.
import type { CashMovement } from './cashWallet'

export interface WalletTrendPoint {
  date: string
  balance: number
  /** false = la cartera todavía no existía ese día: no hay dato (el saldo mostrado es 0 solo para poder apilar). */
  known: boolean
}

export interface WalletForTrend {
  id: string
  openingBalance: number
  /** Fecha (YYYY-MM-DD) de creación de la cartera. Sin ella, la del primer movimiento. */
  createdOn: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Primer día del que hay saldo fiable de la cartera. */
export function walletStartDate(wallet: WalletForTrend, movements: readonly Pick<CashMovement, 'walletId' | 'occurredOn'>[]): string | null {
  if (wallet.createdOn) return wallet.createdOn
  let first: string | null = null
  for (const m of movements) if (m.walletId === wallet.id && (first === null || m.occurredOn < first)) first = m.occurredOn
  return first
}

/** Un punto por día entre fromDate y toDate (ambos incluidos). Mismo formato de fechas que balanceTrend, para poder apilarlas con las cuentas del banco. */
export function walletBalanceTrend(wallet: WalletForTrend, movements: readonly Pick<CashMovement, 'walletId' | 'occurredOn' | 'amount'>[], fromDate: string, toDate: string): WalletTrendPoint[] {
  const start = walletStartDate(wallet, movements)
  const mine = movements.filter((m) => m.walletId === wallet.id)
  const points: WalletTrendPoint[] = []
  const cursor = new Date(fromDate + 'T00:00')
  const end = new Date(toDate + 'T00:00')
  while (cursor <= end) {
    const date = toDateStr(cursor)
    if (start === null || date < start) {
      points.push({ date, balance: 0, known: false })
    } else {
      const moved = mine.filter((m) => m.occurredOn <= date).reduce((s, m) => s + m.amount, 0)
      points.push({ date, balance: round2(wallet.openingBalance + moved), known: true })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return points
}
