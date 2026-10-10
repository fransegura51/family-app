import { describe, expect, it } from 'vitest'
import { buildFoodContext } from '@/domain/eventFood'
import { decisionStatus, pairQuestionKey, type PairQuestionInfo } from '@/domain/eventPairDecisions'
import { buildEspecialDecisionSummary, buildFamiliaresDecisionSummary, buildFoodDecisionSummary, buildPairDecisionSummary, mergeTipoResolucionPairs } from '@/domain/eventDecisionsSummary'
import { ESPECIAL_HAY_QUESTION_KEY, ESPECIAL_VESTIMENTA_QUESTION_KEY, ESPECIAL_COMPLEMENTOS_QUESTION_KEY, ESPECIAL_REGALOS_QUESTION_KEY } from '@/domain/eventSpecialPeople'
import { makeDecision, makeEvent } from '@/domain/eventFoodFixtures'
import type { EventDecision } from '@/domain/types'

const ctx = (decisions: EventDecision[]) => buildFoodContext(makeEvent(), decisions, [], null)
const texts = (items: { text: string }[]) => items.map((i) => i.text)

describe('resumen de decisiones — tomadas, por decidir, sin responder', () => {
  it('una decisión tomada aparece como frase natural en TOMADAS', () => {
    const s = buildFoodDecisionSummary(ctx([makeDecision('comida.quien', { choice: 'catering' })]))
    expect(texts(s.taken)).toContain('La comida la pone un catering')
  })

  it('«Todavía no lo sabemos» aparece como POR DECIDIR, nunca como tomada', () => {
    const s = buildFoodDecisionSummary(ctx([makeDecision('comida.quien', { choice: 'todavia_no_lo_sabemos' })]))
    expect(texts(s.taken)).not.toContain('La comida la pone un catering')
    expect(s.pending.some((p) => p.key === 'comida.quien')).toBe(true)
  })

  it('CORRECCIÓN: comida.menu_estado = por_decidir NO cuenta como decisión tomada', () => {
    const decision = makeDecision('comida.menu_estado', { choice: 'por_decidir' })
    expect(decisionStatus(decision)).toBe('por_decidir')
    // El menú solo se pregunta cuando la familia lo cocina (o combina): con «nosotros» la pregunta aplica.
    const s = buildFoodDecisionSummary(ctx([makeDecision('comida.quien', { choice: 'nosotros' }), decision]))
    expect(s.taken.some((t) => t.key === 'comida.menu_estado')).toBe(false)
    expect(s.pending.some((p) => p.key === 'comida.menu_estado')).toBe(true)
  })

  it('sin responder no inventa ninguna decisión: aparece como pendiente', () => {
    const s = buildFoodDecisionSummary(ctx([]))
    expect(s.taken.length).toBe(0)
    expect(s.pending.length).toBeGreaterThan(0)
  })

  it('una pregunta que pasa de pendiente a tomada se mueve de POR DECIDIR a TOMADAS', () => {
    const before = buildFoodDecisionSummary(ctx([makeDecision('comida.tarta', { choice: 'todavia_no_lo_sabemos' })]))
    expect(before.pending.some((p) => p.key === 'comida.tarta')).toBe(true)
    const after = buildFoodDecisionSummary(ctx([makeDecision('comida.tarta', { choice: 'encargar' })]))
    expect(after.pending.some((p) => p.key === 'comida.tarta')).toBe(false)
    expect(texts(after.taken)).toContain('Habrá tarta (se encarga)')
  })

  it('eliminar la decisión la devuelve a POR DECIDIR (reconciliación)', () => {
    const removed = buildFoodDecisionSummary(ctx([]))
    expect(removed.taken.some((t) => t.key === 'comida.tarta')).toBe(false)
    expect(removed.pending.some((p) => p.key === 'comida.tarta')).toBe(true)
  })

  it('no duplica: cada pregunta aparece una sola vez, en tomadas o en pendientes', () => {
    const s = buildFoodDecisionSummary(ctx([makeDecision('comida.quien', { choice: 'nosotros' })]))
    const keys = [...s.taken, ...s.pending].map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('usa lenguaje natural: sin claves técnicas en el texto', () => {
    const s = buildFoodDecisionSummary(ctx([makeDecision('comida.quien', { choice: 'no_habra' })]))
    for (const item of [...s.taken, ...s.pending]) {
      expect(item.text).not.toMatch(/comida\.|todavia_no_lo_sabemos|por_decidir|_/)
    }
    expect(texts(s.taken)).toContain('No habrá comida')
  })
})

// Tanda "Resúmenes de decisiones compactos" — sustituye la palabra genérica "Resuelto" por la respuesta
// real, con el mínimo texto posible (petición explícita: "Personas especiales · 2", "Vestimenta · Algunos").
describe('buildEspecialDecisionSummary — statusLabel real en vez del genérico "Resuelto"', () => {
  it('"¿Habrá...?" decidida con gente ya añadida: statusLabel es el NÚMERO real, nunca "Resuelto"', () => {
    const s = buildEspecialDecisionSummary([makeDecision(ESPECIAL_HAY_QUESTION_KEY, { choice: 'si' })], 2)
    const item = s.taken.find((t) => t.key === ESPECIAL_HAY_QUESTION_KEY)
    expect(item).toEqual({ key: ESPECIAL_HAY_QUESTION_KEY, text: 'Personas especiales', statusLabel: '2' })
  })
  it('"Sí" pero todavía sin ninguna persona añadida: statusLabel es "Sí", NUNCA inventa un número (0)', () => {
    const s = buildEspecialDecisionSummary([makeDecision(ESPECIAL_HAY_QUESTION_KEY, { choice: 'si' })], 0)
    const item = s.taken.find((t) => t.key === ESPECIAL_HAY_QUESTION_KEY)
    expect(item?.statusLabel).toBe('Sí')
  })
  it('"No" se resume como statusLabel "No"', () => {
    const s = buildEspecialDecisionSummary([makeDecision(ESPECIAL_HAY_QUESTION_KEY, { choice: 'no' })], 0)
    expect(s.taken.find((t) => t.key === ESPECIAL_HAY_QUESTION_KEY)?.statusLabel).toBe('No')
  })
  it('Vestimenta/Complementos/Regalos decididos muestran el texto corto de la pregunta y Todos/Algunos/Ninguno como statusLabel', () => {
    const base = [makeDecision(ESPECIAL_HAY_QUESTION_KEY, { choice: 'si' })]
    const vestimenta = buildEspecialDecisionSummary([...base, makeDecision(ESPECIAL_VESTIMENTA_QUESTION_KEY, { choice: 'algunos', selectedPersonIds: ['p1'] })], 2)
    expect(vestimenta.taken.find((t) => t.key === ESPECIAL_VESTIMENTA_QUESTION_KEY)).toEqual({ key: ESPECIAL_VESTIMENTA_QUESTION_KEY, text: 'Vestimenta', statusLabel: 'Algunos' })
    const complementos = buildEspecialDecisionSummary([...base, makeDecision(ESPECIAL_COMPLEMENTOS_QUESTION_KEY, { choice: 'ninguno' })], 2)
    expect(complementos.taken.find((t) => t.key === ESPECIAL_COMPLEMENTOS_QUESTION_KEY)?.statusLabel).toBe('Ninguno')
    const regalos = buildEspecialDecisionSummary([...base, makeDecision(ESPECIAL_REGALOS_QUESTION_KEY, { choice: 'todos' })], 2)
    expect(regalos.taken.find((t) => t.key === ESPECIAL_REGALOS_QUESTION_KEY)).toEqual({ key: ESPECIAL_REGALOS_QUESTION_KEY, text: 'Regalos', statusLabel: 'Todos' })
  })
  it('"Todavía no lo sabemos" aparece en PENDIENTES con su propio estado abreviado, distinto de una pregunta nunca respondida', () => {
    const base = [makeDecision(ESPECIAL_HAY_QUESTION_KEY, { choice: 'si' })]
    const s = buildEspecialDecisionSummary([...base, makeDecision(ESPECIAL_COMPLEMENTOS_QUESTION_KEY, { choice: 'todavia_no_lo_sabemos' })], 2)
    const item = s.pending.find((p) => p.key === ESPECIAL_COMPLEMENTOS_QUESTION_KEY)
    expect(item).toEqual({ key: ESPECIAL_COMPLEMENTOS_QUESTION_KEY, text: 'Complementos', statusLabel: 'Todavía no lo sabemos' })
    // Regalos, nunca respondida todavía: pendiente también, pero SIN ese statusLabel abreviado (genérico de siempre).
    const nuncaRespondida = s.pending.find((p) => p.key === ESPECIAL_REGALOS_QUESTION_KEY)
    expect(nuncaRespondida?.statusLabel).toBeUndefined()
  })
  it('elegir "Sí, hay" no selecciona por sí sola el trabajo como completado: sin personas añadidas, Vestimenta/Complementos/Regalos ni siquiera aparecen todavía (revelado progresivo, sin cambios)', () => {
    const s = buildEspecialDecisionSummary([makeDecision(ESPECIAL_HAY_QUESTION_KEY, { choice: 'si' })], 0)
    expect(s.taken.some((t) => t.key === ESPECIAL_VESTIMENTA_QUESTION_KEY)).toBe(false)
    expect(s.pending.some((p) => p.key === ESPECIAL_VESTIMENTA_QUESTION_KEY)).toBe(false)
  })
})

describe('mergeTipoResolucionPairs — La pareja: Vestuario/Peluquería/Detalle especial son dos niveles, se muestran como UNA sola entrada', () => {
  function pq(questionKey: string, status: PairQuestionInfo['status']): PairQuestionInfo {
    return { questionKey, blockKey: 'pareja', label: 'Vestuario de Jennifer', status }
  }

  it('tipo decidido + resolución justo después: se fusionan en una sola fila con el estado de la RESOLUCIÓN', () => {
    const merged = mergeTipoResolucionPairs([pq('pareja.partner1.vestuario', 'decidida'), pq('pareja.partner1.vestuario.resolucion', 'por_decidir')])
    expect(merged).toEqual([pq('pareja.partner1.vestuario.resolucion', 'por_decidir')])
  })

  it('tipo "todavía no lo sabemos" (sin resolución revelada todavía): se queda solo, con su propio estado — nada que fusionar', () => {
    const merged = mergeTipoResolucionPairs([pq('pareja.partner1.vestuario', 'por_decidir')])
    expect(merged).toEqual([pq('pareja.partner1.vestuario', 'por_decidir')])
  })

  it('no fusiona preguntas no relacionadas (p. ej. alianzas seguida de floral) aunque estén adyacentes', () => {
    const alianzas = pq('pareja.alianzas', 'decidida')
    const ramo = pq('pareja.partner1.floral.ramo', 'por_decidir')
    expect(mergeTipoResolucionPairs([alianzas, ramo])).toEqual([alianzas, ramo])
  })

  it('conserva el orden y fusiona varios pares distintos en la misma lista (vestuario y peluquería de la misma persona)', () => {
    const merged = mergeTipoResolucionPairs([
      pq('pareja.partner1.vestuario', 'decidida'),
      pq('pareja.partner1.vestuario.resolucion', 'decidida'),
      pq('pareja.partner1.peluqueria_maquillaje', 'decidida'),
      pq('pareja.partner1.peluqueria_maquillaje.resolucion', 'por_decidir'),
    ])
    expect(merged.map((m) => m.questionKey)).toEqual(['pareja.partner1.vestuario.resolucion', 'pareja.partner1.peluqueria_maquillaje.resolucion'])
  })
})

describe('buildPairDecisionSummary — usa la fusión tipo+resolución, nunca dos filas por la misma pregunta', () => {
  const boda = makeEvent({ type: 'boda', details: { partner1Name: 'Jennifer' } })

  it('vestuario con tipo elegido y resolución pendiente: UNA sola fila en POR DECIDIR (no dos)', () => {
    const decisions = [makeDecision(pairQuestionKey('partner1', 'vestuario'), { choice: 'vestido' })]
    const s = buildPairDecisionSummary(boda, decisions)
    const vestuarioRows = [...s.taken, ...s.pending].filter((i) => i.key.startsWith(pairQuestionKey('partner1', 'vestuario')))
    expect(vestuarioRows.length).toBe(1)
    expect(vestuarioRows[0].key).toBe(pairQuestionKey('partner1', 'vestuario.resolucion'))
  })

  it('vestuario con tipo y resolución ambos decididos: UNA sola fila en TOMADAS', () => {
    const decisions = [
      makeDecision(pairQuestionKey('partner1', 'vestuario'), { choice: 'vestido' }),
      makeDecision(pairQuestionKey('partner1', 'vestuario.resolucion'), { choice: 'elegir_comprar' }),
    ]
    const s = buildPairDecisionSummary(boda, decisions)
    const vestuarioRows = [...s.taken, ...s.pending].filter((i) => i.key.startsWith(pairQuestionKey('partner1', 'vestuario')))
    expect(vestuarioRows.length).toBe(1)
    expect(s.taken.some((t) => t.key === pairQuestionKey('partner1', 'vestuario.resolucion'))).toBe(true)
  })
})

describe('EVT-003 — buildFamiliaresDecisionSummary: statusLabel real (qué necesitan y para cuántos), nunca el genérico "Resuelto"', () => {
  it('necesidades decididas: statusLabel combina las necesidades elegidas y el alcance', () => {
    const decisions = [makeDecision('familiares.necesidades', { selected: ['vestimenta', 'peluqueria'], alcance: 'algunos', selectedPersonIds: ['p1'] })]
    const s = buildFamiliaresDecisionSummary(decisions, 3)
    const item = s.taken.find((t) => t.key === 'familiares.necesidades')
    expect(item?.statusLabel).toBe('Vestimenta especial, Peluquería (Algunos)')
  })

  it('nunca cae en el genérico "Resuelto": statusLabel siempre tiene contenido real cuando hay respuesta', () => {
    const decisions = [makeDecision('familiares.necesidades', { selected: ['maquillaje'], alcance: 'todos', selectedPersonIds: [] })]
    const s = buildFamiliaresDecisionSummary(decisions, 2)
    const item = s.taken.find((t) => t.key === 'familiares.necesidades')
    expect(item?.statusLabel).not.toBe('Resuelto')
    expect(item?.statusLabel).toBe('Maquillaje (Todos)')
  })
})
