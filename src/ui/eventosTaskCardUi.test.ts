import { describe, expect, it } from 'vitest'

// Fase 8 — auditoría de uso real en iPhone: "fecha cruda ISO
// 2026-08-20". TaskCard y "Pepa te recomienda" deben formatear
// siempre con formatSpanishDate (DD/MM/YYYY), nunca imprimir
// task.dueDate en crudo dentro de una etiqueta de texto.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

describe('Preparativos: nunca se enseña una fecha ISO cruda', () => {
  it('TaskCard formatea con formatSpanishDate, no imprime task.dueDate directamente', () => {
    const fnStart = SRC.indexOf('function TaskCard(')
    const fnBody = SRC.slice(fnStart, SRC.indexOf('\nfunction TaskEditModal', fnStart))
    expect(fnBody).toContain('formatSpanishDate(task.dueDate)')
    expect(fnBody).not.toMatch(/\{task\.dueDate\}(?!\s*\))/)
  })

  it('"Pepa te recomienda" formatea con formatSpanishDate, no imprime task.dueDate directamente', () => {
    const idx = SRC.indexOf('💡 Pepa te recomienda')
    const block = SRC.slice(idx, idx + 1500)
    expect(block).toContain('formatSpanishDate(task.dueDate)')
    expect(block).not.toMatch(/\$\{task\.dueDate\}/)
  })

  it('la ficha de tarea mueve borrar detrás de "⋯" (no hay una ✕ siempre visible)', () => {
    const fnStart = SRC.indexOf('function TaskCard(')
    const fnBody = SRC.slice(fnStart, SRC.indexOf('\nfunction TaskEditModal', fnStart))
    expect(fnBody).not.toContain('ConfirmIconButton')
    expect(fnBody).toContain('ConfirmButton')
  })
})
