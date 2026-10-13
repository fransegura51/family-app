import { describe, expect, it } from 'vitest'

// Encargo "Separar puntos de carrera y saldo de recompensas" (COR-2/COR-3) — la tarjeta de cada
// participante debe mostrar dos datos independientes y rotulados sin ambigüedad: lo que ha GANADO
// este mes/en total para la carrera (progressPoints, nunca baja al canjear) y el saldo que puede
// canjear ahora mismo (balance, memberPointsBalance). Ninguno de los dos se recalcula aquí — los dos
// ya vienen hechos de domain/rewards.ts, solo se muestran con una etiqueta clara.
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']
const BODY = UI.slice(UI.indexOf('export function RewardsScreen'), UI.indexOf('\n// PG-PUNTOS-FINANZAS (Parte A2) — "los adultos pueden elegir'))

describe('COR-2 — puntos del mes y saldo disponible, dos datos independientes y rotulados', () => {
  // Encargo "Reorganización de fichas" (punto 1) — pasan de una frase combinada a dos insignias
  // separadas, cada una con su propia etiqueta explícita, siempre visibles (Resumen).
  it('una insignia rotula explícitamente el SALDO disponible, aparte de la insignia de progreso', () => {
    expect(BODY).toContain('<span className="points-badge">⭐ Puntos disponibles: {balance}</span>')
  })

  it('en Carrera, la insignia de progreso dice explícitamente "🏁 Carrera mensual", sin mezclarlo con el saldo', () => {
    expect(BODY).toContain("mode === 'camino' ? '🛤️ Camino' : `🏁 Carrera mensual${standing ? ` (${standing.rank}º)` : ''}`")
    expect(BODY).toContain('<span className="points-badge">{progressChipLabel}: {progressPoints}</span>')
  })

  it('ninguno de los dos números se recalcula en la tarjeta — balance y progressPoints llegan ya hechos', () => {
    expect(BODY).toContain('const balance = memberPointsBalance(m.id, completions, redemptions, grants)')
    // progressPoints viene del propio raceRunners (ver rewardsScreenTrackUi.test.ts), no de una resta nueva aquí.
    expect(BODY).not.toMatch(/balance\s*-\s*(redemptions|spent|canje)/i)
  })
})

describe('COR-3 — progreso hacia la próxima recompensa del catálogo, sobre el saldo real', () => {
  it('usa nextRewardProgress(balance, …) — nunca milestoneProgress ni el progreso de Camino/Carrera', () => {
    expect(BODY).toContain('const nextReward = nextRewardProgress(balance, activeRewards.filter((r) => r.emoji && r.pointsCost > 0))')
    expect(BODY).not.toContain('milestoneProgress(progressPoints)')
    expect(BODY).not.toContain('hasta el próximo premio de hito')
  })

  it('sin una recompensa todavía inalcanzable (nextReward null), no se pinta ninguna barra — nunca un "0/10" inventado', () => {
    expect(BODY).toContain('{nextReward && (')
  })

  it('"Ya puedes conseguir" (A5, balance real) sigue intacto — una recompensa ya asequible sigue apareciendo ahí', () => {
    expect(BODY).toContain('activeRewards.filter((r) => r.emoji && r.pointsCost <= balance)')
    expect(BODY).toContain('🎁 Ya puedes conseguir:')
  })

  it('el mecanismo de "premio de hito" (A5, confeti cada 10 puntos de saldo) sigue existiendo, pero aparte — nunca se confunde con el catálogo', () => {
    expect(UI).toContain('const newOnes = newlyReachedMilestones(balance, highestSeen)')
    expect(UI).toContain('ha llegado a {celebrating.milestone * 10} puntos!')
  })
})
