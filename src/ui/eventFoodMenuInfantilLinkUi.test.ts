import { describe, expect, it } from 'vitest'

// Fase 3 (plan de pendientes) — "Menú infantil": las opciones nuevas 'menu_infantil' y 'alternativa' (sus
// platos viven en la sección «Menú infantil» de Menú del evento, ver src/domain/eventFood.ts:86-87) no
// llevaban a ningún sitio donde escribirlos — solo la opción heredada 'nosotros' mostraba el enlace. Este
// archivo protege que las tres comparten el mismo enlace (misma sección, sin inventar una nueva).
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const INFANTIL_BLOCK = slice(SRC, '{/* H) Menú infantil', '{/* I) Tarta')

describe('Menú infantil — enlace a Menú del evento para las 3 opciones que de verdad necesitan escribir platos', () => {
  it("'nosotros' (heredada), 'menu_infantil' y 'alternativa' comparten el mismo <FoodMenuLink>, nunca uno por opción", () => {
    expect(INFANTIL_BLOCK).toContain("infantil?.choice === 'nosotros'")
    expect(INFANTIL_BLOCK).toContain("infantil?.choice === 'menu_infantil'")
    expect(INFANTIL_BLOCK).toContain("infantil?.choice === 'alternativa'")
    expect(INFANTIL_BLOCK.match(/<FoodMenuLink/g) ?? []).toHaveLength(1)
  })

  it("el enlace sigue comprobando platos reales de la sección 'menu_infantil', nunca una cuenta inventada", () => {
    expect(INFANTIL_BLOCK).toContain("menuItems.some((i) => sectionKeyForCategory(i.category) === 'menu_infantil')")
  })

  it("'incluido' sigue con su propio flujo (FoodMenuSavePrompt) — no se mezcla con el enlace de las otras tres", () => {
    expect(INFANTIL_BLOCK).toContain("infantil?.choice === 'incluido'")
    expect(INFANTIL_BLOCK).toContain('<FoodMenuSavePrompt')
  })
})
