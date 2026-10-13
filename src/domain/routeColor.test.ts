import { describe, expect, it } from 'vitest'
import { routeColorFor } from '@/domain/routeColor'

function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
}
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)
  if (max === g) return 60 * ((b - r) / delta + 2)
  if (max === r) return (60 * (((g - b) / delta) % 6) + 360) % 360
  return 60 * ((r - g) / delta + 4)
}

describe('color de la ruta en el mapa: el de cada persona; los verdes, más oscuros', () => {
  it('cada persona lleva su color exacto (los de la familia, menos el verde)', () => {
    for (const color of ['#f2f54d', '#4d8df5', '#e91e63', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#6b7280', '#ffffff']) {
      expect(routeColorFor(color, 'x'), color).toBe(color)
    }
  })

  it('el verde claro de Paco (#4df558) pasa a un verde más oscuro: sigue siendo verde, pero ya no se confunde con el tráfico', () => {
    const route = routeColorFor('#4df558', 'paco')
    expect(route).not.toBe('#4df558')
    expect(lightness(route)).toBeLessThan(0.3)
    const h = hue(route)
    expect(h).toBeGreaterThan(110)
    expect(h).toBeLessThan(140) // el mismo tono de verde que el suyo (124º)
    expect(route).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('todos los verdes, claros u oscuros, acaban en un verde oscuro del mismo tono', () => {
    for (const green of ['#22c55e', '#16a34a', '#4ade80', '#10b981', '#00ff00', '#2e7d32', '#14b8a6', '#4df558']) {
      const route = routeColorFor(green, 'x')
      expect(lightness(route), green).toBeLessThan(0.3)
      expect(Math.abs(hue(route) - hue(green)), green).toBeLessThan(6)
    }
  })

  it('es estable: la misma persona, siempre el mismo color', () => {
    expect(routeColorFor('#4df558', 'paco')).toBe(routeColorFor('#4df558', 'otra'))
  })

  it('un valor que no es un color hexadecimal no rompe nada', () => {
    expect(routeColorFor('verde', 'x')).toBe('verde')
    expect(routeColorFor('', 'x')).toBe('')
  })
})
