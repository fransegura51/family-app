import { isPlaceholderProduct } from '@/domain/placeholderProduct'

// COMP-06 — líneas «Pendiente» de las compras (productos que llegaron de fuera sin identificar). Cuenta, por compra, cuántas líneas siguen siendo el producto marcador, para
// resaltarlas, ofrecer «Resolver» y enseñar un contador accionable en Compras. No toca ningún dato: solo cuenta.
export interface PendingLineRow {
  receiptId: string | null
  product: { normalizedName?: string | null; displayName?: string | null } | null
}

/** receiptId → nº de líneas que siguen siendo el producto marcador «Pendiente». Las compras sin líneas pendientes no aparecen. */
export function countPendingLinesByReceipt(rows: readonly PendingLineRow[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    if (!r.receiptId || !isPlaceholderProduct(r.product)) continue
    out.set(r.receiptId, (out.get(r.receiptId) ?? 0) + 1)
  }
  return out
}

export function pendingPurchasesLabel(count: number): string {
  return count === 1 ? '1 compra con productos por identificar' : `${count} compras con productos por identificar`
}
