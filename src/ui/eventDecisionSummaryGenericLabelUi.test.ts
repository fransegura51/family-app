import { describe, expect, it } from 'vitest'

// EVT-003 — «Resumen de decisiones» (DecisionSummaryDetails, compartido por los 5 bloques del
// configurador) ya no rellena con la palabra genérica "Resuelto" cuando un bloque no calcula su propio
// statusLabel: item.text ya es, en todos los bloques, una frase real ("La fecha está decidida"...),
// así que la coletilla " · Resuelto" se omite en vez de inventarse (ver eventDecisionsSummary.ts).
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const BLOCK = window_(UI, 'function DecisionSummaryDetails(', '\n// «¿Qué incluye el lugar contratado?»')

describe('DecisionSummaryDetails — EVT-003, nunca el genérico "Resuelto" cuando no hay statusLabel real', () => {
  it('ya no existe el fallback literal a \'Resuelto\'', () => {
    expect(BLOCK).not.toContain("?? 'Resuelto'")
  })
  it('la coletilla "· statusLabel" solo se muestra si el bloque calculó un statusLabel real', () => {
    expect(BLOCK).toContain('{statusLabel && <>· {statusLabel} </>}')
  })
  it('las filas "por decidir" conservan su genérico "Pendiente" (fuera del alcance de EVT-003, que solo pide quitar "Resuelto")', () => {
    expect(BLOCK).toContain("?? 'Pendiente'")
  })
})
