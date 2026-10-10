import { describe, expect, it } from 'vitest'

// PEPA — Prompt maestro "Continuidad automática + Pequeños Grandes + Eventos", Bloque A: los 3 accesos
// ilustrados del hub (Puntos y recompensas / Educación financiera / Lista de deseos) pasan a una sola
// columna, más pequeños que la cabecera MASTER, sin bloques blancos ni subtítulos grises (los títulos ya
// van dibujados dentro de cada imagen). Ninguna imagen se toca ni se genera de nuevo — solo su
// presentación en el grid.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const PG_SCREEN = UI['/src/ui/PequenosGrandesScreen.tsx']

describe('PequenosGrandesScreen — los 3 accesos en una sola columna, sin recortar, sin texto superpuesto', () => {
  it('usa pg-access-list/pg-access-card, no el card-grid de 2 columnas que usaba antes', () => {
    expect(PG_SCREEN).toContain('className="pg-access-list"')
    expect(PG_SCREEN).toContain('className="pg-access-card"')
  })
  it('las 3 imágenes aprobadas siguen siendo exactamente las mismas (nunca se generan nuevas)', () => {
    expect(PG_SCREEN).toContain("import recompensasCardImg from '@/assets/puntos/recompensas-card.jpg'")
    expect(PG_SCREEN).toContain("import educacionFinancieraCardImg from '@/assets/puntos/educacion-financiera-card.jpg'")
    expect(PG_SCREEN).toContain("import deseosCardImg from '@/assets/puntos/deseos-card.jpg'")
  })
  it('sin subtítulo gris pintado en pantalla — el nombre accesible va en aria-label del botón', () => {
    expect(PG_SCREEN).toContain('aria-label={`${card.label} — ${card.stat}`}')
    expect(PG_SCREEN).not.toContain('home-card-photo-caption')
    expect(PG_SCREEN).not.toMatch(/<p className="muted">\{card\.stat\}/)
  })
  it('sin flechas, iconos de navegación ni botones superpuestos dentro de cada tarjeta', () => {
    const start = PG_SCREEN.indexOf('className="pg-access-list"')
    const block = PG_SCREEN.slice(start, PG_SCREEN.indexOf('</div>', start))
    expect(block).not.toMatch(/home-card-icon|→|←/)
  })
  it('las rutas de navegación no cambian — openModule sigue siendo el único mecanismo', () => {
    expect(PG_SCREEN).toContain('onClick={() => setOpenModule(card.key)}')
  })
})

// El detalle visual (aspect-ratio 16:9, object-fit: contain, ancho 66%, bordes redondeados) vive en
// styles.css — Vitest no procesa el contenido real de los .css importados (?raw devuelve vacío aquí, sin
// precedente en este repo para leerlo), así que esa parte se verificó en vivo en el navegador (mobile):
// las 3 imágenes se ven completas sin recortar, en una columna, más pequeñas que la cabecera.

describe('La cabecera MASTER y las cabeceras de módulo no se tocan (Bloque A lo prohíbe explícitamente)', () => {
  it('las 2 cabeceras propias de este archivo siguen intactas, mismas imágenes de siempre (Lista de deseos tiene la suya en WishlistScreen.tsx desde que se construyó, 2026-10-10)', () => {
    const matches = PG_SCREEN.match(/className="kitchen-header kitchen-header-wide"/g) ?? []
    expect(matches.length).toBe(2)
    expect(PG_SCREEN).toContain("import pequenosGrandesHeaderImg from '@/assets/puntos/pequenos-grandes-header.jpg'")
  })
})
