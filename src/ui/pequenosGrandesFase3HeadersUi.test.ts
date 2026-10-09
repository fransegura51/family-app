import { describe, expect, it } from 'vitest'

// «Pequeños Grandes» (prompt maestro) — Fase 3: cabeceras e imágenes reales ya entregadas por el
// usuario. Petición real: "la de puntos y recompensas se queda igual" — RewardsScreen.tsx no se toca.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const PG_SCREEN = UI['/src/ui/PequenosGrandesScreen.tsx']
const REWARDS_SCREEN = UI['/src/ui/RewardsScreen.tsx']

describe('PequenosGrandesScreen — las 3 cabeceras propias (hub, Educación financiera, Lista de deseos)', () => {
  it('importa las 3 imágenes reales, ninguna queda pendiente', () => {
    expect(PG_SCREEN).toContain("import pequenosGrandesHeaderImg from '@/assets/puntos/pequenos-grandes-header.jpg'")
    expect(PG_SCREEN).toContain("import educacionFinancieraHeaderImg from '@/assets/puntos/educacion-financiera-header.jpg'")
    expect(PG_SCREEN).toContain("import deseosHeaderImg from '@/assets/puntos/deseos-header.jpg'")
  })
  it('las 3 pantallas llevan su kitchen-header-wide (mismo ratio 16:9 que el resto de Pequeños Grandes)', () => {
    const matches = PG_SCREEN.match(/className="kitchen-header kitchen-header-wide"/g) ?? []
    expect(matches.length).toBe(3)
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
  it('el botón de cada tarjeta es la imagen completa (home-card-photo), con el subtítulo debajo', () => {
    expect(PG_SCREEN).toContain('className="card event-module-card home-card-photo"')
    expect(PG_SCREEN).toContain('<img src={card.img} alt={card.label} className="home-card-photo-img" />')
  })
})

describe('RewardsScreen — su cabecera (puntos-header.jpg) no se toca, petición real: "se queda igual"', () => {
  it('sigue importando y usando exactamente el mismo archivo de siempre', () => {
    expect(REWARDS_SCREEN).toContain("import puntosHeaderImg from '@/assets/puntos/puntos-header.jpg'")
    expect(REWARDS_SCREEN).toContain('<img src={puntosHeaderImg} alt="Puntos y recompensas" className="kitchen-header-img" />')
  })
})
