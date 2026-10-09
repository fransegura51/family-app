import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro — Fase 6: Parte B2 (servicios estructurados) y Parte B4 (versionado).
// Seleccionar/añadir/editar un servicio es SOLO información para comparar — nunca contrata ni completa
// nada; marcar una oferta como revisión de otra es puramente informativo, nunca oculta la anterior.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const OFFER_ITEMS_PANEL = window_(UI, 'function OfferItemsPanel({', '\nfunction AddOfferItemForm(')
const ADD_OFFER_ITEM_FORM = window_(UI, 'function AddOfferItemForm({', '\nfunction EditOfferItemForm(')
const OFFERS_COMPARISON = window_(UI, 'function OffersComparison(', '\nfunction AddOfferForm(')
const PROVIDER_OFFERS_PANEL = window_(UI, 'function ProviderOffersPanel({', '\nfunction AddLooseOfferForm(')
const ADD_OFFER_FORM = window_(UI, 'function AddOfferForm({', '\nfunction EditOfferForm(')
const ADD_LOOSE_OFFER_FORM = window_(UI, 'function AddLooseOfferForm({', '\nconst RESOLUTION_METHOD_OPTIONS')

describe('OfferItemsPanel — desglose de servicios, nunca toca la oferta ni crea un pago', () => {
  it('carga con listEventTaskGroupOfferItems, nunca con listEventTaskGroupOffers (eso sería otra oferta)', () => {
    expect(OFFER_ITEMS_PANEL).toContain('listEventTaskGroupOfferItems(offer.id)')
  })
  it('marcar/desmarcar una línea llama solo a setEventTaskGroupOfferItemSelected — nunca resuelve ni paga', () => {
    const toggleFn = window_(OFFER_ITEMS_PANEL, 'async function handleToggleSelected(', '\n  }')
    expect(toggleFn).toContain('await setEventTaskGroupOfferItemSelected(item.id, !item.selected)')
    expect(toggleFn).not.toMatch(/resolveEventTaskGroup|addEventPayment/)
  })
  it('el aviso de descuadre solo aparece si hay algún subtotal Y la diferencia es real (no por redondeo de céntimos)', () => {
    expect(OFFER_ITEMS_PANEL).toContain('const amountMismatch = hasAnySubtotal && Math.abs(sumAll - offer.amount) > 0.009')
  })
  it('sin servicios desglosados, deja claro que el importe de arriba es el total tal cual, sin desglose', () => {
    expect(OFFER_ITEMS_PANEL).toContain('el total tal cual, sin desglose')
  })
})

describe('AddOfferItemForm — un paquete indivisible no fuerza cantidad × precio; subtotal manda siempre', () => {
  it('llama a addEventTaskGroupOfferItem con la oferta completa (para que family_id salga de ahí, nunca inventado)', () => {
    expect(ADD_OFFER_ITEM_FORM).toContain('await addEventTaskGroupOfferItem(offer, {')
  })
  it('"📦 Paquete indivisible" oculta cantidad/unidad/precio unitario — solo queda el subtotal', () => {
    expect(ADD_OFFER_ITEM_FORM).toContain("{!isPackage && (")
    expect(ADD_OFFER_ITEM_FORM).toContain('📦 Paquete indivisible')
  })
})

describe('Parte B4 — marcar una oferta como revisión de otra es opcional y nunca oculta la anterior', () => {
  it('AddOfferForm (dentro de un encargo) ofrece el selector solo si ya hay ofertas previas, y por defecto no es una revisión', () => {
    expect(ADD_OFFER_FORM).toContain('existingOffers.length > 0 && (')
    expect(ADD_OFFER_FORM).toContain('<option value="">No, es una oferta nueva</option>')
    expect(ADD_OFFER_FORM).toContain('supersedesOfferId: supersedesOfferId || null,')
  })
  it('AddLooseOfferForm (registro global / proveedores de un evento) ofrece el mismo selector', () => {
    expect(ADD_LOOSE_OFFER_FORM).toContain('existingOffers.length > 0 && (')
    expect(ADD_LOOSE_OFFER_FORM).toContain('supersedesOfferId: supersedesOfferId || null,')
  })
  it('OffersComparison muestra el aviso "🔁 Revisión de otra oferta" sin ocultar ninguna de las dos', () => {
    expect(OFFERS_COMPARISON).toContain('🔁 Revisión de otra oferta')
    expect(OFFERS_COMPARISON).toContain('offers.find((p) => p.id === o.supersedesOfferId)')
  })
  it('ProviderOffersPanel muestra el mismo aviso para ofertas sueltas', () => {
    expect(PROVIDER_OFFERS_PANEL).toContain('🔁 Revisión de otra oferta')
  })
})
