import { describe, expect, it } from 'vitest'

// Fase 4 (plan de pendientes) — Economía: "Conciliados recientemente" vivía atado a la ventana propia de
// conciliación (±14/+10 días) y no había ningún sitio donde ver lo conciliado antes de esa ventana — se
// perdía de la vista sin más. Este archivo comprueba, leyendo el código fuente real (igual que
// src/ui/forecastUiWiring.test.ts, sin react-testing-library/jsdom en este proyecto), que el nuevo
// "Histórico de conciliaciones" reutiliza el MISMO motor (expandForecastOccurrences + overrides ya
// cargados) en vez de una consulta o cálculo aparte, y que nunca se solapa con "recientemente".
const FS = (import.meta.glob('/src/ui/FinanceScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FinanceScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Histórico de conciliaciones — mismo motor que "recientemente", nunca una consulta ni un cálculo nuevo', () => {
  it('reutiliza expandForecastOccurrences con los mismos overridesByPayment ya cargados (sin filtro de fecha)', () => {
    const block = slice(FS, 'const reconciliationHistoryRangeEnd = stepDays(reconciliationRangeStart, -1)', 'const reconciliationHistory =')
    expect(block).toContain('expandForecastOccurrences(p, overridesByPayment.get(p.id) ?? [], reconciliationHistoryRangeStart, reconciliationHistoryRangeEnd, p.installments)')
  })

  it('el histórico termina justo ANTES de donde empieza la ventana de "recientemente" — nunca se solapan ni se duplica una fila', () => {
    expect(FS).toContain('const reconciliationHistoryRangeEnd = stepDays(reconciliationRangeStart, -1)')
  })

  it('solo cuenta lo YA conciliado (matchedExpenseId) y se ordena de más reciente a más antiguo', () => {
    expect(FS).toContain('reconciliationHistoryOccurrences.filter((o) => !!o.matchedExpenseId).sort((a, b) => b.expectedPaymentDate.localeCompare(a.expectedPaymentDate))')
  })

  it('está plegado por defecto (reconciliationHistoryOpen arranca en false) — no vuelca meses de conciliaciones de golpe', () => {
    expect(FS).toContain('const [reconciliationHistoryOpen, setReconciliationHistoryOpen] = useState(false)')
  })

  it('la sección de conciliación aparece aunque solo haya histórico (sin candidatos ni "recientemente")', () => {
    expect(FS).toContain('(reconciliationCandidates.length > 0 || reconciledRecently.length > 0 || reconciliationHistory.length > 0) && (')
  })

  it('"Gestionar" de una fila del histórico abre el MISMO ManageReconciledExpense que "recientemente" — nunca un flujo aparte', () => {
    const historyMapStart = FS.indexOf('reconciliationHistoryOpen &&')
    expect(historyMapStart).toBeGreaterThan(-1)
    const nearby = FS.slice(historyMapStart, historyMapStart + 900)
    expect(nearby).toContain('reconciliationHistory.map((o) =>')
    expect(nearby).toContain('setManaging({ expenseId: o.matchedExpenseId!, forecastCategoryId: o.categoryId })')
  })
})
