import { describe, expect, it } from 'vitest'

// Encargo "Reorganización de fichas de Puntos y recompensas" (2026-10-13) — la ficha de cada niño/a
// pasa de "tocar para expandir todo" a un Resumen SIEMPRE visible (foto, nombre, carrera/camino, saldo,
// progreso hacia la siguiente recompensa) más tres bloques plegables independientes con su propio
// estado por defecto: 🎁 Catálogo (abierto), 📜 Historial (cerrado), 🏆 Trofeos (cerrado). No toca
// COR-1 a COR-4 (ver rewardsScreenPointsVsBalanceUi.test.ts / rewardsScreenTrackUi.test.ts).
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']
const BODY = UI.slice(UI.indexOf('export function RewardsScreen'), UI.indexOf('\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir'))

describe('Resumen — siempre visible, ya no detrás de un "tocar para expandir"', () => {
  it('no queda ningún rastro del antiguo expandedMemberId ni del "tocar para expandir" de la cabecera', () => {
    expect(UI).not.toContain('expandedMemberId')
    expect(BODY).not.toContain("cursor: 'pointer'")
    expect(BODY).not.toContain('setExpandedMemberId')
  })

  it('MemberRewardsPanel (catálogo/historial/trofeos) se pinta SIEMPRE, nunca detrás de una condición de apertura', () => {
    expect(BODY).toContain('<MemberRewardsPanel')
    // Ya no existe ninguna variable "open" de ficha (ver expandedMemberId arriba) que pudiera volver
    // a condicionar el panel — si reapareciera, sería exactamente el bug que corrige este encargo.
    expect(BODY).not.toMatch(/\{open\s*&&/)
  })

  it('el resumen muestra foto, nombre completo, progreso (carrera/camino) y saldo disponible — todo fuera de cualquier bloque plegable', () => {
    const resumenStart = BODY.indexOf('<MemberAvatar member={m} size={32} />')
    const resumenEnd = BODY.indexOf('<MemberRewardsPanel')
    expect(resumenStart).toBeGreaterThan(-1)
    expect(resumenEnd).toBeGreaterThan(resumenStart)
    const resumen = BODY.slice(resumenStart, resumenEnd)
    expect(resumen).toContain('{m.name}')
    expect(resumen).toContain('progressChipLabel')
    expect(resumen).toContain('⭐ Puntos disponibles: {balance}')
  })
})

// El Catálogo/Historial/Trofeos de cada niño/a viven dentro de MemberRewardsPanel, que cae FUERA del
// recorte BODY (ver arriba) — estas comprobaciones miran el archivo completo (UI), no BODY.
describe('Tres bloques plegables independientes (RewardsSubsection), cada uno con su propio estado por defecto', () => {
  it('🎁 Catálogo de recompensas — desplegado por defecto', () => {
    expect(UI).toContain('<RewardsSubsection title="🎁 Catálogo de recompensas" defaultOpen>')
  })

  it('📜 Historial — plegado por defecto', () => {
    expect(UI).toContain('<RewardsSubsection title="📜 Historial" defaultOpen={false}>')
  })

  it('🏆 Trofeos — plegado por defecto, se mantiene oculto por completo sin trofeos (comportamiento ya existente, no tocado)', () => {
    expect(UI).toContain('<RewardsSubsection title="🏆 Trofeos" defaultOpen={false}>')
    expect(UI).toContain('{trophies.length > 0 && (')
  })

  it('cada bloque usa el mismo patrón ya establecido en la app (cabecera ▸/▾ + contenido en un .card anidado)', () => {
    expect(UI).toContain("{open ? '▾' : '▸'} {title}")
    expect(UI).toContain('<div className="card" style={{ padding: 8, marginTop: 4 }}>{children}</div>')
  })
})

describe('"Dar puntos" y el catálogo general de abajo siguen con su funcionamiento actual', () => {
  it('"Dar puntos" sigue en la ficha, mismo botón y mismo formulario de siempre', () => {
    expect(UI).toContain('⭐ Dar puntos')
    expect(UI).toContain('<GivePointsForm member={member} onClose={() => setShowGivePoints(false)} onGiven={onChanged} setError={setError} />')
  })

  it('el catálogo general (crear/editar/administrar, para los padres) sigue aparte, debajo de las fichas, con los mismos datos', () => {
    expect(UI).toContain('<h2 className="section-title">Catálogo de recompensas</h2>')
    expect(UI).toContain('<AddRewardForm')
  })

  it('el catálogo por niño/a reutiliza exactamente el mismo array de recompensas activas (activeRewards) — nunca otro catálogo de datos', () => {
    expect(BODY).toContain('rewards={activeRewards}')
  })
})
