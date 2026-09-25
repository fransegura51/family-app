import { describe, expect, it } from 'vitest'

// Guardas de la FASE 6D.1: una devolución no es ingreso real ni gasto real; SOLO domain/refunds.ts conoce su identidad
// (catalog_key i.ingreso.devoluciones); ningún consumidor de isRealIncome queda con la semántica antigua; sin migración, sin UI nueva.
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FINANCE_COMPUTE = APP['/src/domain/financeCompute.ts']
const FINANCE_ANALYSIS = APP['/src/domain/financeAnalysis.ts']
const REFUNDS = APP['/src/domain/refunds.ts']

describe('identidad de la devolución: un único sitio, por catalog_key', () => {
  it('REFUND_CATALOG_KEY es la clave estable del catálogo, definida una sola vez', () => {
    expect(REFUNDS).toContain("export const REFUND_CATALOG_KEY = 'i.ingreso.devoluciones'")
    const defs = Object.values(APP).filter((t) => /REFUND_CATALOG_KEY\s*=\s*['"]/.test(t))
    expect(defs).toHaveLength(1)
  })

  it('isRefundCategory decide SIEMPRE por catalogKey de la categoría resuelta, nunca por el nombre', () => {
    expect(REFUNDS).toContain("categories.find((c) => c.name === category)?.catalogKey === REFUND_CATALOG_KEY")
    expect(REFUNDS).not.toMatch(/===\s*['"]Devoluciones['"]/)
  })

  it('ningún otro archivo compara category === \'Devoluciones\' a mano: solo domain/refunds.ts conoce esa cadena', () => {
    const offenders = Object.entries(APP).filter(([f, t]) => f !== '/src/domain/refunds.ts' && /category\s*===?\s*['"]Devoluciones['"]/.test(t))
    expect(offenders.map(([f]) => f)).toEqual([])
  })
})

describe('isRealIncome: TODOS sus consumidores usan la nueva semántica (sin excepciones)', () => {
  it('isRealIncome excluye devoluciones a través de isRefund, en un solo lugar', () => {
    const body = FINANCE_COMPUTE.slice(FINANCE_COMPUTE.indexOf('export function isRealIncome'), FINANCE_COMPUTE.indexOf('function inRange'))
    expect(body).toContain('!isRefund(e, categories)')
    expect((FINANCE_COMPUTE.match(/export function isRealIncome/g) ?? []).length).toBe(1)
  })

  it('totalIncome sigue delegando en isRealIncome (no hay un segundo cálculo de ingreso que la ignore)', () => {
    const body = FINANCE_COMPUTE.slice(FINANCE_COMPUTE.indexOf('export function totalIncome'), FINANCE_COMPUTE.indexOf('export function totalRefunds'))
    expect(body).toContain('isRealIncome(e, data.categories)')
  })

  it('financeAnalysis calcula sus ingresos con isRealIncome (importado de financeCompute), no con un filtro propio', () => {
    expect(FINANCE_ANALYSIS).toContain('isRealIncome(e, data.categories)')
    expect(FINANCE_ANALYSIS).toMatch(/import\s*\{[^}]*isRealIncome[^}]*\}\s*from\s*'@\/domain\/financeCompute'/)
  })

  // RESUELTO EN 6D.3 (ver src/ui/financeUiRefunds.test.ts): los sitios de FinanceScreen.tsx/EventosScreen.tsx que SÍ representaban
  // "ingreso real" ahora pasan por isRealIncome/isRefund. Este texto sigue apareciendo en los dos archivos, pero por motivos
  // correctos y distintos: en FinanceScreen.tsx son el lado del GASTO (`!e.isIncome`, nunca necesitó isRealIncome) salvo
  // `monthSharedDeposits` (documentado aparte: "depósito en la cuenta común" de piso compartido, no ingreso familiar); en
  // EventosScreen.tsx las 4 apariciones son también el lado del gasto de un evento (documentado in situ). Se deja como
  // constancia de que la búsqueda por texto NO basta para auditar esto — hace falta leer qué calcula cada una.
  // Eventos Fase 3 — loadAllEventAlerts (src/data/events.ts) reutiliza EXACTAMENTE el mismo cálculo de "gastado" de un evento
  // que ya usa EventosScreen.tsx (mismo lado del gasto, misma etiqueta), para que el aviso "presupuesto excedido" nunca pueda
  // divergir de lo que el propio dashboard del evento ya muestra — no un cálculo nuevo, el mismo trasladado a la capa de datos.
  it('auditoría: lo que queda con este patrón de texto ya no es un filtro de ingresos sin corregir', () => {
    const offenders = Object.entries(APP)
      .filter(([f, t]) => !['/src/domain/financeCompute.ts', '/src/domain/financeAnalysis.ts'].includes(f) && /e\.isIncome\s*&&[^\n]*isInternalTransferCategory/.test(t))
      .map(([f]) => f)
      .sort()
    expect(offenders).toEqual(['/src/data/events.ts', '/src/ui/EventosScreen.tsx', '/src/ui/FinanceScreen.tsx'])
  })
})

describe('isRealSpending y grossSpending (totalSpending): sin cambios de comportamiento', () => {
  it('isRealSpending no se ha tocado (sigue excluyendo solo ingresos y movimientos internos)', () => {
    expect(FINANCE_COMPUTE).toContain("return e.kind === 'real' && !e.isIncome && !isInternalTransferCategory(e.category, categories)")
  })

  it('totalSpending sigue siendo gasto bruto: no resta refunds internamente', () => {
    const body = FINANCE_COMPUTE.slice(FINANCE_COMPUTE.indexOf('export function totalSpending'), FINANCE_COMPUTE.indexOf('export function totalIncome'))
    expect(body).not.toMatch(/refund/i)
  })
})

describe('netSpending / totalRefunds: nuevas, sin duplicar la fórmula en otros sitios', () => {
  it('netSpending = totalSpending - totalRefunds, definida una sola vez', () => {
    expect(FINANCE_COMPUTE).toContain('return Math.round((totalSpending(data, from, to, filter) - totalRefunds(data, from, to)) * 100) / 100')
    expect((FINANCE_COMPUTE.match(/export function netSpending/g) ?? []).length).toBe(1)
  })

  it('answerSaved (PEPA) usa netSpending para el ahorro, pero sigue mostrando el gasto bruto tal cual (sin cambiar su texto)', () => {
    const body = FINANCE_COMPUTE.slice(FINANCE_COMPUTE.indexOf('function answerSaved'), FINANCE_COMPUTE.indexOf('function answerTopCategories'))
    expect(body).toContain('const spent = totalSpending(data, resolved.from, resolved.to)')
    expect(body).toContain('netSpending(data, resolved.from, resolved.to)')
    expect(body).toContain('gastos ${formatEuros(spent)}') // el texto del gasto sigue siendo el bruto de siempre (sin ambigüedad, ver 6D.2)
  })

  it('buildAnalysis usa netSpending SOLO para el ahorro; expenses.total/categorías siguen en gasto bruto', () => {
    const body = FINANCE_ANALYSIS.slice(FINANCE_ANALYSIS.indexOf('export function buildAnalysis'), FINANCE_ANALYSIS.indexOf('// Categorías principales'))
    expect(body).toContain('totalRefunds(data, cp.current.from, cp.current.to)')
    expect(body).toContain('incomeNow - (total - refundsNow)')
    expect(FINANCE_ANALYSIS).toContain('expenses: { total, previous, difference, percentChange }')
  })
})

describe('lo que esta fase NO toca', () => {
  it('sin migración de datos nueva de la Fase 6D.2/6D.3 en sí: las posteriores son de otras fases, ya auditadas cada una en su sitio', () => {
    // 0153-0166: ver detalle en el historial de este archivo. 0167 (reclassify_commission_reversal_pair_202609,
    // FASE CA-4) es la corrección puntual del par comisión+bonificación de septiembre — un UPDATE de 2 filas
    // por id exacto, no de 6D.2/6D.3, auditada y con su propio test (commissionReversalMigration202609.test.ts).
    // 0168 (receipt_dedup_fingerprint) añade columnas de huella a `receipts` para evitar tickets duplicados —
    // tampoco toca devoluciones, auditada en mercadonaTicketDedup.test.ts.
    // Ninguna migración de datos posterior a 0152 toca la identidad ni el cálculo de una devolución.
    const numbers = Object.keys(MIGRATIONS)
      .map((f) => Number(f.match(/(\d{4})_/)?.[1]))
      .filter((n) => !Number.isNaN(n))
    expect(Math.max(...numbers)).toBe(168)
  })

  it('el sync bancario sigue con la regla /^anul\\b/i intacta; solo referencia REFUND_CATALOG_KEY donde corresponde (FASE DEV-1)', () => {
    // Hasta la FASE DEV-1 esta guarda comprobaba que el sync bancario no mencionaba nada de devoluciones en
    // absoluto. DEV-1 (posterior, auditada aparte — ver explicitBankRefundDetection.test.ts) añade
    // deliberadamente una regla estrecha ("DEVOLUCION" explícito al inicio → categoría oficial resuelta por
    // catalog_key, sin enlazar ninguna compra) que reutiliza el MISMO valor de REFUND_CATALOG_KEY que este
    // archivo define — no lo redefine con otro valor, no llama a isRefund(), no toca refunds.ts.
    const bank = FUNCTIONS['/supabase/functions/enable-banking-sync-transactions/index.ts']
    expect(bank).toContain('/^anul\\b/i')
    expect(bank).toContain(`const REFUND_CATALOG_KEY = "i.ingreso.devoluciones"`)
    expect(bank).not.toMatch(/isRefund\(/)
  })

  // La métrica 'refunds' y las frases de PEPA sobre devoluciones ya no están reservadas: las implementa la Fase 6D.2
  // (domain/financeQuery.ts, domain/financeCompute.ts) — ver src/domain/refundsPepa.test.ts.

  it('no se ha tocado ningún archivo de UI (.tsx)', () => {
    // Esta fase es dominio/cálculo puro: ni un solo componente cambia.
    const touchedDomain = ['/src/domain/refunds.ts', '/src/domain/financeCompute.ts', '/src/domain/financeAnalysis.ts', '/src/domain/types.ts', '/src/data/finance.ts']
    for (const f of touchedDomain) expect(APP[f]).toBeDefined()
  })

  it('classify_purchase, Amazon pendiente, category nullable y FOOD/OTHER/UNKNOWN no se mencionan aquí (fases 6C, sin regresión)', () => {
    expect(REFUNDS).not.toMatch(/classify_purchase|Amazon|non_food|FOOD|UNKNOWN/i)
  })
})
