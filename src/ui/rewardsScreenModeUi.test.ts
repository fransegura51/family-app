import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte A3) — "Camino de recompensas" (un único trayecto que nunca se reinicia)
// frente a "Carrera mensual" (progreso que arranca de cero cada mes) — ajuste de TODA la familia
// (reward_settings, migración 0248), nunca por miembro, y solo un adulto puede cambiarlo. Un canje de
// premio nunca debe hacer retroceder a nadie (ver domain/rewards.test.ts: memberLifetimePoints y
// memberMonthlyRacePoints ignoran los canjes a propósito) — esta UI solo prueba que enseña el número
// correcto según el modo, no vuelve a calcular nada por su cuenta.
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('A3 — el modo es un ajuste de familia completa, solo un adulto lo cambia', () => {
  it('"⚙️ 🛤️ Camino"/"⚙️ 🏁 Carrera" solo se muestra a isAdult', () => {
    const body = window_(UI, 'export function RewardsScreen', '\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir')
    expect(body).toContain("⚙️ {mode === 'camino' ? '🛤️ Camino' : '🏁 Carrera'}")
  })
  it('ModeSettingsPanel llama a setRewardMode, nunca escribe en family_members ni en ningún otro ajuste', () => {
    const panel = window_(UI, 'function ModeSettingsPanel(', '\n// Aprobar/rechazar una solicitud')
    expect(panel).toContain('await setRewardMode(next)')
    expect(panel).toContain('es un ajuste de toda la familia, no de cada niño/a por separado')
  })
})

describe('A3 — cada tarjeta muestra el progreso del modo activo, sin recalcular nada aparte', () => {
  it('en modo "camino" usa memberLifetimePoints (nunca se reinicia, ignora los canjes)', () => {
    const body = window_(UI, 'export function RewardsScreen', '\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir')
    expect(body).toContain("mode === 'camino'")
    expect(body).toContain('memberLifetimePoints(m.id, completions, grants)')
  })
  it('en modo "carrera" usa monthlyRaceStandings sobre los miembros VISIBLES (no sobre todos), con el mes real de hoy', () => {
    const body = window_(UI, 'export function RewardsScreen', '\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir')
    expect(body).toContain("mode === 'carrera' ? monthlyRaceStandings(visibleMembers.map((m) => m.id), yearMonth, completions, grants)")
    expect(body).toContain('const yearMonth = currentYearMonth()')
  })
})
