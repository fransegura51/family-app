import { describe, expect, it } from 'vitest'

// "Mantenerla como está" debe tener significado persistente (bloque C): una propuesta rechazada no debe
// reaparecer si no cambió nada material, pero sí puede volver a evaluarse si cambia algo real (fecha,
// decisión de origen, motivo). Y nunca debe cambiar la prioridad sin que el usuario acepte.
const EVENTS = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

describe('ensureTaskPrioritySuggestions: no repetir, reevaluar si cambia algo material', () => {
  const body = fn(EVENTS, 'export async function ensureTaskPrioritySuggestions(')

  it('solo revisa tareas con prioridad de origen usuario (PEPA ya se recalcula sola, nunca necesita que se le "proponga" nada)', () => {
    expect(body).toContain("t.prioritySource === 'usuario'")
  })
  it('una propuesta pendiente con el MISMO fingerprint no se repite ni se reescribe', () => {
    expect(body).toContain('if (openSuggestion.contextFingerprint === suggestion.fingerprint) continue')
  })
  it('una propuesta ya rechazada con el MISMO fingerprint no vuelve a crearse', () => {
    expect(body).toContain("forTask.some((s) => s.status === 'rechazada' && s.contextFingerprint === suggestion.fingerprint)")
  })
  it('si el contexto cambia (fingerprint distinto) con una propuesta pendiente, la ACTUALIZA en el sitio en vez de duplicarla', () => {
    expect(body).toContain("if (openSuggestion) {")
    expect(body).toMatch(/update\(\{\s*proposed_priority: suggestion\.proposedPriority/)
  })
  it('si ya no hace falta ninguna propuesta (el usuario igualó la prioridad), resuelve en silencio la que hubiera pendiente — nunca la deja obsoleta', () => {
    expect(body).toContain("if (!suggestion) {")
    expect(body).toContain("status: 'resuelta'")
  })
})

describe('respondToEventTaskPrioritySuggestion: nunca cambia la prioridad sin aceptar', () => {
  const body = fn(EVENTS, 'export async function respondToEventTaskPrioritySuggestion(')
  it('solo escribe en event_tasks cuando accept es true', () => {
    const ifIdx = body.indexOf('if (accept) {')
    const eventTasksIdx = body.indexOf("from('event_tasks')")
    const suggestionsIdx = body.indexOf("from('event_task_priority_suggestions')", ifIdx)
    expect(ifIdx).toBeGreaterThan(-1)
    // El único from('event_tasks') está DENTRO del bloque if(accept), antes de que se actualice la propuesta.
    expect(eventTasksIdx).toBeGreaterThan(ifIdx)
    expect(eventTasksIdx).toBeLessThan(suggestionsIdx)
  })
  it('rechazar solo marca la propuesta como rechazada, nunca toca event_tasks', () => {
    expect(body).toContain("status: accept ? 'aceptada' : 'rechazada'")
  })
})
