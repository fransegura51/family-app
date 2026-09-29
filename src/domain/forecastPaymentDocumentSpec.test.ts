import { describe, expect, it } from 'vitest'

// BUG REAL — documento BBVA real (PDF de 58 páginas, préstamo de 85 cuotas): con maxOutputTokens=768,
// Gemini cortaba su respuesta JSON a mitad de camino en cuanto un documento tenía muchas cuotas
// (installmentAmounts + installmentDueDates son un array por cuota) — el JSON quedaba inválido y se
// descartaba ENTERO, dando la falsa impresión de que el documento "no tenía nada útil" cuando en realidad
// se había leído perfectamente (confirmado con los logs reales del servidor: 920 caracteres, sin cerrar
// llaves). El límite real del modelo (gemini-flash-lite) es 65.536 — esta prueba fija que el presupuesto
// de salida se queda generosamente por debajo de ese límite pero muy por encima de lo que necesitó el
// documento SUMA (6 cuotas) o el propio documento BBVA (85 cuotas), para que no se vuelva a recortar sin
// darse cuenta con un documento futuro de muchas cuotas (una hipoteca a 30-40 años, por ejemplo).
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = FUNCTIONS['/supabase/functions/_shared/ai/purposes/forecastPaymentDocument.ts']

function extractMaxOutputTokens(src: string): number {
  const match = src.match(/maxOutputTokens:\s*(\d+)/)
  expect(match, 'no se encontró "maxOutputTokens: <número>" en forecastPaymentDocument.ts').not.toBeNull()
  return Number(match![1])
}

describe('forecastPaymentDocumentSpec — presupuesto de salida suficiente para documentos con muchas cuotas', () => {
  it('maxOutputTokens es generoso (≥ 8000) — 768 era suficiente para 6 cuotas (SUMA) pero no para 85 (BBVA real)', () => {
    expect(extractMaxOutputTokens(SRC)).toBeGreaterThanOrEqual(8000)
  })

  it('maxOutputTokens se queda claramente por debajo del límite real del modelo (65.536) — nunca se pide más de lo que Gemini puede dar', () => {
    expect(extractMaxOutputTokens(SRC)).toBeLessThan(65536)
  })
})
