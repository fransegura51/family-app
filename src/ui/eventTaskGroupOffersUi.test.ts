import { describe, expect, it } from 'vitest'

// Parte B, Fase 6 — comparar ofertas antes de resolver un encargo (ResolveGroupModal). "Seleccionar" una
// oferta es solo información para comparar — NUNCA crea un pago ni resuelve el encargo por sí sola;
// "Usar esta oferta al resolver" solo rellena el formulario de resolución de siempre, como un atajo
// explícito (un clic más, nunca automático), y la familia sigue teniendo que pulsar "Marcar encargo como
// resuelto" para que pase algo de verdad.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const OFFERS_COMPARISON = window_(UI, 'function OffersComparison(', '\nfunction AddOfferForm(')
const RESOLVE_MODAL = window_(UI, 'function ResolveGroupModal(', '\nfunction NextStepPromptModal(')

describe('OffersComparison — seleccionar una oferta nunca paga ni resuelve nada por su cuenta', () => {
  it('"✓ Seleccionar" llama solo a selectEventTaskGroupOffer, nunca a addEventPayment/resolveEventTaskGroup', () => {
    const selectFn = window_(OFFERS_COMPARISON, 'async function handleSelect(', '\n  }')
    expect(selectFn).toContain('await selectEventTaskGroupOffer(offer.id, group.id)')
    expect(selectFn).not.toContain('addEventPayment')
    expect(selectFn).not.toContain('resolveEventTaskGroup')
  })
  it('"Usar esta oferta al resolver" solo aparece en una oferta ya seleccionada, y llama a onUseOffer (prop del padre) — no resuelve nada aquí dentro', () => {
    expect(OFFERS_COMPARISON).toContain("{o.status === 'seleccionada' && (")
    expect(OFFERS_COMPARISON).toContain('onClick={() => onUseOffer(o)}')
  })
  it('borrar una oferta nunca toca event_payments/event_budget_items/tareas del encargo', () => {
    expect(OFFERS_COMPARISON).toContain('onDelete={() => deleteEventTaskGroupOffer(o).then(reload)}')
  })
})

describe('ResolveGroupModal — "Usar esta oferta al resolver" solo rellena el formulario, nunca lo envía', () => {
  it('onUseOffer rellena método/proveedor/precio pero no llama a handleSubmit ni resuelve nada', () => {
    const onUseOfferProp = window_(RESOLVE_MODAL, 'onUseOffer={(offer) => {', '}}\n          />')
    expect(onUseOfferProp).toContain("setMethod('empresa')")
    expect(onUseOfferProp).toContain('setPrice(String(offer.amount))')
    expect(onUseOfferProp).not.toContain('handleSubmit')
    expect(onUseOfferProp).not.toContain('resolveEventTaskGroup')
  })
  it('si la oferta tiene provider_id (proveedor ya dado de alta), usa ese; si no, precarga el nombre como proveedor nuevo — nunca inventa un id', () => {
    const onUseOfferProp = window_(RESOLVE_MODAL, 'onUseOffer={(offer) => {', '}}\n          />')
    expect(onUseOfferProp).toContain("setProviderMode('existing')")
    expect(onUseOfferProp).toContain('setSelectedProviderId(offer.providerId)')
    expect(onUseOfferProp).toContain("setProviderMode('new')")
    expect(onUseOfferProp).toContain('setNewProviderName(offer.providerName)')
  })
  it('los proveedores se cargan desde el principio del modal (ya no solo al elegir "Empresa/proveedor"), porque OffersComparison los necesita siempre', () => {
    const loadFn = window_(RESOLVE_MODAL, 'useEffect(() => {', '}, [event.id])')
    expect(loadFn).not.toContain("method !== 'empresa'")
  })
})
