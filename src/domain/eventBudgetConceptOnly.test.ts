import { describe, expect, it } from 'vitest'
import { generateEventPlan } from './events'

// Cola nocturna, Bloque 11 — Presupuesto general de Eventos: "Organízamelo Pepa" proponía un importe
// concreto inventado por cada concepto (p. ej. "Tarta: 40 €", "Celebración (boda): 3000 €"), algo que
// PEPA no puede saber de verdad de una familia concreta. generateEventPlan ya no lleva ningún importe:
// solo el nombre del concepto, para que la familia ponga su propia cifra real (o ninguna, de momento).
describe('generateEventPlan.budgetItems — PEPA propone CONCEPTOS, nunca un importe inventado', () => {
  it('ningún budgetItem propuesto lleva plannedAmount (ni ninguna otra clave de importe)', () => {
    const plan = generateEventPlan({ type: 'boda', enabledModules: [] })
    expect(plan.budgetItems.length).toBeGreaterThan(0)
    for (const item of plan.budgetItems) {
      expect(Object.keys(item)).toEqual(['category'])
    }
  })

  it('sigue proponiendo los mismos conceptos de siempre por tipo de evento (cumpleaños, comunión, bautizo, celebración, boda, personalizado)', () => {
    expect(generateEventPlan({ type: 'cumpleanos', enabledModules: [] }).budgetItems.map((b) => b.category)).toContain('Tarta')
    expect(generateEventPlan({ type: 'boda', enabledModules: [] }).budgetItems.map((b) => b.category)).toContain('Celebración')
    expect(generateEventPlan({ type: 'personalizado', enabledModules: [] }).budgetItems.map((b) => b.category)).toEqual(['General'])
  })
})
