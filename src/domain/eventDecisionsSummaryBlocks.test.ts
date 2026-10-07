import { describe, expect, it } from 'vitest'
import {
  buildCelebrationDecisionSummary,
  buildPairDecisionSummary,
  buildGuestsDecisionSummary,
  buildMomentosEspecialesDecisionSummary,
} from '@/domain/eventDecisionsSummary'
import { makeDecision, makeEvent } from '@/domain/eventFoodFixtures'
import { pairQuestionKey } from '@/domain/eventPairDecisions'
import { GUESTS_LISTA_QUESTION_KEY, GUESTS_NINOS_QUESTION_KEY, GUESTS_NINOS_NECESIDADES_QUESTION_KEY } from '@/domain/eventGuestDecisions'
import { MOMENTOS_ESPECIALES_QUESTION_KEY, CLASES_BAILE_QUESTION_KEY } from '@/domain/eventSpecialMoments'

// QA 268-273: Resumen de decisiones para Celebración, La pareja, Invitados y Momentos especiales —
// misma forma que Comida y bebida (TOMADAS/POR DECIDIR), siempre derivado de event_decisions.

const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

describe('interfaz: un único componente de resumen reutilizado, nunca una segunda fuente de verdad', () => {
  it('los cinco bloques (Comida, Celebración, Pareja, Invitados, Momentos especiales) usan el mismo <DecisionSummaryDetails>', () => {
    // Fase 1.2: cada bloque le pasa además onSelect={setLocalFocus} — cada entrada del resumen ya es un
    // enlace a su propia pregunta (ver useConfiguratorQuestionFocus.ts) — mismo componente, nunca uno nuevo.
    expect((UI.match(/<DecisionSummaryDetails summary=\{decisionSummary\} onSelect=\{setLocalFocus\} \/>/g) ?? []).length).toBe(5)
  })
  it('cada bloque calcula su propio decisionSummary con su propio builder (no se comparte estado entre bloques)', () => {
    expect(UI).toContain('const decisionSummary = buildFoodDecisionSummary(ctx)')
    expect(UI).toContain('const decisionSummary = buildCelebrationDecisionSummary(facts)')
    expect(UI).toContain('const decisionSummary = buildPairDecisionSummary(event, decisions)')
    expect(UI).toContain('const decisionSummary = buildGuestsDecisionSummary(decisions, momentsCount)')
    expect(UI).toContain('const decisionSummary = buildMomentosEspecialesDecisionSummary(decisions)')
  })
  it('el indicador de menú infantil pendiente reutiliza el propio resumen de Comida (no un segundo cálculo)', () => {
    expect(UI).toContain('const infantilPending = decisionSummary.pending.some((p) => p.key === FOOD_MENU_INFANTIL_KEY)')
  })
})

describe('Celebración — resumen de decisiones', () => {
  it('sin ninguna respuesta: todo lo relevante aparece como pendiente (nunca "no aplica" cuando sí aplica)', () => {
    const event = makeEvent({ type: 'cumpleanos', eventDate: null, dateStatus: 'pendiente', details: {} })
    const facts = { event, decisions: [], hasMomentLocation: false, structuredByMoments: false }
    const s = buildCelebrationDecisionSummary(facts)
    expect(s.pending.some((p) => p.key === 'edad')).toBe(true)
    expect(s.pending.some((p) => p.key === 'fecha')).toBe(true)
    expect(s.pending.some((p) => p.key === 'lugar')).toBe(true)
  })

  it('fecha confirmada: aparece como tomada con la fecha en lenguaje natural', () => {
    const event = makeEvent({ type: 'cumpleanos', eventDate: '2026-12-20', dateStatus: 'confirmada', details: { ageTurning: 7 } })
    const facts = { event, decisions: [], hasMomentLocation: false, structuredByMoments: false }
    const s = buildCelebrationDecisionSummary(facts)
    expect(s.taken.some((t) => t.key === 'fecha' && t.text.includes('20 diciembre 2026'))).toBe(true)
    expect(s.taken.some((t) => t.key === 'edad' && t.text === 'Cumple 7 años')).toBe(true)
    expect(s.pending.some((p) => p.key === 'edad' || p.key === 'fecha')).toBe(false)
  })

  it('fecha provisional: por decidir, no tomada', () => {
    const event = makeEvent({ type: 'cumpleanos', eventDate: '2026-12-20', dateStatus: 'provisional', details: { ageTurning: 7 } })
    const facts = { event, decisions: [], hasMomentLocation: false, structuredByMoments: false }
    const s = buildCelebrationDecisionSummary(facts)
    expect(s.pending.some((p) => p.key === 'fecha')).toBe(true)
    expect(s.taken.some((t) => t.key === 'fecha')).toBe(false)
  })

  it('no aplicable: la pregunta de la edad no aparece ni tomada ni pendiente en una boda', () => {
    const event = makeEvent({ type: 'boda', eventDate: '2026-12-20', dateStatus: 'confirmada' })
    const facts = { event, decisions: [], hasMomentLocation: false, structuredByMoments: false }
    const s = buildCelebrationDecisionSummary(facts)
    expect(s.taken.some((t) => t.key === 'edad')).toBe(false)
    expect(s.pending.some((p) => p.key === 'edad')).toBe(false)
  })

  it('no hay duplicados', () => {
    const event = makeEvent({ type: 'cumpleanos', eventDate: '2026-12-20', dateStatus: 'confirmada', details: { ageTurning: 7 } })
    const facts = { event, decisions: [], hasMomentLocation: false, structuredByMoments: false }
    const s = buildCelebrationDecisionSummary(facts)
    const keys = [...s.taken.map((t) => t.key), ...s.pending.map((p) => p.key)]
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('La pareja — resumen de decisiones', () => {
  const boda = makeEvent({ type: 'boda' })

  it('sin boda: la lista está vacía (no es un bloque aplicable a este tipo de evento)', () => {
    const s = buildPairDecisionSummary(makeEvent({ type: 'cumpleanos' }), [])
    expect(s.taken).toEqual([])
    expect(s.pending).toEqual([])
  })

  it('vestuario sin responder: pendiente', () => {
    const s = buildPairDecisionSummary(boda, [])
    expect(s.pending.some((p) => p.key === pairQuestionKey('partner1', 'vestuario'))).toBe(true)
  })

  it('vestuario respondido «todavía no lo sabemos»: pendiente, no tomada', () => {
    const key = pairQuestionKey('partner1', 'vestuario')
    const s = buildPairDecisionSummary(boda, [makeDecision(key, { choice: 'todavia_no_lo_sabemos' })])
    expect(s.pending.some((p) => p.key === key)).toBe(true)
    expect(s.taken.some((t) => t.key === key)).toBe(false)
  })

  // Tanda "configurador compacto" (Fase 1.2) — "agrupar entradas relacionadas para reducir longitud, por
  // ejemplo «Vestuario» y «Cómo está resuelto», sin perder información": antes esto eran DOS filas (tipo
  // tomada + resolución pendiente); mergeTipoResolucionPairs las funde en UNA sola, con el estado de la
  // resolución (la única de las dos que de verdad cierra la pregunta) — sigue siendo "pendiente", solo que
  // en una única fila en vez de dos.
  it('vestuario con tipo elegido y resolución todavía sin empezar: UNA sola fila, pendiente (nunca dos filas ni "tomada" todavía)', () => {
    const key = pairQuestionKey('partner1', 'vestuario')
    const resolucionKey = pairQuestionKey('partner1', 'vestuario.resolucion')
    const s = buildPairDecisionSummary(boda, [makeDecision(key, { choice: 'comprar' })])
    expect(s.taken.some((t) => t.key === key)).toBe(false)
    expect(s.pending.some((p) => p.key === resolucionKey)).toBe(true)
    expect([...s.taken, ...s.pending].filter((i) => i.key === key || i.key === resolucionKey)).toHaveLength(1)
  })

  it('revertir una decisión (quitar la resolución) actualiza el resumen: la resolución deja de estar tomada', () => {
    const key = pairQuestionKey('partner1', 'vestuario')
    const resolucionKey = pairQuestionKey('partner1', 'vestuario.resolucion')
    const decided = [makeDecision(key, { choice: 'comprar' }), makeDecision(resolucionKey, { choice: 'ya_comprado' })]
    const s1 = buildPairDecisionSummary(boda, decided)
    expect(s1.taken.some((t) => t.key === resolucionKey)).toBe(true)
    const reverted = [makeDecision(key, { choice: 'comprar' })]
    const s2 = buildPairDecisionSummary(boda, reverted)
    expect(s2.pending.some((p) => p.key === resolucionKey)).toBe(true)
    expect(s2.taken.some((t) => t.key === resolucionKey)).toBe(false)
  })

  it('no hay duplicados', () => {
    const s = buildPairDecisionSummary(boda, [])
    const keys = [...s.taken.map((t) => t.key), ...s.pending.map((p) => p.key)]
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('Invitados e invitaciones — resumen de decisiones', () => {
  it('lista de invitados ya preparada: tomada con texto natural', () => {
    const s = buildGuestsDecisionSummary([makeDecision(GUESTS_LISTA_QUESTION_KEY, { choice: 'ya_la_tenemos' })], 0)
    expect(s.taken.some((t) => t.key === GUESTS_LISTA_QUESTION_KEY && t.text === 'Ya tenéis la lista de invitados')).toBe(true)
  })

  it('«¿Vendrán niños?» sin responder: pendiente; las necesidades no aparecen todavía (revelado progresivo)', () => {
    const s = buildGuestsDecisionSummary([], 0)
    expect(s.pending.some((p) => p.key === GUESTS_NINOS_QUESTION_KEY)).toBe(true)
    expect([...s.taken, ...s.pending].some((x) => x.key === GUESTS_NINOS_NECESIDADES_QUESTION_KEY)).toBe(false)
  })

  it('«Sí» a niños revela la pregunta de necesidades, pendiente hasta responder', () => {
    const s = buildGuestsDecisionSummary([makeDecision(GUESTS_NINOS_QUESTION_KEY, { choice: 'si' })], 0)
    expect(s.taken.some((t) => t.key === GUESTS_NINOS_QUESTION_KEY)).toBe(true)
    expect(s.pending.some((p) => p.key === GUESTS_NINOS_NECESIDADES_QUESTION_KEY)).toBe(true)
  })

  it('no hay duplicados', () => {
    const s = buildGuestsDecisionSummary([makeDecision(GUESTS_NINOS_QUESTION_KEY, { choice: 'si' })], 0)
    const keys = [...s.taken.map((t) => t.key), ...s.pending.map((p) => p.key)]
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('Momentos especiales — resumen de decisiones', () => {
  it('sin responder: la selección está pendiente; clases de baile no aparece (no es relevante todavía)', () => {
    const s = buildMomentosEspecialesDecisionSummary([])
    expect(s.pending.some((p) => p.key === MOMENTOS_ESPECIALES_QUESTION_KEY)).toBe(true)
    expect([...s.taken, ...s.pending].some((x) => x.key === CLASES_BAILE_QUESTION_KEY)).toBe(false)
  })

  it('primer baile seleccionado: clases de baile aparece como pendiente hasta responder', () => {
    const s = buildMomentosEspecialesDecisionSummary([makeDecision(MOMENTOS_ESPECIALES_QUESTION_KEY, { choice: 'seleccionar', selected: ['primer_baile'], customItems: [] })])
    expect(s.taken.some((t) => t.key === MOMENTOS_ESPECIALES_QUESTION_KEY)).toBe(true)
    expect(s.pending.some((p) => p.key === CLASES_BAILE_QUESTION_KEY)).toBe(true)
  })

  it('clases de baile = sí: tomada, lenguaje natural, sin mostrar la clave interna', () => {
    const s = buildMomentosEspecialesDecisionSummary([
      makeDecision(MOMENTOS_ESPECIALES_QUESTION_KEY, { choice: 'seleccionar', selected: ['primer_baile'], customItems: [] }),
      makeDecision(CLASES_BAILE_QUESTION_KEY, { choice: 'si' }),
    ])
    const item = s.taken.find((t) => t.key === CLASES_BAILE_QUESTION_KEY)
    expect(item?.text).toBe('Haréis clases de baile')
    expect(item?.text).not.toContain('momentos_especiales')
  })

  it('quitar primer baile de la selección: clases de baile desaparece del resumen (ya no es relevante)', () => {
    const s = buildMomentosEspecialesDecisionSummary([
      makeDecision(MOMENTOS_ESPECIALES_QUESTION_KEY, { choice: 'seleccionar', selected: ['corte_tarta'], customItems: [] }),
      makeDecision(CLASES_BAILE_QUESTION_KEY, { choice: 'si' }),
    ])
    expect([...s.taken, ...s.pending].some((x) => x.key === CLASES_BAILE_QUESTION_KEY)).toBe(false)
  })

  it('no hay duplicados', () => {
    const s = buildMomentosEspecialesDecisionSummary([makeDecision(MOMENTOS_ESPECIALES_QUESTION_KEY, { choice: 'seleccionar', selected: ['primer_baile'], customItems: [] })])
    const keys = [...s.taken.map((t) => t.key), ...s.pending.map((p) => p.key)]
    expect(new Set(keys).size).toBe(keys.length)
  })
})
