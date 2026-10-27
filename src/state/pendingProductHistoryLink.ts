// "+info →" del carrusel "PEPA analiza tus compras" (Compras → Inicio)
// hacia el historial real de un producto (Compras → Historial). Mismo
// problema y misma solución que src/state/pendingMovementsFilter.ts
// (Compras → Economía): dos pestañas hermanas, sin routing propio entre
// ellas, así que el destino se lee una vez y se consume.
export interface PendingProductHistoryLink {
  productId: string
  productName: string
  /**
   * COR-04 — desde una fila de producto de Estadística compras: abre directamente la FICHA de ese producto (por identificador, nunca por nombre), en el conjunto
   * (Alimentos / Otros) desde el que se tocó, y al cerrarla vuelve a Estadística compras. Sin esto (el «+info →» de siempre) solo se filtra la lista por nombre.
   */
  openSheet?: { kind: 'alimentacion' | 'no_alimentos' }
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
