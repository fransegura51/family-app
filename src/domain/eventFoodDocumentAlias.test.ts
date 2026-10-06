import { describe, expect, it } from 'vitest'
import { documentAlias } from '@/domain/eventFoodDocumentAlias'

const src = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const ORIGINALS = src('src/ui/EventMenuOriginals.tsx')

describe('aliases de documentos originales — según el orden real de importación', () => {
  it('el primero es «Menú importado», después «Menú importado 2», «3»…', () => {
    expect(documentAlias(0)).toBe('Menú importado')
    expect(documentAlias(1)).toBe('Menú importado 2')
    expect(documentAlias(2)).toBe('Menú importado 3')
  })

  it('nunca muestra UUID, extensión ni nombre técnico del fichero', () => {
    for (const i of [0, 1, 2, 9]) expect(documentAlias(i)).not.toMatch(/\.(jpe?g|png|pdf|webp)|[0-9a-f]{8}-[0-9a-f]{4}|IMG_/i)
  })

  it('la lista muestra el alias por posición, no el nombre original del archivo', () => {
    expect(ORIGINALS).toContain('{documentAlias(index)}')
    expect(ORIGINALS).not.toMatch(/\{doc\.originalName\s*\?\?/)
  })

  it('el componente sigue abriendo el documento exacto (URL firmada de su ruta de almacenamiento)', () => {
    expect(ORIGINALS).toContain('getEventFoodDocumentUrl(doc.storagePath)')
  })
})
