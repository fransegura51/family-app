import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte A6) — "resultados de carrera mensual guardados, trofeos adaptados al número
// real de participantes, empates justos, nunca conceder puntos extra por ganar, historial preservado".
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('A6 — cierra solo el mes YA TERMINADO, nunca el que sigue en curso', () => {
  it('usa previousYearMonth(currentYearMonth()), nunca currentYearMonth() a secas', () => {
    const body = window_(UI, 'export function RewardsScreen', '\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir')
    expect(body).toContain('const yearMonth = previousYearMonth(currentYearMonth())')
  })
  it('solo cierra meses si la familia usa el modo "carrera" — nunca para quien no usa la función', () => {
    const body = window_(UI, 'export function RewardsScreen', '\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir')
    expect(body).toContain("if (loading || mode !== 'carrera') return")
  })
  it('no cierra un mes dos veces (historial preservado): comprueba que TODOS los visibles ya tengan resultado antes de calcular nada', () => {
    const body = window_(UI, 'export function RewardsScreen', '\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir')
    expect(body).toContain('const alreadyClosed = visibleMembers.every((m) => monthlyResults.some((r) => r.yearMonth === yearMonth && r.memberId === m.id))')
    expect(body).toContain('if (alreadyClosed) return')
  })
  it('el cierre usa assignTrophies sobre monthlyRaceStandings — nunca inventa un trofeo aparte', () => {
    const body = window_(UI, 'export function RewardsScreen', '\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir')
    expect(body).toContain('finalizeMonthlyResults(yearMonth, assignTrophies(standings))')
  })
})

describe('A6 — vitrina de trofeos por miembro, nunca mezclada con el saldo gastable', () => {
  it('TROPHY_EMOJI cubre los 4 trofeos posibles (oro/plata/bronce/participación), sin inventar ninguno más', () => {
    const block = window_(UI, 'const TROPHY_EMOJI:', '\n}')
    expect(block).toContain("oro: '🥇'")
    expect(block).toContain("plata: '🥈'")
    expect(block).toContain("bronce: '🥉'")
    expect(block).toContain("participacion: '🎖️'")
  })
  it('MemberRewardsPanel solo muestra "🏆 Trofeos" si hay alguno — nunca un botón vacío para quien no tiene historial', () => {
    const panel = window_(UI, 'function MemberRewardsPanel(', '\nconst QUICK_AMOUNTS')
    expect(panel).toContain('{trophies.length > 0 && (')
  })
})
