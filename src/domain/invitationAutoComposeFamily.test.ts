import { describe, expect, it } from 'vitest'
import { INVITATION_TEMPLATES } from '@/domain/events'
import { classifyTemplateGeometry, type GeometryFamily } from '@/domain/invitationAutoCompose'

// Fase 3 Bloque 5A — confirma que la tabla estática de familias geométricas (auditoría 2026-09-27)
// reproduce EXACTAMENTE los tamaños de familia reales sobre las 100 plantillas actuales del catálogo, y
// que ningún caso frontera documentado en la auditoría (navidad_hogar, la Familia 3 de solo 3 plantillas)
// se clasifica mal.

describe('classifyTemplateGeometry — reproduce la auditoría real de las 100 plantillas', () => {
  it('hay exactamente 100 plantillas en el catálogo actual', () => {
    expect(INVITATION_TEMPLATES.length).toBe(100)
  })

  it('cada una de las 100 tiene una familia asignada (1-5)', () => {
    for (const t of INVITATION_TEMPLATES) {
      const family = classifyTemplateGeometry(t)
      expect([1, 2, 3, 4, 5]).toContain(family)
    }
  })

  it('los tamaños de familia coinciden exactamente con la auditoría: 28/36/3/13/20 = 100', () => {
    const counts: Record<GeometryFamily, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const t of INVITATION_TEMPLATES) counts[classifyTemplateGeometry(t)]++
    expect(counts[1]).toBe(28)
    expect(counts[2]).toBe(36)
    expect(counts[3]).toBe(3)
    expect(counts[4]).toBe(13)
    expect(counts[5]).toBe(20)
    expect(counts[1] + counts[2] + counts[3] + counts[4] + counts[5]).toBe(100)
  })

  it('la Familia 3 (horizontal extrema) es exactamente {superheroe, princesa, bebe_nino} — no más, no menos', () => {
    const family3 = INVITATION_TEMPLATES.filter((t) => classifyTemplateGeometry(t) === 3).map((t) => t.key)
    expect(family3.sort()).toEqual(['bebe_nino', 'princesa', 'superheroe'].sort())
  })

  it('navidad_hogar (aspect extremo ≈1.588 pero NO ancha) cae en la Familia 4 (compacta), no en la 3 — el caso frontera exacto que la auditoría advirtió', () => {
    const navidadHogar = INVITATION_TEMPLATES.find((t) => t.key === 'navidad_hogar')!
    expect(classifyTemplateGeometry(navidadHogar)).toBe(4)
  })

  it('corazones_terraza (width mínima, ya certificada — no se toca su textArea) cae en la Familia 5', () => {
    const t = INVITATION_TEMPLATES.find((t) => t.key === 'corazones_terraza')!
    expect(classifyTemplateGeometry(t)).toBe(5)
  })

  it('es determinista: clasificar dos veces la misma plantilla da la misma familia', () => {
    const t = INVITATION_TEMPLATES.find((t) => t.key === 'boda')!
    expect(classifyTemplateGeometry(t)).toBe(classifyTemplateGeometry(t))
  })

  it('una plantilla desconocida (no está en la tabla) usa el fallback geométrico documentado, nunca lanza error', () => {
    expect(() => classifyTemplateGeometry({ key: 'plantilla-futura-inexistente', textArea: { x: 0.2, y: 0.15, width: 0.6, height: 0.6 } })).not.toThrow()
  })

  it('no se añadió ninguna dependencia de clustering al proyecto (la clasificación es una tabla estática + aritmética)', () => {
    const pkg = (import.meta.glob('/package.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/package.json']
    expect(pkg.toLowerCase()).not.toMatch(/kmeans|"ml-|clustering/)
  })
})
