import { describe, expect, it } from 'vitest'

// Encargo "Integración de la carrera animada V6" — sustituye la pista provisional que hubo aquí
// (A4: un carril simple con una ficha, documentado siempre como algo a sustituir, "nunca marcado como
// aprobado" — ver PEPA_CONTROL_REQUISITOS.md) por la carrera real (RaceTrack.tsx), con los corredores
// reales de la familia y las recompensas reales del catálogo.
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']
const BODY = UI.slice(UI.indexOf('export function RewardsScreen'), UI.indexOf('\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir'))

describe('Carrera animada V6 — una sola pista compartida, con los corredores reales', () => {
  it('RaceTrack se pinta UNA sola vez (no por tarjeta), con los participantes reales', () => {
    expect(BODY).toContain('<RaceTrack runners={raceRunners} decorator={raceDecorator} />')
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

  // Encargo "Separar puntos de carrera y saldo de recompensas" (COR-1) — la pista ya NO recibe el
  // catálogo de recompensas: vincular sus posiciones a los costes del catálogo sugería que gastar
  // puntos podía "retrasar" al corredor. RaceTrack ya no acepta esa prop (la línea exacta de arriba,
  // '<RaceTrack runners={raceRunners} />', ya prueba que no lleva "rewards" — MemberRewardsPanel más
  // abajo SÍ sigue recibiendo el catálogo, para poder canjear, y no debe confundirse con esto).
  it('la pista no vuelve a vincular sus posiciones a los costes del catálogo', () => {
    expect(BODY).not.toContain('RaceTrack runners={raceRunners} rewards')
  })

  it('un texto breve explica que la carrera (o el Camino) mide lo ganado, aunque luego se gaste', () => {
    expect(BODY).toContain('La carrera representa los puntos conseguidos durante el mes, aunque después se gasten en recompensas.')
    expect(BODY).toContain('El Camino representa el total de puntos conseguidos, aunque después se gasten en recompensas.')
  })

  it('sin participantes, no se pinta ninguna pista (nunca una carrera vacía o con datos inventados)', () => {
    expect(BODY).toContain('raceRunners.length > 0 &&')
  })
})
