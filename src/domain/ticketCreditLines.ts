// Una línea de un ticket con precio NEGATIVO (abono de portes, descuento, cupón, devolución) no es la compra de un producto: la tabla de precios
// (product_prices) solo admite precios de 0 en adelante, y un abono tampoco tiene sentido en el historial ni en las estadísticas por producto.
// Bug real (16/10/2026): un ticket con «Abono de portes −6,75 €» no se podía guardar («violates check constraint product_prices_price_check»).
// Es un hecho estructural (importe < 0), no una heurística por nombre: por eso no hace falta la lista de reglas con evidencia de las líneas que no son producto.
// El ticket conserva su foto y su total íntegros; solo se aparta la línea del historial de precios.
export function isCreditLine(unitPrice: number): boolean {
  return Number.isFinite(unitPrice) && unitPrice < 0
}

// Separa las líneas con precio negativo (`credits`) del resto (`kept`). Idempotente.
export function partitionCreditLines<T extends { unitPrice: number }>(lines: readonly T[]): { kept: T[]; credits: T[] } {
  const kept: T[] = []
  const credits: T[] = []
  for (const line of lines) {
    if (isCreditLine(line.unitPrice)) credits.push(line)
    else kept.push(line)
  }
  return { kept, credits }
}
