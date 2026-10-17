// Menú semanal oficial en Comunidad: estructura que se ve (renderToStaticMarkup, sin navegador ni red: los efectos no se ejecutan) y reglas que solo se
// comprueban leyendo el código (coste, seguridad, accesibilidad, punto de extensión de alergias, que cada botón tenga su función real).
// Los casos usan una copia CONGELADA del menú de la semilla anterior a la revisión del 16/10 (28 recetas, sin campos nuevos) y variantes con el contrato ampliado.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { parseMenu } from '@/domain/communityMenu'
import type { PostDetail } from '@/domain/community'
import detailSrc from '@/ui/community/PostDetailPage.tsx?raw'
import planSrc from '@/ui/community/menu/MenuPlanView.tsx?raw'
import importSrc from '@/ui/community/menu/MenuImportSheet.tsx?raw'
import shopSrc from '@/ui/ShoppingLinesSheet.tsx?raw'
import shopWrapperSrc from '@/ui/community/menu/MenuShoppingSheet.tsx?raw'
import dataSrc from '@/data/communityMenu.ts?raw'
import { MenuPlanView, RecipeBlock } from '@/ui/community/menu/MenuPlanView'
import { MenuImportSheet } from '@/ui/community/menu/MenuImportSheet'
import { MenuShoppingSheet } from '@/ui/community/menu/MenuShoppingSheet'
import { MenuPostPanel } from '@/ui/community/menu/MenuPostPanel'

vi.mock('@/data/communityMenu', () => ({ previewMenuImport: vi.fn(), runMenuImport: vi.fn() }))
vi.mock('@/data/shopping', () => ({ listShoppingItems: vi.fn(), addShoppingItems: vi.fn() }))
vi.mock('@/data/community', () => ({ camelize: (x: unknown) => x, getPost: vi.fn() }))
// El acceso a Comunidad lo decide useCommunityAccess; aquí se simula acceso completo o solo lectura.
let canParticipate = true
vi.mock('@/ui/community/useCommunityAccess', () => ({
  useCommunityAccess: () => ({ canParticipate, readOnly: !canParticipate, canRead: true, level: canParticipate ? 'participate' : 'read', reason: null, access: {}, refreshAccess: async () => ({}) }),
}))

const raw = JSON.parse(readFileSync(join(process.cwd(), 'src/domain/fixtures/menuSemanaAnterior.json'), 'utf8'))
const menu = parseMenu(raw)!
const dated = parseMenu({ ...raw, weekStart: '2026-10-19', weekEnd: '2026-10-25' })!

const detail = { id: 'p1', kind: 'menu', body: 'Texto de la publicación del menú', menu: raw, canInteract: true } as unknown as PostDetail
const html = (node: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

describe('plan semanal (MenuPlanView)', () => {
  it('muestra los 7 días como pestañas accesibles y el día seleccionado con su comida y cena', () => {
    canParticipate = true
    const out = html(<MenuPlanView postId="p1" menu={menu} canUseKitchen />)
    expect(out).toContain('role="tablist"')
    for (const d of ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']) expect(out).toContain(`>${d}<`)
    expect(out).toContain('aria-selected="true"')
    expect(out).toContain('role="tabpanel"')
    expect(out).toContain('Lentejas estofadas con verduras')
    expect(out).toContain('Crema de calabaza y zanahoria')
    expect(out).toContain('Acompañamiento:')
    expect(out).toContain('Fruta de temporada')
    expect(out).toContain('Comida')
    expect(out).toContain('Cena')
  })

  it('las recetas están plegadas por defecto (aria-expanded) y con «Ver receta»', () => {
    const out = html(<MenuPlanView postId="p1" menu={menu} canUseKitchen />)
    expect(out).toContain('aria-expanded="false"')
    expect(out).toContain('Ver receta')
    expect(out).not.toContain('Preparación') // los pasos solo salen al desplegar
  })

  it('con acceso completo ofrece todas las acciones, cada una con su etiqueta', () => {
    const out = html(<MenuPlanView postId="p1" menu={menu} canUseKitchen />)
    for (const label of ['Importar menú completo', 'Añadir todo a Compras', 'Importar este día', 'Compras de este día']) expect(out).toContain(label)
    expect(out).toContain('aria-label="Importar la comida del lunes"')
    expect(out).toContain('aria-label="Añadir a Compras la cena del lunes"')
  })

  it('con SOLO LECTURA se ve el menú pero no hay ninguna acción de importar ni de Compras, y se explica por qué', () => {
    const out = html(<MenuPlanView postId="p1" menu={menu} canUseKitchen={false} />)
    expect(out).toContain('Lentejas estofadas con verduras')
    for (const label of ['Importar menú completo', 'Añadir todo a Compras', 'Importar este día', 'Guardar esta receta', '🛒', '📥']) expect(out).not.toContain(label)
    expect(out).toContain('Puedes leer el menú y todas sus recetas')
    expect(out).toContain('acceso completo')
  })

  it('el selector de raciones va de 1 a 12 y empieza en las del menú (4)', () => {
    const out = html(<MenuPlanView postId="p1" menu={menu} canUseKitchen />)
    expect(out).toContain('Para 4 personas')
    expect(out).toContain('aria-label="Una ración menos"')
    expect(out).toContain('aria-label="Una ración más"')
    expect(planSrc).toContain('MENU_MAX_SERVINGS')
  })

  it('el menú de ejemplo avisa de que no lleva fechas; el programado enseña su semana y las fechas de cada pestaña', () => {
    expect(html(<MenuPlanView postId="p1" menu={menu} canUseKitchen />)).toContain('Menú de ejemplo')
    const out = html(<MenuPlanView postId="p1" menu={dated} canUseKitchen />)
    expect(out).toContain('Semana del 19 al 25 de octubre')
    expect(out).toContain('aria-label="Lunes, 19 de octubre"')
  })
})

describe('publicación de tipo menú (MenuPostPanel)', () => {
  it('enseña el artículo completo a la vista (sin plegar) y DEBAJO el importador', () => {
    canParticipate = true
    const out = html(<MenuPostPanel detail={detail} />)
    expect(out).not.toContain('<details class="community-menu-intro"')
    expect(out).not.toContain('Leer el texto de la publicación')
    expect(out).toContain('Texto de la publicación del menú')
    expect(out.indexOf('Texto de la publicación del menú')).toBeLessThan(out.indexOf('role="tablist"'))
    expect(out).toContain('role="tablist"')
    expect(out).toContain('Importar menú completo')
  })

  it('con solo lectura no hay acciones de cocina', () => {
    canParticipate = false
    const out = html(<MenuPostPanel detail={detail} />)
    expect(out).toContain('role="tablist"')
    expect(out).not.toContain('Importar menú completo')
    canParticipate = true
  })

  it('si el menú estructurado falta o está mal, cae al texto y no enseña botones que no podrían funcionar', () => {
    const out = html(<MenuPostPanel detail={{ ...detail, menu: { days: 'roto' } } as unknown as PostDetail} />)
    expect(out).toContain('Texto de la publicación del menú')
    expect(out).toContain('no está disponible')
    expect(out).not.toContain('Importar')
  })

  it('PostDetailPage usa MenuPostPanel solo para el tipo menú', () => {
    expect(detailSrc).toContain("detail.kind === 'menu' ? <MenuPostPanel detail={detail} renderWarnings={(items) => <MenuDietaryWarnings items={items} />} />")
  })
})

describe('hoja de importación (MenuImportSheet)', () => {
  const render = (initial: Parameters<typeof MenuImportSheet>[0]['initial'], extra: Partial<Parameters<typeof MenuImportSheet>[0]> = {}) =>
    html(<MenuImportSheet postId="p1" menu={menu} initial={initial} initialServings={4} onClose={() => undefined} {...extra} />)

  it('es un diálogo modal accesible con foco atrapado', () => {
    const out = render({ scope: 'week' })
    expect(out).toContain('role="dialog"')
    expect(out).toContain('aria-modal="true"')
    expect(out).toContain('aria-labelledby=')
    expect(importSrc).toContain('useDialogFocus')
  })

  it('ofrece los 4 alcances como botones de radio y la semana de destino', () => {
    const out = render({ scope: 'week' })
    for (const label of ['Toda la semana', 'Un día', 'Una comida o una cena', 'Una sola receta']) expect(out).toContain(label)
    expect((out.match(/type="radio"/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(out).toContain('¿Para qué semana?')
    expect(out).toContain('¿Para cuántas personas?')
    expect(out).toContain('Esto es lo que pasará')
  })

  it('«Guardar esta receta» no pide semana de destino', () => {
    const out = render({ scope: 'recipe', day: 'lunes', meal: 'comida', recipeIndex: 0 })
    expect(out).not.toContain('¿Para qué semana?')
    expect(out).toContain('Guardar esta receta')
    expect(out).toContain('Guardar receta en mi Cocina')
  })

  it('el botón de confirmar empieza desactivado hasta que haya vista previa', () => {
    expect(render({ scope: 'week' })).toMatch(/<button[^>]*class="primary"[^>]*disabled=""[^>]*>📥 Importar/)
  })

  it('deja un punto de extensión para los avisos de alergias SIN implementar ninguna lógica de alergias', () => {
    expect(importSrc).toContain('renderWarnings?: (items: SelectedRecipe[]) => ReactNode')
    expect(importSrc).not.toContain('domain/dietary')
    const out = render({ scope: 'week' }, { renderWarnings: (items) => <p data-x="aviso">Aviso de prueba para {items.length} recetas</p> })
    expect(out).toContain('community-menu-warnings')
    expect(out).toContain('Aviso de prueba para 28 recetas')
    expect(render({ scope: 'meal', day: 'lunes', meal: 'cena' }, { renderWarnings: (r) => <p>{r.length} recetas</p> })).toContain('2 recetas')
  })

  it('NUNCA importa sin que la persona confirme y nunca sustituye por defecto', () => {
    expect(importSrc).toContain("useState<ConflictMode>('skip')")
    expect(importSrc).toContain('confirmReplace')
    expect(importSrc).toContain('needsReplaceOk')
    expect(importSrc).toContain('sending.current')
    expect(importSrc).toContain('keyRef')
  })
})

describe('hoja de Compras (MenuShoppingSheet)', () => {
  it('es un diálogo accesible, explica que nada se guarda hasta confirmar y no duplica', () => {
    const out = html(<MenuShoppingSheet menu={menu} selection={{ scope: 'day', day: 'lunes' }} servings={4} onClose={() => undefined} />)
    expect(out).toContain('role="dialog"')
    expect(out).toContain('aria-modal="true"')
    expect(out).toContain('El lunes, para 4 personas')
    expect(out).toContain('no se guarda nada hasta que lo confirmes')
    expect(shopSrc).toContain('useDialogFocus')
    expect(shopSrc).toContain('sending.current')
    expect(shopSrc).toContain('markShoppingDuplicates')
    expect(shopSrc).toContain('listShoppingItems')
  })

  it('cada ingrediente es una fila compacta: casilla, nombre, cantidad y cuántas recetas lo usan; los platos solo con «Ver platos»', () => {
    const out = html(<MenuShoppingSheet menu={menu} selection={{ scope: 'day', day: 'lunes' }} servings={4} onClose={() => undefined} />)
    // Sin la lista leída (render estático) no hay filas; el contrato está en el código: la lista de platos solo se pinta si la fila está desplegada.
    expect(out).toContain('community-menu-sheet')
    expect(shopSrc).toContain('community-menu-shop-dishes-btn')
    expect(shopSrc).toContain('{expanded && <p className="community-menu-shop-for">')
    expect(shopSrc).toContain('r.line.hint')
  })
})

describe('coste y seguridad', () => {
  it('cada acción es UNA llamada del cliente y la compra no pasa por la base de datos de Comunidad', () => {
    expect(dataSrc).toContain("'community_menu_import_preview'")
    expect(dataSrc).toContain("'community_menu_import'")
    expect((dataSrc.match(/supabase\.rpc\(/g) ?? []).length).toBe(2)
    expect(dataSrc).not.toContain('addShoppingItems')
  })

  it('el texto del menú nunca se pinta como HTML', () => {
    for (const src of [planSrc, importSrc, shopSrc]) expect(src).not.toContain('dangerouslySetInnerHTML')
  })

  it('la importación nunca recibe un identificador de familia', () => {
    expect(dataSrc).not.toMatch(/family/i)
  })
})


// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Contrato ampliado: elementos sencillos, «Truco de Pepa», congelación y tiempos
// ---------------------------------------------------------------------------------------------------------------------------------------------------
describe('campos opcionales de la receta en el plan (MenuPlanView / RecipeBlock)', () => {
  type R = Record<string, unknown>
  const rawX = JSON.parse(JSON.stringify(raw))
  const lentejas = rawX.days[0].meals.comida.recipes[0] as R
  const fruta = rawX.days[0].meals.comida.recipes[1] as R
  Object.assign(lentejas, { tip: 'Cuece el doble y congela <b>raciones</b>.', freeze: { ideal: true, note: 'Congela en raciones de 2 personas.' }, time: { active: 20, total: 90 } })
  Object.assign(fruta, { simple: true, steps: [] })
  // La cena del lunes es SOLO un elemento sencillo (no hay receta que ver).
  rawX.days[0].meals.cena.recipes = [Object.assign({}, rawX.days[0].meals.cena.recipes[1], { simple: true, steps: [] })]
  const mx = parseMenu(rawX)!
  const [rLent, rFruta] = mx.days[0].meals.comida!.recipes
  const block = (recipe: typeof rLent, over: Partial<Parameters<typeof RecipeBlock>[0]> = {}) =>
    html(<RecipeBlock recipe={recipe} menu={mx} servings={4} role="Plato principal" canUseKitchen onSave={() => undefined} onShop={() => undefined} {...over} />)

  it('una receta con truco, congelación y tiempos los enseña, con la insignia y la nota, y conserva Preparación y «Guardar esta receta»', () => {
    const out = block(rLent)
    expect(out).toContain('Ideal para cocinar de más y congelar')
    expect(out).toContain('❄️')
    expect(out).toContain('Congela en raciones de 2 personas.')
    expect(out).toContain('💡')
    expect(out).toContain('Truco de Pepa')
    expect(out).toContain('Trabajo activo 20 min · Total 90 min')
    expect(out).toContain('⏱️')
    expect(out).toContain('Preparación')
    expect(out).toContain('Guardar esta receta')
    expect(out).toContain('Ingredientes a Compras')
  })

  it('el texto del truco se pinta como texto (nada de HTML)', () => {
    const out = block(rLent)
    expect(out).not.toContain('<b>raciones</b>')
    expect(out).toContain('&lt;b&gt;raciones&lt;/b&gt;')
  })

  it('una receta SIN campos nuevos no enseña insignia, truco ni tiempo (todo sigue igual que antes)', () => {
    const plain = parseMenu(raw)!.days[0].meals.cena!.recipes[0]
    const out = block(plain)
    for (const t of ['Ideal para cocinar', 'Truco de Pepa', 'Trabajo activo', '❄️', '💡', '⏱️']) expect(out).not.toContain(t)
    expect(out).toContain('Preparación')
    expect(out).toContain('Guardar esta receta')
  })

  it('un elemento SENCILLO se enseña con sus ingredientes y cantidades, sin pasos y SIN «Guardar esta receta»', () => {
    const out = block(rFruta, { role: 'Acompañamiento sencillo' })
    expect(out).toContain('Fruta de temporada')
    expect(out).toContain('Acompañamiento sencillo')
    expect(out).toContain('Elemento sencillo: Fruta de temporada') // etiqueta accesible
    expect(out).toContain('Ingredientes')
    expect(out).toContain('no necesita receta')
    expect(out).not.toContain('Preparación')
    expect(out).not.toContain('no tiene pasos')
    expect(out).not.toContain('Guardar esta receta')
    expect(out).toContain('Ingredientes a Compras') // sus ingredientes SÍ van a Compras
  })

  it('las cantidades del elemento sencillo se escalan con las raciones elegidas', () => {
    const base = block(rFruta)
    const doble = html(<RecipeBlock recipe={rFruta} menu={mx} servings={8} role="x" canUseKitchen onSave={() => undefined} onShop={() => undefined} />)
    const qty = (o: string) => o.match(/<li>[^<]*<\/li>/)?.[0]
    expect(qty(base)).toBeDefined()
    expect(qty(doble)).toBeDefined()
    expect(qty(doble)).not.toBe(qty(base))
  })

  it('con solo lectura el elemento sencillo no ofrece ningún botón', () => {
    const out = block(rFruta, { canUseKitchen: false })
    expect(out).not.toContain('<button')
    expect(out).toContain('Fruta de temporada')
  })

  it('en la tarjeta cerrada: insignia discreta de congelación y tiempo del plato principal', () => {
    const out = html(<MenuPlanView postId="p1" menu={mx} canUseKitchen />)
    expect(out).toContain('Ideal para cocinar de más y congelar')
    expect(out).toContain('Trabajo activo 20 min · Total 90 min')
    // La nota larga y el truco solo salen al desplegar la receta.
    expect(out).not.toContain('Congela en raciones de 2 personas.')
    expect(out).not.toContain('Truco de Pepa')
  })

  it('una comida con receta dice «Ver receta»; una comida solo de elementos sencillos dice «Ver ingredientes» (no hay receta con pasos vacíos)', () => {
    const out = html(<MenuPlanView postId="p1" menu={mx} canUseKitchen />)
    expect((out.match(/Ver receta/g) ?? []).length).toBe(1)
    expect((out.match(/Ver ingredientes/g) ?? []).length).toBe(1)
  })

  it('sin campos nuevos el plan se ve exactamente con «Ver receta» en las dos comidas del día', () => {
    const out = html(<MenuPlanView postId="p1" menu={menu} canUseKitchen />)
    expect((out.match(/Ver receta/g) ?? []).length).toBe(2)
    expect(out).not.toContain('Ver ingredientes')
  })

  it('el código no tiene botón de receta para los sencillos y no pinta HTML', () => {
    expect(planSrc).toContain('!recipe.simple')
    expect(planSrc).not.toContain('dangerouslySetInnerHTML')
  })
})

describe('hoja de importación con elementos sencillos', () => {
  type R = Record<string, unknown>
  const rawX = JSON.parse(JSON.stringify(raw))
  Object.assign(rawX.days[0].meals.comida.recipes[1] as R, { simple: true, steps: [] })
  rawX.days[0].meals.cena.recipes = [Object.assign({}, rawX.days[0].meals.cena.recipes[1], { simple: true, steps: [] })]
  const mx = parseMenu(rawX)!
  const render = (initial: Parameters<typeof MenuImportSheet>[0]['initial'], extra: Partial<Parameters<typeof MenuImportSheet>[0]> = {}) =>
    html(<MenuImportSheet postId="p1" menu={mx} initial={initial} initialServings={4} onClose={() => undefined} {...extra} />)

  it('«Una sola receta»: los elementos sencillos aparecen desactivados y marcados como «no es una receta»', () => {
    const out = render({ scope: 'recipe', day: 'lunes', meal: 'comida', recipeIndex: 0 })
    expect(out).toMatch(/<option value="1" disabled="">[^<]*Fruta de temporada[^<]*\(apunte sencillo: no es una receta\)/)
    expect(out).not.toMatch(/<option value="0" disabled/)
  })

  it('si la selección llegase a ser un sencillo, se pasa a la primera receta de verdad de esa comida', () => {
    const out = render({ scope: 'recipe', day: 'lunes', meal: 'comida', recipeIndex: 1 })
    expect(out).toMatch(/<option value="0" selected="">/)
  })

  it('una comida con solo sencillos no ofrece guardar nada como receta: el botón sigue desactivado', () => {
    const out = render({ scope: 'recipe', day: 'lunes', meal: 'cena', recipeIndex: 0 })
    expect(out).toMatch(/<button[^>]*class="primary"[^>]*disabled=""[^>]*>📥 Guardar esta receta/)
  })

  it('el punto de extensión de alergias recibe TAMBIÉN los elementos sencillos (sus ingredientes se avisan igual)', () => {
    const out = render({ scope: 'meal', day: 'lunes', meal: 'comida' }, { renderWarnings: (items) => <p>{items.length} elementos, {items.filter((i) => i.recipe.simple).length} sencillos</p> })
    expect(out).toContain('2 elementos, 1 sencillos')
  })

  it('el código distingue «apunte sin receta» en la vista previa y en el resumen, y no ofrece guardar sencillos como receta', () => {
    expect(importSrc).toContain("recipe.action === 'note'")
    expect(importSrc).toContain('apunte sin receta')
    expect(importSrc).toContain('disabled={r.simple}')
    expect(importSrc).toContain('MENU_ERROR_MESSAGES.NOT_A_RECIPE')
  })
})

describe('Compras no cambia con los elementos sencillos', () => {
  it('MenuShoppingSheet no distingue sencillos: usa la misma función de siempre para todos', () => {
    expect(shopSrc).not.toMatch(/simple|tip|freeze/)
    expect(shopWrapperSrc).not.toMatch(/simple|tip|freeze/)
    expect(shopWrapperSrc).toContain('buildMenuShopping(menu, selection, servings)')
  })
})
