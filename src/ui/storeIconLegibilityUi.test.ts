import { describe, expect, it } from 'vitest'

// Fase 6 (plan de pendientes) — Compras: un logo de tienda mayormente blanco o transparente (favicon o
// imagen empaquetada) se volvía ilegible sin ningún respaldo de contraste detrás. Este archivo protege
// que el respaldo blanco envuelve AMBOS casos de logo real (favicon y la imagen empaquetada), nunca el
// emoji/icono genérico (que ya tiene su propio color de fondo según el caso), y que el tamaño del propio
// logo nunca cambia — solo se le añade un margen fijo alrededor.
const SRC = (import.meta.glob('/src/ui/StoreIcon.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/StoreIcon.tsx']

describe('StoreIcon — respaldo blanco detrás de un logo real, nunca detrás del emoji genérico', () => {
  it('LogoBackdrop envuelve el <img> de la imagen empaquetada (kind "image")', () => {
    const imageBranch = SRC.slice(SRC.indexOf("if (icon.kind === 'image')"), SRC.indexOf("if (icon.kind === 'logo'"))
    expect(imageBranch).toContain('<LogoBackdrop size={size}>')
    expect(imageBranch).toContain('</LogoBackdrop>')
  })

  it('LogoBackdrop envuelve el <img> del favicon en vivo (kind "logo")', () => {
    const logoBranch = SRC.slice(SRC.indexOf("if (icon.kind === 'logo'"), SRC.indexOf("return <span style={{ fontSize: size }}>"))
    expect(logoBranch).toContain('<LogoBackdrop size={size}>')
    expect(logoBranch).toContain('</LogoBackdrop>')
  })

  it('el emoji/icono genérico de respaldo NUNCA lleva LogoBackdrop (ya tiene su propio tratamiento)', () => {
    const fallback = SRC.slice(SRC.indexOf('return <span style={{ fontSize: size }}>'))
    expect(fallback).not.toContain('LogoBackdrop')
  })

  it('el tamaño del logo en sí (width/height) nunca cambia — el respaldo solo añade un margen fijo alrededor', () => {
    expect(SRC).toContain('const boxSize = size + LOGO_BACKDROP_PADDING * 2')
    expect([...SRC.matchAll(/width=\{size\}\s*\n\s*height=\{size\}/g)]).toHaveLength(2)
  })
})
