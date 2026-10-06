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
    expect(MODAL).toContain('aria-label={`Cantidad de ${row.name || "producto nuevo"}`}')
    expect(MODAL).toContain('aria-label={`Tienda de ${row.name || "producto nuevo"}`}')
  })

  it('cada línea muestra de qué platos viene', () => {
    expect(MODAL).toContain('Para: {row.line ? [...new Set(row.line.sources.map((s) => s.dishName))].join')
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

// Maquetación móvil del modal de revisión (solo estructura JSX: el proyecto no puede leer CSS en vitest).
describe('modal de revisión — contenedor, tarjetas y pie separados (maquetación móvil)', () => {
  it('usa la hoja opaca de la app (.modal-sheet) dentro del overlay, nunca la clase huérfana .modal', () => {
    expect(MODAL).toContain('className="modal-overlay menu-shopping-overlay"')
    expect(MODAL).toContain('className="modal-sheet menu-shopping-sheet"')
    expect(MODAL).not.toContain('className="modal"')
  })

  it('cada ingrediente es una tarjeta independiente (article) con su propio check, controles y procedencia', () => {
    const item = MODAL.slice(MODAL.indexOf('<article'), MODAL.indexOf('</article>') + '</article>'.length)
    expect(MODAL).toContain('<article key={row.id} className="menu-shopping-item">')
    expect(item).toContain('type="checkbox"')
    expect(item).toContain('menu-shopping-quantity')
    expect(item).toContain('menu-shopping-store')
    expect(item).toContain('menu-shopping-sources')
  })

  it('cantidad y tienda están en el mismo bloque de controles, dentro de la misma tarjeta', () => {
    const controls = MODAL.slice(MODAL.indexOf('className="menu-shopping-controls"'), MODAL.indexOf('</div>', MODAL.indexOf('className="menu-shopping-controls"')))
    expect(controls).toContain('menu-shopping-quantity')
    expect(controls).toContain('menu-shopping-store')
  })

  it('el cuerpo con scroll termina antes del pie: el pie no está dentro del área desplazable', () => {
    const bodyStart = MODAL.indexOf('className="menu-shopping-body"')
    const footerStart = MODAL.indexOf('<footer className="menu-shopping-footer">')
    expect(bodyStart).toBeGreaterThan(-1)
    expect(footerStart).toBeGreaterThan(bodyStart)
    const between = MODAL.slice(bodyStart, footerStart)
    expect(between).toContain('</div>')
    expect(MODAL.slice(footerStart)).not.toContain('menu-shopping-item')
  })

  it('la cabecera va antes del cuerpo y dice qué se revisa', () => {
    expect(MODAL.indexOf('<header className="menu-shopping-header">')).toBeLessThan(MODAL.indexOf('className="menu-shopping-body"'))
    expect(MODAL).toContain('Revisa qué quieres añadir a Compras')
  })
})

describe('modal de revisión — ninguna acción guarda salvo la confirmación explícita', () => {
  it('Cancelar solo cierra (onClose) y no llama a ningún guardado', () => {
    const cancel = MODAL.slice(MODAL.indexOf('className="menu-shopping-cancel'), MODAL.indexOf('</button>', MODAL.indexOf('className="menu-shopping-cancel')))
    expect(cancel).toContain('onClick={onClose}')
    expect(cancel).not.toContain('confirm')
    expect(cancel).not.toContain('addMenuShoppingLines')
  })

  it('el botón de confirmar es el único que llama a confirm(), y confirm es el único que guarda', () => {
    const confirmBtn = MODAL.slice(MODAL.indexOf('className="menu-shopping-confirm"'), MODAL.indexOf('</button>', MODAL.indexOf('className="menu-shopping-confirm"')))
    expect(confirmBtn).toContain('onClick={() => void confirm()}')
    expect(MODAL.match(/addMenuShoppingLines\(/g)?.length).toBe(1)
  })

  it('abrir el modal no guarda: el estado inicial solo prepara filas, sin escrituras', () => {
    const init = MODAL.slice(MODAL.indexOf('useState<ReviewRow[]>'), MODAL.indexOf('const [saving'))
    expect(init).toContain('include: true')
    expect(init).not.toMatch(/addMenuShoppingLines|addShoppingItem/)
  })
})

describe('modal de revisión — contador, cantidades desconocidas y lógica intacta', () => {
  it('el número del botón sale de las filas marcadas (include)', () => {
    expect(MODAL).toContain('const selected = rows.filter((r) => r.include && r.name.trim()).length')
    expect(MODAL).toContain('`Añadir ${selected} a Compras`')
  })

  it('la cantidad desconocida se muestra vacía con placeholder, nunca como 0', () => {
    expect(MODAL).toContain("quantity: l.quantity ?? ''")
    expect(MODAL).toContain('placeholder="Cantidad (desconocida)"')
    expect(MODAL).not.toMatch(/quantity: ['"]0['"]/)
  })

  it('la lógica de confirmación no cambió: solo guarda las filas marcadas con su cantidad y tienda', () => {
    expect(MODAL).toContain('.filter((r) => r.include && r.name.trim())')
    expect(MODAL).toContain('store: r.store || null')
  })
})

describe('propuesta editable — nunca modifica la receta ni escribe antes de confirmar', () => {
  it('el modal no importa ni llama a ningún escritor de recetas', () => {
    expect(MODAL).not.toMatch(/updateRecipe|createRecipe|deleteRecipe/)
  })

  it('editar cantidad o tienda solo cambia el estado local de la fila (update), sin guardar', () => {
    const edit = MODAL.slice(MODAL.indexOf('function update('), MODAL.indexOf('async function confirm()'))
    expect(edit).toContain('setRows(')
    expect(edit).not.toMatch(/addShoppingItem|addMenuShoppingLines|supabase/)
  })
})
