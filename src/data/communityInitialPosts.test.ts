// Las 20 publicaciones iniciales de Comunidad (supabase/seed/community_initial_posts/*.md): comprueba que están todas, que reflejan las decisiones editoriales
// de la dueña (títulos, temas, textos literales, cosas prohibidas) y que el kit de rutinas existe de verdad. No publica nada ni toca la base de datos.
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { validateWeeklyMenuArticle, WEEKLY_MENU_ARTICLE_MAX_CHARS } from '@/domain/communityMenuArticle'

const dir = join(process.cwd(), 'supabase/seed/community_initial_posts')

interface Post {
  file: string
  key: string
  section: string
  topic: string
  title: string
  body: string
}

function load(): Post[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort()
    .map((file) => {
      const text = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n')
      const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
      if (!m) throw new Error(`${file}: sin cabecera`)
      const meta: Record<string, string> = {}
      for (const line of m[1].split('\n')) {
        const kv = /^([a-z_]+):\s*(.*)$/.exec(line)
        if (kv) meta[kv[1]] = kv[2].trim()
      }
      return { file, key: meta.seed_key, section: meta.section, topic: meta.topic, title: meta.title, body: m[2].trim() }
    })
}

const TITLES: Record<string, string> = {
  '01': 'Congela el pan en rebanadas',
  '02': 'Plátanos muy maduros: no los tires',
  '03': 'Pelar ajos sin esfuerzo',
  '04': 'Tortilla francesa: mucho más que huevo batido',
  '05': 'Menú semanal para personas con poco tiempo para cocinar \u{1F37D}️⏱️',
  '06': 'Más verdura sin que nadie se queje',
  '07': 'Caldo casero con restos de verduras',
  '08': 'Hierbas frescas que duran meses',
  '09': 'El pan duro tiene mil vidas',
  '10': 'Arroz blanco que sale bien siempre',
  '11': 'Consejos para hacer más provechosa la compra 🛒',
  '12': '¿Lo necesito o simplemente me apetece? 6 trucos para comprar con cabeza',
  '13': 'Diez minutos en familia que pueden cambiar tu semana ❤️',
  '14': '¿Otra vez me toca a mí? 7 ideas para repartir las tareas de casa sin discusiones 🏡',
  '15': '¡Yo solito! Crea con tus hijos un tablero de rutinas con velcro 🎨',
  '16': 'Vinagre, bicarbonato y otros trucos de limpieza: ¿funcionan de verdad? 🧽',
  '17': 'Cinco minutos que pueden ahorrarte media hora de trabajo 🏡',
  '18': 'Una noche de juegos en familia sin gastar un euro 🎲',
  '19': 'Antes de tirar un tarro de cristal, ¡dale otra oportunidad! 🫙❤️',
  '20': 'El paseo de los pequeños exploradores: 6 misiones para descubrir lo que nunca vemos 🔎🌳',
}
const SECTION_OF = (n: number) => (n <= 10 ? 'recetas' : 'hogar')
const TOPICS = {
  recetas: ['platos-principales', 'entrantes-aperitivos-tapas', 'recetas-faciles', 'postres-dulces', 'cocina-saludable', 'menus-planificacion', 'trucos-de-cocina', 'aprovechamiento-alimentos'],
  hogar: ['ahorro-economia', 'organizacion-familiar', 'crianza-educacion', 'limpieza-hogar', 'actividades-familia', 'manualidades-decoracion'],
} as Record<string, string[]>
const PDF_LINK = 'https://pepafamilyapp.es/descargas/PEPA_Kit_Rutinas_Imprimible_Completo.pdf'

const posts = load()
const byNum = (n: number) => posts.find((p) => p.file.startsWith(String(n).padStart(2, '0') + '-'))!

describe('las 20 publicaciones iniciales', () => {
  it('son exactamente 20, numeradas del 1 al 20, sin claves ni títulos repetidos', () => {
    expect(posts).toHaveLength(20)
    expect(posts.map((p) => p.file.slice(0, 2))).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')))
    expect(new Set(posts.map((p) => p.key)).size).toBe(20)
    expect(new Set(posts.map((p) => p.title)).size).toBe(20)
    for (const p of posts) expect(p.key).toMatch(/^inicial-\d\d-[a-z0-9-]+$/)
  })

  it('llevan los títulos definitivos de la dueña', () => {
    for (const p of posts) expect(p.title, p.file).toBe(TITLES[p.file.slice(0, 2)])
  })

  it('cada una está en su sección y con un tema válido de esa sección (recetas 1-10, hogar 11-20)', () => {
    for (const p of posts) {
      const n = Number(p.file.slice(0, 2))
      expect(p.section, p.file).toBe(SECTION_OF(n))
      expect(TOPICS[p.section], p.file).toContain(p.topic)
    }
  })

  it('usan solo el formato que Comunidad sabe pintar y caben en el límite del servidor', () => {
    for (const p of posts) {
      expect(p.body.length, p.file).toBeGreaterThan(400)
      expect(p.body.length, p.file).toBeLessThanOrEqual(10000)
      expect(p.body, p.file).not.toMatch(/^#{1,6}\s/m)
      expect(p.body, p.file).not.toMatch(/^\s*\|.*\|\s*$/m)
      expect(p.body, p.file).not.toMatch(/<[a-z][^>]*>/i)
      expect(p.body, p.file).not.toContain('```')
      expect(p.body, p.file).not.toMatch(/\n\n[-*] [^\n]*\n\n[-*] /)
    }
  })

  it('no llevan datos privados ni inventan funciones: sin correos, teléfonos, ni enlaces salvo el kit de la 15', () => {
    for (const p of posts) {
      expect(p.body, p.file).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
      expect(p.body, p.file).not.toMatch(/\b[6-9]\d{2}[ .-]?\d{3}[ .-]?\d{3}\b/)
      const links = p.body.match(/https?:\/\/[^\s)\]>]+/g) ?? []
      if (p.file.startsWith('15-')) expect(links).toEqual([PDF_LINK])
      else expect(links, p.file).toEqual([])
    }
  })
})

describe('decisiones editoriales concretas', () => {
  it('04 tortilla: las siete variantes pedidas y con guarniciones', () => {
    const b = byNum(4).body.toLowerCase()
    for (const w of ['espinacas', 'champiñones', 'calabacín', 'jamón', 'tomate', 'patata', 'atún']) expect(b).toContain(w)
    expect(b).toMatch(/guarnici|acomp|completa/)
  })

  it('06 verdura: ejemplos concretos y verduras visibles, sin engañar', () => {
    const b = byNum(6).body.toLowerCase()
    for (const w of ['calabacín', 'albóndigas', 'cremas']) expect(b).toContain(w)
    expect(b).toMatch(/visible|a la vista/)
    expect(b).toMatch(/enga|mentir|ocultar/)
  })

  it('07 caldo y 10 arroz: enfriar y conservar de forma segura', () => {
    expect(byNum(7).body.toLowerCase()).toMatch(/enfr/)
    expect(byNum(7).body.toLowerCase()).toMatch(/moho|mal olor|estrop/)
    expect(byNum(10).body.toLowerCase()).toMatch(/enfr/)
    expect(byNum(10).body.toLowerCase()).toMatch(/nevera/)
    for (const w of ['curry', 'cubana', 'limón', 'verduras', 'champiñones']) expect(byNum(10).body.toLowerCase()).toContain(w)
    expect(byNum(10).body).not.toMatch(/1 medida de arroz por 2 de agua/i)
  })

  it('08 hierbas: las cuatro combinaciones y nunca ajo en aceite a temperatura ambiente', () => {
    const b = byNum(8).body.toLowerCase()
    for (const w of ['perejil', 'albahaca', 'romero', 'tomillo', 'cilantro', 'lima']) expect(b).toContain(w)
    expect(b).toContain('botulismo')
    expect(b).toMatch(/nunca[^.]*ajo[^.]*aceite[^.]*temperatura ambiente/)
  })

  it('09 pan duro: pan rallado, picatostes, torrijas y migas, y nada de pan con moho', () => {
    const b = byNum(9).body.toLowerCase()
    for (const w of ['pan rallado', 'picatostes', 'torrijas', 'migas', 'moho']) expect(b).toContain(w)
  })

  it('11 compra: ideas pedidas y nada del comparador de supermercados', () => {
    const b = byNum(11).body.toLowerCase()
    for (const w of ['3×2', 'kilo', 'ración', 'hambre', 'historial']) expect(b).toContain(w)
    expect(b).not.toContain('comparador')
  })

  it('12 comprar con cabeza: seis trucos, Lista de deseos y pregunta final', () => {
    const b = byNum(12).body
    expect(b).toContain('24 horas')
    expect(b).toContain('Lista de deseos')
    expect(b.trim().endsWith('?')).toBe(true)
  })

  it('13 y 14: relacionan con Calendario y Puntos y recompensas sin imponer pagar todo con puntos', () => {
    expect(byNum(13).body).toContain('Calendario')
    const b14 = byNum(14).body
    expect(b14).toContain('Puntos y recompensas')
    expect(b14.toLowerCase()).toMatch(/idéntico|igual/)
  })

  it('15 tablero: manualidad en 6 pasos + anuncio discreto con el enlace exacto al kit aprobado', () => {
    const b = byNum(15).body
    expect(b).toContain('«Por hacer»')
    expect(b).toContain('«¡Conseguido!»')
    expect(b.toLowerCase()).toContain('velcro')
    expect(b).toContain('🎁 ¿Preferís saltaros la parte de preparar los dibujos y las plantillas?')
    expect(b).toContain('[Descargar el kit de rutinas de PEPA (PDF)](' + PDF_LINK + ')')
    // El anuncio va al final y es pequeño (el contenido principal es la manualidad).
    expect(b.indexOf('🎁')).toBeGreaterThan(b.length * 0.7)
    expect(b.length - b.indexOf('🎁')).toBeLessThan(700)
  })

  it('15: el PDF aprobado existe de verdad en public/descargas (no es un archivo vacío)', () => {
    const pdf = join(process.cwd(), 'public/descargas/PEPA_Kit_Rutinas_Imprimible_Completo.pdf')
    expect(existsSync(pdf)).toBe(true)
    expect(statSync(pdf).size).toBe(13775324)
    expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-')
    expect(PDF_LINK.endsWith('/descargas/PEPA_Kit_Rutinas_Imprimible_Completo.pdf')).toBe(true)
  })

  it('16 limpieza: advertencia de no mezclar lejía, sin tabla problema→producto, cinco trucos', () => {
    const b = byNum(16).body
    expect(b).toMatch(/Nunca mezcl[a-zé]+ lejía con vinagre/i)
    expect(b).toMatch(/amoniaco/i)
    expect(b).not.toMatch(/problema\s*→|problema\s*\|/i)
    expect((b.match(/^\*\*\d\. /gm) ?? []).length).toBe(5)
  })

  it('17 cinco minutos: versión aprobada con su pregunta literal y sin la versión alternativa', () => {
    const p = byNum(17)
    expect(p.body).toContain('¿Cuál es ese objeto que siempre aparece fuera de su sitio en vuestra casa?')
    expect(p.body + p.title).not.toContain('¿Para qué dejarlo para después si puedes dejarlo bien ahora?')
    expect(p.body.toLowerCase()).toContain('cesta')
  })

  it('18 juegos: cinco juegos y NINGÚN kit descargable', () => {
    const b = byNum(18).body
    for (const w of ['¿Quién soy?', 'Dibuja y adivina', 'objeto desaparecido', 'olimpiadas del salón', 'historia más disparatada']) expect(b).toContain(w)
    expect(b.toLowerCase()).not.toMatch(/kit|descarga|pdf/)
  })

  it('19 tarros: seis ideas, sin congelar en tarros ni conservas caseras de despensa', () => {
    const b = byNum(19).body
    expect((b.match(/^\*\*\d\. /gm) ?? []).length).toBe(6)
    expect(b.toLowerCase()).not.toMatch(/congel/)
    expect(b.toLowerCase()).not.toMatch(/esteriliz|al baño maría|conserva casera/)
  })

  it('20 exploradores: seis misiones, cierre y pregunta literales', () => {
    const b = byNum(20).body
    expect(b).toContain('Porque a veces no hace falta ir muy lejos para descubrir algo nuevo. Solo mirar con otros ojos')
    expect(b).toContain('¿Qué es lo más curioso que habéis descubierto paseando por vuestro barrio o pueblo?')
    expect(b).toContain('Galería')
  })

  it('no se repite el mismo consejo central en dos publicaciones (verificación de títulos temáticos)', () => {
    const roots = posts.map((p) => p.title.toLowerCase().replace(/[^a-záéíóúñ ]/g, '').split(' ').slice(0, 3).join(' '))
    expect(new Set(roots).size).toBe(20)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Publicación 05: «Menú semanal para personas con poco tiempo para cocinar». Revisión de la dueña del 16/10/2026 (ORDEN_REVISION_MENU_16-10.md):
// título e introducción literales, los 7+7 platos acordados, acompañamientos sencillos sin pasos, consejos de ahorro de tiempo, congelación solo donde procede,
// seguridad alimentaria y ningún plato sustituido.
// ---------------------------------------------------------------------------------------------------------------------------------------------

interface MenuIngredient {
  name: string
  quantity: string
  unit: string
}
interface MenuRecipe {
  title: string
  servings: number
  simple?: boolean
  ingredients: MenuIngredient[]
  steps: string[]
  tags: string[]
  tip?: string
  freeze?: { ideal: boolean; note: string }
  time?: { active: number; total: number }
}
interface MenuMeal {
  title: string
  side: string
  recipes: MenuRecipe[]
}
interface Menu {
  version: number
  servings: number
  days: { day: string; meals: { comida: MenuMeal; cena: MenuMeal } }[]
}

const payloadFile = join(dir, '05-menu-semanal.payload.json')
const payloadText = readFileSync(payloadFile, 'utf8')
const menu = JSON.parse(payloadText) as Menu
const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const meals: { day: string; kind: 'comida' | 'cena'; meal: MenuMeal }[] = menu.days.flatMap((d) => (['comida', 'cena'] as const).map((kind) => ({ day: d.day, kind, meal: d.meals[kind] })))
const allRecipes: MenuRecipe[] = meals.flatMap((m) => m.meal.recipes)
const recipeByTitle = (title: string) => {
  const r = allRecipes.filter((x) => x.title === title)
  expect(r.length, title).toBeGreaterThan(0)
  return r[0]
}

// Tabla definitiva de la dueña (orden §5): plato principal de cada comida y cena, y las recetas de cada plato (la primera es el principal).
const TABLE: [string, 'comida' | 'cena', string, string[]][] = [
  ['lunes', 'comida', 'Lentejas estofadas con verduras y huevo duro', ['Lentejas estofadas con verduras y huevo duro', 'Fruta de temporada']],
  ['lunes', 'cena', 'Crema de calabaza y zanahoria', ['Crema de calabaza y zanahoria', 'Tostadas con queso fresco, tomate y albahaca fresca']],
  ['martes', 'comida', 'Arroz tres delicias con pollo y verduras', ['Arroz tres delicias con pollo y verduras']],
  ['martes', 'cena', 'Salmón con calabacín y limón', ['Salmón con calabacín y limón']],
  ['miércoles', 'comida', 'Merluza al horno con patatas y verduras', ['Merluza al horno con patatas y verduras']],
  ['miércoles', 'cena', 'Sopa de verduras con fideos y pollo desmenuzado', ['Sopa de verduras con fideos y pollo desmenuzado']],
  ['jueves', 'comida', 'Macarrones con tomate, pavo y verduras', ['Macarrones con tomate, pavo y verduras', 'Zanahoria rallada con limón y maíz']],
  ['jueves', 'cena', 'Tortilla de calabacín', ['Tortilla de calabacín', 'Ensalada de tomate']],
  ['viernes', 'comida', 'Garbanzos con espinacas y bacalao', ['Garbanzos con espinacas y bacalao', 'Fruta de temporada']],
  ['viernes', 'cena', 'Pizzas pequeñas de tortilla de trigo con verduras y queso', ['Pizzas pequeñas de tortilla de trigo con verduras y queso']],
  ['sábado', 'comida', 'Hamburguesas caseras de ternera', ['Hamburguesas caseras de ternera', 'Patatas al horno', 'Ensalada de lechuga y tomate']],
  ['sábado', 'cena', 'Quesadillas de pollo, pimiento y queso', ['Quesadillas de pollo, pimiento y queso', 'Ensalada de lechuga y maíz']],
  ['domingo', 'comida', 'Pollo asado con patatas y verduras', ['Pollo asado con patatas y verduras', 'Ensalada de lechuga y manzana']],
  ['domingo', 'cena', 'Revuelto de champiñones y calabacín', ['Revuelto de champiñones y calabacín', 'Tostada integral']],
]
const SIMPLE_TITLES = ['Fruta de temporada', 'Tostada integral']
// Recetas del menú anterior que no cambian (solo se ajustan time / tip / freeze); el resto se ha reescrito o es nueva.
const CONSERVED = ['Crema de calabaza y zanahoria', 'Zanahoria rallada con limón y maíz', 'Hamburguesas caseras de ternera', 'Patatas al horno', 'Ensalada de lechuga y tomate', 'Ensalada de lechuga y maíz', 'Ensalada de lechuga y manzana', 'Revuelto de champiñones y calabacín']
// Congelación: solo estas (orden §7). Los garbanzos con bacalao NO se marcan: cuestión pendiente de decisión de la dueña.
const FREEZE_TITLES = ['Lentejas estofadas con verduras y huevo duro', 'Crema de calabaza y zanahoria', 'Macarrones con tomate, pavo y verduras', 'Hamburguesas caseras de ternera']

const INTRO = [
  '¡Estrenamos los menús semanales de Pepa! ❤️',
  'Sabemos que pensar cada día qué preparar para comer y cenar puede convertirse en otra tarea más.',
  'Por eso, todos los sábados Pepa te traerá un nuevo menú para la semana siguiente, con siete comidas y siete cenas variadas, prácticas y pensadas para facilitar la organización familiar.',
  'Encontrarás recetas fáciles, ideas para ahorrar tiempo y platos que puedes preparar con antelación.',
  'Puedes importar el menú completo, elegir días o recetas individuales, ajustar las raciones y añadir los ingredientes a Compras.',
  'Pepa te da las ideas. Tú decides cómo organizarte. ❤️',
]
// Platos y detalles del menú anterior que ya no están (no deben quedar en el texto, los datos ni los documentos de la semilla).
const REPLACED: [string, RegExp][] = [
  ['jamón cocido', /jam[oó]n/i],
  ['puré de patata', /pur[eé] de patata/i],
  ['cuscús', /cusc[uú]s/i],
  ['pasas', /\bpasas\b/i],
  ['sándwich mixto', /s[aá]ndwich/i],
  ['pan de molde', /pan de molde/i],
  ['bastones', /bastones/i],
  ['pan integral tostado como receta', /pan integral tostado/i],
  ['tortilla de patata', /tortilla de patata/i],
  ['pizzas rápidas', /pizzas r[aá]pidas/i],
  ['salmón a la plancha', /salm[oó]n a la plancha/i],
  ['sopa de fideos con verduras (la antigua)', /sopa de fideos con verduras/i],
  ['gajos de patata', /gajos de patata/i],
  ['ensalada de tomate y pepino', /tomate y pepino/i],
  ['tostadas con tomate (sin queso)', /tostadas con tomate/i],
  ['macarrones con tomate y pavo (sin verduras)', /macarrones con tomate y pavo/i],
  ['quesadillas sin pollo', /quesadillas de pimiento y queso/i],
  ['pollo asado sin patatas', /pollo asado con verduras/i],
  ['merluza sin patatas', /merluza al horno con verduras/i],
  ['garbanzos sin bacalao', /garbanzos con espinacas(?! y bacalao)/i],
  ['lentejas sin huevo', /lentejas estofadas con verduras(?! y huevo)/i],
  ['"28 recetas"', /28 recetas/i],
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const STOP = new Set(['del', 'las', 'los', 'con', 'sin', 'para', 'por', 'una', 'uno', 'unos', 'unas', 'que'])
// ¿Se menciona el ingrediente en los pasos? Mismo criterio que el aviso INGREDIENT_NOT_IN_STEPS del servidor, pero por palabras enteras (la «sal» no vale por «salteado»).
function mentioned(ingredient: string, steps: string[]): boolean {
  const words = norm(steps.join(' ')).split(/[^a-z0-9]+/).filter(Boolean)
  const tokens = norm(ingredient).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t))
  return tokens.some((t) => {
    if (t === 'sal') return words.some((w) => /^sal(a|alo|alos|ala|alas|ar|ada|ado|ados|adas)?$/.test(w))
    const stem = t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t
    return words.some((w) => w.startsWith(stem))
  })
}

describe('menú semanal (publicación 05): texto', () => {
  const p = byNum(5)

  it('lleva el título exacto de la dueña y las claves de siempre', () => {
    expect(p.title).toBe('Menú semanal para personas con poco tiempo para cocinar \u{1F37D}️⏱️')
    expect(p.key).toBe('inicial-05-menu-semanal')
    expect(p.section).toBe('recetas')
    expect(p.topic).toBe('menus-planificacion')
  })

  it('empieza por la introducción literal de la orden, sin cambiar una coma', () => {
    expect(p.body.startsWith(INTRO.join('\n\n') + '\n\n')).toBe(true)
  })

  it('tiene los siete días, las siete comidas y las siete cenas con los platos definitivos', () => {
    const lower = p.body.toLowerCase()
    for (const d of DAYS) expect(p.body).toContain(`**${d.charAt(0).toUpperCase()}${d.slice(1)}**`)
    for (const [, kind, dish] of TABLE) expect(lower, dish).toContain(`${kind}: ${dish.charAt(0).toLowerCase()}${dish.slice(1)}`)
    expect((p.body.match(/^- \*\*Comida:/gm) ?? []).length).toBe(7)
    expect((p.body.match(/^- \*\*Cena:/gm) ?? []).length).toBe(7)
  })

  it('es breve: tras la introducción solo el resumen de la semana, sin tiempos, trucos, congelación ni listas de seguridad (eso va en las fichas)', () => {
    expect(validateWeeklyMenuArticle(p.body, menu)).toEqual([])
    expect(p.body.length).toBeLessThanOrEqual(WEEKLY_MENU_ARTICLE_MAX_CHARS)
    expect(p.body.length).toBeLessThan(2600)
    for (const w of ['Trucos para ahorrar tiempo', 'Ideal para cocinar de más', 'Seguridad en la cocina', 'Por qué funciona', 'min de trabajo', '⏱', '❄']) expect(p.body, w).not.toContain(w)
    expect(p.body).not.toMatch(/congel|\d+ min/i)
    expect(p.body).toContain('**Este es el menú de esta semana** (cantidades para 4 personas):')
    expect(p.body.trim().endsWith('no una dieta ni un plan nutricional.')).toBe(true)
  })

  it('cumple las reglas de Comunidad: sin enlaces, sin títulos ni tablas, máximo 10.000 caracteres', () => {
    expect(p.body.length).toBeLessThanOrEqual(10000)
    expect(p.body).not.toMatch(/https?:\/\//)
    expect(p.body).not.toMatch(/^#{1,6}\s/m)
    expect(p.body).not.toMatch(/^\s*\|.*\|\s*$/m)
  })

  it('no afirma que el menú esté validado nutricionalmente ni da consejos médicos', () => {
    expect(p.body).not.toMatch(/validad[oa]s? (nutricional|por (un |una )?(nutri|dietista|m[eé]dic))|nutricionalmente (validad|aprobad|equilibrad)|aprobad[oa] por (nutri|dietista|m[eé]dic)|avalad/i)
    expect(p.body).toMatch(/no una dieta ni un plan nutricional/i)
  })

  it('no menciona platos sustituidos', () => {
    for (const [name, re] of REPLACED) expect(p.body, name).not.toMatch(re)
  })

  it('la semilla SQL generada lleva este título y estos datos (se regenera con scripts/build-community-seed.mjs)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/seed/community_seed_proposals.sql'), 'utf8').replace(/\r\n/g, '\n')
    expect(sql).toContain(p.title)
    expect(sql).toContain(JSON.stringify({ menu }))
  })
})

describe('menú semanal (publicación 05): datos del menú (payload)', () => {
  it('versión 1, 4 raciones, 7 días de lunes a domingo y comida y cena con título, acompañamiento y de 1 a 6 recetas', () => {
    expect(menu.version).toBe(1)
    expect(menu.servings).toBe(4)
    expect(menu.days.map((d) => d.day)).toEqual(DAYS)
    expect(meals).toHaveLength(14)
    for (const m of meals) {
      expect(typeof m.meal.title, `${m.day} ${m.kind}`).toBe('string')
      expect(m.meal.title.length).toBeGreaterThan(0)
      expect(typeof m.meal.side).toBe('string')
      expect(m.meal.side.length).toBeLessThanOrEqual(120)
      expect(m.meal.recipes.length).toBeGreaterThanOrEqual(1)
      expect(m.meal.recipes.length).toBeLessThanOrEqual(6)
    }
  })

  it('los 14 platos son exactamente los de la tabla de la dueña, con sus acompañamientos', () => {
    expect(meals.map((m) => [m.day, m.kind, m.meal.title, m.meal.recipes.map((r) => r.title)])).toEqual(TABLE)
    for (const m of meals) expect(m.meal.recipes[0].title, `${m.day} ${m.kind}`).toBe(m.meal.title)
  })

  it('no queda ningún plato sustituido en los datos', () => {
    for (const [name, re] of REPLACED) expect(payloadText, name).not.toMatch(re)
  })

  it('cumple las reglas del servidor: un plato no se repite más de 2 veces, comida y cena distintas, ingredientes sin repetir y límites de longitud', () => {
    const count = new Map<string, number>()
    for (const m of meals) count.set(norm(m.meal.title), (count.get(norm(m.meal.title)) ?? 0) + 1)
    for (const [t, n] of count) expect(n, t).toBeLessThanOrEqual(2)
    for (const d of menu.days) {
      expect(norm(d.meals.comida.title)).not.toBe(norm(d.meals.cena.title))
      expect(norm(d.meals.comida.recipes[0].ingredients[0].name), d.day).not.toBe(norm(d.meals.cena.recipes[0].ingredients[0].name))
    }
    for (const r of allRecipes) {
      expect(r.title.length, r.title).toBeLessThanOrEqual(120)
      expect(Number.isInteger(r.servings) && r.servings === 4, r.title).toBe(true)
      expect(r.ingredients.length, r.title).toBeGreaterThanOrEqual(1)
      expect(new Set(r.ingredients.map((i) => norm(i.name))).size, r.title).toBe(r.ingredients.length)
      expect(r.tags.length, r.title).toBeLessThanOrEqual(12)
      for (const t of r.tags) expect(t.length).toBeLessThanOrEqual(40)
      for (const s of r.steps) {
        expect(s.trim().length, r.title).toBeGreaterThan(0)
        expect(s.length, r.title).toBeLessThanOrEqual(1000)
      }
      expect(r.steps.length, r.title).toBeLessThanOrEqual(30)
    }
  })

  it('cantidades para 4 personas: numéricas, positivas y razonables, con unidad y sin comas en los nombres', () => {
    for (const r of allRecipes) {
      for (const i of r.ingredients) {
        const where = `${r.title} · ${i.name}`
        expect(i.name, where).not.toContain(',')
        expect(i.name.length, where).toBeLessThanOrEqual(120)
        expect(i.quantity, where).toMatch(/^\d+(\.\d+)?$/)
        const q = Number(i.quantity)
        expect(q, where).toBeGreaterThan(0)
        expect(i.unit.length, where).toBeGreaterThan(0)
        expect(i.unit.length, where).toBeLessThanOrEqual(30)
        const limit = ['g', 'ml'].includes(i.unit) ? 2000 : 60
        expect(q, where).toBeLessThanOrEqual(limit)
      }
    }
  })

  it('cada ingrediente usa siempre la misma unidad en todo el menú (para que la lista de la compra los junte)', () => {
    const units = new Map<string, Set<string>>()
    for (const r of allRecipes) for (const i of r.ingredients) units.set(norm(i.name), (units.get(norm(i.name)) ?? new Set()).add(i.unit))
    for (const [name, u] of units) expect([...u], name).toHaveLength(1)
  })

  it('los acompañamientos sencillos (fruta, tostada) llevan ingredientes con cantidad y NINGÚN paso; las demás recetas llevan pasos', () => {
    const simples = allRecipes.filter((r) => r.simple)
    expect(simples.map((r) => r.title).sort()).toEqual([...SIMPLE_TITLES, 'Fruta de temporada'].sort())
    for (const r of simples) {
      expect(r.steps, r.title).toEqual([])
      expect(r.ingredients.length, r.title).toBeGreaterThanOrEqual(1)
      expect(r.freeze, r.title).toBeUndefined()
      expect(r.tip, r.title).toBeUndefined()
    }
    for (const r of allRecipes.filter((x) => !x.simple)) {
      expect(r.steps.length, r.title).toBeGreaterThanOrEqual(2)
      expect(SIMPLE_TITLES, r.title).not.toContain(r.title)
    }
  })

  it('pasos coherentes con ingredientes: todo ingrediente de una receta con pasos se menciona en ellos (sin ingredientes huérfanos)', () => {
    for (const r of allRecipes.filter((x) => !x.simple)) for (const i of r.ingredients) expect(mentioned(i.name, r.steps), `${r.title} · ${i.name}`).toBe(true)
  })

  it('tiempos: enteros, trabajo activo > 0, total ≥ activo y realistas', () => {
    for (const r of allRecipes.filter((x) => !x.simple)) {
      expect(r.time, r.title).toBeTruthy()
      const { active, total } = r.time!
      expect(Number.isInteger(active) && Number.isInteger(total), r.title).toBe(true)
      expect(active, r.title).toBeGreaterThan(0)
      expect(total, r.title).toBeGreaterThanOrEqual(active)
      expect(total, r.title).toBeLessThanOrEqual(120)
    }
    const total = (t: string) => recipeByTitle(t).time!.total
    // Las que llevan cocción larga no pueden prometer menos de lo que dicen sus propios pasos.
    expect(total('Lentejas estofadas con verduras y huevo duro')).toBeGreaterThanOrEqual(60)
    expect(total('Pollo asado con patatas y verduras')).toBeGreaterThanOrEqual(70)
    expect(total('Patatas al horno')).toBeGreaterThanOrEqual(45)
    expect(total('Merluza al horno con patatas y verduras')).toBeGreaterThanOrEqual(55)
    expect(total('Salmón con calabacín y limón')).toBeLessThanOrEqual(30)
    for (const t of ['Ensalada de tomate', 'Ensalada de lechuga y tomate', 'Ensalada de lechuga y maíz', 'Zanahoria rallada con limón y maíz', 'Ensalada de lechuga y manzana']) expect(total(t), t).toBeLessThanOrEqual(10)
  })

  it('consejos de ahorro de tiempo: los pedidos por la dueña (arroz literal, salmón congelado, patatas de la merluza) y ninguno genérico ni repetido', () => {
    const tips = allRecipes.filter((r) => r.tip)
    for (const r of tips) {
      expect(r.tip!.length, r.title).toBeGreaterThanOrEqual(1)
      expect(r.tip!.length, r.title).toBeLessThanOrEqual(400)
      expect(r.tip!, r.title).toMatch(/^Truco de Pepa/)
    }
    expect(new Set(tips.map((r) => r.tip)).size).toBe(tips.length)
    expect(recipeByTitle('Arroz tres delicias con pollo y verduras').tip).toBe(
      'Truco de Pepa para ahorrar tiempo. ¿No tienes tiempo de preparar el arroz? También puedes comprar arroz tres delicias congelado o arroz precocinado en vasitos que se calientan en el microondas en aproximadamente un minuto, según el producto. Añade el pollo y las verduras que necesites para completar el plato.',
    )
    const salmon = recipeByTitle('Salmón con calabacín y limón').tip!
    expect(salmon).toMatch(/congelad/)
    expect(salmon).toMatch(/instrucciones del envase/)
    const merluza = recipeByTitle('Merluza al horno con patatas y verduras').tip!
    expect(merluza).toMatch(/patatas/)
    expect(merluza).toMatch(/antelaci/)
    expect(merluza).toMatch(/nevera/)
    expect(merluza).toMatch(/envasadas/)
    // Solo van en platos con preparación (nunca en un acompañamiento sin pasos ni en una ensalada).
    for (const r of tips) expect(r.simple, r.title).not.toBe(true)
    for (const t of ['Ensalada de tomate', 'Ensalada de lechuga y tomate', 'Ensalada de lechuga y maíz', 'Ensalada de lechuga y manzana', 'Zanahoria rallada con limón y maíz']) expect(recipeByTitle(t).tip, t).toBeUndefined()
  })

  it('congelación: SOLO lentejas, crema, macarrones (la salsa por separado) y hamburguesas crudas; nada más y con cómo dividir, descongelar y recalentar', () => {
    const frozen = allRecipes.filter((r) => r.freeze)
    expect(frozen.map((r) => r.title).sort()).toEqual([...FREEZE_TITLES].sort())
    for (const r of frozen) {
      expect(r.freeze!.ideal, r.title).toBe(true)
      expect(r.freeze!.note.length, r.title).toBeGreaterThanOrEqual(1)
      expect(r.freeze!.note.length, r.title).toBeLessThanOrEqual(300)
      expect(r.freeze!.note, r.title).toMatch(/nevera/)
    }
    const note = (t: string) => recipeByTitle(t).freeze!.note
    for (const t of ['Lentejas estofadas con verduras y huevo duro', 'Crema de calabaza y zanahoria', 'Macarrones con tomate, pavo y verduras']) expect(note(t), t).toMatch(/hierva/)
    expect(note('Lentejas estofadas con verduras y huevo duro')).toMatch(/sin el huevo/)
    expect(note('Macarrones con tomate, pavo y verduras')).toMatch(/solo la salsa/)
    expect(note('Hamburguesas caseras de ternera')).toMatch(/crudas/)
    expect(note('Hamburguesas caseras de ternera')).toMatch(/papel/)
    expect(note('Hamburguesas caseras de ternera')).toMatch(/nada rosado/)
    // Nunca en platos que no lo piden.
    for (const t of ['Salmón con calabacín y limón', 'Tortilla de calabacín', 'Pizzas pequeñas de tortilla de trigo con verduras y queso', 'Quesadillas de pollo, pimiento y queso', 'Sopa de verduras con fideos y pollo desmenuzado', 'Revuelto de champiñones y calabacín', 'Garbanzos con espinacas y bacalao', 'Ensalada de tomate', 'Ensalada de lechuga y tomate']) {
      expect(recipeByTitle(t).freeze, t).toBeUndefined()
    }
  })

  it('los consejos que antes estaban en el artículo viven ahora en las fichas (tip, freeze o pasos) y se importan a las notas de la receta', () => {
    const tipOf = (t: string) => recipeByTitle(t).tip!
    expect(tipOf('Lentejas estofadas con verduras y huevo duro')).toMatch(/lentejas cocidas de bote/)
    expect(tipOf('Crema de calabaza y zanahoria')).toMatch(/congeladas, no hace falta descongelarlas/)
    expect(tipOf('Arroz tres delicias con pollo y verduras')).toMatch(/precocinado/)
    expect(tipOf('Salmón con calabacín y limón')).toMatch(/congelado/)
    expect(tipOf('Merluza al horno con patatas y verduras')).toMatch(/hasta 2 días antes/)
    expect(tipOf('Sopa de verduras con fideos y pollo desmenuzado')).toMatch(/pollo ya cocido/)
    expect(tipOf('Macarrones con tomate, pavo y verduras')).toMatch(/el día antes/)
    expect(tipOf('Garbanzos con espinacas y bacalao')).toMatch(/garbanzos cocidos de bote/)
    expect(tipOf('Quesadillas de pollo, pimiento y queso')).toMatch(/por la mañana o el día antes/)
    for (const t of FREEZE_TITLES) {
      expect(recipeByTitle(t).freeze!.note, t).toMatch(/nevera/)
      expect(recipeByTitle(t).freeze!.note, t).toMatch(/no (la |lo )?vuelvas a congelar/i)
    }
    // El pescado crudo: tabla y cuchillo aparte y manos lavadas, también en las fichas de pescado.
    for (const t of ['Salmón con calabacín y limón', 'Merluza al horno con patatas y verduras', 'Garbanzos con espinacas y bacalao']) expect(recipeByTitle(t).steps.join(' '), t).toMatch(/tabla y un cuchillo solo para el pescado crudo y lávate las manos/)
  })

  it('seguridad alimentaria: carne y huevo bien hechos, pescado sin espinas, bacalao desalado y conservación', () => {
    const steps = (t: string) => recipeByTitle(t).steps.join(' ')
    for (const t of ['Arroz tres delicias con pollo y verduras', 'Quesadillas de pollo, pimiento y queso', 'Sopa de verduras con fideos y pollo desmenuzado', 'Macarrones con tomate, pavo y verduras', 'Pollo asado con patatas y verduras']) {
      expect(steps(t), t).toMatch(/rosad/)
      expect(steps(t), t).toMatch(/Lávate las manos/)
    }
    for (const t of ['Salmón con calabacín y limón', 'Merluza al horno con patatas y verduras', 'Garbanzos con espinacas y bacalao']) {
      expect(steps(t), t).toMatch(/espinas/)
      expect(steps(t), t).toMatch(/nevera/)
    }
    expect(steps('Garbanzos con espinacas y bacalao')).toMatch(/salado seco/)
    expect(steps('Garbanzos con espinacas y bacalao')).toMatch(/ya desalado/)
    expect(steps('Garbanzos con espinacas y bacalao')).toMatch(/refrigerado o congelado/)
    expect(steps('Garbanzos con espinacas y bacalao')).toMatch(/menores de 4 años/)
    expect(steps('Lentejas estofadas con verduras y huevo duro')).toMatch(/bien cuajadas/)
    expect(steps('Tortilla de calabacín')).toMatch(/bien cuajada/)
    expect(steps('Arroz tres delicias con pollo y verduras')).toMatch(/una hora/)
    expect(steps('Pollo asado con patatas y verduras')).toMatch(/74 ºC/)
    expect(steps('Merluza al horno con patatas y verduras')).toMatch(/envasadas/)
  })

  it('alérgenos presentes: las recetas reescritas o nuevas los señalan sin prometer seguridad', () => {
    const ALLERGENS: [string, RegExp][] = [
      ['huevo', /huevo/],
      ['gluten', /^(pan integral|pan de hamburguesa|fideos finos|macarrones|tortillas de trigo|pan rallado)$/],
      ['lácteos', /^(queso fresco|queso rallado|queso en lonchas)$/],
      ['pescado', /^(lomos de salmón|lomos de merluza|bacalao desalado)$/],
    ]
    for (const r of allRecipes.filter((x) => !x.simple && !CONSERVED.includes(x.title))) {
      const present = ALLERGENS.filter(([, re]) => r.ingredients.some((i) => re.test(i.name)))
      const text = r.steps.join(' ')
      if (present.length === 0) continue
      expect(text, r.title).toMatch(/Alérgenos presentes:/)
      for (const [name] of present) expect(text.toLowerCase(), `${r.title} · ${name}`).toContain(name)
      expect(text, r.title).not.toMatch(/apto para|sin alérgenos|libre de|seguro para al[eé]rgicos/i)
    }
  })
})
