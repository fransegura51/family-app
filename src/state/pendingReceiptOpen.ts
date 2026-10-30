// COR-04C — «Ver ticket» / «Ver compra» desde un precio del Historial de precios de un producto: abre la compra original (por identificador) en Compras → Tickets y ofrece
// volver a la ficha del producto consultado. Mismo patrón que pendingProductHistoryLink / pendingMovementsFilter: Historial y Tickets son pestañas hermanas sin routing propio,
// así que el destino se guarda una vez y se consume al montar Tickets.
export interface PendingReceiptOpen {
  receiptId: string
  /** Para volver a la ficha del producto de la que se salió (y, si venía de Estadística compras, seguir devolviendo allí al cerrarla). */
  back?: { productId: string; productName: string; kind: 'alimentacion' | 'no_alimentos'; scrollY: number; fromStats: boolean; scope: 'identical' | 'equivalent' }
}

let pending: PendingReceiptOpen | null = null

export function setPendingReceiptOpen(link: PendingReceiptOpen): void {
  pending = link
}

export function takePendingReceiptOpen(): PendingReceiptOpen | null {
  const value = pending
  pending = null
  return value
}
