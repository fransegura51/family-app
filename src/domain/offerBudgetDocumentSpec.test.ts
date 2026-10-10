import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro — Fase 6, Parte B3: "Importar presupuesto". Mismo patrón de pruebas que
// forecastPaymentDocumentSpec.test.ts — raw-string sobre el propio archivo del servidor (Deno), para no
// tener que ejecutar módulos con especificadores jsr:/npm: en vitest.
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SPEC_SRC = FUNCTIONS['/supabase/functions/_shared/ai/purposes/offerBudgetDocument.ts']
const ENTRYPOINT_SRC = FUNCTIONS['/supabase/functions/analyze-offer-budget-document/index.ts']

describe('offerBudgetDocumentSpec — nunca inventa, nunca calcula, revisión obligatoria', () => {
  it('el propósito se llama analyze-offer-budget-document, con presupuesto de salida generoso para varias líneas', () => {
    expect(SPEC_SRC).toContain("purpose: 'analyze-offer-budget-document'")
    const match = SPEC_SRC.match(/maxOutputTokens:\s*(\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThanOrEqual(2048)
  })
  it('el prompt prohíbe explícitamente inventar datos y calcular/multiplicar/dividir números', () => {
    expect(SPEC_SRC).toContain('NUNCA inventes ni completes ningún dato')
    expect(SPEC_SRC).toContain('NUNCA calcules, multipliques ni dividas tú ningún número')
  })
  it('"amount" es siempre el total impreso, nunca la suma de las líneas calculada por el modelo', () => {
    expect(SPEC_SRC).toContain('nunca la suma de las líneas calculada por ti')
  })
  it('isPackage distingue un paquete sin desglose real de cantidad × precio — en ese caso quantity/unit/unitPrice quedan null', () => {
    expect(SPEC_SRC).toContain('"isPackage": true cuando la línea es un paquete/precio cerrado')
    expect(SPEC_SRC).toContain('en ese caso deja')
  })
  it('readInput exige fileBase64 y mimeType, igual que providerContactDocument', () => {
    expect(SPEC_SRC).toContain("if (typeof fileBase64 !== 'string' || !fileBase64 || typeof mimeType !== 'string' || !mimeType) return { ok: false, error: 'missing file' }")
  })
  it('parseOutput nunca lanza — un documento ilegible se trata como "todo null, sin líneas", nunca un 502', () => {
    expect(SPEC_SRC).toContain('const empty: OfferBudgetDocumentOutput')
    expect(SPEC_SRC).toContain('if (!parsed) return empty')
  })
  it('las líneas sin nombre se descartan — nunca se guarda un servicio sin nombre', () => {
    expect(SPEC_SRC).toContain("filter((it: OfferBudgetDocumentItem) => it.name.trim())")
  })
  // Orden de recuperación de requisitos (Parte A5+B3) — "extracción correcta de... número de presupuesto...
  // y fechas" y "nombre descriptivo de la oferta y del archivo adjunto a partir del número de presupuesto".
  it('extrae "quoteNumber" (número/referencia del presupuesto), nunca lo usa para identificar nada', () => {
    expect(SPEC_SRC).toContain('"quoteNumber"')
    expect(SPEC_SRC).toContain('quoteNumber: asCleanString(parsed.quoteNumber, 80)')
  })
  it('extrae "scopeExcluded" (qué NO incluye), solo cuando el documento lo dice con claridad', () => {
    expect(SPEC_SRC).toContain('"scopeExcluded"')
    expect(SPEC_SRC).toContain('scopeExcluded: asCleanString(parsed.scopeExcluded, 2000)')
  })
})

describe('analyze-offer-budget-document — wrapper mínimo, igual que analyze-provider-contact-document', () => {
  it('delega todo en serveAiPurpose(offerBudgetDocumentSpec), sin lógica propia', () => {
    expect(ENTRYPOINT_SRC).toContain('serveAiPurpose(offerBudgetDocumentSpec)')
  })
})
