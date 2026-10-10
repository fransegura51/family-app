import { describe, expect, it } from 'vitest'

// PEPA Eventos — orden de recuperación de requisitos (Parte B2+B3, prompt maestro consolidado de
// Eventos): "contemplar descuentos por conjunto, impuestos" y "extracción correcta de... descuentos,
// impuestos". Informativos sobre la oferta — nunca calculados ni combinados con el importe total en
// automático, igual que la suma de servicios ya existente (amountMismatch).
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const PURPOSE = (import.meta.glob('/supabase/functions/_shared/ai/purposes/offerBudgetDocument.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/functions/_shared/ai/purposes/offerBudgetDocument.ts'
]
const MIGRATION = (import.meta.glob('/supabase/migrations/0234_event_task_group_offer_discount_tax.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0234_event_task_group_offer_discount_tax.sql'
]

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const OFFER_FORM_FIELDS = window_(UI, 'function OfferFormFields(', '\nfunction OfferCardMenu(')
const ADD_OFFER_FORM = window_(UI, 'function AddOfferForm({', '\nfunction EditOfferForm(')
const EDIT_OFFER_FORM = window_(UI, 'function EditOfferForm({', '\nfunction AddLooseOfferForm(')
const ADD_LOOSE_OFFER_FORM = window_(UI, 'function AddLooseOfferForm({', '\nfunction OfferItemsPanel(')

describe('Migración 0234 — aditiva, importes informativos nunca negativos', () => {
  it('dos columnas nuevas en event_task_group_offers, nunca toca nada existente', () => {
    expect(MIGRATION).toContain('alter table event_task_group_offers add column discount_amount numeric(10, 2) null')
    expect(MIGRATION).toContain('alter table event_task_group_offers add column tax_amount numeric(10, 2) null')
  })
})

describe('Extracción con IA — descuento e impuestos SOLO si aparecen impresos como cantidad, nunca calculados', () => {
  it('el prompt prohíbe calcular un porcentaje a partir de dos totales', () => {
    expect(PURPOSE).toContain('"discountAmount": el importe del descuento')
    expect(PURPOSE).toContain('nunca calcules tú un porcentaje')
    expect(PURPOSE).toContain('"taxAmount": el importe de impuestos')
  })
})

describe('OfferFormFields — Descuento/Impuestos viven dentro de "Más detalles", nunca tocan el importe total', () => {
  it('los dos campos están dentro del bloque showMoreDetails', () => {
    const details = window_(OFFER_FORM_FIELDS, '{showMoreDetails && (', '\n    </>')
    expect(details).toContain('Descuento (€, opcional)')
    expect(details).toContain('Impuestos (€, opcional)')
  })
  it('"Más detalles" se abre solo si ya había descuento/impuestos (edición), igual que el resto de campos secundarios', () => {
    expect(OFFER_FORM_FIELDS).toContain('discountAmount || taxAmount')
  })
})

for (const [label, FORM] of [
  ['AddOfferForm', ADD_OFFER_FORM],
  ['EditOfferForm', EDIT_OFFER_FORM],
  ['AddLooseOfferForm', ADD_LOOSE_OFFER_FORM],
] as const) {
  describe(`${label} — guarda y propone descuento/impuestos sin tocar el importe total`, () => {
    it('el envío convierte el texto a número o null, nunca a 0 por defecto', () => {
      expect(FORM).toContain("discountAmount: discountAmount.trim() ? Number(discountAmount) : null,")
      expect(FORM).toContain("taxAmount: taxAmount.trim() ? Number(taxAmount) : null,")
    })
    it('"Importar presupuesto" solo rellena estos campos si estaban vacíos', () => {
      expect(FORM).toContain('if (!discountAmount && result.discountAmount !== null) setDiscountAmount(String(result.discountAmount))')
      expect(FORM).toContain('if (!taxAmount && result.taxAmount !== null) setTaxAmount(String(result.taxAmount))')
    })
  })
}

describe('Tarjetas de oferta — descuento/impuestos visibles al comparar (Parte B4: "comparación de precios... impuestos y condiciones")', () => {
  it('se muestran en las dos listas de ofertas (OffersComparison y ProviderOffersPanel)', () => {
    const matches = UI.match(/\{o\.discountAmount !== null && <>Descuento: \{o\.discountAmount\.toFixed\(2\)\} €<\/>\}/g) ?? []
    expect(matches.length).toBe(2)
  })
})
