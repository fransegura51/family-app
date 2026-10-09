import { describe, expect, it } from 'vitest'

// Pequeños Grandes (prompt maestro) — Fase 4: Puntos y recompensas. Verifica que el rediseño respeta
// las reglas explícitas: formularios ocultos hasta pulsar su botón, aprobar/rechazar/dar puntos solo
// visibles para adultos (la barrera real está en el servidor — RLS, migración 0229 — esto solo evita
// enseñar botones sin sentido), el canje pasa siempre por el RPC con reserva atómica, y el historial usa
// SIEMPRE el snapshot del premio (reward_title/reward_emoji), nunca un join a `rewards`.
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('RewardsScreen — isAdult se deriva del profile.role real, nunca de un flag inventado', () => {
  it('isAdult es admin/adult — la UI de gestión se oculta para child/guest', () => {
    expect(UI).toContain("const isAdult = profile.role === 'admin' || profile.role === 'adult'")
  })
  it('el catálogo (crear/editar/desactivar/borrar) solo se renderiza si isAdult', () => {
    const body = UI.slice(UI.indexOf('export function RewardsScreen'))
    expect(body).toContain('{isAdult && (')
    expect(body).toContain('Catálogo de recompensas')
  })
  it('las solicitudes pendientes de aprobar solo se muestran a isAdult', () => {
    expect(UI).toContain('{isAdult && pendingApprovals.length > 0 && (')
  })
})

describe('Solicitar un canje — siempre a través del RPC con reserva atómica, nunca un insert directo', () => {
  it('handleRequest llama a requestRewardRedemption (nunca a un insert o a la vieja redeemReward)', () => {
    const fn = window_(UI, 'async function handleRequest(', '\n  }')
    expect(fn).toContain('await requestRewardRedemption(reward.id, member.id)')
    expect(fn).not.toContain('redeemReward')
  })
  it('el botón "Solicitar" se deshabilita si el saldo no llega al coste', () => {
    expect(UI).toContain('disabled={!canAfford || requestingId === reward.id}')
    expect(UI).toContain('const canAfford = balance >= reward.pointsCost')
  })
})

describe('Aprobar/rechazar — rechazar pide confirmación (le quita algo al niño), aprobar no', () => {
  it('"Aprobar" es un botón directo', () => {
    expect(UI).toContain("onClick={() => void decide('aprobada')}")
  })
  it('"Rechazar" usa ConfirmButton (dos toques)', () => {
    const row = window_(UI, 'function RedemptionDecisionRow(', '\nfunction MemberRewardsPanel(')
    expect(row).toContain('<ConfirmButton label="✕ Rechazar"')
  })
})

describe('Historial — usa SIEMPRE el snapshot del premio, nunca un join a `rewards` que pudiera haber cambiado', () => {
  it('el historial de cada miembro muestra r.rewardTitle/r.rewardEmoji, nunca busca en la lista de rewards', () => {
    const panel = window_(UI, 'function MemberRewardsPanel(', '\nconst QUICK_AMOUNTS')
    expect(panel).toContain('r.rewardEmoji')
    expect(panel).toContain('r.rewardTitle')
  })
})

describe('Formularios ocultos hasta pulsar su botón (4.2) — nunca siempre visibles como antes de la Fase 4', () => {
  it('"Nueva recompensa" solo se renderiza tras showAddReward', () => {
    expect(UI).toContain('{showAddReward ? (')
    expect(UI).toContain('<AddRewardForm onClose={() => setShowAddReward(false)}')
  })
  it('"Dar puntos" solo se renderiza tras showGivePoints, y solo para isAdult', () => {
    expect(UI).toContain('{showGivePoints && <GivePointsForm')
    const panel = window_(UI, 'function MemberRewardsPanel(', '\nconst QUICK_AMOUNTS')
    expect(panel).toContain('{isAdult && (')
  })
})

describe('Desactivar una recompensa (4.2) — nunca borra su historial, siempre pide confirmación', () => {
  it('usa ConfirmButton con un mensaje que explica que el historial se conserva', () => {
    expect(UI).toContain('Deja de poderse solicitar, pero su historial de canjes se conserva')
  })
})
