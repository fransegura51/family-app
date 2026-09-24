// "+info →" del carrusel "PEPA analiza tus compras" (Compras → Inicio)
// hacia el historial real de un producto (Compras → Historial). Mismo
// problema y misma solución que src/state/pendingMovementsFilter.ts
// (Compras → Economía): dos pestañas hermanas, sin routing propio entre
// ellas, así que el destino se lee una vez y se consume.
export interface PendingProductHistoryLink {
  productId: string
  productName: string
}

let pending: PendingProductHistoryLink | null = null

export function setPendingProductHistoryLink(link: PendingProductHistoryLink): void {
  pending = link
}

export function takePendingProductHistoryLink(): PendingProductHistoryLink | null {
  const value = pending
  pending = null
  return value
}
