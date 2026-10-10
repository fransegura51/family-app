import { describe, expect, it } from 'vitest'

// «Pequeños Grandes» (prompt maestro) — Fase 3: cabeceras e imágenes reales ya entregadas por el
// usuario. Petición real: "la de puntos y recompensas se queda igual" — RewardsScreen.tsx no se toca.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const PG_SCREEN = UI['/src/ui/PequenosGrandesScreen.tsx']
const REWARDS_SCREEN = UI['/src/ui/RewardsScreen.tsx']
// Lista de deseos (Fases 12-16, construida 2026-10-10) ya no es un hueco dentro de
// PequenosGrandesScreen.tsx — su propia cabecera vive en WishlistScreen.tsx, su pantalla real.
const WISHLIST_SCREEN = UI['/src/ui/WishlistScreen.tsx']

describe('PequenosGrandesScreen — las 2 cabeceras propias del hub (hub, Educación financiera)', () => {
  it('importa las 2 imágenes reales, ninguna queda pendiente', () => {
    expect(PG_SCREEN).toContain("import pequenosGrandesHeaderImg from '@/assets/puntos/pequenos-grandes-header.jpg'")
    expect(PG_SCREEN).toContain("import educacionFinancieraHeaderImg from '@/assets/puntos/educacion-financiera-header.jpg'")
  })
  it('las 2 pantallas llevan su kitchen-header-wide (mismo ratio 16:9 que el resto de Pequeños Grandes)', () => {
    const matches = PG_SCREEN.match(/className="kitchen-header kitchen-header-wide"/g) ?? []
    expect(matches.length).toBe(2)
  })
  it('Lista de deseos (WishlistScreen.tsx) tiene su propia cabecera real, mismo ratio', () => {
    expect(WISHLIST_SCREEN).toContain("import deseosHeaderImg from '@/assets/puntos/deseos-header.jpg'")
    expect(WISHLIST_SCREEN).toContain('className="kitchen-header kitchen-header-wide"')
  })
})

describe('PequenosGrandesScreen — las 3 tarjetas del hub usan su propia imagen a toda tarjeta, no color+emoji', () => {
  it('importa las 3 imágenes de tarjeta', () => {
    expect(PG_SCREEN).toContain("import recompensasCardImg from '@/assets/puntos/recompensas-card.jpg'")
    expect(PG_SCREEN).toContain("import educacionFinancieraCardImg from '@/assets/puntos/educacion-financiera-card.jpg'")
    expect(PG_SCREEN).toContain("import deseosCardImg from '@/assets/puntos/deseos-card.jpg'")
  })
  it('MODULE_CARDS ya no lleva campo "icon" (emoji) — la imagen sustituye al emoji y al color pastel', () => {
    expect(PG_SCREEN).not.toContain('icon:')
    expect(PG_SCREEN).not.toContain('pastelPalette')
  })
  it('el botón de cada tarjeta es la imagen completa, sin recortar y sin texto encima ni debajo (Bloque A, segunda ronda)', () => {
    expect(PG_SCREEN).toContain('className="pg-access-card"')
    expect(PG_SCREEN).toContain('<img src={card.img} alt="" className="pg-access-card-img" />')
    expect(PG_SCREEN).not.toContain('home-card-photo-caption')
  })
})

describe('RewardsScreen — su cabecera (puntos-header.jpg) no se toca, petición real: "se queda igual"', () => {
  it('sigue importando y usando exactamente el mismo archivo de siempre', () => {
    expect(REWARDS_SCREEN).toContain("import puntosHeaderImg from '@/assets/puntos/puntos-header.jpg'")
    expect(REWARDS_SCREEN).toContain('<img src={puntosHeaderImg} alt="Puntos y recompensas" className="kitchen-header-img" />')
  })
})
