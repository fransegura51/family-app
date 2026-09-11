// "Tendencia del saldo" (petición real, con captura de referencia de
// otra app): una línea con la evolución del saldo día a día. La app no
// guarda un histórico de saldo (solo el saldo ACTUAL de cada cuenta,
// que trae cada sincronización) — se reconstruye hacia atrás a partir
// de ese saldo conocido y de los movimientos reales ya sincronizados:
// el saldo de ayer es el de hoy menos lo que cambió hoy, y así
// sucesivamente. Es exacto mientras haya movimientos guardados — más
// atrás de eso no hay manera de saberlo (Enable Banking solo entrega
// los últimos meses salvo que se pida explícitamente "todo el
// histórico" al sincronizar).

export interface BalanceTrendPoint {
  date: string // YYYY-MM-DD
  balance: number
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Varias cuentas a la vez (petición real: "cómo se van a manejar los
// movimientos con varias cuentas" → una línea combinada por defecto,
// que se puede aislar a una sola cuenta pasando solo esa en `accounts`).
export function balanceTrend(
  accounts: { id: string; balance: number | null }[],
  transactions: { accountId: string; transactionDate: string | null; amount: number; creditDebit: 'CRDT' | 'DBIT' }[],
  fromDate: string,
  toDate: string,
): BalanceTrendPoint[] {
  const accountIds = new Set(accounts.map((a) => a.id))
  const anchorBalance = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0)

  // Cambio neto por día (crédito suma, débito resta), solo de las
  // cuentas elegidas y solo de movimientos con fecha conocida.
  const netByDate = new Map<string, number>()
  for (const t of transactions) {
    if (!accountIds.has(t.accountId) || !t.transactionDate) continue
    const signed = t.creditDebit === 'CRDT' ? t.amount : -t.amount
    netByDate.set(t.transactionDate, (netByDate.get(t.transactionDate) ?? 0) + signed)
  }

  // El saldo conocido (anchorBalance) es el de HOY, no el de `toDate` —
  // si se pide un rango que termina antes de hoy, primero hay que
  // deshacer lo que pasó DESPUÉS de `toDate` para llegar al saldo de
  // ese día.
  let runningBalance = anchorBalance
  for (const [date, net] of netByDate) {
    if (date > toDate) runningBalance -= net
  }

  const points: BalanceTrendPoint[] = []
  const cursor = new Date(toDate + 'T00:00')
  const fromD = new Date(fromDate + 'T00:00')
  while (cursor >= fromD) {
    const dateStr = toDateStr(cursor)
    points.push({ date: dateStr, balance: runningBalance })
    runningBalance -= netByDate.get(dateStr) ?? 0
    cursor.setDate(cursor.getDate() - 1)
  }
  return points.reverse()
}

// La fecha más antigua con movimientos reales guardados, de las cuentas
// elegidas — para avisar en pantalla de que el gráfico no puede ir más
// atrás de ahí, aunque se amplíe el plazo pedido (limitación real:
// Enable Banking solo trae unos meses de histórico salvo que se pida
// expresamente "todo el histórico" al sincronizar).
export function earliestTransactionDate(
  accountIds: Set<string>,
  transactions: { accountId: string; transactionDate: string | null }[],
): string | null {
  let earliest: string | null = null
  for (const t of transactions) {
    if (!accountIds.has(t.accountId) || !t.transactionDate) continue
    if (earliest === null || t.transactionDate < earliest) earliest = t.transactionDate
  }
  return earliest
}
