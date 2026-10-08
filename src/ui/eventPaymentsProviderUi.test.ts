import { describe, expect, it } from 'vitest'

// Bug real reportado (Parte B, Pagos y fianzas): las tarjetas de pago mostraban el concepto ("Flores")
// pero nunca el proveedor. Causa real: event_payments nunca guardaba el nombre del proveedor (solo
// provider_id). Fix (migración 0221 event_payments_provider_name): snapshot provider_name que se muestra
// siempre en gris secundario bajo el concepto cuando existe.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const PAYMENTS_SECTION = window_(UI, 'function PaymentsSection(', '\nfunction AddPaymentModal(')
const ADD_PAYMENT_MODAL = window_(UI, 'function AddPaymentModal(', '\n// ---------------------------------------------------------------------\n// Invitaciones')
const RESOLVE_MODAL = window_(UI, 'function ResolveGroupModal(', '\nfunction NextStepPromptModal(')

describe('PaymentsSection — el proveedor se ve siempre en gris secundario bajo el concepto', () => {
  it('cada tarjeta de pago muestra p.providerName cuando existe, nunca lo oculta', () => {
    expect(PAYMENTS_SECTION).toContain('{p.providerName && <div className="muted" style={{ fontSize: 12 }}>{p.providerName}</div>}')
  })
})

describe('ResolveGroupModal — el pago de un encargo resuelto con proveedor guarda su nombre, no solo el id', () => {
  it('addEventPayment recibe providerName además de providerId, para que sobreviva si el proveedor se edita/borra luego', () => {
    expect(RESOLVE_MODAL).toContain('addEventPayment(event.id, { concept: group.name, totalAmount: amount, depositPaid: 0, providerId, providerName })')
  })
})

describe('AddPaymentModal — "+ Añadir pago" manual también puede enlazar un proveedor existente', () => {
  it('carga los proveedores del evento y ofrece un selector opcional, nunca obligatorio', () => {
    expect(ADD_PAYMENT_MODAL).toContain('listEventProviders(eventId).then(setProviders)')
    expect(ADD_PAYMENT_MODAL).toContain('{providers.length > 0 && (')
    expect(ADD_PAYMENT_MODAL).toContain('<option value="">Sin proveedor</option>')
  })
  it('al enviar, pasa providerId/providerName del proveedor elegido (o null si no se elige ninguno) — nunca inventa un nombre', () => {
    const submitFn = window_(ADD_PAYMENT_MODAL, 'async function handleSubmit(', '\n  }')
    expect(submitFn).toContain('providers.find((p) => p.id === providerId)')
    expect(submitFn).toContain('providerId: provider?.id ?? null')
    expect(submitFn).toContain('providerName: provider?.name ?? null')
  })
})
