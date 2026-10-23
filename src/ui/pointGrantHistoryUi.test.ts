import { describe, expect, it } from 'vitest'

// PEPA-PUNTOS-CORR — cableado de «Corregir puntos» / «Anular concesión» en el Historial. El servidor es quien impide
// de verdad (supabase/local-sql-tests/point-grants.mjs); aquí se comprueba que la pantalla solo ofrece la opción donde
// corresponde, sin tocar canjes, y siempre por el RPC.
const files = import.meta.glob(['/src/ui/RewardsScreen.tsx', '/src/ui/PointGrantHistory.tsx', '/src/data/rewards.ts', '/src/ui/MiCamino.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SCREEN = files['/src/ui/RewardsScreen.tsx']
const ITEM = files['/src/ui/PointGrantHistory.tsx']
const DATA = files['/src/data/rewards.ts']
const MI_CAMINO = files['/src/ui/MiCamino.tsx']

function between(src: string, from: string, to: string): string {
  const a = src.indexOf(from)
  expect(a, from).toBeGreaterThan(-1)
  const b = src.indexOf(to, a + from.length)
  expect(b, to).toBeGreaterThan(a)
  return src.slice(a, b)
}

describe('Corregir/anular puntos — dónde aparece la opción', () => {
  it('solo las concesiones del historial usan GrantHistoryItem; los canjes siguen siendo una línea sin opciones', () => {
    const historial = between(SCREEN, '<RewardsSubsection title="📜 Historial"', '</RewardsSubsection>')
    expect(historial).toContain('<GrantHistoryItem')
    expect(historial).toContain('{r.rewardTitle} · ⭐ {r.pointsSpent} · {REDEMPTION_STATUS_LABELS[r.status]}')
    const redemptionLines = between(historial, '{history.map((r) => (', '))}')
    expect(redemptionLines).not.toContain('Corregir')
    expect(redemptionLines).not.toContain('Anular')
    expect(redemptionLines).not.toContain('GrantHistoryItem')
  })

  it('la opción solo se pinta para adultos y solo en concesiones originales no anuladas', () => {
    expect(ITEM).toContain('const adjustable = isAdult && canAdjustGrant(grant, memberGrants)')
    expect(ITEM).toContain('{adjustable && (')
    // Las filas de corrección/anulación no tienen ninguna acción propia.
    const rowKind = between(ITEM, "if (grant.kind !== 'concesion') {", 'const status = grantStatus')
    expect(rowKind).not.toContain('Corregir puntos')
    expect(rowKind).not.toContain('adjustable')
  })

  it('opción discreta (⋯) con las dos acciones con el nombre pedido', () => {
    expect(ITEM).toContain('className="member-row-more"')
    expect(ITEM).toContain('✏️ Corregir puntos')
    expect(ITEM).toContain('🚫 Anular concesión')
  })
})

describe('Corregir/anular puntos — comportamiento del formulario', () => {
  it('al anular pide confirmación e indica cuántos puntos se descontarán', () => {
    expect(ITEM).toContain('Se descontarán <strong>{effective} {pointsWord(effective)}</strong> a {memberName}. El movimiento original se conserva en el historial.')
    expect(ITEM).toContain("'Sí, anular'")
    expect(ITEM).toContain('Cancelar')
  })
  it('al corregir permite cambiar la cantidad, con el efecto a la vista, y el motivo es opcional', () => {
    expect(ITEM).toContain('Cantidad correcta (ahora {signed(effective)})')
    expect(ITEM).toContain('Se descontarán ${-delta} ${pointsWord(delta)} a ${memberName}.')
    expect(ITEM).toContain('Se sumarán ${delta} ${pointsWord(delta)} a ${memberName}.')
    expect(ITEM).toContain('Motivo (opcional)')
  })
  it('avisa y bloquea antes de enviar si el saldo quedaría negativo (el servidor lo vuelve a comprobar)', () => {
    expect(ITEM).toContain('adjustmentWouldMakeBalanceNegative(balance, delta)')
    expect(ITEM).toContain('disabled={saving || blocked ||')
  })
  it('no admite guardar sin cambios ni cantidades inválidas, y evita el doble envío', () => {
    expect(ITEM).toContain('Number.isInteger(parsed) && parsed >= 1 && parsed <= 10000')
    expect(ITEM).toContain('parsed === effective')
    expect(ITEM).toContain('if (saving) return')
  })
  it('muestra fecha, responsable y estado (corregida / anulada) de cada movimiento', () => {
    expect(ITEM).toContain('por ${responsible}')
    expect(ITEM).toContain('✏️ corregida: ahora')
    expect(ITEM).toContain('🚫 anulada')
    expect(ITEM).toContain("grant.kind === 'anulacion' ? '🚫 Anulación' : '✏️ Corrección'")
  })
})

describe('Corregir/anular puntos — datos y servidor', () => {
  it('corregir y anular van SIEMPRE por el RPC adjust_point_grant; no queda ningún insert directo de correcciones', () => {
    expect(DATA).toContain("supabase.rpc('adjust_point_grant'")
    expect(DATA).not.toContain('reversePointGrant')
    expect(DATA).not.toContain('reverses_grant_id: grant.id')
  })
  it('tras corregir se recarga sin «Cargando…» para no cerrar el Historial', () => {
    expect(SCREEN).toContain('function reloadQuiet()')
    expect(SCREEN).toContain('onGrantChanged={reloadQuiet}')
  })
})

describe('Corregir/anular puntos — Mi Camino y Carrera siguen leyendo lo mismo', () => {
  it('Mi Camino sigue siendo de solo lectura sobre memberLifetimePoints (sin escrituras ni cambios)', () => {
    expect(MI_CAMINO).not.toContain('adjustPointGrant')
    expect(MI_CAMINO).not.toContain('memberPointsBalance')
    expect(SCREEN).toContain("const points = mode === 'camino' ? memberLifetimePoints(m.id, completions, grants) : (standing?.points ?? 0)")
  })
})
