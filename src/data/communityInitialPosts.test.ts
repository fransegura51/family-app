// Las 20 publicaciones iniciales de Comunidad (supabase/seed/community_initial_posts/*.md): comprueba que están todas, que reflejan las decisiones editoriales
// de la dueña (títulos, temas, textos literales, cosas prohibidas) y que el kit de rutinas existe de verdad. No publica nada ni toca la base de datos.
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
    .filter((f) => f.endsWith('.md'))
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
  '05': 'Menú semanal en familia',
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
const PDF_LINK = 'https://fransegura51.github.io/family-app/descargas/PEPA_Kit_Rutinas_Imprimible_Completo.pdf'

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

describe('menú semanal (publicación 05): contenido editorial, sin prometer funciones que no existen', () => {
  it('existe, es de menus-planificacion y presenta siete comidas y siete cenas', () => {
    const p = byNum(5)
    expect(p.topic).toBe('menus-planificacion')
    for (const d of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']) expect(p.body.toLowerCase()).toContain(d)
    expect((p.body.match(/comida/gi) ?? []).length).toBeGreaterThanOrEqual(7)
    expect((p.body.match(/cena/gi) ?? []).length).toBeGreaterThanOrEqual(7)
  })

  it('no afirma que ya se pueda importar o guardar en Cocina (todavía no existe)', () => {
    expect(byNum(5).body.toLowerCase()).not.toMatch(/importa(r|d) (el )?men|guarda(r)? (la receta )?en (tu )?cocina|añade(n)? (los )?ingredientes a (tu )?(lista|compras)/)
  })
})
