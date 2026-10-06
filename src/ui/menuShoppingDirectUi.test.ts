import { describe, expect, it } from 'vitest'

// Compra directa de platos sin receta (cableado real leído del código fuente).
const read = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const MENU = read('src/ui/EventMenu.tsx')
const MODAL = read('src/ui/MenuShoppingModal.tsx')
const FOOD = read('src/data/food.ts')

describe('carrito de un plato sin receta', () => {
  it('el 🛒 directo aparece solo para platos sin receta enlazada y de compra de la familia', () => {
    expect(MENU).toContain('{tools && dish.requiresPurchase !== false && !dish.recipeId && (')
    expect(MENU).toContain('aria-label={`Preparar compra de ${dish.name}`}')
  })

  it('el 🛒 con receta sigue exactamente igual (ingredientes de la receta)', () => {
    expect(MENU).toContain('{tools && dish.requiresPurchase !== false && recipe && recipe.ingredients.length > 0 && (')
    expect(MENU).toContain('onClick={() => setIngredientsFor(dish)}')
  })

  it('abrir el 🛒 directo solo fija el plato; la revisión se muestra antes de guardar', () => {
    expect(MENU).toContain('onClick={() => setDirectDish(dish)}')
    expect(MENU).toContain('lines={buildMenuShoppingPlan([directDish], data.recipes, targetDiners, mode)}')
  })

  it('el plato sin receta NO usa la vía de receta (PickIngredientsModal solo con receta)', () => {
    expect(MENU).toContain('{ingredientsFor && ingredientsFor.recipeId && recipeById.get(ingredientsFor.recipeId) && (')
  })
})

describe('revisión: nombre editable, producto a mano, confirmación explícita', () => {
  it('la propuesta de un plato sin receta tiene el nombre editable', () => {
    expect(MODAL).toContain('aria-label={`Nombre de ${row.line.name}`}')
    expect(MODAL).toContain('onChange={(e) => update(row.id, { name: e.target.value })}')
  })

  it('se puede añadir un producto a mano que entra en la misma revisión', () => {
    expect(MODAL).toContain('+ Añadir producto a mano')
    expect(MODAL).toContain('function addManual()')
  })

  it('solo se guardan las filas marcadas y con nombre; las vacías no', () => {
    expect(MODAL).toContain('.filter((r) => r.include && r.name.trim())')
  })

  it('cantidad sin valor se envía vacía, nunca 0', () => {
    expect(MODAL).toContain("quantity: l.quantity ?? ''")
    expect(MODAL).not.toMatch(/quantity: ['"]0['"]/)
  })

  it('Cancelar solo cierra; ninguna edición guarda', () => {
    const cancel = MODAL.slice(MODAL.indexOf('menu-shopping-cancel'), MODAL.indexOf('</button>', MODAL.indexOf('menu-shopping-cancel')))
    expect(cancel).toContain('onClick={onClose}')
    expect(MODAL.match(/addMenuShoppingLines\(/g)?.length).toBe(1)
  })

  it('editar nombre o cantidad solo cambia el estado de la revisión (no toca el plato ni la base de datos)', () => {
    const update = MODAL.slice(MODAL.indexOf('function update('), MODAL.indexOf('// Producto añadido a mano'))
    expect(update).toContain('setRows(')
    expect(update).not.toMatch(/supabase|addShoppingItem|addMenuShoppingLines|updateEventMenuItem/)
  })
})

describe('datos: el guardado de compra directa usa la misma función de Compras', () => {
  it('addMenuShoppingLines guarda en UNA operación atómica (RPC) con cantidad null cuando es desconocida', () => {
    const start = FOOD.indexOf('export async function addMenuShoppingLines')
    const fn = FOOD.slice(start, FOOD.indexOf('\n}', start))
    expect(fn).toContain("supabase.rpc('add_menu_shopping_lines'")
    expect(fn).toContain("quantity === '' ? null : line.quantity")
    expect(fn).not.toContain('addShoppingItem')
  })
})
