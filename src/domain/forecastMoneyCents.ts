// Previsión de pagos — reparto de un importe TOTAL entre varias cuotas/cargos. Trabaja SIEMPRE en
// céntimos enteros — nunca floats para repartir dinero (0,1 + 0,2 no es exactamente 0,3 en punto
// flotante; repartir 867,56 € en 6 partes a float puede dejar la suma a un céntimo de distancia del
// total sin que se note). Compartido entre el plan finito (Fase 1D-b/e) y el cobro fraccionado por
// ciclo (Fase 1D-c/d): las dos ramas reparten un total en N líneas con la misma regla.

export function eurosStringToCents(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  // Math.round, no truncar: 867.56 * 100 puede llegar como 86755.99999999999 en punto flotante.
  return Math.round(n * 100)
}

export function centsToEurosString(cents: number): string {
  return (cents / 100).toFixed(2)
}

// Reparto determinista: la base (redondeada hacia abajo) para todas las líneas salvo la ÚLTIMA, que
// absorbe TODO el resto — así la suma de las N líneas es SIEMPRE exactamente igual al total, sin
// excepción, y coincide con el patrón real observado (867,56 € / 6 → 5 × 144,59 € + 1 × 144,61 €).
export function distributeTotalCentsEvenly(totalCents: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('count debe ser un entero >= 1')
  const base = Math.floor(totalCents / count)
  const amounts = new Array(count).fill(base) as number[]
  amounts[count - 1] = totalCents - base * (count - 1)
  return amounts
}

export interface CentsDistributionCheck {
  totalCents: number
  distributedCents: number
  differenceCents: number // totalCents - distributedCents (negativo si se ha repartido de más)
  matches: boolean
}

// Compara el total contra lo realmente repartido entre las líneas — null (unknown) no aporta céntimos,
// nunca se inventa un importe para que cuadre.
export function checkCentsDistribution(totalCents: number, lineCentsList: (number | null)[]): CentsDistributionCheck {
  const distributedCents = lineCentsList.reduce((sum: number, c) => sum + (c ?? 0), 0)
  const differenceCents = totalCents - distributedCents
  return { totalCents, distributedCents, differenceCents, matches: differenceCents === 0 }
}
