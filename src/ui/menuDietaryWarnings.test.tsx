// Avisos de alergias antes de importar un menú de Comunidad: día y plato de cada aviso, sin nombres de persona, nunca «segura», solo para quien puede ver todo.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/data/supabaseClient', () => ({ supabase: { rpc: vi.fn(), auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } } }))

import { a11yProblems } from '@/domain/staticA11y'
import { parseMenu, selectRecipes } from '@/domain/communityMenu'
import { DIETARY_GENERAL_DISCLAIMER, NO_MATCH_DISCLAIMER, type DietaryRestriction } from '@/domain/dietaryRestrictions'
import type { DietaryOverview } from '@/data/dietaryRestrictions'
import { MenuDietaryWarningsView } from '@/ui/MenuDietaryWarnings'
import { WARN_LOAD_ERROR } from '@/ui/familyDietaryText'

const raw = JSON.parse(readFileSync(join(process.cwd(), 'supabase/seed/community_initial_posts/05-menu-semanal.payload.json'), 'utf8'))
const menu = parseMenu(raw)!
const week = selectRecipes(menu, { scope: 'week' })
const TRAP_NOTE = 'ZZ_NOTA_TRAMPA_1177'

function r(over: Partial<DietaryRestriction> = {}): DietaryRestriction {
  return { id: 'r1', memberId: 'm1', kind: 'alergia', allergenKey: 'leche', customLabel: null, severity: 'grave', note: TRAP_NOTE, createdAt: '2026-10-16T10:00:00Z', updatedAt: '2026-10-16T10:00:00Z', ...over }
}
function overview(over: Partial<DietaryOverview> = {}): DietaryOverview {
  return { canManage: true, myMemberId: 'm9', consents: [], restrictions: [r()], ...over }
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ')
const render = (o: DietaryOverview | null, items = week, extra: { loadFailed?: boolean } = {}) => renderToStaticMarkup(<MenuDietaryWarningsView overview={o} items={items} {...extra} />)

describe('avisos de alergias antes de importar un menú', () => {
  it('indica el día y el plato de cada aviso, sin nombres de persona ni la nota de la ficha', () => {
    const html = render(overview({ restrictions: [r({ allergenKey: 'huevo' }), r({ id: 'r2', allergenKey: 'leche' })] }))
    const t = text(html)
    expect(t).toContain('Revisa antes de cocinar')
    // Cada aviso lleva «Día · Comida/Cena · plato».
    expect(t).toMatch(/(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo) · (Comida|Cena) · /)
    expect(t).toContain('Alguien de tu familia')
    expect(t).not.toContain(TRAP_NOTE)
    expect(t).toContain(DIETARY_GENERAL_DISCLAIMER)
    expect(t).toContain('el menú no se modifica')
    expect(a11yProblems(html)).toEqual([])
  })

  it('solo enseña los platos con aviso (no los 28)', () => {
    const t = text(render(overview({ restrictions: [r({ allergenKey: 'altramuces' })] })))
    const n = (t.match(/(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo) · (Comida|Cena) · /g) ?? []).length
    expect(n).toBeLessThan(week.length)
  })

  it('sin restricciones registradas no pinta nada', () => {
    expect(render(overview({ restrictions: [] }))).toBe('')
  })

  it('sin permiso para ver todo (niño/invitado) no pinta nada', () => {
    expect(render(overview({ canManage: false }))).toBe('')
  })

  it('sin datos todavía no pinta nada; con fallo de lectura, una frase fija', () => {
    expect(render(null)).toBe('')
    expect(text(render(null, week, { loadFailed: true }))).toContain(WARN_LOAD_ERROR)
  })

  it('una sola receta sin coincidencias enseña el descargo, nunca «segura» ni verde', () => {
    const item = week.find((w) => w.recipe.ingredients.every((i) => !/huevo|leche|queso|nata|mantequilla|yogur/i.test(i.name))) ?? week[0]
    const html = render(overview({ restrictions: [r({ allergenKey: 'altramuces' })] }), [item])
    const t = text(html)
    expect(t).toContain(NO_MATCH_DISCLAIMER)
    expect(html).not.toMatch(/fd-ok|success|green|verde/i)
    // La única aparición de «segura» es la frase negativa fija.
    const without = t.split(NO_MATCH_DISCLAIMER).join('')
    expect(without).not.toMatch(/segur[ao]|libre de|apta? para/i)
  })

  it('en los avisos de todo el menú no aparece lenguaje que prometa seguridad fuera de los descargos fijos', () => {
    const t = text(render(overview({ restrictions: [r({ allergenKey: 'huevo' }), r({ id: 'r3', allergenKey: 'gluten' })] })))
    const without = t.split(NO_MATCH_DISCLAIMER).join('').split(DIETARY_GENERAL_DISCLAIMER).join('')
    expect(without).not.toMatch(/segur[ao]|libre de|apta? para|sin alérgenos/i)
  })

  it('el módulo no usa almacenamiento del navegador ni consola', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/MenuDietaryWarnings.tsx'), 'utf8')
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|console\./)
  })
})
