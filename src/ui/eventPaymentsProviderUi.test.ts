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

// Fase 9 (Parte E, prompt maestro) — tarjetas compactas plegables: el proveedor se mueve a la propia
// línea de cabecera (siempre visible, plegada o no), en vez de una línea aparte dentro del detalle.
describe('PaymentsSection — el proveedor se ve siempre junto al concepto, nunca lo oculta', () => {
  it('cada tarjeta de pago muestra p.providerName cuando existe, en la línea de cabecera (visible aunque esté plegada)', () => {
    expect(PAYMENTS_SECTION).toContain("{p.providerName && <span className=\"muted\" style={{ fontSize: 12 }}> · {p.providerName}</span>}")
  })
})

describe('ResolveGroupModal — el pago de un encargo resuelto con proveedor guarda su nombre, no solo el id', () => {
  it('addEventPayment recibe providerName además de providerId, para que sobreviva si el proveedor se edita/borra luego', () => {
    expect(RESOLVE_MODAL).toContain('addEventPayment(event.id, { concept: group.name, totalAmount: amount, depositPaid: 0, providerId, providerName })')
  })
})

describe('AddPaymentModal — "+ Añadir pago" manual también puede enlazar un proveedor existente', () => {
  it('PaymentsSection carga los proveedores del evento (filtrados, no archivados) y se los pasa como prop; ofrece un selector opcional, nunca obligatorio', () => {
    expect(PAYMENTS_SECTION).toContain('listEventProviders(eventId).then((all) => setProviders(all.filter((p) => !p.archived)))')
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

// Bug real reportado (Parte B, Fase 2): "Marcar como pagado del todo" se podía tocar sin querer, sin
// confirmación, y sin forma de corregirlo después sin borrar el pago entero.
describe('PaymentsSection — "Marcar como pagado del todo" pide confirmación con el importe exacto', () => {
  it('usa ConfirmButton (dos toques) en vez de un botón directo', () => {
    expect(PAYMENTS_SECTION).toContain('<ConfirmButton')
    expect(PAYMENTS_SECTION).toContain('label="Marcar como pagado del todo"')
  })
  it('el mensaje de confirmación muestra el importe exacto que queda pendiente y el total', () => {
    expect(PAYMENTS_SECTION).toContain('confirmMessage={`¿Marcar los ${remaining.toFixed(2)} € que quedan como pagados (total ${p.totalAmount.toFixed(2)} €)?`}')
  })
})

describe('PaymentsSection — el importe pagado se puede corregir siempre, no solo mientras queda pendiente', () => {
  it('"✏️ Corregir lo pagado" no depende de remaining > 0 — está disponible también con el pago ya completo', () => {
    const editorBlock = window_(PAYMENTS_SECTION, 'editingId === p.id ? (', '{remaining > 0 && (')
    expect(editorBlock).toContain('✏️ Corregir lo pagado')
    expect(editorBlock).not.toContain('remaining > 0 &&')
  })
  it('guardar recalcula el estado (pendiente/parcial/pagado) a partir del nuevo importe, nunca lo deja desincronizado', () => {
    const saveFn = window_(PAYMENTS_SECTION, 'async function saveEditingDeposit(', '\n  }')
    expect(saveFn).toContain('updateEventPayment(p.id, { depositPaid, status: paymentStatusForAmounts(p.totalAmount, depositPaid) })')
  })
})
