import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro — Parte B1 (Fase 5): registrar ofertas desde el registro global de
// proveedores o desde Proveedores de un evento, SIN encargo todavía (ProviderOffersPanel), y poder
// vincular una oferta suelta a un encargo concreto desde "🗂️ Encargos" (OffersComparison) — siempre con
// un clic explícito de la familia, nunca en automático al crearla/seleccionarla/mostrarla.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const PROVIDER_OFFERS_PANEL = window_(UI, 'function ProviderOffersPanel({', '\nfunction AddLooseOfferForm(')
const ADD_LOOSE_OFFER_FORM = window_(UI, 'function AddLooseOfferForm({', '\nconst RESOLUTION_METHOD_OPTIONS')
const PROVIDERS_GLOBAL_SCREEN = window_(UI, 'function ProvidersGlobalScreen(', '\nfunction AddProviderGlobalForm(')
const PROVIDERS_SECTION = window_(UI, 'function ProvidersSection({ eventId }', '\nfunction LinkExistingProviderForm(')
const OFFERS_COMPARISON = window_(UI, 'function OffersComparison(', '\nfunction AddOfferForm(')

describe('ProviderOffersPanel — ofertas sueltas de un proveedor, nunca crea ni completa nada por sí solo', () => {
  it('carga con listLooseOffersForProvider, nunca con listEventTaskGroupOffers (ese es el de un encargo)', () => {
    expect(PROVIDER_OFFERS_PANEL).toContain('listLooseOffersForProvider(globalProviderId, eventId)')
    expect(PROVIDER_OFFERS_PANEL).not.toContain('listEventTaskGroupOffers(')
  })
  it('añadir/editar/borrar reutiliza exactamente las mismas funciones que un encargo (nunca un camino paralelo)', () => {
    expect(PROVIDER_OFFERS_PANEL).toContain('<AddLooseOfferForm')
    expect(PROVIDER_OFFERS_PANEL).toContain('<EditOfferForm')
    expect(PROVIDER_OFFERS_PANEL).toContain('setEventTaskGroupOfferStatus(offer.id,')
    expect(PROVIDER_OFFERS_PANEL).toContain('deleteEventTaskGroupOffer(o)')
  })
  it('una oferta suelta de un evento avisa de que sigue sin encargo, sin forzar a vincularla', () => {
    expect(PROVIDER_OFFERS_PANEL).toContain('Sin encargo todavía')
  })
})

describe('AddLooseOfferForm — registra la oferta sin encargo (group_id queda null en la capa de datos)', () => {
  it('llama a addLooseTaskGroupOffer, nunca a addEventTaskGroupOffer (ese exige un encargo)', () => {
    expect(ADD_LOOSE_OFFER_FORM).toContain('await addLooseTaskGroupOffer({')
    expect(ADD_LOOSE_OFFER_FORM).not.toContain('addEventTaskGroupOffer(')
  })
  it('el proveedor viene fijo del contexto (globalProviderId/providerName) — no hay selector de proveedor que pueda desincronizarlo', () => {
    expect(ADD_LOOSE_OFFER_FORM).toContain('globalProviderId,')
    expect(ADD_LOOSE_OFFER_FORM).toContain('providerName,')
  })
})

describe('ProvidersGlobalScreen — cada proveedor puede tener ofertas sueltas sin ningún evento (eventId null)', () => {
  it('monta ProviderOffersPanel con eventId null', () => {
    expect(PROVIDERS_GLOBAL_SCREEN).toContain('<ProviderOffersPanel\n')
    expect(PROVIDERS_GLOBAL_SCREEN).toContain('eventId={null}')
    expect(PROVIDERS_GLOBAL_SCREEN).toContain('globalProviderId={p.id}')
    expect(PROVIDERS_GLOBAL_SCREEN).toContain('providerName={p.name}')
  })
  it('conecta el historial de ofertas (Parte A2+B5, "usar como referencia") con esta misma tarjeta de proveedor', () => {
    expect(PROVIDERS_GLOBAL_SCREEN).toContain('<ProviderOfferHistoryPanel')
    expect(PROVIDERS_GLOBAL_SCREEN).toContain('reference={referenceEntry?.providerId === p.id ? referenceEntry.entry : null}')
  })
})

describe('ProvidersSection (por evento) — cada proveedor vinculado puede tener ofertas sueltas de ESTE evento', () => {
  it('monta ProviderOffersPanel con el eventId del evento (nunca null aquí)', () => {
    expect(PROVIDERS_SECTION).toContain('<ProviderOffersPanel eventId={eventId} globalProviderId={g.id} providerName={g.name} />')
  })
})

describe('OffersComparison — vincular una oferta suelta a este encargo es un clic explícito, nunca automático', () => {
  it('carga las sueltas del evento con listLooseOffersForEvent, aparte de las ya vinculadas al encargo', () => {
    expect(OFFERS_COMPARISON).toContain('listLooseOffersForEvent(group.eventId)')
  })
  it('"Vincular a este encargo" llama solo a linkLooseTaskGroupOfferToGroup — nunca resuelve el encargo ni crea un pago', () => {
    const linkFn = window_(OFFERS_COMPARISON, 'async function handleLinkLoose(', '\n  }')
    expect(linkFn).toContain('await linkLooseTaskGroupOfferToGroup(offer, group.id)')
    expect(linkFn).not.toMatch(/resolveEventTaskGroup|addEventPayment/)
  })
})
