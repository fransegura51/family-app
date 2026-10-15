// Parte pura de la preparación de fotos de Comunidad (el dibujo en el lienzo necesita navegador y no se prueba aquí).
import { describe, expect, it } from 'vitest'
import { COMPRESSION_STEPS, MAX_PHOTO_BYTES, MAX_PHOTO_SIDE, fitsPhotoLimit, looksLikeAcceptedImage, prepareCommunityPhoto, scaledSize } from '@/services/communityPhoto'
import { CommunityError } from '@/domain/communityErrors'

describe('scaledSize', () => {
  it('reduce el lado largo a 1600 px conservando la proporción', () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(scaledSize(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(scaledSize(1600, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('nunca agranda una foto pequeña', () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('aplica la reducción extra de los intentos de compresión', () => {
    expect(scaledSize(4000, 3000, MAX_PHOTO_SIDE, 0.5)).toEqual({ width: 800, height: 600 })
  })

  it('nunca devuelve 0 ni valores raros', () => {
    expect(scaledSize(10000, 1)).toEqual({ width: 1600, height: 1 })
    expect(scaledSize(0, 0)).toEqual({ width: 1, height: 1 })
    expect(scaledSize(-5, 20)).toEqual({ width: 1, height: 1 })
    expect(scaledSize(Number.NaN, 20)).toEqual({ width: 1, height: 1 })
  })
})

describe('límites', () => {
  it('el máximo son 3 MB', () => {
    expect(MAX_PHOTO_BYTES).toBe(3 * 1024 * 1024)
    expect(fitsPhotoLimit(MAX_PHOTO_BYTES)).toBe(true)
    expect(fitsPhotoLimit(MAX_PHOTO_BYTES + 1)).toBe(false)
    expect(fitsPhotoLimit(0)).toBe(false)
  })

  it('los intentos de compresión van de más a menos calidad', () => {
    const q = COMPRESSION_STEPS.map((s) => s.quality)
    expect([...q].sort((a, b) => b - a)).toEqual(q)
    expect(COMPRESSION_STEPS[0].scale).toBe(1)
  })
})

describe('tipos aceptados', () => {
  it('acepta imágenes, no acepta SVG ni otros archivos', () => {
    expect(looksLikeAcceptedImage('image/jpeg')).toBe(true)
    expect(looksLikeAcceptedImage('image/png')).toBe(true)
    expect(looksLikeAcceptedImage('image/heic')).toBe(true) // se intenta; si el navegador no la lee, BAD_PHOTO
    expect(looksLikeAcceptedImage('')).toBe(true)
    expect(looksLikeAcceptedImage('image/svg+xml')).toBe(false)
    expect(looksLikeAcceptedImage('application/pdf')).toBe(false)
    expect(looksLikeAcceptedImage('text/html')).toBe(false)
  })

  it('un archivo que no es imagen se rechaza con BAD_PHOTO antes de intentar nada', async () => {
    const notImage = new Blob(['hola'], { type: 'application/pdf' })
    await expect(prepareCommunityPhoto(notImage)).rejects.toMatchObject({ code: 'BAD_PHOTO' })
    await expect(prepareCommunityPhoto(notImage)).rejects.toBeInstanceOf(CommunityError)
  })
})
