import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte B5) — debajo de las 4 tarjetas, "Total fondo común": el saldo REAL del fondo
// compartido (aportado por impuesto de CUALQUIER hijo/a, menos lo ya gastado), nunca una cuenta bancaria
// real ni un duplicado de la tarjeta "Impuestos" (esa es solo del niño/a activo/a en los chips de arriba).
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const FS = UI['/src/ui/FinanceScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('"Total fondo común" — debajo de las 4 tarjetas, saldo real de toda la familia (Parte B5)', () => {
  const body = window_(FS, 'export function KidsFinanceTab(', '\nfunction GoalCard(')

  it('reutiliza taxFundAvailable (mismo cálculo que TaxFundSection), nunca una cifra nueva aparte', () => {
    expect(body).toContain('const taxFundTotal = taxFundAvailable(transactions, taxFundExpenses)')
  })
  it('aparece DESPUÉS del grid de 4 tarjetas, no antes ni mezclado con ellas', () => {
    const cardsIdx = body.indexOf('className="card-grid"')
    const fundIdx = body.indexOf('Total fondo común')
    expect(cardsIdx).toBeGreaterThan(-1)
    expect(fundIdx).toBeGreaterThan(cardsIdx)
  })
  it('con más de un niño aclara que es la suma de todos (nunca solo el niño/a activo/a)', () => {
    expect(body).toContain('members.length > 1')
    expect(body).toContain('Lo que han aportado entre todos los niños')
  })
  it('con un solo niño usa una frase sencilla, sin mencionar "todos"', () => {
    expect(body).toContain('Lo aportado, menos lo ya gastado del fondo común.')
  })
  it('tocarlo abre la tarjeta "Impuestos" ya existente, nunca una pantalla nueva', () => {
    const fundBlock = window_(body, '🏛️ Total fondo común', '</button>')
    expect(body.slice(body.indexOf('🏛️ Total fondo común') - 200, body.indexOf('🏛️ Total fondo común'))).toContain("onClick={() => openWalletCard('impuesto')}")
    expect(fundBlock).toContain('taxFundTotal.toFixed(2)')
  })
})
