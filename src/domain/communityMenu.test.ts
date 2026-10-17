// Menú semanal oficial (Comunidad): lectura del menú, escalado, selección, fechas, resultado de la importación y compra (suma sin duplicar).
// Los casos concretos usan una copia CONGELADA del menú de la semilla anterior a la revisión del 16/10 (7 días × comida y cena, 28 recetas para 4 personas, sin campos
// nuevos): así no dependen del contenido que se reescribe. El menú ACTUAL de la semilla se comprueba aparte, de forma general.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MENU_ERROR_MESSAGES,
  addDays,
  buildMenuShopping,
  countSelection,
  defaultTargetMonday,
  formatDayDate,
  formatMinutes,
  formatRecipeTime,
  formatWeekRange,
  importResultLines,
  ingredientQuantityText,
  isMonday,
  markShoppingDuplicates,
  menuErrorCode,
  mondayOf,
  normalizeDayName,
  parseMenu,
  recipeBaseServings,
  selectRecipes,
  selectionTitle,
  targetMondayOptions,
  type CommunityMenu,
  type MenuImportResult,
} from '@/domain/communityMenu'
import { normalizeKey } from '@/domain/communityRecipeDiff'

const raw = JSON.parse(readFileSync(join(process.cwd(), 'src/domain/fixtures/menuSemanaAnterior.json'), 'utf8'))
const menu = parseMenu(raw) as CommunityMenu
const seedNow = JSON.parse(readFileSync(join(process.cwd(), 'supabase/seed/community_initial_posts/05-menu-semanal.payload.json'), 'utf8'))

describe('lectura del menú', () => {
  it('lee los 7 días con comida y cena y 28 recetas', () => {
    expect(menu).not.toBeNull()
    expect(menu.days.map((d) => d.day)).toEqual(['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])
    expect(menu.servings).toBe(4)
    expect(menu.weekStart).toBeNull()
    expect(menu.days.every((d) => d.meals.comida && d.meals.cena)).toBe(true)
    expect(menu.days.flatMap((d) => [d.meals.comida!, d.meals.cena!]).flatMap((m) => m.recipes)).toHaveLength(28)
  })

  it('el plato principal es la primera receta y el acompañamiento la segunda', () => {
    const lunes = menu.days[0].meals.comida!
    expect(lunes.title).toBe('Lentejas estofadas con verduras')
    expect(lunes.side).toBe('Fruta de temporada')
    expect(lunes.recipes.map((r) => r.title)).toEqual(['Lentejas estofadas con verduras', 'Fruta de temporada'])
  })

  it('acepta los días con otra grafía y los devuelve de lunes a domingo aunque lleguen desordenados', () => {
    expect(normalizeDayName('Miercoles')).toBe('miércoles')
    expect(normalizeDayName('SÁBADO')).toBe('sábado')
    expect(normalizeDayName('festivo')).toBeNull()
    const messy = parseMenu({ servings: 2, days: [raw.days[2], raw.days[0]], week_start: 'no', weekStart: '2026-10-19', weekEnd: '2026-10-25' })!
    expect(messy.days.map((d) => d.day)).toEqual(['lunes', 'miércoles'])
    expect(messy.weekStart).toBe('2026-10-19')
    expect(messy.servings).toBe(2)
  })

  it('lo que no es un menú válido se descarta (null), sin romper', () => {
    expect(parseMenu(null)).toBeNull()
    expect(parseMenu('texto')).toBeNull()
    expect(parseMenu({ days: 'no' })).toBeNull()
    expect(parseMenu({ days: [] })).toBeNull()
    expect(parseMenu({ days: [{ day: 'lunes', meals: { comida: { recipes: [] } } }] })).toBeNull()
    expect(parseMenu({ days: [{ day: 'lunes', meals: { comida: { recipes: [{ ingredients: [] }] } } }] })).toBeNull()
  })
})

describe('escalado de cantidades (solo se ve; la receta oficial no se toca)', () => {
  const lentejas = menu.days[0].meals.comida!.recipes[0]
  const q = (name: string, servings: number) => ingredientQuantityText(lentejas.ingredients.find((i) => i.name === name)!, recipeBaseServings(lentejas, menu), servings)
  it('con las raciones originales no cambia nada', () => {
    expect(q('lentejas', 4)).toBe('320 g')
    expect(q('cebolla', 4)).toBe('1 unidad')
  })
  it('para 2 personas: la mitad, con coma decimal y ≈ si no es un número entero de unidades', () => {
    expect(q('lentejas', 2)).toBe('160 g')
    expect(q('aceite de oliva', 2)).toBe('1,5 cucharadas')
    expect(q('cebolla', 2)).toBe('≈ 0,5 unidades')
  })
  it('los dientes se escalan y la pizca se deja tal cual', () => {
    expect(q('ajo', 8)).toBe('4 dientes')
    expect(q('sal', 8)).toBe('1 pizca')
  })
})

describe('qué abarca cada selección', () => {
  it('semana = 28 recetas; día = 4; comida = 2; receta = 1 (con su índice)', () => {
    expect(selectRecipes(menu, { scope: 'week' })).toHaveLength(28)
    expect(selectRecipes(menu, { scope: 'day', day: 'martes' })).toHaveLength(4)
    expect(selectRecipes(menu, { scope: 'meal', day: 'martes', meal: 'cena' }).map((r) => r.recipe.title)).toEqual(['Salmón a la plancha', 'Puré de patata'])
    const one = selectRecipes(menu, { scope: 'recipe', day: 'jueves', meal: 'comida', recipeIndex: 1 })
    expect(one).toHaveLength(1)
    expect(one[0].recipe.title).toBe('Zanahoria rallada con limón y maíz')
    expect(one[0].recipeIndex).toBe(1)
  })
  it('el orden es lunes → domingo con la comida antes que la cena', () => {
    const week = selectRecipes(menu, { scope: 'week' })
    expect(week[0].day).toBe('lunes')
    expect(week[0].meal).toBe('comida')
    expect(week[2].meal).toBe('cena')
    expect(week[27].day).toBe('domingo')
  })
  it('títulos claros para la persona', () => {
    expect(selectionTitle({ scope: 'week' }, menu)).toBe('Todo el menú de la semana')
    expect(selectionTitle({ scope: 'day', day: 'sábado' }, menu)).toBe('El sábado')
    expect(selectionTitle({ scope: 'meal', day: 'lunes', meal: 'cena' }, menu)).toBe('La cena del lunes')
    expect(selectionTitle({ scope: 'recipe', day: 'lunes', meal: 'comida', recipeIndex: 0 }, menu)).toBe('Receta «Lentejas estofadas con verduras»')
  })
})

describe('fechas (lunes a domingo, sin husos horarios)', () => {
  it('mondayOf y addDays', () => {
    expect(mondayOf('2026-10-16')).toBe('2026-10-12') // viernes
    expect(mondayOf('2026-10-19')).toBe('2026-10-19') // lunes
    expect(mondayOf('2026-10-25')).toBe('2026-10-19') // domingo
    expect(addDays('2026-10-26', 6)).toBe('2026-11-01')
    expect(isMonday('2026-10-19')).toBe(true)
    expect(isMonday('2026-10-20')).toBe(false)
  })
  it('por defecto la PRÓXIMA semana; si el menú trae sus fechas y no han pasado, la suya', () => {
    expect(defaultTargetMonday(menu, '2026-10-16')).toBe('2026-10-19')
    expect(defaultTargetMonday(menu, '2026-10-19')).toBe('2026-10-26') // hoy es lunes: la próxima, no la de hoy
    const dated = { ...menu, weekStart: '2026-10-19', weekEnd: '2026-10-25' }
    expect(defaultTargetMonday(dated, '2026-10-16')).toBe('2026-10-19')
    expect(defaultTargetMonday(dated, '2026-10-21')).toBe('2026-10-19') // la semana del menú está en curso: todavía se puede importar
    expect(defaultTargetMonday(dated, '2026-10-27')).toBe('2026-11-02') // esa semana ya pasó: la próxima
    expect(defaultTargetMonday({ ...dated, weekStart: '2026-09-07' }, '2026-10-16')).toBe('2026-10-19') // antigua
  })
  it('las opciones de semana son lunes consecutivos desde esta semana (y la del menú si cae fuera)', () => {
    const opts = targetMondayOptions(menu, '2026-10-16')
    expect(opts[0]).toBe('2026-10-12')
    expect(opts).toHaveLength(12)
    expect(opts.every(isMonday)).toBe(true)
    expect(targetMondayOptions({ ...menu, weekStart: '2027-06-07' }, '2026-10-16')).toContain('2027-06-07')
  })
  it('textos de fechas en español', () => {
    expect(formatWeekRange('2026-10-19')).toBe('del 19 al 25 de octubre')
    expect(formatWeekRange('2026-10-26')).toBe('del 26 de octubre al 1 de noviembre')
    expect(formatDayDate('2026-10-19')).toBe('lunes 19 de octubre')
  })
})

describe('resultado de la importación en lenguaje llano', () => {
  const base: MenuImportResult = {
    ok: true, replayed: false, scope: 'week', targetStart: '2026-10-19', targetEnd: '2026-10-25', servings: 4, onConflict: 'skip',
    recipesCreated: 26, recipesReused: 2, notesCreated: 0, recipes: [], slotsImported: 12, slotsSkipped: 2, slotsReplaced: 0, slotsAppended: 0, skipped: [], entriesCreated: 24, entriesRemoved: 0,
  }
  it('dice qué se ha creado, reutilizado y respetado', () => {
    const lines = importResultLines(base).join(' ')
    expect(lines).toContain('26 recetas nuevas guardadas')
    expect(lines).toContain('2 recetas que ya tenías se han reutilizado')
    expect(lines).toContain('24 platos apuntados en tu menú de la semana del 19 al 25 de octubre')
    expect(lines).toContain('2 comidas o cenas omitidas porque ya tenías algo apuntado')
  })
  it('sustituir y añadir se cuentan aparte, y sin cambios lo dice', () => {
    const l = importResultLines({ ...base, slotsSkipped: 0, slotsReplaced: 1, entriesRemoved: 2, slotsAppended: 1 }).join(' ')
    expect(l).toContain('1 comida o cena sustituida (2 platos quitados de tu menú; tus recetas siguen ahí)')
    expect(l).toContain('1 comida o cena con platos añadidos')
    expect(importResultLines({ ...base, recipesCreated: 0, recipesReused: 0, entriesCreated: 0, slotsSkipped: 0 })).toEqual(['No se ha guardado nada nuevo.'])
  })
})

describe('errores propios de la importación', () => {
  it('se reconocen por el código del servidor', () => {
    expect(menuErrorCode({ message: 'BAD_TARGET_START' })).toBe('BAD_TARGET_START')
    expect(menuErrorCode({ message: 'Error: KEY_REUSED' })).toBe('KEY_REUSED')
    expect(menuErrorCode({ message: 'BAD_SCOPE' })).toBe('BAD_SCOPE')
    expect(menuErrorCode({ message: 'NOT_A_RECIPE' })).toBe('NOT_A_RECIPE')
    expect(MENU_ERROR_MESSAGES.NOT_A_RECIPE).toContain('no es una receta')
    expect(menuErrorCode({ message: 'NOT_AVAILABLE' })).toBeNull() // es un error de Comunidad
    expect(menuErrorCode(new Error('otra cosa'))).toBeNull()
  })
})

describe('compra: suma sin duplicar con el código de «Preparar compra del menú»', () => {
  // Suma independiente (a mano) de lo que pide el menú para una selección, por producto + unidad.
  function expected(servings: number, sel = { scope: 'week' } as Parameters<typeof selectRecipes>[1]) {
    const sums = new Map<string, number>()
    for (const p of selectRecipes(menu, sel)) {
      const base = recipeBaseServings(p.recipe, menu)
      for (const i of p.recipe.ingredients) {
        const n = Number(i.quantity.replace(',', '.'))
        if (!Number.isFinite(n)) continue
        const key = `${normalizeKey(i.name)}|${i.unit}`
        sums.set(key, (sums.get(key) ?? 0) + (n * servings) / base)
      }
    }
    return sums
  }

  it('cada producto sale UNA sola vez (no hay dos líneas con el mismo nombre y unidad compatible)', () => {
    const lines = buildMenuShopping(menu, { scope: 'week' }, 4)
    const seen = new Set<string>()
    for (const l of lines) {
      const key = normalizeKey(l.name)
      expect(seen.has(key), `repetido: ${l.name}`).toBe(false)
      seen.add(key)
    }
    // Hay muchos menos productos que ingredientes escritos (se suman).
    const written = selectRecipes(menu, { scope: 'week' }).reduce((n, p) => n + p.recipe.ingredients.length, 0)
    expect(lines.length).toBeLessThan(written)
    expect(lines.length).toBeGreaterThan(30)
  })

  it('las cantidades coinciden con la suma hecha a mano (4 personas y 2 personas)', () => {
    for (const servings of [4, 2, 6]) {
      const lines = buildMenuShopping(menu, { scope: 'week' }, servings)
      const exp = expected(servings)
      for (const l of lines) {
        const numeric = l.quantity ? Number(l.quantity.split(' ')[0].replace(',', '.')) : null
        const match = [...exp.entries()].find(([k]) => k.startsWith(normalizeKey(l.name) + '|'))
        expect(match, `sin suma para ${l.name}`).toBeDefined()
        if (numeric !== null && match && /^(g|ml|unidad|unidades|cucharada|cucharadas|cucharadita|cucharaditas)$/.test(l.unit)) {
          // 1 kg se enseña como «1 kg»: se compara en la unidad base.
          const factor = / kg$/.test(l.quantity ?? '') ? 1000 : / l$/.test(l.quantity ?? '') ? 1000 : 1
          // Las unidades enteras se COMPRAN redondeadas hacia arriba (1,5 lechugas → 2); el resto coincide con la suma exacta.
          const target = /^(unidad|unidades)$/.test(l.unit) ? Math.ceil(match[1] - 1e-9) : match[1]
          expect(Math.abs(numeric * factor - target)).toBeLessThan(0.01 * Math.max(1, target))
        }
      }
    }
  })

  it('una receta suelta solo suma sus ingredientes; un día, los de ese día', () => {
    const one = buildMenuShopping(menu, { scope: 'recipe', day: 'lunes', meal: 'comida', recipeIndex: 0 }, 4)
    expect(one).toHaveLength(10)
    expect(one.find((l) => l.name === 'lentejas')?.quantity).toBe('320 g')
    const day = buildMenuShopping(menu, { scope: 'day', day: 'lunes' }, 4)
    expect(day.length).toBeGreaterThan(10)
    expect(day.length).toBeLessThan(buildMenuShopping(menu, { scope: 'week' }, 4).length)
  })

  it('las lentejas del lunes para 2 personas son 160 g y para 8, 640 g', () => {
    const sel = { scope: 'recipe', day: 'lunes', meal: 'comida', recipeIndex: 0 } as const
    expect(buildMenuShopping(menu, sel, 2).find((l) => l.name === 'lentejas')?.quantity).toBe('160 g')
    expect(buildMenuShopping(menu, sel, 8).find((l) => l.name === 'lentejas')?.quantity).toBe('640 g')
  })

  it('avisa de lo que YA está en la lista (solo lo pendiente; sin tildes ni mayúsculas) y no lo marca como nuevo', () => {
    const lines = buildMenuShopping(menu, { scope: 'recipe', day: 'lunes', meal: 'comida', recipeIndex: 0 }, 4)
    const rows = markShoppingDuplicates(lines, [
      { name: 'Pimentón DULCE', status: 'pendiente' },
      { name: 'cebolla', status: 'comprado' }, // ya comprada: no cuenta
      { name: 'lentejas', status: 'pendiente' },
    ])
    expect(rows.find((r) => r.line.name === 'pimentón dulce')?.inList).toBe(true)
    expect(rows.find((r) => r.line.name === 'lentejas')?.inList).toBe(true)
    expect(rows.find((r) => r.line.name === 'cebolla')?.inList).toBe(false)
    expect(rows.filter((r) => r.inList)).toHaveLength(2)
  })
})


// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Contrato AMPLIADO de la receta: simple, tip, freeze, time (todo opcional)
// ---------------------------------------------------------------------------------------------------------------------------------------------------
type RawRecipe = Record<string, unknown>
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const rawRecipe = (m: typeof raw, d: number, meal: 'comida' | 'cena', i: number): RawRecipe => m.days[d].meals[meal].recipes[i]

describe('lectura de los campos nuevos', () => {
  it('un menú anterior (sin campos nuevos) se lee igual: ni sencillos, ni truco, ni congelación, ni tiempos', () => {
    const all = menu.days.flatMap((d) => [d.meals.comida!, d.meals.cena!]).flatMap((m) => m.recipes)
    expect(all.every((r) => r.simple === false && r.tip === null && r.freeze === null && r.time === null)).toBe(true)
    expect(all.every((r) => r.steps.length > 0)).toBe(true)
  })

  it('lee simple, tip, freeze y time', () => {
    const m = clone(raw)
    Object.assign(rawRecipe(m, 0, 'comida', 0), { tip: '  Cuece las lentejas el domingo.  ', freeze: { ideal: true, note: ' Congela en raciones. ' }, time: { active: 20, total: 90 } })
    Object.assign(rawRecipe(m, 0, 'comida', 1), { simple: true, steps: [] })
    const p = parseMenu(m)!
    const [lentejas, fruta] = p.days[0].meals.comida!.recipes
    expect(lentejas.tip).toBe('Cuece las lentejas el domingo.')
    expect(lentejas.freeze).toEqual({ ideal: true, note: 'Congela en raciones.' })
    expect(lentejas.time).toEqual({ active: 20, total: 90 })
    expect(lentejas.simple).toBe(false)
    expect(fruta.simple).toBe(true)
    expect(fruta.steps).toEqual([])
    expect(fruta.ingredients.length).toBeGreaterThan(0)
  })

  it('un elemento sencillo sin la clave steps se lee sin romper (steps vacío) y conserva sus ingredientes con cantidades', () => {
    const m = clone(raw)
    const r = rawRecipe(m, 4, 'comida', 1)
    r.simple = true
    delete r.steps
    const fruta = parseMenu(m)!.days[4].meals.comida!.recipes[1]
    expect(fruta.simple).toBe(true)
    expect(fruta.steps).toEqual([])
    expect(fruta.ingredients.length).toBe(1)
  })

  it('lo que no tiene sentido se descarta sin romper: simple como texto, truco vacío, congelación no ideal, tiempos inválidos', () => {
    const m = clone(raw)
    Object.assign(rawRecipe(m, 0, 'comida', 0), { simple: 'true', tip: '   ', freeze: { ideal: false, note: 'no' }, time: { active: 0, total: 10 } })
    Object.assign(rawRecipe(m, 0, 'cena', 0), { tip: 5, freeze: 'sí', time: { active: 30, total: 20 } })
    Object.assign(rawRecipe(m, 1, 'comida', 0), { freeze: { ideal: true }, time: { active: 10.5, total: 20 } })
    const p = parseMenu(m)!
    const a = p.days[0].meals.comida!.recipes[0]
    expect([a.simple, a.tip, a.freeze, a.time]).toEqual([false, null, null, null])
    const b = p.days[0].meals.cena!.recipes[0]
    expect([b.tip, b.freeze, b.time]).toEqual([null, null, null])
    const c = p.days[1].meals.comida!.recipes[0]
    expect(c.freeze).toEqual({ ideal: true, note: '' })
    expect(c.time).toBeNull()
  })

  it('el menú ACTUAL de la semilla se lee entero: toda receta normal con pasos y cada sencillo con ingredientes', () => {
    const p = parseMenu(seedNow)!
    expect(p).not.toBeNull()
    expect(p.days).toHaveLength(7)
    const all = p.days.flatMap((d) => [d.meals.comida!, d.meals.cena!]).flatMap((m) => m.recipes)
    for (const r of all) {
      if (r.simple) expect(r.ingredients.length, r.title).toBeGreaterThan(0)
      else expect(r.steps.length, r.title).toBeGreaterThan(0)
      expect(r.ingredients.every((i) => i.name), r.title).toBe(true)
    }
  })
})

describe('textos de tiempo', () => {
  it('minutos hasta 2 horas, luego horas', () => {
    expect(formatMinutes(15)).toBe('15 min')
    expect(formatMinutes(90)).toBe('90 min')
    expect(formatMinutes(119)).toBe('119 min')
    expect(formatMinutes(120)).toBe('2 h')
    expect(formatMinutes(135)).toBe('2 h 15 min')
    expect(formatMinutes(1440)).toBe('24 h')
  })
  it('«Trabajo activo X · Total Y»', () => {
    expect(formatRecipeTime({ active: 20, total: 90 })).toBe('Trabajo activo 20 min · Total 90 min')
    expect(formatRecipeTime({ active: 15, total: 15 })).toBe('Trabajo activo 15 min · Total 15 min')
  })
})

describe('elementos sencillos: selección, escalado y Compras', () => {
  const m = clone(raw)
  Object.assign(rawRecipe(m, 0, 'comida', 1), { simple: true, steps: [] })
  const sm = parseMenu(m)!

  it('siguen apareciendo en la selección de la comida (con su marca simple) y se cuentan aparte', () => {
    const meal = selectRecipes(sm, { scope: 'meal', day: 'lunes', meal: 'comida' })
    expect(meal.map((x) => x.recipe.title)).toEqual(['Lentejas estofadas con verduras', 'Fruta de temporada'])
    expect(meal.map((x) => x.recipe.simple)).toEqual([false, true])
    expect(countSelection(meal)).toEqual({ notes: 1, recipes: 1 })
    expect(countSelection(selectRecipes(sm, { scope: 'week' }))).toEqual({ notes: 1, recipes: 27 })
    expect(countSelection([])).toEqual({ notes: 0, recipes: 0 })
  })

  it('sus cantidades se escalan igual que las de una receta', () => {
    const fruta = sm.days[0].meals.comida!.recipes[1]
    const base = recipeBaseServings(fruta, sm)
    const original = menu.days[0].meals.comida!.recipes[1].ingredients[0]
    expect(ingredientQuantityText(fruta.ingredients[0], base, 4)).toBe([original.quantity, original.unit].filter(Boolean).join(' '))
    expect(ingredientQuantityText(fruta.ingredients[0], base, 8)).not.toBe(ingredientQuantityText(fruta.ingredients[0], base, 4))
  })

  it('sus ingredientes llegan a Compras exactamente igual que antes de ser sencillos (mismas líneas y cantidades)', () => {
    for (const servings of [4, 2, 6]) {
      const antes = buildMenuShopping(menu, { scope: 'week' }, servings)
      const despues = buildMenuShopping(sm, { scope: 'week' }, servings)
      expect(despues).toEqual(antes)
    }
    const meal = buildMenuShopping(sm, { scope: 'meal', day: 'lunes', meal: 'comida' }, 4)
    const fruta = menu.days[0].meals.comida!.recipes[1].ingredients[0]
    expect(meal.some((l) => normalizeKey(l.name) === normalizeKey(fruta.name))).toBe(true)
  })

  it('una sola línea de Compras para un sencillo suelto (selección de receta con índice 1)', () => {
    const lines = buildMenuShopping(sm, { scope: 'recipe', day: 'lunes', meal: 'comida', recipeIndex: 1 }, 4)
    expect(lines).toHaveLength(1)
    expect(normalizeKey(lines[0].name)).toBe(normalizeKey(menu.days[0].meals.comida!.recipes[1].ingredients[0].name))
  })
})

describe('resultado de la importación con apuntes sin receta', () => {
  const base: MenuImportResult = {
    ok: true, replayed: false, scope: 'week', targetStart: '2026-10-19', targetEnd: '2026-10-25', servings: 4, onConflict: 'skip',
    recipesCreated: 26, recipesReused: 0, notesCreated: 2, recipes: [], slotsImported: 14, slotsSkipped: 0, slotsReplaced: 0, slotsAppended: 0, skipped: [], entriesCreated: 28, entriesRemoved: 0,
  }
  it('dice cuántos platos son apuntes sin receta y que no se crea ninguna receta', () => {
    const l = importResultLines(base)
    expect(l.join(' ')).toContain('28 platos apuntados')
    expect(l.join(' ')).toContain('2 de ellos son apuntes sin receta')
    expect(l.join(' ')).toContain('no se crea ninguna receta')
    expect(importResultLines({ ...base, notesCreated: 1 }).join(' ')).toContain('1 de ellos es un apunte sin receta')
  })
  it('sin apuntes no añade esa frase (resultado igual que antes)', () => {
    expect(importResultLines({ ...base, notesCreated: 0 }).join(' ')).not.toContain('apunte')
  })
  it('un resultado de una versión anterior (sin notesCreated) tampoco rompe', () => {
    const old = { ...base } as Partial<MenuImportResult>
    delete old.notesCreated
    expect(importResultLines(old as MenuImportResult).join(' ')).not.toContain('apunte sin receta')
  })
})
