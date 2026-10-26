// Lectura de envases con IA (servidor, SIN desplegar): el modelo solo transcribe lo impreso y el código lo valida de forma estricta. Sin llamar a ningún proveedor.
import { describe, expect, it } from 'vitest'
import { isValidEan, packagePhotoSpec, parsePackagePhotoOutput } from '../../supabase/functions/_shared/ai/purposes/packagePhoto.ts'

const json = (o: unknown) => JSON.stringify(o)

describe('entrada', () => {
  it('admite de una a tres imágenes y rechaza lo que no es imagen', () => {
    const img = { imageBase64: 'AAAA', mimeType: 'image/jpeg' }
    expect(packagePhotoSpec.readInput({ images: [img] })).toEqual({ ok: true, input: { images: [img] } })
    const four = packagePhotoSpec.readInput({ images: [img, img, img, img] })
    expect(four.ok && four.input.images).toHaveLength(3)
    expect(packagePhotoSpec.readInput({ images: [] }).ok).toBe(false)
    expect(packagePhotoSpec.readInput({}).ok).toBe(false)
    expect(packagePhotoSpec.readInput({ images: [{ imageBase64: 'x', mimeType: 'application/pdf' }] }).ok).toBe(false)
  })
  it('manda el texto y todas las fotos al modelo, sin guardar nada', () => {
    const parts = packagePhotoSpec.buildParts({ images: [{ imageBase64: 'A', mimeType: 'image/png' }, { imageBase64: 'B', mimeType: 'image/jpeg' }] })
    expect(parts).toHaveLength(3)
    expect((parts[0] as { text: string }).text).toContain('NUNCA inventes')
  })
  it('tiene tope diario propio por familia (control de coste)', () => {
    expect(packagePhotoSpec.purposeDailyCap).toBe(40)
  })
})

describe('lectura completa y coherente', () => {
  it('6 latas × 330 ml con el total impreso coherente: confianza alta', () => {
    const r = parsePackagePhotoOutput(json({ name: 'Cerveza Lager', brand: 'Estrella', count: 6, amount: 330, unit: 'ml', total: 1.98, totalUnit: 'l', presentation: 'Pack 6 latas de 33 cl', ean: '8410000000009', confidence: 'alta', notes: null }))
    expect(r).toMatchObject({ name: 'Cerveza Lager', brand: 'Estrella', count: 6, amount: 330, unit: 'ml', confidence: 'alta', ean: '8410000000009' })
  })
  it('acepta las vallas de markdown', () => {
    expect(parsePackagePhotoOutput('```json\n' + json({ count: 1, amount: 1.5, unit: 'l', confidence: 'alta' }) + '\n```')).toMatchObject({ count: 1, amount: 1.5, unit: 'l' })
  })
})

describe('no inventa ni acepta lecturas dudosas', () => {
  it('un total impreso que no cuadra baja la confianza a «baja» y avisa', () => {
    const r = parsePackagePhotoOutput(json({ count: 6, amount: 330, unit: 'ml', total: 2.5, totalUnit: 'l', confidence: 'alta' }))
    expect(r.confidence).toBe('baja')
    expect(r.notes).toContain('no coincide')
  })
  it('un formato a medias no se da por completo', () => {
    const r = parsePackagePhotoOutput(json({ count: null, amount: 500, unit: 'g', confidence: 'alta' }))
    expect(r).toMatchObject({ count: null, amount: 500, unit: 'g', confidence: 'media' })
    expect(r.notes).toContain('cuántas unidades')
  })
  it('una unidad desconocida o un número absurdo se descartan', () => {
    expect(parsePackagePhotoOutput(json({ count: 2, amount: 3, unit: 'oz' }))).toMatchObject({ unit: null })
    expect(parsePackagePhotoOutput(json({ count: -4, amount: 'abc', unit: 'g' }))).toMatchObject({ count: null, amount: null })
    expect(parsePackagePhotoOutput(json({ count: 2.5, amount: 1, unit: 'ud', confidence: 'alta' }))).toMatchObject({ count: null })
  })
  it('un código de barras con dígito de control incorrecto se descarta', () => {
    const r = parsePackagePhotoOutput(json({ count: 1, amount: 1, unit: 'l', ean: '8410000000000', confidence: 'alta' }))
    expect(r.ean).toBeNull()
    expect(r.confidence).toBe('media')
    expect(r.notes).toContain('no es válido')
  })
  it('una respuesta que no es JSON es «no se ha leído nada», sin lanzar', () => {
    expect(parsePackagePhotoOutput('lo siento, no puedo')).toMatchObject({ name: null, count: null, confidence: 'baja' })
    expect(parsePackagePhotoOutput('')).toMatchObject({ confidence: 'baja' })
    expect(parsePackagePhotoOutput('[1,2]')).toMatchObject({ confidence: 'baja' })
  })
  it('sin confianza declarada se toma «baja»', () => {
    expect(parsePackagePhotoOutput(json({ count: 1, amount: 1, unit: 'l' })).confidence).toBe('baja')
  })
})

describe('código EAN (auxiliar)', () => {
  it('valida EAN-13 y EAN-8 por su dígito de control', () => {
    expect(isValidEan('8410000000009')).toBe(true)
    expect(isValidEan('8410000000000')).toBe(false)
    expect(isValidEan('96385074')).toBe(true)
    expect(isValidEan('1234')).toBe(false)
  })
})
