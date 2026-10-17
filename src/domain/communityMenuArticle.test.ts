import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateWeeklyMenuArticle, WEEKLY_MENU_ARTICLE_MAX_CHARS, type MenuArticleMenu } from '@/domain/communityMenuArticle'

const dir = join(process.cwd(), 'supabase/seed/community_initial_posts')
const menu = JSON.parse(readFileSync(join(dir, '05-menu-semanal.payload.json'), 'utf8')) as MenuArticleMenu
const article = readFileSync(join(dir, '05-menu-semanal.md'), 'utf8').replace(/\r\n/g, '\n').split(/^---\n[\s\S]*?\n---\n/)[1].trim()
const template = readFileSync(join(dir, '_plantilla-menu-semanal.md'), 'utf8').replace(/\r\n/g, '\n')

// Texto de un artículo mínimo válido para el menú del archivo.
function week(): string {
  const lines: string[] = []
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
  for (const d of menu.days) {
    lines.push(`**${d.day.charAt(0).toUpperCase()}${d.day.slice(1)}**`, '')
    lines.push(`- **Comida: ${lower(d.meals.comida!.title)}.**`, `- **Cena: ${lower(d.meals.cena!.title)}.**`, '')
  }
  return lines.join('\n')
}

describe('validateWeeklyMenuArticle', () => {
  it('el artículo del menú 05 cumple las reglas', () => {
    expect(validateWeeklyMenuArticle(article, menu)).toEqual([])
    expect(article.length).toBeLessThanOrEqual(WEEKLY_MENU_ARTICLE_MAX_CHARS)
  })

  it('la versión breve de la plantilla + el resumen de la semana también cumple', () => {
    const brief = /Versión BREVE[\s\S]*?```\n([\s\S]*?)```/.exec(template)![1].trim()
    expect(validateWeeklyMenuArticle(`${brief}\n\n**Este es el menú de esta semana** (cantidades para 4 personas):\n\n${week()}`, menu)).toEqual([])
  })

  it('rechaza tiempos, congelación, trucos y secciones largas', () => {
    expect(validateWeeklyMenuArticle(`${week()}\n⏱️ 25 min de trabajo`, menu).join(' ')).toMatch(/tiempos/)
    expect(validateWeeklyMenuArticle(`${week()}\nTarda 2 horas`, menu).join(' ')).toMatch(/tiempos/)
    expect(validateWeeklyMenuArticle(`${week()}\nSe puede congelar`, menu).join(' ')).toMatch(/congelación/)
    expect(validateWeeklyMenuArticle(`${week()}\n**Trucos para ahorrar tiempo**`, menu).join(' ')).toMatch(/fichas/)
    expect(validateWeeklyMenuArticle(`${week()}\n${'texto largo '.repeat(400)}`, menu).join(' ')).toMatch(/máximo/)
  })

  it('exige los siete días en orden, una comida y una cena por día, y los platos del menú', () => {
    expect(validateWeeklyMenuArticle(week().replace('**Martes**', '**Mardi**')).join(' ')).toMatch(/falta el día «Martes»/)
    expect(validateWeeklyMenuArticle(week().replace(/- \*\*Cena: [^\n]*\n/, '')).join(' ')).toMatch(/exactamente una comida y una cena/)
    expect(validateWeeklyMenuArticle(week().replace('salmón con calabacín y limón', 'pizza'), menu).join(' ')).toMatch(/Martes, cena: el texto no coincide/)
  })
})

describe('plantilla del artículo de menú semanal', () => {
  it('existe, no se confunde con una publicación (empieza por _) y recoge las reglas', () => {
    expect(template).toMatch(/^# Plantilla editorial/)
    for (const w of ['NO van tiempos', 'FICHA', 'tip', 'freeze', 'weekly_menu_autopublish', '¡Estrenamos los menús semanales de Pepa!']) expect(template.toLowerCase()).toContain(w.toLowerCase())
  })
})
