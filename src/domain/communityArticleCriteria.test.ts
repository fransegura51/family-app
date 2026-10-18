import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARTICLE_CRITERIA, ARTICLE_INTRO_MAX_CHARS, checkArticleCriteria } from '@/domain/communityArticleCriteria'

const dir = join(process.cwd(), 'supabase/seed/community_initial_posts')
const bodyOf = (file: string) => (/^---\n[\s\S]*?\n---\n([\s\S]*)$/.exec(readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n'))?.[1] ?? '').trim()

describe('criterio editorial de los artículos oficiales', () => {
  it('recoge los siete puntos acordados', () => {
    expect(ARTICLE_CRITERIA).toHaveLength(7)
    expect(ARTICLE_CRITERIA.join(' ')).toMatch(/UNA sola vez, dentro de sus fichas/)
    expect(ARTICLE_CRITERIA.join(' ')).toMatch(/aprovechamiento/)
    expect(ARTICLE_CRITERIA.join(' ')).toMatch(/seguridad alimentaria/)
  })
  it('un texto breve y útil no da avisos', () => {
    expect(checkArticleCriteria({ body: '¡Hola! Hoy: tres trucos con pan duro.\n\n- Rállalo.\n- Tuéstalo.' })).toEqual([])
    expect(checkArticleCriteria({ body: '   ' })).toEqual([])
  })
  it('avisa de una introducción larga y de un artículo demasiado largo para el móvil', () => {
    expect(checkArticleCriteria({ body: 'a'.repeat(ARTICLE_INTRO_MAX_CHARS + 1) })[0]).toMatch(/introducción/)
    expect(checkArticleCriteria({ body: 'Intro corta.\n\n' + 'palabra '.repeat(800) }).join(' ')).toMatch(/largo/)
  })
  it('con fichas de recetas, avisa si el texto repite recetas numeradas; sin fichas no', () => {
    const repeated = 'Intro.\n\n1. **Con curry.** Sofríe.\n2. **A la cubana.** Sirve.\n3. **Con ajo.** Dora.'
    expect(checkArticleCriteria({ body: repeated, hasRecipeCards: true }).join(' ')).toMatch(/solo en las fichas/)
    expect(checkArticleCriteria({ body: repeated, hasRecipeCards: false })).toEqual([])
  })
  it('avisa de «recetas de aprovechamiento»', () => {
    expect(checkArticleCriteria({ body: 'Intro. Cinco recetas de aprovechamiento.' }).join(' ')).toMatch(/aprovechamiento/)
  })
  it('el artículo del arroz, ya reestructurado, cumple el criterio con sus fichas', () => {
    expect(checkArticleCriteria({ body: bodyOf('10-arroz-blanco.md'), hasRecipeCards: true })).toEqual([])
  })
  it('la plantilla y el criterio escrito existen para quien prepara borradores (los archivos con «_» no se publican)', () => {
    const files = readdirSync(dir)
    expect(files).toContain('_criterio-editorial.md')
    expect(readFileSync(join(dir, '_criterio-editorial.md'), 'utf8')).toMatch(/una sola vez/i)
    expect(readFileSync(join(dir, '_plantilla-menu-semanal.md'), 'utf8')).toContain('_criterio-editorial.md')
  })
})
