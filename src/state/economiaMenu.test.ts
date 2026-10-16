import { afterEach, describe, expect, it, vi } from 'vitest'
import { ECONOMIA_MENU_ITEM_META, loadEconomiaMenuLayout, type FixedEconomiaMenuItemKey } from './economiaMenu'

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

afterEach(() => vi.unstubAllGlobals())

// Fase 1E.2 — petición real: orden nuevo del menú de Economía y "Nuevo movimiento" deja de ser una entrada del menú (pasa a ser un botón dentro de
// Movimientos). 2026-10-16: "Educación financiera" también sale de este menú (vive en Pequeños Grandes).
describe('orden por defecto del menú de Economía', () => {
  it('sin nada guardado todavía (instalación nueva), el orden es exactamente el pedido, sin "Educación financiera" (ahora en Pequeños Grandes)', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    const layout = loadEconomiaMenuLayout()
    const keys = layout.flatMap((g) => g.items.map((it) => it.key))
    expect(keys).toEqual(['Resumen', 'Estadísticas', 'Movimientos', 'Presupuesto Generales', 'Banco', 'Previsión de pagos'])
  })

  it('"Nuevo movimiento" (accion:movimiento) ya no es una clave fija del menú', () => {
    expect(Object.keys(ECONOMIA_MENU_ITEM_META)).not.toContain('accion:movimiento')
    expect(Object.keys(ECONOMIA_MENU_ITEM_META)).toHaveLength(6)
    expect(Object.keys(ECONOMIA_MENU_ITEM_META)).not.toContain('Educación financiera')
  })

  it('un menú ya personalizado por la familia (guardado con el "accion:movimiento" antiguo) lo pierde solo, sin tocar el resto del orden que ya habían elegido', () => {
    const storage = fakeStorage()
    storage.setItem(
      'familyapp:economia-menu-layout',
      JSON.stringify([
        { id: 'default', name: null, items: [{ key: 'Banco' }, { key: 'accion:movimiento' }, { key: 'Resumen' }, { key: 'Estadísticas' }, { key: 'Movimientos' }, { key: 'Presupuesto Generales' }, { key: 'Educación financiera' }, { key: 'Previsión de pagos' }] },
      ]),
    )
    vi.stubGlobal('localStorage', storage)
    const layout = loadEconomiaMenuLayout()
    const keys = layout.flatMap((g) => g.items.map((it) => it.key))
    expect(keys).not.toContain('accion:movimiento')
    // El orden personalizado (Banco primero) se respeta tal cual — solo desaparece la clave retirada.
    expect(keys[0]).toBe('Banco')
  })

  it('un menú guardado con «Educación financiera» (que ya no es pestaña de Economía) la pierde sola, respeta el orden elegido y no deja ninguna clave sin icono', () => {
    const storage = fakeStorage()
    storage.setItem(
      'familyapp:economia-menu-layout',
      JSON.stringify([
        { id: 'a', name: 'Cuentas', items: [{ key: 'Banco' }, { key: 'Educación financiera' }, { key: 'Resumen' }] },
        { id: 'b', name: 'Más', items: [{ key: 'Movimientos' }, { key: 'custom:x', icon: '🌟', label: 'Mi acceso' }] },
      ]),
    )
    vi.stubGlobal('localStorage', storage)
    const layout = loadEconomiaMenuLayout()
    const keys = layout.flatMap((g) => g.items.map((it) => it.key))
    expect(keys).not.toContain('Educación financiera')
    // Lo demás queda como lo había elegido la familia (grupos, orden y accesos propios); lo que faltaba de la lista fija se añade al final del primer grupo.
    expect(layout[0].items.map((it) => it.key).slice(0, 2)).toEqual(['Banco', 'Resumen'])
    expect(layout[1].items.map((it) => it.key)).toEqual(['Movimientos', 'custom:x'])
    for (const item of layout.flatMap((g) => g.items).filter((it) => !String(it.key).startsWith('custom:'))) {
      expect(ECONOMIA_MENU_ITEM_META[item.key as FixedEconomiaMenuItemKey]).toBeDefined()
    }
  })

  it('cada clave fija tiene su icono/nombre real — ninguna huérfana', () => {
    const layout = loadEconomiaMenuLayout()
    for (const item of layout.flatMap((g) => g.items)) {
      expect(ECONOMIA_MENU_ITEM_META[item.key as FixedEconomiaMenuItemKey]).toBeDefined()
    }
  })
})
