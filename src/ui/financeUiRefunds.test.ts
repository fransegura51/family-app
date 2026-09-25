import { describe, expect, it } from 'vitest'

// FASE 6D.3 — UI / Economía / consistencia visual del Modelo C de Devoluciones. El componente no se renderiza (este proyecto no
// tiene react-testing-library/jsdom: el resto de guardas de FinanceScreen.tsx también se auditan por texto, ver refundsGuards.test.ts);
// aquí se comprueba que cada sitio que representa "Ingresos"/"Devoluciones"/"Gasto neto"/"Balance" usa los helpers de dominio
// centrales (isRealIncome, isRefund, domain/financeCompute.ts y domain/refunds.ts) en vez de reimplementar la identidad de una
// devolución — la verificación visual con datos reales se hizo a mano en el navegador (ver informe de la fase).
const FILES = import.meta.glob(['/src/ui/FinanceScreen.tsx', '/src/ui/EventosScreen.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FS = FILES['/src/ui/FinanceScreen.tsx']
const EVENTOS = FILES['/src/ui/EventosScreen.tsx']
const APP_DOMAIN = import.meta.glob('/src/domain/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function body(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker)
  const end = text.indexOf(endMarker, start)
  expect(start, `no encuentro "${startMarker}"`).toBeGreaterThanOrEqual(0)
  expect(end, `no encuentro "${endMarker}" después de "${startMarker}"`).toBeGreaterThan(start)
  return text.slice(start, end)
}

describe('2. no se duplica la identidad de dominio: FinanceScreen usa isRealIncome/isRefund, nunca las reimplementa', () => {
  it('importa los helpers centrales, no una copia propia', () => {
    // Corrección — ahora import junto a computePeriodFinancials (misma función compartida de
    // Resumen/Evolución temporal), pero isRealIncome se sigue importando de financeCompute, no
    // reimplementado.
    expect(FS).toMatch(/import\s*\{\s*computePeriodFinancials,\s*isRealIncome\s*\}\s*from\s*'@\/domain\/financeCompute'/)
    expect(FS).toMatch(/import\s*\{\s*isRefund\s*\}\s*from\s*'@\/domain\/refunds'/)
  })
})

describe('A/D. Movimientos y Banco: "Ingresos" excluye devoluciones; "Devoluciones" es su propio filtro', () => {
  it('BankTab: el filtro "ingresos" usa isRealIncome; "devoluciones" usa isRefund', () => {
    const b = body(FS, 'function BankTab(', 'function DateFilterTab(')
    expect(b).toContain("if (typeFilter === 'ingresos') return isRealIncome(e, categories)")
    expect(b).toContain("if (typeFilter === 'devoluciones') return isRefund(e, categories)")
    expect(b).toMatch(/'todos' \| 'fijos' \| 'variables' \| 'ingresos' \| 'devoluciones' \| 'categoria' \| 'busqueda' \| 'pendientes'/)
  })

  it('ExpensesTab (Movimientos): el filtro "ingresos" usa isRealIncome; "devoluciones" usa isRefund', () => {
    const b = body(FS, 'function ExpensesTab(', 'function movementRowColor(')
    expect(b).toContain("if (typeFilter === 'ingresos') return isRealIncome(e, categories)")
    expect(b).toContain("if (typeFilter === 'devoluciones') return isRefund(e, categories)")
    // La cabecera "X € gastados · +Y € ingresados" (monthIncome) tampoco cuenta una devolución.
    expect(b).toContain('accountFilteredExpenses.filter((e) => isRealIncome(e, categories))')
  })

  it('TYPE_FILTER_OPTIONS incluye Devoluciones, junto a Ingresos y Pendientes', () => {
    const idx = { ingresos: FS.indexOf("{ key: 'ingresos'"), devoluciones: FS.indexOf("{ key: 'devoluciones'"), pendientes: FS.indexOf("{ key: 'pendientes'") }
    expect(idx.ingresos).toBeGreaterThan(0)
    expect(idx.devoluciones).toBeGreaterThan(idx.ingresos)
    expect(idx.pendientes).toBeGreaterThan(idx.devoluciones)
  })

  it('"Ver registros →" de Ingresos (el filtro isIncome:true que llega a Movimientos) tampoco cuenta una devolución', () => {
    const b = body(FS, 'function ExpensesTab(', 'function movementRowColor(')
    expect(b).toContain('if (filter.isIncome === true && isRefund(e, categories)) return false')
  })
})

describe('B. una devolución sigue visible en "Todos" (nunca se oculta del historial)', () => {
  it("el filtro 'todos' sigue devolviendo true sin condiciones, en Banco y Movimientos", () => {
    const matches = [...FS.matchAll(/if \(typeFilter === 'todos'\) return true/g)]
    expect(matches.length).toBe(2) // BankTab + ExpensesTab
  })
  it('refundsOnly (como pendingOnly) es un filtro lógico aparte, no una exclusión del listado general', () => {
    expect(FS).toContain('refundsOnly?: boolean')
    expect(FS).toContain('if (filter.refundsOnly && !isRefund(e, categories)) return false')
  })
})

describe('C. una devolución nunca cuenta como gasto (is_income=true, fuera de !e.isIncome)', () => {
  it('ResumenTab: totalSpent/refundsTotal/netSpent salen de computePeriodFinancials (misma función que Evolución temporal), no de una fórmula propia', () => {
    const b = body(FS, 'function ResumenTab(', 'function PepaConclusionsWidget(')
    expect(b).toContain(
      'const { income: totalIncome, spent: totalSpent, refunds: refundsTotal, netSpent, ahorro } = computePeriodFinancials(inRange, categories)',
    )
    // La propia función compartida (financeCompute.ts) es la que de verdad define totalSpent como gasto
    // BRUTO (isRealSpending: !e.isIncome, nunca resta la devolución) y netSpent como spent - refunds.
    const financeCompute = APP_DOMAIN['/src/domain/financeCompute.ts']
    const fnBody = body(financeCompute, 'export function computePeriodFinancials', '\n}')
    expect(fnBody).toContain('rows.filter((e) => isRealSpending(e, categories))')
    expect(fnBody).toContain('rows.filter((e) => isRefund(e, categories))')
    expect(fnBody).toContain('const netSpent = spent - refunds')
  })
})

describe('E-I. Resumen: ingresos reales, gasto bruto, devoluciones, gasto neto y balance (Modelo C)', () => {
  it('totalIncome usa isRealIncome (ingreso real, sin devoluciones); ahorro = totalIncome - netSpent (misma invariante que PEPA), vía computePeriodFinancials', () => {
    const b = body(FS, 'function ResumenTab(', 'function PepaConclusionsWidget(')
    expect(b).toContain('computePeriodFinancials(inRange, categories)')
    const financeCompute = APP_DOMAIN['/src/domain/financeCompute.ts']
    const fnBody = body(financeCompute, 'export function computePeriodFinancials', '\n}')
    expect(fnBody).toContain('rows.filter((e) => isRealIncome(e, categories))')
    expect(fnBody).toContain('ahorro: income - netSpent')
  })

  it('la tarjeta SOLO añade Devoluciones/Gasto neto cuando refundsTotal > 0 (si refunds = 0, la tarjeta no cambia)', () => {
    const b = body(FS, 'function ResumenTab(', 'function PepaConclusionsWidget(')
    expect(b).toContain('{refundsTotal > 0 && (')
    expect(b).toContain('Devoluciones: +{refundsTotal.toFixed(2)} €')
    expect(b).toContain('Gasto neto: <strong>{netSpent.toFixed(2)} €</strong>')
    // Ingresos/Gastos (bruto) se muestran SIEMPRE, tal cual, fuera del condicional de devoluciones.
    expect(b.indexOf('Ingresos: +{totalIncome.toFixed(2)}')).toBeLessThan(b.indexOf('{refundsTotal > 0 && ('))
    expect(b.indexOf('Gastos: -{totalSpent.toFixed(2)}')).toBeLessThan(b.indexOf('{refundsTotal > 0 && ('))
  })

  it('el enlace de Devoluciones lleva a Movimientos con refundsOnly (nunca a un filtro de Ingresos)', () => {
    const b = body(FS, 'function ResumenTab(', 'function PepaConclusionsWidget(')
    expect(b).toContain("onViewMovements({ label: `Devoluciones — ${PRESET_LABELS[preset]}`, from, to, refundsOnly: true })")
  })
})

describe('9. Ahorro/Balance: solo cambia la etiqueta cuando es negativo, nunca la fórmula', () => {
  it('Resumen y Evolución temporal dicen "Balance" en vez de "Ahorro" cuando el importe es negativo', () => {
    expect(FS).toContain("<strong>{ahorro >= 0 ? 'Ahorro' : 'Balance'}: {ahorro.toFixed(2)} €</strong>")
    expect(FS).toContain("{r.ahorro >= 0 ? 'Ahorro' : 'Balance'}: {r.ahorro.toFixed(2)} €")
  })
  it('la fórmula del ahorro no cambia: Evolución temporal usa la misma computePeriodFinancials que Resumen (ingresos - gasto neto)', () => {
    // Fase 1F.D — "¿Por qué ha cambiado mi gasto?" se mudó a Compras (PorQueHaCambiadoMiCompra, ShoppingScreen.tsx);
    // el siguiente componente en FinanceScreen.tsx es ahora ExpensesTab.
    const b = body(FS, 'function EvolucionTemporal(', 'function ExpensesTab(')
    expect(b).toContain('computePeriodFinancials(inMonth, categories)')
    const financeCompute = APP_DOMAIN['/src/domain/financeCompute.ts']
    const fnBody = body(financeCompute, 'export function computePeriodFinancials', '\n}')
    expect(fnBody).toContain('ahorro: income - netSpent')
  })
})

describe('12/13/N. Gráficos y ranking de categorías: siguen en gasto BRUTO, sin atribuir devoluciones', () => {
  it('EstadisticasTab (dónuts, D/N/Q, fijo/variable) sigue construyéndose solo con !e.isIncome (una devolución nunca entra)', () => {
    const b = body(FS, 'function EstadisticasTab(', 'function EvolucionTemporal(')
    expect(b).toContain("const real = expenses.filter(\n    (e) => e.kind === 'real' && !e.isIncome && !isInternalTransferCategory(e.category, categories) && e.expenseDate >= from && e.expenseDate <= to,\n  )")
    expect(b).not.toMatch(/isRefund|refundsTotal|netSpent/)
  })
})

describe('14/O. Presupuesto General: sigue consumiéndose con gasto BRUTO (decisión 6D.3, sin cambios)', () => {
  it('totalSpent/byCategoryFlat de BudgetsOverview no descuentan devoluciones (siguen en !e.isIncome, sin isRefund)', () => {
    const b = body(FS, 'function BudgetsOverview(', 'async function handleDeleteIncome')
    expect(b).toContain("const totalSpent = inRange\n    .filter((e) => !e.isIncome && e.kind === 'real' && !isInternalTransferCategory(e.category, allCategories))")
    expect(b).not.toMatch(/totalSpent.*isRefund|isRefund.*totalSpent/)
  })

  it('pero "Ingresos" (totalIncome, manual y bancario) sí excluye una devolución — no es gasto de presupuesto, es la cifra de Ingresos', () => {
    const b = body(FS, 'function BudgetsOverview(', 'async function handleDeleteIncome')
    expect(b).toContain("e.source === 'manual' && !isRefund(e, allCategories)")
    expect(b).toContain('!isInternalTransferCategory(e.category, allCategories) && !isRefund(e, allCategories)')
  })
})

describe('S. EventosScreen: auditado — sus 4 apariciones son el GASTO de un evento, nunca "ingreso real"', () => {
  it('las 4 siguen siendo !e.isIncome (gasto), documentadas, sin isRealIncome (no aplica: no es ingreso)', () => {
    const matches = [...EVENTOS.matchAll(/\.filter\(\(e\) => e\.tagId === event\.tagId && !e\.isIncome && !isInternalTransferCategory\(e\.category, categories\)\)/g)]
    expect(matches.length).toBe(4)
    expect(EVENTOS).toContain('FASE 6D.3 — auditoría')
    // No se USA isRealIncome (no aplica: esto es gasto, no ingreso) — solo se menciona en el comentario de auditoría.
    expect(EVENTOS).not.toMatch(/isRealIncome\(/)
  })
})

describe('monthSharedDeposits (piso compartido): semántica distinta documentada, intencionalmente sin tocar', () => {
  it('sigue sin pasar por isRealIncome/isRefund, con la razón explicada in situ', () => {
    const b = body(FS, 'const monthSharedDeposits = scopedExpenses.filter(', 'function periodLabelForTitle(')
    expect(FS).toContain('esto NO es "ingreso real familiar" (isRealIncome)')
    expect(b).not.toMatch(/isRealIncome\(/)
  })
})

describe('24/M. Cobro anulado: nunca aparece en Ingresos, Gastos, Devoluciones ni Gasto neto', () => {
  it('isInternalTransferCategory (que excluye Cobro anulado, hijo de Movimientos internos) sigue delante de cada total tocado', () => {
    expect(FS).toContain('const real = inRange.filter((e) => e.kind === \'real\' && !isInternalTransferCategory(e.category, categories))')
  })
})

describe('28. no se reescribe PEPA 6D.2: solo se comparten los mismos helpers de dominio', () => {
  it('domain/financeCompute.ts y domain/refunds.ts no se han tocado en esta fase (mismo contrato que consume PEPA)', () => {
    expect(FS).not.toMatch(/export function answerRefunds|export function totalRefunds/)
  })
})

describe('29/30. no banco, no migración, no cambios de datos', () => {
  it('sin migración de datos nueva de la Fase 6D.2/6D.3 en sí: las posteriores son de otras fases, ya auditadas cada una en su sitio', () => {
    // 0153-0166: ver detalle en el historial de este archivo. 0167 (reclassify_commission_reversal_pair_202609,
    // FASE CA-4) es la corrección puntual del par comisión+bonificación de septiembre — un UPDATE de 2 filas
    // por id exacto, no de 6D.2/6D.3, auditada y con su propio test (commissionReversalMigration202609.test.ts).
    const numbers = Object.keys(MIGRATIONS)
      .map((f) => Number(f.match(/(\d{4})_/)?.[1]))
      .filter((n) => !Number.isNaN(n))
    expect(Math.max(...numbers)).toBe(167)
  })
  it('el sync bancario sigue con /^anul\\b/i intacta; solo referencia REFUND_CATALOG_KEY donde corresponde (FASE DEV-1)', () => {
    // Ver el mismo razonamiento en src/data/refundsGuards.test.ts — DEV-1 (posterior, auditada aparte)
    // reutiliza deliberadamente el mismo valor de REFUND_CATALOG_KEY, sin llamar a isRefund() ni tocar refunds.ts.
    const bank = FUNCTIONS['/supabase/functions/enable-banking-sync-transactions/index.ts']
    expect(bank).toContain('/^anul\\b/i')
    expect(bank).toContain(`const REFUND_CATALOG_KEY = "i.ingreso.devoluciones"`)
    expect(bank).not.toMatch(/isRefund\(/)
  })
})
