import { describe, expect, it } from 'vitest'
import { buildFoodContext } from '@/domain/eventFood'
import { decisionStatus, pairQuestionKey, type PairQuestionInfo } from '@/domain/eventPairDecisions'
import { buildFoodDecisionSummary, buildPairDecisionSummary, mergeTipoResolucionPairs } from '@/domain/eventDecisionsSummary'
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
