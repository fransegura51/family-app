import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cleanCommercialTitle, looksLikeCommercialTitle } from '@/domain/commercialTitle'

const ZOCONE =
  'ZOCONE Cadenas para Chupetes Bebe, 8 Piezas Chupete Cuerda Tela Suave Cadena para Chupete con Clip Reutilizable Cadena Chupete Bebe Sujeta Chupetes Niña Niño Cadenas Sujetachupetes'

describe('COMP-02 · títulos comerciales importados', () => {
  it('un título larguísimo de Amazon se limpia: conserva marca, cantidad y rasgo distintivo, sin repeticiones', () => {
    expect(looksLikeCommercialTitle(ZOCONE)).toBe(true)
    const clean = cleanCommercialTitle(ZOCONE)
    expect(clean.length).toBeLessThanOrEqual(110)
    expect(clean.length).toBeLessThan(ZOCONE.length)
    expect(clean).toContain('ZOCONE')
    expect(clean).toMatch(/\b8\b/)
    expect(clean.toLowerCase()).toContain('reutilizable')
    // la palabra «chupete(s)» ya no se repite diez veces
    expect((clean.toLowerCase().match(/chupete/g) ?? []).length).toBeLessThanOrEqual(2)
  })

  it('un nombre corto y limpio (un artículo de ticket) no se toca nunca', () => {
    for (const name of ['Leche entera 1 L', 'Cable Ethernet 5 m', 'Pilas AA 8 ud']) {
      expect(looksLikeCommercialTitle(name)).toBe(false)
    }
  })

  it('las dos copias del módulo (app y función de servidor) son idénticas', () => {
    const app = readFileSync('src/domain/commercialTitle.ts', 'utf8').replace(/\r\n/g, '\n')
    const server = readFileSync('supabase/functions/_shared/commercialTitle.ts', 'utf8').replace(/\r\n/g, '\n')
    expect(server).toBe(app)
  })
})
