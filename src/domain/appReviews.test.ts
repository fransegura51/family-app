// Reseñas y opiniones: estrellas de 1 a 5 por sección y «lo que me gusta / lo que no me gusta».
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { cleanReviewText, GENERAL_SECTION, isValidStars, REVIEW_SECTIONS, REVIEW_TEXT_MAX, sectionLabel, starsText, summarizeReviews } from '@/domain/appReviews'
import { NAV_TABS } from '@/domain/navTabs'
import screen from '@/ui/ReviewsScreen.tsx?raw'
import stars from '@/ui/StarPicker.tsx?raw'
import data from '@/data/appReviews.ts?raw'
import app from '@/App.tsx?raw'
import nav from '@/ui/NavShell.tsx?raw'

const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/0290_app_reviews.sql'), 'utf8')
const css = fs.readFileSync(path.resolve(__dirname, '../ui/styles.css'), 'utf8')

describe('estrellas', () => {
  it('solo valen enteros de 1 a 5', () => {
    for (const ok of [1, 2, 3, 4, 5]) expect(isValidStars(ok)).toBe(true)
    for (const bad of [0, 6, 2.5, -1, Number.NaN, '3', null, undefined]) expect(isValidStars(bad)).toBe(false)
  })

  it('se pintan como ★ y ☆ hasta 5', () => {
    expect(starsText(3)).toBe('★★★☆☆')
    expect(starsText(5)).toBe('★★★★★')
    expect(starsText(1)).toBe('★☆☆☆☆')
  })
})

describe('secciones', () => {
  it('hay una valoración general y una por cada sección de la app (Compras, Economía, Galería, Ubicación…) con su mismo nombre', () => {
    expect(GENERAL_SECTION.id).toBe('general')
    const ids = REVIEW_SECTIONS.map((s) => s.id)
    for (const id of ['compras', 'dinero', 'galeria', 'ubicacion', 'calendario', 'documentos', 'inicio']) expect(ids).toContain(id)
    for (const tab of NAV_TABS.filter((t) => t.to !== '/')) expect(REVIEW_SECTIONS.find((s) => s.id === tab.to.slice(1))?.label).toBe(tab.label)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('el nombre de una sección se resuelve, y uno desconocido se enseña tal cual', () => {
    expect(sectionLabel('general')).toBe('La app en general')
    expect(sectionLabel('dinero')).toBe('Economía')
    expect(sectionLabel('rara')).toBe('rara')
  })
})

describe('comentarios', () => {
  it('vacío o en blanco no se guarda; se recorta a 1000 caracteres', () => {
    expect(cleanReviewText('   ')).toBeNull()
    expect(cleanReviewText(null)).toBeNull()
    expect(cleanReviewText('  me gusta  ')).toBe('me gusta')
    expect(cleanReviewText('a'.repeat(1500))).toHaveLength(REVIEW_TEXT_MAX)
  })
})

describe('summarizeReviews', () => {
  it('media con un decimal y número de valoraciones por sección, de mejor a peor; ignora estrellas inválidas', () => {
    const out = summarizeReviews([
      { section: 'compras', stars: 5 },
      { section: 'compras', stars: 4 },
      { section: 'dinero', stars: 3 },
      { section: 'dinero', stars: 9 },
      { section: 'galeria', stars: 2 },
    ])
    expect(out).toEqual([
      { section: 'compras', count: 2, average: 4.5 },
      { section: 'dinero', count: 1, average: 3 },
      { section: 'galeria', count: 1, average: 2 },
    ])
  })

  it('sin valoraciones no hay medias', () => {
    expect(summarizeReviews([])).toEqual([])
  })
})

describe('base de datos (migración 0290)', () => {
  it('una valoración por persona y sección, de 1 a 5, con «me gusta» y «no me gusta» de hasta 1000 caracteres', () => {
    expect(sql).toContain('unique (profile_id, section)')
    expect(sql).toContain('stars smallint not null check (stars between 1 and 5)')
    expect(sql).toContain('char_length(liked) <= 1000')
    expect(sql).toContain('char_length(disliked) <= 1000')
  })

  it('RLS: cada persona ve, deja, cambia y borra solo lo suyo; la dueña de la app lo ve todo; las políticas usan (select …)', () => {
    expect(sql).toContain('alter table public.app_reviews enable row level security')
    expect(sql).toContain('using (profile_id = (select auth.uid()) or (select public.am_i_app_owner()))')
    expect(sql).toContain('with check (profile_id = (select auth.uid()) and family_id = (select private.current_family_id()))')
    expect((sql.match(/create policy/g) ?? []).length).toBe(4)
    expect(sql).not.toMatch(/drop |alter table public\.(?!app_reviews)/)
  })

  it('es solo aditiva y tiene su marcha atrás', () => {
    const down = fs.readFileSync(path.resolve(__dirname, '../../supabase/rollbacks/0290_app_reviews_down.sql'), 'utf8')
    expect(down).toContain('drop table if exists public.app_reviews')
  })
})

describe('pantalla Reseñas y opiniones', () => {
  it('es una tarjeta aparte del Buzón de sugerencias: ruta propia y botón propio en el menú', () => {
    expect(app).toContain('<Route path="/resenas" element={<ReviewsScreen />} />')
    expect(nav).toContain("go('/resenas')")
    expect(nav).toContain('Reseñas y opiniones')
    expect(nav).toContain("go('/sugerencias')")
  })

  it('estrellas de 1 a 5 de la app en general y de cada sección, con «lo que me gusta» y «lo que no me gusta»', () => {
    expect(stars).toContain('[1, 2, 3, 4, 5].map')
    expect(screen).toContain('section={GENERAL_SECTION}')
    expect(screen).toContain('REVIEW_SECTIONS.map')
    expect(screen).toContain('Lo que me gusta')
    expect(screen).toContain('Lo que no me gusta')
  })

  it('lo simple por delante: las secciones y los comentarios van plegados (cerrados de entrada) y se abren a mano', () => {
    expect(screen).toContain('<details className="card review-sections">')
    expect(screen).toContain('<details className="review-more">')
    expect(screen).not.toMatch(/<details[^>]*\bopen\b/)
  })

  it('un comentario sin estrellas no se puede guardar, y cada estrella se guarda al pulsarla', () => {
    expect(screen).toContain('disabled={busy || stars === 0}')
    expect(screen).toContain('Primero elige las estrellas.')
    expect(screen).toContain('onPick={(n) => run(() => saveAppReview({ section: section.id, stars: n, liked, disliked }))}')
  })

  it('la dueña ve todas las reseñas con la media por sección; el resto solo las suyas (lo decide la base de datos)', () => {
    expect(screen).toContain('{isOwner && (')
    expect(screen).toContain('Media por sección')
    expect(data).toContain("onConflict: 'profile_id,section'")
  })

  it('accesible: cada estrella es un botón con nombre y estado, de 44 px', () => {
    expect(stars).toContain('aria-pressed={n === value}')
    expect(stars).toMatch(/aria-label=\{`\$\{n\} \$\{n === 1 \? 'estrella' : 'estrellas'\}`\}/)
    expect(css).toMatch(/\.review-star \{[^}]*min-width: 44px;[^}]*min-height: 44px/)
  })


  it('«Valorar cada sección» es una tarjeta igual de grande que las demás, con una flecha que gira al abrirla (también en «Contar qué me gusta y qué no»)', () => {
    expect(screen).toContain('<details className="card review-sections">')
    expect((screen.match(/className="review-chevron"/g) ?? []).length).toBe(2)
    expect(css).toMatch(/\.review-sections > summary \{[^}]*min-height: 72px/)
    expect(css).toMatch(/details\[open\] > summary > \.review-chevron \{[^}]*rotate\(180deg\)/)
    expect(css).toContain('::-webkit-details-marker')
  })

  it('las estrellas son dibujos (SVG), no letras: así se distingue lo vacío de lo lleno en cualquier móvil', () => {
    expect(stars).toContain('<svg viewBox="0 0 24 24"')
    expect(stars).toContain("fill={n <= value ? 'currentColor' : 'none'}")
    expect(stars).not.toMatch(/[★☆]/)
  })
})

