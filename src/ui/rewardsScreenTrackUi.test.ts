import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte A4) — "no debe bloquear el resto del desarrollo": como un personaje infantil
// corriendo con limpieza de verdad no es viable en el tiempo de esta tanda, se deja preparado el espacio,
// la lógica de movimiento y la integración de datos reales (milestoneProgress sobre el progreso real del
// modo activo), con una representación provisional simple y funcional — nunca un hueco vacío ni un
// muñeco de baja calidad. No se marca como aprobado: ver docs/PEPA_CONTROL_REQUISITOS.md.
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']

describe('A4 — pista provisional, conectada a datos reales (nunca un hueco vacío)', () => {
  it('cada tarjeta reserva su propio carril (rewards-track), siempre presente, nunca condicionado a que "quede bien"', () => {
    const body = UI.slice(UI.indexOf('export function RewardsScreen'), UI.indexOf('\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir'))
    expect(body).toContain('<div className="rewards-track">')
    expect(body).toContain('<div className="rewards-track-marker"')
  })
  it('la posición del marcador sale de milestoneProgress sobre el progreso REAL (camino o carrera), nunca un valor fijo o aleatorio', () => {
    const body = UI.slice(UI.indexOf('export function RewardsScreen'), UI.indexOf('\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir'))
    expect(body).toContain('const milestone = milestoneProgress(progressPoints)')
    expect(body).toContain("mode === 'camino' ? memberLifetimePoints(m.id, completions, grants) : (standing?.points ?? 0)")
  })
  it('el marcador lleva el color pastel del propio miembro, igual que la tarjeta (A1) — nunca un color aparte', () => {
    const body = UI.slice(UI.indexOf('export function RewardsScreen'), UI.indexOf('\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir'))
    expect(body).toContain("style={{ background: toPastel(m.color, 'chart') }}")
  })
})
