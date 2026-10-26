import { describe, expect, it } from 'vitest'
import { eanHint, sanitizeReading, suggestionFromReading } from './packPhoto'

describe('propuesta a partir de la lectura del envase', () => {
  const ok = sanitizeReading({ name: 'Cerveza Lager', count: 6, amount: 330, unit: 'ml', ean: '8410000000009', confidence: 'alta' })
  it('lectura completa y fiable: rellena el editor, que sigue exigiendo pulsar «Guardar formato»', () => {
    const s = suggestionFromReading(ok)
    expect(s.fill).toEqual({ count: '6', amount: '330', unit: 'ml' })
    expect(s.message).toContain('Comprueba y pulsa «Guardar formato»')
  })
  it('lectura media: rellena pero pide revisar', () => {
    expect(suggestionFromReading({ ...ok, confidence: 'media' }).message).toContain('revísalo')
  })
  it('lectura baja: no rellena nada ni acepta nada solo', () => {
    const s = suggestionFromReading({ ...ok, confidence: 'baja', notes: 'imagen borrosa' })
    expect(s.fill).toBeNull()
    expect(s.message).toContain('imagen borrosa')
  })
  it('datos a medias: no se da por completo y dice qué falta', () => {
    const s = suggestionFromReading(sanitizeReading({ count: null, amount: 500, unit: 'g', confidence: 'media' }))
    expect(s.fill).toBeNull()
    expect(s.message).toContain('contenido 500 g')
  })
  it('una respuesta rara del servidor no rompe nada', () => {
    expect(sanitizeReading(null)).toMatchObject({ count: null, confidence: 'baja', unit: null })
    expect(sanitizeReading({ unit: 'oz', count: -1, ean: '12' })).toMatchObject({ unit: null, count: null, ean: null })
  })
  it('el código de barras es solo una ayuda y no se usa con lecturas dudosas', () => {
    expect(eanHint(ok)).toBe('8410000000009')
    expect(eanHint({ ...ok, confidence: 'baja' })).toBeNull()
  })
})
