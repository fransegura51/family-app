// Menú semanal oficial (Comunidad): lectura del menú, escalado, selección, fechas, resultado de la importación y compra (suma sin duplicar).
// Usa el menú REAL de la publicación semilla 05 (7 días × comida y cena, 28 recetas para 4 personas).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  buildMenuShopping,
  defaultTargetMonday,
  formatDayDate,
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

const raw = JSON.parse(readFileSync(join(process.cwd(), 'supabase/seed/community_initial_posts/05-menu-semanal.payload.json'), 'utf8'))
const menu = parseMenu(raw) as CommunityMenu

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
  it('lo que no se puede escalar se deja tal cual (dientes, pizca)', () => {
    expect(q('ajo', 8)).toBe('2 dientes')
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
    recipesCreated: 26, recipesReused: 2, recipes: [], slotsImported: 12, slotsSkipped: 2, slotsReplaced: 0, slotsAppended: 0, skipped: [], entriesCreated: 24, entriesRemoved: 0,
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
          expect(Math.abs(numeric * factor - match[1])).toBeLessThan(0.01 * Math.max(1, match[1]))
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
