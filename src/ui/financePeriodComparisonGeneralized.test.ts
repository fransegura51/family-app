import { describe, expect, it } from 'vitest'

// Cola nocturna (continuación) — Bloque B: PeriodComparison ("Comparado con el periodo anterior") se
// generaliza para que Compras pueda reutilizarlo agrupando por TIENDA en vez de por categoría de Economía,
// sin duplicar el componente en uno "PurchasesPeriodComparison"/"EconomyPeriodComparison" aparte. Economía
// sigue pasando exactamente el mismo filtro (isComparableSpend) y agrupador (groupBy con groupSpending) de
// siempre — su comportamiento no cambia ni un píxel (verificado también en forecastFase1FReorg.test.ts).
const SRC = (import.meta.glob('/src/ui/FinanceScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FinanceScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('PeriodComparison — un único componente reutilizable, parametrizado por agrupador (nunca duplicado por pantalla)', () => {
  const fn = slice(SRC, 'function PeriodComparison({', '\n// Skill de Pepa, punto 13')

  it('recibe isComparableSpend y groupBy como props — ya no decide él mismo qué es "gasto comparable" ni cómo agrupar', () => {
    expect(fn).toContain('isComparableSpend: (e: Expense) => boolean')
    expect(fn).toContain('groupBy: (rows: Expense[]) => PeriodComparisonGroup[]')
  })

  it('no existe un segundo componente de comparación (nunca PurchasesPeriodComparison/EconomyPeriodComparison)', () => {
    expect(SRC).not.toContain('PurchasesPeriodComparison')
    expect(SRC).not.toContain('EconomyPeriodComparison')
    expect(SRC.match(/function PeriodComparison\(/g)?.length).toBe(1)
  })

  it('el icono de un grupo sale de after (periodo actual) y, si no está ahí, de before — nunca se pierde un icono solo por desaparecer del periodo actual', () => {
    expect(fn).toContain('const icon = afterByName.get(name)?.icon ?? beforeByName.get(name)?.icon ?? null')
  })
})

describe('PeriodComparison — resumen de totales opcional (showTotals), sin división por cero', () => {
  const fn = slice(SRC, 'function PeriodComparison({', '\n// Skill de Pepa, punto 13')

  it('showTotals por defecto es false — Economía no lo pide y no le cambia nada', () => {
    expect(fn).toContain('showTotals = false')
  })

  it('el porcentaje del total es null cuando el periodo anterior fue 0 — nunca una división por cero/Infinity%', () => {
    expect(fn).toContain('const totalDeltaPercent = totalBefore > 0 ? Math.round(((totalAfter - totalBefore) / totalBefore) * 1000) / 10 : null')
  })

  it('sin ningún dato en ninguno de los dos periodos, el resumen de totales no se pinta (hasTotals exige alguno > 0)', () => {
    expect(fn).toContain('const hasTotals = showTotals && (totalBefore > 0 || totalAfter > 0)')
  })

  it('si no hay ni aumentos/descensos ni totales que mostrar, el componente no pinta nada (como ya hacía antes de este bloque)', () => {
    expect(fn).toContain('if (increases.length === 0 && decreases.length === 0 && !hasTotals) return null')
  })
})

describe('Compras (Estadística compras) — "Comparado con el periodo anterior" agrupado por TIENDA', () => {
  const callSite = slice(SRC, 'group === \'alimentacion\' && (\n        <PeriodComparison', '\n      )}\n\n      {group !== \'alimentacion\' && dateFilter}')

  it('agrupa por canonicalStoreName (misma normalización de tienda que el resto de Compras: dónuts, historial...), no por categoría', () => {
    expect(callSite).toContain('const store = canonicalStoreName(e.store, knownStores)')
    expect(callSite).not.toContain('groupSpending')
  })

  it('usa el MISMO filtro de "gasto real" que ya usa Total Registrado en Compras (monthRealExpenses) — los dos números son comparables', () => {
    expect(callSite).toContain("isComparableSpend={(e) => e.kind === 'real' && !e.isIncome && !isInternalTransferCategory(e.category, categories)}")
  })

  it('pide el resumen de totales (showTotals) — a diferencia de Economía, que no lo lleva', () => {
    expect(callSite).toContain('showTotals')
  })

  it('usa el motor de fechas ya existente (preset/periodFrom/periodTo/monthStartDay de esta misma pantalla) — no construye un segundo sistema de fechas para Compras', () => {
    expect(callSite).toContain('preset={preset}')
    expect(callSite).toContain('from={periodFrom}')
    expect(callSite).toContain('to={periodTo}')
    expect(callSite).toContain('monthStartDay={monthStartDay}')
  })
})

describe('groupByStore (Compras) — casos límite: tienda nueva, tienda desaparecida, importes redondeados', () => {
  it('suma por tienda con canonicalStoreName (mismo criterio en todas las filas) y redondea a centavos', () => {
    const callSite = slice(SRC, 'group === \'alimentacion\' && (\n        <PeriodComparison', '\n      )}\n\n      {group !== \'alimentacion\' && dateFilter}')
    expect(callSite).toContain('totals.set(store, (totals.get(store) ?? 0) + e.amount)')
    expect(callSite).toContain('amount: Math.round(amount * 100) / 100')
  })

  it('una tienda que solo aparece en un periodo (nueva, o ya no comprada) sigue el mismo tratamiento genérico de PeriodComparison: isNew si es nueva, o un descenso al 100% si desapareció — no hace falta lógica aparte', () => {
    // Esto ya lo prueba PeriodComparison en general (before=0 → isNew; after=0 con before>0 → delta negativo
    // -before, deltaPercent -100) — groupByStore no necesita reimplementar nada de eso, solo producir
    // {name, amount} por tienda; el resto (Set de nombres de los dos periodos, filtro both=0) es común.
    const fn = slice(SRC, 'function PeriodComparison({', '\n// Skill de Pepa, punto 13')
    expect(fn).toContain('const names = new Set([...beforeByName.keys(), ...afterByName.keys()])')
  })
})
