// PESO-4/5 — capa central única para decidir cuándo dos precios de product_prices son comparables entre
// sí. Regla de oro: SOLO comparar precios con la MISMA magnitud (kg con kg, ud con ud) — nunca kg con ud,
// y un legacy unit=null (histórico anterior a PESO-1/2/3) NUNCA se asume kg ni se reinterpreta a la
// fuerza. Toda función de domain/products.ts, domain/priceTrends.ts, domain/financeCompute.ts y
// domain/shoppingInsights.ts que compare o agregue precios reutiliza este módulo — un único sitio con el
// criterio, en vez de un `if (unit === 'kg')` distinto en cada función.
export type MeasurementUnit = 'ud' | 'kg'

export function normalizeMeasurementUnit(unit: string | null | undefined): MeasurementUnit | null {
  return unit === 'kg' ? 'kg' : unit === 'ud' ? 'ud' : null
}

export function displayMeasurementUnit(unit: MeasurementUnit): '€/kg' | '€/ud' {
  return unit === 'kg' ? '€/kg' : '€/ud'
}

export function sameMeasurementUnit(a: MeasurementUnit, b: MeasurementUnit): boolean {
  return a === b
}

export interface MagnitudeGroups<T> {
  kg: T[]
  ud: T[]
  // Legacy (unit=null, guardado antes de PESO-1/2/3) dentro de una serie que SÍ tiene algún registro "kg"
  // explícito en otro sitio: no hay forma segura de saber si ESTE registro en concreto fue una venta por
  // peso guardada con la semántica antigua (importe total como si fuese €/ud) o una venta normal por
  // unidades — se excluye siempre de cualquier estadística o comparación, nunca se adivina.
  unknown: T[]
}

// Agrupa una serie de precios de UN MISMO producto por magnitud comparable:
//  - unit="kg" -> siempre kg.
//  - unit="ud" -> siempre ud.
//  - unit=null/otro (legacy) -> compatible con "ud" SOLO si esa misma serie no contiene ningún registro
//    "kg" explícito; si lo contiene, se aparta como `unknown`.
// NUNCA modifica los registros ni la base de datos — es una relectura, no una reinterpretación guardada.
export function groupBySafeMagnitude<T extends { unit: string | null }>(records: readonly T[]): MagnitudeGroups<T> {
  const kg: T[] = []
  const ud: T[] = []
  const legacyNull: T[] = []
  for (const r of records) {
    const u = normalizeMeasurementUnit(r.unit)
    if (u === 'kg') kg.push(r)
    else if (u === 'ud') ud.push(r)
    else legacyNull.push(r)
  }
  if (kg.length > 0) return { kg, ud, unknown: legacyNull }
  return { kg, ud: [...ud, ...legacyNull], unknown: [] }
}

export interface LastPriceByStoreResult {
  unit: MeasurementUnit
  // Cuántos registros entraron en esta magnitud (excluyendo los `unknown` descartados) — para exigir un
  // mínimo de compras fiables antes de comparar/afirmar algo.
  count: number
  byStore: Map<string, { price: number; date: string }>
}

// Último precio "seguro" por tienda de UN producto: usa solo los registros de la magnitud DOMINANTE de
// esa serie (la del registro comparable —kg o ud— más reciente), nunca mezcla kg con ud ni compara un
// legacy ambiguo. `store` usa la misma clave que el resto de la app: p.store || 'Sin tienda concreta'.
// Devuelve null si no hay ningún registro comparable (todo legacy ambiguo, o ninguna compra).
export function lastComparablePriceByStore<T extends { unit: string | null; store: string | null; price: number; recordedDate: string }>(
  records: readonly T[],
): LastPriceByStoreResult | null {
  const { kg, ud } = groupBySafeMagnitude(records)
  const comparable = [...kg.map((r) => ({ r, unit: 'kg' as const })), ...ud.map((r) => ({ r, unit: 'ud' as const }))]
  if (comparable.length === 0) return null
  const sorted = [...comparable].sort((a, b) => a.r.recordedDate.localeCompare(b.r.recordedDate))
  const unit = sorted[sorted.length - 1].unit
  const group = unit === 'kg' ? kg : ud
  const byStore = new Map<string, { price: number; date: string }>()
  for (const r of [...group].sort((a, b) => a.recordedDate.localeCompare(b.recordedDate))) {
    byStore.set(r.store || 'Sin tienda concreta', { price: r.price, date: r.recordedDate })
  }
  return { unit, count: group.length, byStore }
}
