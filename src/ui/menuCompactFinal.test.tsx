// Ajustes finales del menú semanal de Cocina (19/10/2026): compacto, iconos de interfaz pequeños, editar y comprar también lo escrito a mano.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CartIcon, PencilIcon, TrashIcon } from '@/ui/MenuActionIcons'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const alim = read('src/ui/AlimentacionScreen.tsx')
const css = read('src/ui/styles.css')
const sheet = read('src/ui/ShoppingLinesSheet.tsx')
const block = (sel: string) => {
  const i = css.lastIndexOf(String.fromCharCode(10) + sel + ' {')
  return css.slice(i, css.indexOf('}', i))
}

describe('menú semanal compacto', () => {
  it('los acompañamientos no llevan raya vertical ni sangría', () => {
    const extras = block('.menu-slot-extras')
    expect(extras).not.toMatch(/border/)
    expect(extras).toMatch(/padding: 0/)
    expect(extras).toMatch(/margin: 0/)
    expect(css).not.toMatch(/\.menu-slot-extras \{[^}]*border-left/)
    // Quedan unidos a su plato por un «+» delante, sin bordes.
    expect(css).toContain(".menu-slot-extra .menu-slot-name::before")
    expect(block('.menu-slot-extra .menu-slot-name')).not.toMatch(/border/)
  })
  it('los iconos son SVG de interfaz de 17 px, no emojis, con zona de toque de 40×40 px', () => {
    for (const Icon of [CartIcon, PencilIcon, TrashIcon]) {
      const html = renderToStaticMarkup(<Icon />)
      expect(html).toContain('width="17"')
      expect(html).toContain('height="17"')
      expect(html).toContain('stroke="currentColor"')
      expect(html).toContain('aria-hidden="true"')
    }
    expect(block('.menu-icon-btn')).toMatch(/width: 40px;[\s\S]*height: 40px/)
    const dish = alim.slice(alim.indexOf('const dish = ('), alim.indexOf('return (\n              <Fragment key={meal.value}>'))
    expect(alim).toContain('<CartIcon />')
    expect(dish).toContain('<PencilIcon />')
    expect(dish).toContain('icon={<TrashIcon />}')
    const actions = alim.slice(alim.indexOf('const cart = ('), alim.indexOf('<Fragment key={meal.value}>'))
    expect(actions).not.toMatch(/🛒|✏️|🗑️/)
  })
  it('los iconos van en una línea aparte, a la derecha, con poca altura', () => {
    expect(block('.menu-slot-actions')).toMatch(/justify-content: flex-end/)
    expect(block('.menu-slot-actions')).toMatch(/height: 32px/)
  })
  it('la etiqueta de comida sigue arriba a la derecha y el nombre usa todo el ancho', () => {
    expect(block('.menu-slot-meal')).toMatch(/align-self: flex-end/)
    expect(block('.menu-slot-name')).toMatch(/width: 100%/)
  })
})

describe('editar y comprar también lo escrito a mano', () => {
  it('todas las entradas (plato principal y acompañamientos, con receta o texto libre) tienen carrito, lápiz y papelera', () => {
    const dish = alim.slice(alim.indexOf('const dish = ('), alim.indexOf('return (\n              <Fragment key={meal.value}>'))
    expect(dish).toContain('cart(e, label)')
    expect(dish).toContain('setEditingId(e.id)')
    expect(dish).toContain('deleteMenuEntry(e.id)')
    // El mismo bloque sirve al plato principal y a los acompañamientos.
    expect(alim).toContain('dish(entry, recipe)')
    expect(alim).toContain('dish(extra, extraRecipe)')
  })
  it('editar cambia solo la receta o el texto de esa entrada (no la elimina ni la recrea): fecha, comida y lugar se conservan', () => {
    const dish = alim.slice(alim.indexOf('const dish = ('), alim.indexOf('return (\n              <Fragment key={meal.value}>'))
    expect(dish).toContain('await updateMenuEntry(e.id, pick)')
    expect(dish).not.toContain('setMenuEntry(')
    expect(dish).not.toContain('deleteMenuEntry(e.id).then(reload)}\n                  />')
  })
  it('la revisión de Compras separa recetas y textos escritos a mano y deja revisar nombre, cantidad y unidad', () => {
    expect(sheet).toContain('Ingredientes de recetas')
    expect(sheet).toContain('Escritos a mano')
    for (const t of ['placeholder="Nombre del producto"', 'placeholder="Cantidad"', 'placeholder="Unidad"']) expect(sheet).toContain(t)
    // Lo que se envía de un producto escrito a mano es lo que la persona escribió: nada de cantidades inventadas.
    expect(sheet).toContain("quantity: (edits[r.line.key]?.quantity ?? '').trim()")
    expect(sheet).toContain("unit: (edits[r.line.key]?.unit ?? '').trim()")
  })
  it('los productos escritos a mano usan el mismo selector de tiendas y no se envían si se desmarcan o se quedan sin nombre', () => {
    expect(sheet).toContain('RowStoreSelect')
    expect(sheet).toContain('const usable = (r: MenuShoppingRow) => checked.has(r.line.key) && nameOf(r) !== \'\'')
    expect(sheet).toContain('const chosen = rows.filter(usable)')
  })
  it('la lista de la compra se lee UNA vez: cambiar personas no pierde lo marcado, lo editado ni las tiendas', () => {
    expect((sheet.match(/listShoppingItems\(\)/g) ?? []).length).toBe(1)
    expect(sheet).toContain('knownKeys')
    expect(sheet).toContain('const [edits, setEdits]')
  })
})
