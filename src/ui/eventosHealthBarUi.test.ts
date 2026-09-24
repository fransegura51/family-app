import { describe, expect, it } from 'vitest'

// Fase 7 — auditoría: el porcentaje de "Preparación del evento" se
// quitó en la Fase 2 precisamente porque escondía problemas reales
// detrás de un número. La nueva barra dinámica reutiliza `progress`
// como valor INTERNO (ancho de la barra), pero nunca debe imprimirse
// como texto/cifra para el usuario. Comprobado sobre el código fuente
// real, no solo sobre el resultado de computeEventHealth.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

describe('barra de "Estado del evento": progress nunca se enseña como cifra', () => {
  it('eventHealth.progress solo se usa para el ancho de la barra (style), nunca dentro de una etiqueta de texto', () => {
    const usages = [...SRC.matchAll(/eventHealth\.progress/g)]
    expect(usages.length).toBeGreaterThan(0)
    for (const u of usages) {
      const context = SRC.slice(Math.max(0, u.index! - 40), u.index! + 60)
      expect(context).toMatch(/width:\s*`\$\{eventHealth\.progress\}%`/)
    }
  })

  it('el nivel (level), no el progreso, es lo único que decide el color de la barra', () => {
    expect(SRC).toContain('event-health-${eventHealth.level}')
  })
})
