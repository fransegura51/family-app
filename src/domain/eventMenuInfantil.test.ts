import { describe, expect, it } from 'vitest'

// Menú infantil (2.ª tanda): las seis opciones pedidas, sin tareas ni presupuestos nuevos (los platos viven en Menú del evento).
const src = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const FOOD = src('src/domain/eventFood.ts')
const SCREEN = src('src/ui/EventosScreen.tsx')

describe('menú infantil — opciones de resolución', () => {
  it('el tipo incluye las opciones nuevas junto a las anteriores (sin borrar respuestas guardadas)', () => {
    expect(FOOD).toContain("export type MenuInfantilChoice = 'incluido' | 'pedir' | 'nosotros' | 'otro' | 'todavia_no_lo_sabemos' | 'mismo_menu' | 'menu_infantil' | 'alternativa'")
  })

  it('la UI ofrece Mismo menú, Menú infantil, Alternativa concreta, Incluido por restaurante/catering, Todavía no decidido y Otro', () => {
    const start = SCREEN.indexOf('const FOOD_MENU_INFANTIL_OPTIONS')
    const block = SCREEN.slice(start, SCREEN.indexOf('\n]', start))
    for (const label of ['Mismo menú', 'Menú infantil', 'Alternativa concreta', 'Incluido por restaurante/catering', 'Todavía no decidido', 'Otro']) {
      expect(block).toContain(label)
    }
  })

  it('las opciones nuevas no generan tareas ni presupuesto: desiredForMenuInfantil solo reconoce las anteriores', () => {
    const start = FOOD.indexOf('export function desiredForMenuInfantil')
    const body = FOOD.slice(start, FOOD.indexOf('\n}', start))
    expect(body).not.toMatch(/mismo_menu|menu_infantil|alternativa/)
    expect(body).toContain('return NONE')
  })
})
