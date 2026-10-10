import { describe, expect, it } from 'vitest'
import { routeColorFor } from '@/domain/routeColor'

const GREENS = ['#7c3aed', '#db2777', '#2563eb', '#ea580c']

describe('color de la ruta en el mapa (el tráfico se dibuja en verde: la ruta no puede ser verde)', () => {
  it('un verde de persona se cambia por un color que no se parece a nada del mapa', () => {
    for (const green of ['#22c55e', '#16a34a', '#4ade80', '#10b981', '#00ff00', '#2e7d32', '#14b8a6']) {
      expect(GREENS, green).toContain(routeColorFor(green, 'paco'))
    }
  })

  it('los colores que no son verdes se quedan tal cual', () => {
    for (const color of ['#ef4444', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#6b7280', '#ffffff']) {
      expect(routeColorFor(color, 'x'), color).toBe(color)
    }
  })

  it('es estable por persona y reparte entre varias personas verdes', () => {
    expect(routeColorFor('#22c55e', 'paco')).toBe(routeColorFor('#22c55e', 'paco'))
    const colors = new Set(['paco', 'jennifer', 'fran', 'alvaro', 'carlos', 'elena'].map((id) => routeColorFor('#22c55e', id)))
    expect(colors.size).toBeGreaterThan(1)
  })

  it('un valor que no es un color hexadecimal no rompe nada', () => {
    expect(routeColorFor('verde', 'x')).toBe('verde')
    expect(routeColorFor('', 'x')).toBe('')
  })
})
