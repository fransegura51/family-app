import { describe, expect, it } from 'vitest'

// Fase 12 — al llegar a Preparativos desde un aviso, se destaca la
// tarea más urgente de verdad, reutilizando rankUpcomingTasks (la
// misma que ya ordena "Pepa te recomienda") en vez de una segunda
// definición de "más urgente". No se añade ningún parámetro nuevo a
// la URL (?event=&modulo= de la Fase 4 se mantiene intacto).
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

describe('Fase 12 — deep-link a la tarea concreta', () => {
  it('deriva la tarea a destacar con rankUpcomingTasks, no con un criterio nuevo', () => {
    expect(SRC).toContain("const deepLinkHighlightTaskId = initialModule === 'tareas' ? (rankUpcomingTasks(tasks)[0]?.task.id ?? null) : null")
  })

  it('no añade parámetros nuevos a la URL — sigue siendo ?event=&modulo= (Fase 4)', () => {
    expect(SRC).toContain("searchParams.get('event')")
    expect(SRC).toContain("searchParams.get('modulo')")
    expect(SRC).not.toMatch(/searchParams\.get\('tarea'\)|searchParams\.get\('task'\)/)
  })

  it('TaskCard recibe "highlighted" y aplica una clase CSS discreta, no un color nuevo por tarea', () => {
    const fnStart = SRC.indexOf('function TaskCard(')
    const fnBody = SRC.slice(fnStart, SRC.indexOf('\nfunction TaskEditModal', fnStart))
    expect(fnBody).toContain('event-task-card-highlighted')
  })

  it('showAllTasks arranca en true cuando se llega directo a Preparativos, para que la tarea destacada esté siempre visible sin un paso extra', () => {
    expect(SRC).toContain("useState(initialModule === 'tareas')")
  })
})
