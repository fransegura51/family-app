import { describe, expect, it } from 'vitest'

// Tanda integrada "Personas especiales, complementos, regalos, preparativos y encargos" —
// applyPairDecisionGenerationPerPerson (migración 0219: event_tasks.role_person_id) reutiliza EXACTAMENTE
// el mismo motor puro (reconcilePairGeneration, ya probado a fondo en eventPairDecisions.test.ts: idempotente,
// nunca borra una tarea enriquecida — ver isTaskUntouched) una vez por persona, nunca un motor paralelo.
// Esta prueba solo cubre el cableado nuevo (cómo se agrupan las tareas existentes por persona y qué pasa
// con una persona que deja de estar en la lista deseada), no repite lo que ya prueba el motor puro.
const EVENTS = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const BODY = window_(EVENTS, 'export async function applyPairDecisionGenerationPerPerson(', '\n// Ejecuta tal cual la lista de acciones')

describe('applyPairDecisionGenerationPerPerson — UN preparativo POR PERSONA, mismo motor puro reutilizado', () => {
  it('agrupa las tareas YA existentes de esta decisión por role_person_id (nunca por nombre ni por posición)', () => {
    expect(BODY).toContain("select(TASK_SELECT).eq('decision_id', decisionId)")
    expect(BODY).toContain('if (t.rolePersonId) existingByPerson.set(t.rolePersonId, t)')
  })
  it('por cada persona deseada, reconcilia con SU propia tarea existente (o ninguna) — reconcilePairGeneration tal cual, sin presupuesto (los complementos no lo tienen)', () => {
    expect(BODY).toContain('reconcilePairGeneration(desired, existingByPerson.get(personId), undefined)')
    expect(BODY).toContain('await executeReconcileActions(eventId, familyId, decisionId, result, personId)')
  })
  it('una persona que YA tenía tarea pero ya no está en la lista deseada (complemento quitado o persona eliminada) se reconcilia con NONE_DESIRED — nunca un borrado directo fuera del motor', () => {
    const leftoverLoop = BODY.slice(BODY.indexOf('for (const [personId, task] of existingByPerson)'))
    expect(leftoverLoop).toContain('if (desiredPersonIds.has(personId)) continue')
    expect(leftoverLoop).toContain('reconcilePairGeneration(NONE_DESIRED, task, undefined)')
  })
  it('idempotencia: volver a llamar con la MISMA lista deseada no repite trabajo — depende solo de reconcilePairGeneration (puro, cubierto en eventPairDecisions.test.ts), nunca de un flag de "ya ejecutado" propio', () => {
    // No existe ningún estado local de "ya se ejecutó esta reconciliación" — cada llamada vuelve a leer
    // las tareas reales de la BD (existingByPerson) y delega en el motor puro, que no genera ninguna
    // acción cuando lo deseado ya coincide con lo existente.
    expect(BODY).not.toMatch(/already(Run|Applied|Reconciled)|hasReconciled/i)
  })
  it('NONE_DESIRED es la misma forma vacía que el resto del módulo (taskTitle/budgetCategory/providerCategory/resolved/groupKind/groupDefaultName todos null/false)', () => {
    expect(EVENTS).toContain(
      "const NONE_DESIRED: DesiredPairGeneration = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }",
    )
  })
})
