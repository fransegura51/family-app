import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte B3) — sustituye "Disponible"/"Ahorro acumulado" por una tira compacta
// "💰 Mi dinero ahora" (entre el objetivo y las 4 tarjetas): el total (hucha + para gastar) y 3
// conceptos alineados debajo (🐷 Hucha / 🛒 Para gastar / 💸 Ya gastado, en negativo) — nunca pie charts
// aquí, compacto, sin scroll horizontal; "Ya gastado" puede enlazar al historial de gastos.
// .replace: un checkout en Windows puede guardar el archivo con CRLF; los \n literales de abajo
// deben seguir encontrándolo igual.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FinanceScreen.tsx'].replace(/\r\n/g, '\n')

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const KIDS_TAB = window_(UI, 'export function KidsFinanceTab(', '\nfunction GoalCard(')

describe('B3 — "💰 Mi dinero ahora": el total y los 3 conceptos alineados', () => {
  it('el total es hucha + para gastar (moneyNow = savedTotal + balance), calculado siempre, nunca un número aparte', () => {
    expect(KIDS_TAB).toContain('const moneyNow = savedTotal + balance')
    expect(KIDS_TAB).toContain('💰 Mi dinero ahora: {moneyNow.toFixed(2)} €')
  })
  it('🐷 Hucha y 🛒 Para gastar son walletBalance/walletCategoryTotal de siempre, sin recalcularlos aparte', () => {
    expect(KIDS_TAB).toContain('🐷 Hucha: {savedTotal.toFixed(2)} €')
    expect(KIDS_TAB).toContain('🛒 Para gastar: {balance.toFixed(2)} €')
  })
  it('💸 Ya gastado se enseña en negativo, nunca se resta otra vez de "Para gastar" (balance ya lo tiene restado)', () => {
    expect(KIDS_TAB).toContain("const gastoTotal = activeMemberId ? walletCategoryTotal(activeMemberId, 'gasto', transactions) : 0")
    expect(KIDS_TAB).toContain('💸 Ya gastado: -{gastoTotal.toFixed(2)} €')
    // balance ya resta "gasto" (walletBalance en domain/finance.ts) — gastoTotal nunca se usa para
    // recalcular `balance` ni `moneyNow`, solo se muestra.
    expect(KIDS_TAB).not.toContain('balance - gastoTotal')
    expect(KIDS_TAB).not.toContain('moneyNow - gastoTotal')
  })
  it('"Ya gastado" enlaza al historial de gastos (abre la tarjeta "Gastar" ya existente, nunca una vista nueva)', () => {
    expect(KIDS_TAB).toContain("onClick={() => setOpenCard('gasto')}")
  })
  it('compacto y sin scroll horizontal: flex-wrap, nunca overflow-x/white-space nowrap', () => {
    const strip = window_(KIDS_TAB, '💰 Mi dinero ahora', '</div>\n      </div>')
    expect(strip).toContain("flexWrap: 'wrap'")
    expect(strip).not.toContain('overflowX')
    expect(strip).not.toContain('nowrap')
  })
  it('nunca un pie chart aquí (eso es cosa de las 4 tarjetas, Parte B4)', () => {
    const strip = window_(KIDS_TAB, '💰 Mi dinero ahora', '</div>\n      </div>')
    expect(strip).not.toContain('svg')
    expect(strip).not.toContain('Donut')
  })
})
