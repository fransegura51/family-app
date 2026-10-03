import { describe, expect, it } from 'vitest'
import { isTaskUntouched, reconcilePairGeneration } from '@/domain/eventPairDecisions'
import {
  CLASES_BAILE_QUESTION_KEY,
  desiredForClasesBaile,
  momentosEspecialesStatus,
  MOMENTOS_ESPECIALES_CATALOG,
  MOMENTOS_ESPECIALES_QUESTION_KEY,
  summarizeMomentosEspecialesBlock,
} from '@/domain/eventSpecialMoments'
import type { EventDecision, EventTask } from '@/domain/types'

function makeDecision(overrides: Partial<EventDecision> = {}): EventDecision {
  return {
    id: 'd1',
    eventId: 'e1',
    familyId: 'f1',
    blockKey: 'momentos_especiales',
    questionKey: MOMENTOS_ESPECIALES_QUESTION_KEY,
    answer: {},
    isCustomOption: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeTask(overrides: Partial<EventTask> = {}): EventTask {
  return {
    id: 't1',
    eventId: 'e1',
    familyId: 'f1',
    title: 'Buscar/organizar clases de baile',
    done: false,
    dueDate: null,
    source: 'auto',
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    assignedMemberId: null,
    calendarEventId: null,
    decisionId: 'd1',
    ...overrides,
  }
}

describe('Catálogo de momentos especiales por tipo de evento', () => {
  it('boda incluye Primer baile y el resto de momentos propios de boda', () => {
    const keys = MOMENTOS_ESPECIALES_CATALOG.boda.map((i) => i.key)
    expect(keys).toEqual(['primer_baile', 'corte_tarta', 'discursos', 'ramo', 'salida_especial', 'sorpresa', 'proyeccion'])
  })

  it('cumpleaños NO incluye Primer baile ni Ramo (exclusivos de boda)', () => {
    const keys = MOMENTOS_ESPECIALES_CATALOG.cumpleanos.map((i) => i.key)
    expect(keys).toEqual(['velas_tarta', 'sorpresa', 'apertura_regalos', 'proyeccion'])
    expect(keys).not.toContain('primer_baile')
    expect(keys).not.toContain('ramo')
  })

  it('comunión y bautizo comparten exactamente el mismo catálogo', () => {
    expect(MOMENTOS_ESPECIALES_CATALOG.comunion).toEqual(MOMENTOS_ESPECIALES_CATALOG.bautizo)
    const keys = MOMENTOS_ESPECIALES_CATALOG.comunion.map((i) => i.key)
    expect(keys).toEqual(['tarta', 'brindis', 'apertura_regalos', 'proyeccion'])
  })

  it('celebración y personalizado comparten el mismo catálogo genérico, sin Primer baile/Ramo/Apertura de regalos', () => {
    expect(MOMENTOS_ESPECIALES_CATALOG.celebracion).toEqual(MOMENTOS_ESPECIALES_CATALOG.personalizado)
    const keys = MOMENTOS_ESPECIALES_CATALOG.celebracion.map((i) => i.key)
    expect(keys).toEqual(['tarta', 'brindis', 'sorpresa', 'proyeccion'])
  })

  it('"Momento de fotos" no existe en ningún catálogo — "Proyección de fotos o vídeo" es mostrar algo durante el evento, nunca hacer fotos/photocall', () => {
    for (const type of Object.keys(MOMENTOS_ESPECIALES_CATALOG) as (keyof typeof MOMENTOS_ESPECIALES_CATALOG)[]) {
      const labels = MOMENTOS_ESPECIALES_CATALOG[type].map((i) => i.label)
      expect(labels).not.toContain('Momento de fotos')
      expect(labels.join(' ')).not.toMatch(/photocall|fotógrafo|sesión de fotos/i)
    }
  })

  it('"Actividades y juegos" (animación infantil) nunca aparece en el catálogo — eso ya es su propio módulo', () => {
    for (const type of Object.keys(MOMENTOS_ESPECIALES_CATALOG) as (keyof typeof MOMENTOS_ESPECIALES_CATALOG)[]) {
      const labels = MOMENTOS_ESPECIALES_CATALOG[type].map((i) => i.label.toLowerCase())
      expect(labels.some((l) => l.includes('juego') || l.includes('animación'))).toBe(false)
    }
  })

  it('ningún catálogo sugiere contratar música/DJ/fotógrafo — eso son bloques futuros', () => {
    for (const type of Object.keys(MOMENTOS_ESPECIALES_CATALOG) as (keyof typeof MOMENTOS_ESPECIALES_CATALOG)[]) {
      const labels = MOMENTOS_ESPECIALES_CATALOG[type].map((i) => i.label.toLowerCase())
      expect(labels.some((l) => l.includes('dj') || l.includes('música') || l.includes('fotógrafo'))).toBe(false)
    }
  })
})

describe('Estado del bloque — "todavía no lo sabemos" pendiente, "ninguno" resuelto, sin interacción sin empezar', () => {
  it('sin ninguna decisión: sin_empezar', () => {
    expect(momentosEspecialesStatus([])).toBe('sin_empezar')
    expect(summarizeMomentosEspecialesBlock([])).toBe('')
  })

  it('"todavía no lo sabemos": por_decidir, nunca confundido con "sin responder"', () => {
    const decisions = [makeDecision({ answer: { choice: 'todavia_no_lo_sabemos', selected: [], customItems: [] } })]
    expect(momentosEspecialesStatus(decisions)).toBe('por_decidir')
    expect(summarizeMomentosEspecialesBlock(decisions)).toBe('⏳ por decidir')
  })

  it('"ninguno en especial": decidida (resuelto), no "por decidir"', () => {
    const decisions = [makeDecision({ answer: { choice: 'ninguno', selected: [], customItems: [] } })]
    expect(momentosEspecialesStatus(decisions)).toBe('decidida')
    expect(summarizeMomentosEspecialesBlock(decisions)).toBe('✓ decidido')
  })

  it('selección concreta: decidida', () => {
    const decisions = [makeDecision({ answer: { choice: 'seleccionar', selected: ['corte_tarta'], customItems: [] } })]
    expect(momentosEspecialesStatus(decisions)).toBe('decidida')
  })
})

describe('Derivados — muy conservador: seleccionar un momento NUNCA genera nada por sí solo', () => {
  it('seleccionar Primer baile, Proyección o Tarta no genera Preparativo/Presupuesto/Proveedor — eso solo lo decide la propia fase de selección (nunca aquí)', () => {
    // La selección en sí (MomentosEspecialesAnswer) nunca pasa por reconcilePairGeneration/
    // applyPairDecisionGeneration — ver EventosScreen.tsx saveSeleccion, que solo llama upsertEventDecision
    // y, como mucho, reconcilia a NONE el sub-item de clases de baile si se deselecciona. No existe ninguna
    // función "desiredForMomentoEspecial" que genere algo a partir de la propia selección.
    expect(desiredForClasesBaile(undefined)).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
  })

  it('"Primer baile" + clases de baile = "No": no genera nada', () => {
    expect(desiredForClasesBaile({ choice: 'no' })).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
  })

  it('"Primer baile" + clases de baile = "Todavía no lo sabemos": no genera nada (pendiente, no cancelado)', () => {
    expect(desiredForClasesBaile({ choice: 'todavia_no_lo_sabemos' })).toEqual({ taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false })
  })

  it('"Primer baile" + clases de baile = "Sí": genera ÚNICAMENTE el Preparativo "Buscar/organizar clases de baile" — nunca presupuesto ni proveedor', () => {
    const desired = desiredForClasesBaile({ choice: 'si' })
    expect(desired.taskTitle).toBe('Buscar/organizar clases de baile')
    expect(desired.budgetCategory).toBeNull()
    expect(desired.providerCategory).toBeNull()
    expect(desired.resolved).toBe(false)
  })

  it('guardar "Sí" repetidamente no duplica el Preparativo — reconcilePairGeneration ya garantiza como mucho una tarea por decisión', () => {
    const desired = desiredForClasesBaile({ choice: 'si' })
    const existingTask = makeTask()
    const result = reconcilePairGeneration(desired, existingTask, undefined)
    expect(result.actions).toEqual([])
  })

  it('"Sí" → "No": si el Preparativo sigue prístino, se elimina; si fue enriquecido a mano, solo se desvincula (nunca se borra)', () => {
    const desired = desiredForClasesBaile({ choice: 'no' })
    const pristine = makeTask()
    const touched = makeTask({ assignedMemberId: 'm1' })
    expect(isTaskUntouched(pristine)).toBe(true)
    expect(isTaskUntouched(touched)).toBe(false)
    expect(reconcilePairGeneration(desired, pristine, undefined).actions).toEqual([{ op: 'delete_task', id: 't1' }])
    expect(reconcilePairGeneration(desired, touched, undefined).actions).toEqual([{ op: 'detach_task', id: 't1' }])
  })
})

describe('Claves de pregunta — nunca colisionan con event_moments ni con otros bloques', () => {
  it('MOMENTOS_ESPECIALES_QUESTION_KEY y CLASES_BAILE_QUESTION_KEY tienen su propio espacio de nombres', () => {
    expect(MOMENTOS_ESPECIALES_QUESTION_KEY).toBe('momentos_especiales.seleccion')
    expect(CLASES_BAILE_QUESTION_KEY).toBe('momentos_especiales.primer_baile.clases_baile')
    expect(CLASES_BAILE_QUESTION_KEY.startsWith('momentos_especiales.')).toBe(true)
  })
})
