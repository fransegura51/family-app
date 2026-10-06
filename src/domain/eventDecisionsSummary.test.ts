import { describe, expect, it } from 'vitest'
import { buildFoodContext } from '@/domain/eventFood'
import { decisionStatus } from '@/domain/eventPairDecisions'
import { buildFoodDecisionSummary } from '@/domain/eventDecisionsSummary'
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
