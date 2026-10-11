import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte A5) — "hitos cada 10 puntos... calculados del saldo canjeable REAL, breve
// celebración + confeti, que no se repita cada vez que se abra la pantalla". La detección usa `balance`
// (memberPointsBalance), nunca el progreso de Camino/Carrera (progressPoints), que a propósito no baja
// al canjear — sería engañoso celebrar algo que ya no se puede gastar de verdad.
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']

describe('A5 — hitos detectados sobre el saldo canjeable real, nunca sobre Camino/Carrera', () => {
  it('newlyReachedMilestones se calcula con `balance` (memberPointsBalance), no con progressPoints', () => {
    expect(UI).toContain('const balance = memberPointsBalance(m.id, completions, redemptions, grants)')
    expect(UI).toContain('const newOnes = newlyReachedMilestones(balance, highestSeen)')
  })
  it('un salto grande marca TODOS los hitos nuevos como vistos, pero celebra solo el más alto (una celebración breve)', () => {
    expect(UI).toContain('if (!celebrate) celebrate = { memberId: m.id, memberName: m.name, milestone: newOnes[newOnes.length - 1] }')
  })
  it('la celebración se cierra sola a los 4s, nunca exige un cierre manual', () => {
    expect(UI).toContain('setTimeout(() => setCelebrating(null), 4000)')
  })
})

describe('A5 — emojis de recompensa calculados del saldo canjeable real', () => {
  it('"Ya puedes conseguir" filtra el catálogo activo por balance (nunca por el progreso de Camino/Carrera)', () => {
    expect(UI).toContain('activeRewards.filter((r) => r.emoji && r.pointsCost <= balance)')
  })
})
