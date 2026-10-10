import { describe, expect, it } from 'vitest'

// Punto 1.4 (prompt de correcciones) — "distinguir correctamente teléfono, WhatsApp (cuando esté
// expresamente identificado), correo y otros datos" + "no inventes que un número tiene WhatsApp si el
// documento no lo indica". Mismo patrón de pruebas que offerBudgetDocumentSpec.test.ts — raw-string sobre
// el propio archivo del servidor (Deno), para no ejecutar módulos con especificadores jsr:/npm: en vitest.
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SPEC_SRC = FUNCTIONS['/supabase/functions/_shared/ai/purposes/providerContactDocument.ts']

describe('providerContactDocumentSpec — whatsapp distinto de phone, nunca inferido', () => {
  it('el tipo de salida tiene whatsapp aparte de phone', () => {
    expect(SPEC_SRC).toContain('phone: string | null')
    expect(SPEC_SRC).toContain('whatsapp: string | null')
  })
  it('el prompt exige una marca EXPLÍCITA de WhatsApp (icono o la palabra) — nunca copiar un teléfono normal', () => {
    expect(SPEC_SRC).toContain('"whatsapp": un número de WhatsApp, SOLO si el documento lo indica EXPRESAMENTE')
    expect(SPEC_SRC).toContain('Nunca copies aquí un teléfono normal')
  })
  it('el JSON de ejemplo en el prompt incluye "whatsapp" como campo propio', () => {
    expect(SPEC_SRC).toContain('"whatsapp": "texto o null"')
  })
  it('parseOutput mapea whatsapp igual que el resto de campos de texto, con límite de longitud razonable', () => {
    expect(SPEC_SRC).toContain('whatsapp: asCleanString(parsed.whatsapp, 60)')
  })
  it('el valor "vacío" (documento ilegible) también deja whatsapp en null, nunca inventado', () => {
    expect(SPEC_SRC).toContain('{ name: null, type: null, contactPerson: null, phone: null, whatsapp: null, email: null, website: null, address: null }')
  })
})
