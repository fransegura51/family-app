import { describe, expect, it } from 'vitest'

// «Preparar compra del menú» y raciones (2.ª tanda): cableado real leído del código fuente.
const read = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const MENU = read('src/ui/EventMenu.tsx')
const MODAL = read('src/ui/MenuShoppingModal.tsx')
const FOOD = read('src/data/food.ts')
const ALIM = read('src/ui/AlimentacionScreen.tsx')
const MIG = (import.meta.glob('/supabase/migrations/0200_recipe_servings.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/migrations/0200_recipe_servings.sql']

describe('Preparar compra del menú — revisión antes de guardar', () => {
  it('el botón global solo aparece en modos en los que la familia cocina', () => {
    expect(MENU).toContain("{(mode === 'familia' || mode === 'mixto') && (")
    expect(MENU).toContain('🛒 Preparar compra del menú')
  })

  it('abre la revisión; no escribe en Compras desde el propio menú', () => {
    expect(MENU).toContain('setShoppingOpen(true)')
    expect(MENU).not.toContain('addMenuShoppingLines')
  })

  it('la revisión solo llama a addMenuShoppingLines dentro de confirm (tras pulsar el botón)', () => {
    const confirmBody = MODAL.slice(MODAL.indexOf('async function confirm()'), MODAL.indexOf('return (', MODAL.indexOf('async function confirm()')))
    expect(confirmBody).toContain('await addMenuShoppingLines(chosen, eventId)')
    expect(MODAL.match(/addMenuShoppingLines\(/g)?.length).toBe(1)
  })

  it('en la revisión se puede desmarcar cada línea, editar la cantidad y elegir tienda', () => {
    expect(MODAL).toContain('type="checkbox"')
    expect(MODAL).toContain('aria-label={`Cantidad de ${line.name}`}')
    expect(MODAL).toContain('aria-label={`Tienda de ${line.name}`}')
  })

  it('cada línea muestra de qué platos viene', () => {
    expect(MODAL).toContain('Para: {[...new Set(line.sources.map((s) => s.dishName))].join')
  })

  it('la compra guarda con addShoppingItem (mismo camino que el 🛒 de un plato), sin automatizar nada', () => {
    const fn = FOOD.slice(FOOD.indexOf('export async function addMenuShoppingLines'))
    expect(fn).toContain('await addShoppingItem(')
    expect(fn).toContain("priority: 'normal'")
  })
})

describe('raciones — estructura opcional, null cuando no se sabe', () => {
  it('la lectura y la escritura de recetas incluyen servings', () => {
    expect(FOOD).toContain('tags, servings, recipe_ingredients')
    expect(FOOD).toContain('servings: r.servings ?? null')
    expect(FOOD).toContain('servings: input.servings ?? null')
  })

  it('actualizar sin tocar raciones no las borra (solo se escribe si viene en la entrada)', () => {
    expect(FOOD).toContain('...(input.servings !== undefined ? { servings: input.servings } : {})')
  })

  it('el formulario guarda null si el campo está vacío y rechaza valores fuera de 1..50', () => {
    expect(ALIM).toContain("servingsTrimmed === '' ? null : Number(servingsTrimmed)")
    expect(ALIM).toContain('servingsValue < 1 || servingsValue > 50')
  })
})

describe('migración 0200 — aditiva, nullable, sin default', () => {
  it('añade servings como columna nullable con rango, sin default ni borrados', () => {
    expect(MIG).toContain('alter table recipes add column servings smallint null')
    const code = MIG.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(code).not.toMatch(/default/i)
    expect(code).not.toMatch(/\bdelete\b|\bdrop\b/i)
  })
})
