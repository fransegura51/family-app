import { describe, expect, it } from 'vitest'

// Encargo "Integración de la carrera animada V6" — sustituye la pista provisional que hubo aquí
// (A4: un carril simple con una ficha, documentado siempre como algo a sustituir, "nunca marcado como
// aprobado" — ver PEPA_CONTROL_REQUISITOS.md) por la carrera real (RaceTrack.tsx), con los corredores
// reales de la familia y las recompensas reales del catálogo.
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']
const BODY = UI.slice(UI.indexOf('export function RewardsScreen'), UI.indexOf('\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir'))

describe('Carrera animada V6 — una sola pista compartida, con los corredores y recompensas reales', () => {
  it('RaceTrack se pinta UNA sola vez (no por tarjeta), con los participantes reales y el catálogo activo', () => {
    expect(BODY).toContain('{raceRunners.length > 0 && <RaceTrack runners={raceRunners} rewards={activeRewards} />}')
    // Nunca la vieja pista provisional de un carril por tarjeta.
    expect(BODY).not.toContain('<div className="rewards-track">')
    expect(BODY).not.toContain('<div className="rewards-track-marker"')
  })

  it('la posición de cada corredor sale del mismo progreso real (Camino/Carrera) que ya enseña su tarjeta, nunca un valor aparte', () => {
    expect(BODY).toContain('const raceRunners = visibleMembers.map((m) => {')
    expect(BODY).toContain("const points = mode === 'camino' ? memberLifetimePoints(m.id, completions, grants) : (standing?.points ?? 0)")
    // La propia tarjeta reutiliza raceRunners (no vuelve a calcular su progreso por separado) —
    // así el número de la pista y el de la tarjeta nunca pueden desincronizarse.
    expect(BODY).toContain('{raceRunners.map(({ member: m, points: progressPoints }) => {')
  })

  it('las recompensas de la pista son el catálogo real activo (activeRewards), nunca emojis de ejemplo fijos', () => {
    expect(UI).toContain('const activeRewards = rewards.filter((r) => r.active)')
    expect(BODY).toContain('rewards={activeRewards}')
  })

  it('sin participantes, no se pinta ninguna pista (nunca una carrera vacía o con datos inventados)', () => {
    expect(BODY).toContain('raceRunners.length > 0 &&')
  })
})
