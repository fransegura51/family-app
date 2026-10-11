import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte A7) — "Gran Copa Anual (quien ganó más carreras mensuales ese año, empates
// compartidos, sin ningún sistema de puntos nuevo) + vitrina por niño/a, por defecto el año en curso,
// con acceso a años anteriores, cada trofeo con tipo/mes/año/puesto, nunca una lista mezclada".
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('A7 — vitrina por año, por defecto el año en curso', () => {
  it('el año seleccionado arranca en el año real de hoy, nunca uno fijo a mano', () => {
    const panel = window_(UI, 'function MemberRewardsPanel(', '\nconst QUICK_AMOUNTS')
    expect(panel).toContain("const currentYear = String(new Date().getFullYear())")
    expect(panel).toContain('const [selectedYear, setSelectedYear] = useState(currentYear)')
  })
  it('los trofeos del año se filtran aparte (trophiesForYear) — nunca se enseña la lista completa mezclada de golpe', () => {
    const panel = window_(UI, 'function MemberRewardsPanel(', '\nconst QUICK_AMOUNTS')
    expect(panel).toContain('const trophiesForYear = trophies.filter((t) => t.yearMonth.startsWith(selectedYear))')
  })
  it('el selector de años siempre incluye el año en curso aunque ese miembro no tenga trofeos todavía', () => {
    const panel = window_(UI, 'function MemberRewardsPanel(', '\nconst QUICK_AMOUNTS')
    expect(panel).toContain('Array.from(new Set([currentYear,')
  })
})

describe('A7 — Gran Copa Anual: quien ganó más carreras ese año, sin inventar un sistema de puntos nuevo', () => {
  it('usa annualCupStandings sobre TODOS los resultados de la familia (monthlyResults), no solo los de este miembro', () => {
    const panel = window_(UI, 'function MemberRewardsPanel(', '\nconst QUICK_AMOUNTS')
    expect(panel).toContain('const cupStandings = annualCupStandings(monthlyResults, selectedYear)')
  })
  it('el aviso de Gran Copa solo se muestra a quien de verdad ganó ese año (isCupWinner)', () => {
    const panel = window_(UI, 'function MemberRewardsPanel(', '\nconst QUICK_AMOUNTS')
    expect(panel).toContain('{isCupWinner && (')
  })
})
