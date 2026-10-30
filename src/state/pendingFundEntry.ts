import type { IncomingBankTx } from '@/data/groupFunds'

// ECO-03 — «Enlazar con bote» desde un movimiento de Economía: se abre el bote elegido en Gestión de grupos y, al llegar, el MISMO formulario de apunte de siempre (EntrySheet) ya con
// los datos del movimiento bancario. Aquí solo se anota qué abrir; el enlace lo crea el propio apunte del bote al guardarse (fund_entries.bank_transaction_id), sin pasar por el
// «Guardar» del movimiento. Variable de módulo que se lee una sola vez (mismo patrón que pendingMovementsFilter).
export interface PendingFundEntry {
  fundId: string
  kind: 'aportacion' | 'gasto'
  bankTx: IncomingBankTx
}

let pending: PendingFundEntry | null = null

export function setPendingFundEntry(entry: PendingFundEntry): void {
  pending = entry
}

export function takePendingFundEntry(fundId: string): PendingFundEntry | null {
  const value = pending && pending.fundId === fundId ? pending : null
  if (value) pending = null
  return value
}
