import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte B7) — historial Año → Mes → Movimientos, ambos plegables por su cuenta, tanto
// en el detalle de cada tarjeta (categoryTransactions) como en el fondo común (TaxFundSection, que funde
// aportaciones + gastos en una sola línea de tiempo antes de agrupar). Usa <details>/<summary> nativo
// (patrón ya existente en el resto de la app), nunca un acordeón nuevo; la fecha siempre sale de
// `created_at` real vía groupByYearMonth (domain/finance.ts), nunca se inventa.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const FS = UI['/src/ui/FinanceScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Detalle de cada tarjeta — historial agrupado Año → Mes (Parte B7)', () => {
  const body = window_(FS, 'export function KidsFinanceTab(', '\nfunction GoalCard(')

  it('usa groupByYearMonth sobre categoryTransactions, leyendo la fecha real (t.createdAt), nunca una inventada', () => {
    expect(body).toContain('groupByYearMonth(categoryTransactions, (t) => t.createdAt)')
  })
  it('año y mes son <details>/<summary> independientes, el más reciente de cada nivel abierto por defecto', () => {
    expect(body).toContain('className="wallet-history-year" open={yearIdx === 0}')
    expect(body).toContain('className="wallet-history-month" open={yearIdx === 0 && monthIdx === 0}')
  })
  it('cada movimiento conserva TODAS sus acciones de siempre (aprobar/rechazar si pendiente, eliminar), nada se ha quitado', () => {
    const detail = window_(body, "groupByYearMonth(categoryTransactions, (t) => t.createdAt)", '{categoryTransactions.length === 0')
    expect(detail).toContain('⏳ Pendiente de que un adulto lo apruebe')
    expect(detail).toContain('✓ Aprobar')
    expect(detail).toContain('✕ Rechazar')
    expect(detail).toContain('<ConfirmButton label="Eliminar"')
  })
  it('cada fila ahora enseña también el día (el mes/año ya los da el desplegable que la contiene)', () => {
    expect(body).toContain('{new Date(t.createdAt).getDate()} — {t.amount.toFixed(2)} € — {t.description}')
  })
})

describe('Fondo común — aportaciones y gastos fundidos en una sola línea de tiempo, agrupada Año → Mes (Parte B7)', () => {
  const section = window_(FS, 'function TaxFundSection({', '\nfunction AddTaxFundExpenseForm(')

  it('funde contributions (kid_wallet_transactions) y expenses (family_tax_fund_expenses) antes de agrupar, nunca dos listas aparte', () => {
    expect(section).toContain("kind: 'aporte' as const")
    expect(section).toContain("kind: 'gasto' as const")
    expect(section).toContain('groupByYearMonth(fundMovements, (m) => m.createdAt)')
  })
  it('borrar un gasto sigue siendo solo de adultos y solo afecta a los gastos, nunca a una aportación', () => {
    expect(section).toContain("{m.kind === 'gasto' && isAdult && (")
    expect(section).toContain('deleteTaxFundExpense(m.expenseId!)')
  })
  it('año y mes también son <details>/<summary> independientes aquí, mismo patrón que el detalle de cada tarjeta', () => {
    expect(section).toContain('className="wallet-history-year" open={yearIdx === 0}')
    expect(section).toContain('className="wallet-history-month" open={yearIdx === 0 && monthIdx === 0}')
  })
})
