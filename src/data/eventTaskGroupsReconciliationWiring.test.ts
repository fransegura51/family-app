import { describe, expect, it } from 'vitest'

// Bloque H — una tarea automática agrupada nunca debe perder su encargo en una reconciliación posterior.
// executeReconcileActions (create_task/update_task/complete_task/delete_task/detach_task) nunca
// referencia group_id: por construcción, ningún camino de reconciliación lo toca ni lo borra.
const EVENTS = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('bloque H: la reconciliación automática nunca toca group_id', () => {
  const body = window_(EVENTS, 'async function executeReconcileActions(', '\n// ---')

  it('update_task solo actualiza el título — nunca group_id, prioridad, nota ni responsables', () => {
    const block = window_(body, "case 'update_task': {", "case 'complete_task': {")
    expect(block).toContain(".update({ title: action.title })")
    expect(block).not.toContain('group_id')
  })
  it('detach_task solo desvincula la decisión — conserva group_id tal cual (y con él, el encargo)', () => {
    const block = window_(body, "case 'detach_task': {", "case 'create_budget': {")
    expect(block).toContain('.update({ decision_id: null })')
    expect(block).not.toContain('group_id')
  })
  it('create_task (una tarea auto nueva) nunca fija group_id — empieza sin agrupar, nunca se obliga a agrupar', () => {
    const block = window_(body, "case 'create_task': {", "case 'update_task': {")
    expect(block).not.toContain('group_id')
  })
  it('complete_task/delete_task tampoco mencionan group_id', () => {
    const completeBlock = window_(body, "case 'complete_task': {", "case 'delete_task': {")
    const deleteBlock = window_(body, "case 'delete_task': {", "case 'detach_task': {")
    expect(completeBlock).not.toContain('group_id')
    expect(deleteBlock).not.toContain('group_id')
  })
})

describe('isTaskUntouched protege una tarea agrupada igual que una con fecha/responsable/calendario', () => {
  it('eventPairDecisions.ts exporta la regla con groupId incluido (ver eventPairDecisions.test.ts para el comportamiento)', () => {
    const PAIR = (import.meta.glob('/src/domain/eventPairDecisions.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/domain/eventPairDecisions.ts']
    const fnBody = window_(PAIR, 'export function isTaskUntouched(', '\n}')
    expect(fnBody).toContain('!task.groupId')
  })
})
