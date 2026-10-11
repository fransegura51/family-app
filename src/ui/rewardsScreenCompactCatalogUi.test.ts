import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte A8) — "mantener el catálogo existente, '+ Nueva recompensa' justo debajo del
// título y antes de la lista, tarjetas más compactas (emoji/nombre/coste/estado/acciones en un menú
// compacto: editar/activar-desactivar/borrar), controles sin ambigüedad, nunca tocar los permisos de
// canje/aprobación ya existentes".
const UI = (import.meta.glob('/src/ui/RewardsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RewardsScreen.tsx']

function catalogBlock(): string {
  const start = UI.indexOf('<h2 className="section-title">Catálogo de recompensas</h2>')
  expect(start, 'no se encontró el bloque del catálogo').toBeGreaterThan(-1)
  const end = UI.indexOf('\n        </>\n      )}\n    </div>\n  )\n}', start)
  expect(end, 'no se encontró el final del bloque del catálogo').toBeGreaterThan(start)
  return UI.slice(start, end)
}

describe('A8 — "+ Nueva recompensa" justo debajo del título, antes de la lista', () => {
  it('el botón/formulario de añadir aparece ANTES de event-list (la lista de tarjetas)', () => {
    const block = catalogBlock()
    const addIdx = block.indexOf('+ Nueva recompensa')
    const listIdx = block.indexOf('className="event-list"')
    expect(addIdx).toBeGreaterThan(-1)
    expect(listIdx).toBeGreaterThan(-1)
    expect(addIdx).toBeLessThan(listIdx)
  })
})

describe('A8 — tarjetas compactas con menú "⋯" (editar/activar-desactivar/borrar)', () => {
  it('cada tarjeta lleva un botón "⋯" con las acciones ocultas hasta tocarlo, mismo patrón ya usado en Familia', () => {
    const block = catalogBlock()
    expect(block).toContain('className="member-row-more"')
    expect(block).toContain('className="member-row-actions"')
  })
  it('el menú incluye exactamente editar, activar/desactivar y borrar — nunca toca la aprobación de canjes', () => {
    const block = catalogBlock()
    expect(block).toContain('✏️ Editar')
    expect(block).toContain("reward.active ? '📦 Desactivar' : '♻️ Reactivar'")
    expect(block).toContain('ariaLabel="Borrar recompensa"')
    expect(block).not.toContain('decideRewardRedemption')
    expect(block).not.toContain('requestRewardRedemption')
  })
  it('desactivar sigue pidiendo confirmación y sigue avisando que el historial de canjes se conserva', () => {
    const block = catalogBlock()
    expect(block).toContain('Deja de poderse solicitar, pero su historial de canjes se conserva')
  })
})
