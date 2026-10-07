import { describe, expect, it } from 'vitest'

// Bloque H — una tarea automática agrupada nunca debe perder su encargo en una reconciliación posterior.
// update_task/complete_task/delete_task/detach_task nunca referencian group_id: por construcción, esos
// caminos de reconciliación no lo tocan ni lo borran. Tanda Encargos v2: create_task es la ÚNICA
// excepción deliberada — SOLO cuando action.groupKind lo pide (auto-agrupación en origen, ver
// desiredForFloral) agrupa la tarea RECIÉN creada; nunca reclasifica retroactivamente ninguna existente.
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
  it('create_task solo agrupa la tarea SI action.groupKind lo pide — nunca incondicionalmente, nunca se obliga a agrupar', () => {
    const block = window_(body, "case 'create_task': {", "case 'update_task': {")
    expect(block).toContain('if (action.groupKind) {')
    expect(block).toContain('findOrCreateEventTaskGroupByKind(eventId, familyId, action.groupKind, action.groupDefaultName ?? action.groupKind)')
    expect(block).toContain("from('event_tasks').update({ group_id: groupId })")
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
