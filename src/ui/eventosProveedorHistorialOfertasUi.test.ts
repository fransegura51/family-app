import { describe, expect, it } from 'vitest'

// PEPA Eventos — orden de recuperación de requisitos, Fase 1 (Partes A2+B5 del prompt maestro
// consolidado): "consultar precios históricos" / "las ofertas de eventos anteriores estarán disponibles
// en el registro global, mostrando siempre evento original, fecha, proveedor, servicios y precio
// histórico... no trasladar automáticamente... permitir usarla como referencia".
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const DATA = (import.meta.glob('/src/data/eventTaskGroups.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventTaskGroups.ts']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const HISTORY_FN = window_(DATA, 'export async function listOfferHistoryForProvider(', '\n// ---')
const HISTORY_PANEL = window_(UI, 'function ProviderOfferHistoryPanel(', '\nfunction AddLooseOfferForm(')
const PROVIDERS_GLOBAL_SCREEN = window_(UI, 'function ProvidersGlobalScreen(', '\nfunction AddProviderGlobalForm(')
const ADD_LOOSE_OFFER_FORM = window_(UI, 'function AddLooseOfferForm({', '\nfunction OfferItemsPanel(')

describe('listOfferHistoryForProvider — TODAS las ofertas del proveedor, de cualquier evento/encargo, nunca solo las sueltas', () => {
  it('no filtra por group_id ni por event_id (a diferencia de listLooseOffersForProvider)', () => {
    expect(HISTORY_FN).not.toContain(".is('group_id'")
    expect(HISTORY_FN).not.toContain(".is('event_id'")
    expect(HISTORY_FN).toContain(".eq('global_provider_id', globalProviderId)")
  })
  it('trae el título del evento vía join, sin tabla ni columna nueva', () => {
    expect(HISTORY_FN).toContain('events(title)')
  })
})

describe('ProviderOfferHistoryPanel — solo consulta, nunca vincula ni traslada una oferta antigua sola', () => {
  it('muestra el contador y el evento original de cada oferta (o "Sin evento")', () => {
    expect(HISTORY_PANEL).toContain('📜 Historial de ofertas')
    expect(HISTORY_PANEL).toContain("e.eventTitle ?? 'Sin evento'")
  })
  it('el aviso deja claro que nunca se traslada ni se da por vigente sola', () => {
    expect(HISTORY_PANEL).toContain('nunca se traslada sola a un evento nuevo ni se da por vigente')
  })
  it('"Usar como referencia" delega en el callback del padre — no crea nada por sí mismo', () => {
    expect(HISTORY_PANEL).toContain('onClick={() => onUseAsReference(e)}')
    expect(HISTORY_PANEL).not.toMatch(/addLooseTaskGroupOffer|addEventTaskGroupOffer/)
  })
})

describe('ProvidersGlobalScreen — conecta el historial con el alta de oferta sin duplicar el formulario', () => {
  it('guarda qué proveedor/oferta se está usando de referencia (una sola a la vez)', () => {
    expect(PROVIDERS_GLOBAL_SCREEN).toContain('referenceEntry')
  })
  it('pasa el historial y el alta de ofertas para el MISMO proveedor de la tarjeta', () => {
    expect(PROVIDERS_GLOBAL_SCREEN).toContain('<ProviderOfferHistoryPanel')
    expect(PROVIDERS_GLOBAL_SCREEN).toContain('onUseAsReference={(entry) => setReferenceEntry({ providerId: p.id, entry })}')
    expect(PROVIDERS_GLOBAL_SCREEN).toContain('reference={referenceEntry?.providerId === p.id ? referenceEntry.entry : null}')
  })
})

describe('AddLooseOfferForm — el prerrelleno de "usar como referencia" nunca marca supersedesOfferId solo', () => {
  it('siembra name/amount/scopeIncluded desde "initial" cuando lo hay', () => {
    expect(ADD_LOOSE_OFFER_FORM).toContain('useState(initial?.name ?? ')
    expect(ADD_LOOSE_OFFER_FORM).toContain('useState(initial ? String(initial.amount) : ')
    expect(ADD_LOOSE_OFFER_FORM).toContain('useState(initial?.scopeIncluded ?? ')
  })
})
