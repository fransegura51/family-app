import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte A1/A2) — A1: cada tarjeta de "Puntos por persona" lleva el pastel del
// propio color del miembro (toPastel), cubriendo toda la tarjeta en abierto y cerrado, nunca un color
// inventado aparte. A2: los adultos eligen quién participa (reward_participants, migración 0248) sin
// tocar ningún permiso general de la familia — un miembro desactivado desaparece de la lista pero su
// historial sigue intacto en la base de datos (eso no lo prueba esta UI, lo prueba rewards.test.ts).
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('A1 — pastel del color propio del miembro, cubriendo toda la tarjeta', () => {
  it('la tarjeta (abierta o cerrada, es el mismo div) usa toPastel(m.color) como fondo, nunca un color fijo', () => {
    const body = window_(UI, 'export function RewardsScreen', '\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir')
    expect(body).toContain("className=\"card task-card\" style={{ flexDirection: 'column', alignItems: 'stretch', background: toPastel(m.color) }}")
  })
})

describe('A2 — participación: solo un adulto la gestiona, nunca borra historial', () => {
  it('"⚙️ Quién participa" solo se muestra a isAdult', () => {
    const body = window_(UI, 'export function RewardsScreen', '\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir')
    expect(body).toContain('{isAdult && (')
    expect(body).toContain('⚙️ Quién participa')
  })
  it('la lista de "Puntos por persona" filtra con isMemberRewardsEnabled, nunca enseña a todo el mundo sin mirar', () => {
    const body = window_(UI, 'export function RewardsScreen', '\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir')
    expect(body).toContain('.filter((m) => isMemberRewardsEnabled(m.id, m.memberType, participants))')
  })
  it('ParticipantsPanel nunca borra nada — solo llama a setMemberRewardsEnabled (un ajuste, no un delete)', () => {
    const panel = window_(UI, 'function ParticipantsPanel(', '\n// Aprobar/rechazar una solicitud')
    expect(panel).toContain('await setMemberRewardsEnabled(member.id, enabled)')
    expect(panel).not.toContain('delete')
    expect(panel).toContain('Desactivar a alguien no borra nada de su historial')
  })
})
