import { describe, expect, it } from 'vitest'

// Fase 3 — auditoría: "considere únicamente eventos activos/en
// planificación" y "evento archivado excluido" (test de regresión
// pedido explícitamente). loadAllEventAlerts no filtra por status a
// mano — se apoya en que listEvents() sin argumentos ya excluye los
// archivados por defecto (ver EVENT_SELECT/listEvents en este mismo
// archivo). Esta prueba fija esa forma de llamarlo como regresión: si
// alguna vez alguien cambia a listEvents(true) aquí, los eventos
// archivados volverían a generar avisos.
const SRC = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']

describe('loadAllEventAlerts — solo eventos activos', () => {
  it('llama a listEvents() sin incluir archivados', () => {
    const fnStart = SRC.indexOf('export async function loadAllEventAlerts')
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = SRC.slice(fnStart, SRC.indexOf('\n}', fnStart) + 2)
    expect(fnBody).toContain('const events = await listEvents()')
    expect(fnBody).not.toMatch(/listEvents\(\s*true\s*\)/)
  })
})
