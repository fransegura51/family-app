import { describe, expect, it } from 'vitest'

// Orden de recuperación de requisitos (Partes C2b/C2c/C4, D1-D7/EVT-006, E1-E8/EVT-005 — autorización
// directa del usuario 2026-10-10) — rediseño de Presupuesto y Pagos y fianzas: por partida (no solo
// agregados de TODO el evento), agrupación con subtotales, desglose de conceptos, historial de cambios,
// varios proveedores por encargo, 8 campos + barra de progreso en Pagos, 6 criterios de orden, agrupar
// por categoría/proveedor, diario de abonos fechados, fianzas, documentos.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const DATA = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']
const GROUPS_DATA = (import.meta.glob('/src/data/eventTaskGroups.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventTaskGroups.ts']
const MIGRATION_0236 = (
  import.meta.glob('/supabase/migrations/0236_event_payments_ledger_and_bonds.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
)['/supabase/migrations/0236_event_payments_ledger_and_bonds.sql']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Parte D2/EVT-006 — Presupuesto: agrupar por categoría/encargo/proveedor con subtotales', () => {
  const budgetSection = window_(UI, 'function BudgetSection(', '\nfunction CategoryInputWithSuggestions(')

  it('ofrece los 4 criterios (sin agrupar + los 3 reales)', () => {
    expect(UI).toContain("{ value: 'ninguno', label: 'Sin agrupar' }")
    expect(UI).toContain("{ value: 'categoria', label: 'Por categoría' }")
    expect(UI).toContain("{ value: 'encargo', label: 'Por encargo' }")
    expect(UI).toContain("{ value: 'proveedor', label: 'Por proveedor' }")
  })

  it('agrupar usa groupKeyForBudgetItem (dominio puro), nunca reimplementa el criterio en la UI', () => {
    expect(budgetSection).toContain('groupKeyForBudgetItem(i, groupBy)')
  })

  it('cada grupo muestra su propio subtotal de planned y es plegable de forma independiente', () => {
    expect(budgetSection).toContain('subtotalPlanned.toFixed(2)')
    expect(budgetSection).toContain('setCollapsedGroups((prev) => {')
  })
})

describe('Parte D1 — Comprometido/Pagado calculados POR PARTIDA, no solo agregados del evento', () => {
  it('budgetItemAmounts (dominio puro) calcula los tres por partida a partir de los pagos enlazados', () => {
    const fn = window_(UI, 'function renderRow(i: EventBudgetItem) {', '\n  }')
    expect(fn).toContain('budgetItemAmounts(i, payments)')
  })
  it('la fila muestra Comprometido/Pagado de la partida cuando existen, sin inventar cifras', () => {
    expect(UI).toContain("amounts.committed != null && \`Comprometido ${amounts.committed.toFixed(2)} €\`".replace(/\\`/g, '`'))
  })
})

describe('Parte D (migración 0235) — enlaces proveedor/encargo/categoría y Comprometido manual', () => {
  it('event_budget_items select incluye las 4 columnas nuevas', () => {
    expect(DATA).toContain(
      "const BUDGET_ITEM_SELECT =\n  'id, event_id, family_id, category, planned_amount, sort_order, created_at, decision_id, provider_id, group_id, category_id, committed_amount'",
    )
  })
  it('addEventBudgetItem acepta providerId/groupId opcionales, sin romper las llamadas antiguas (3 argumentos)', () => {
    const fn = window_(DATA, 'export async function addEventBudgetItem(', '\n  if (error) throw error\n}')
    expect(fn).toContain('extra?: { providerId?: string | null; groupId?: string | null; categoryId?: string | null }')
  })
})

describe('Parte D3 — desglose de conceptos dentro de una partida, opcional (EVT-D3)', () => {
  it('BudgetItemConceptsPanel añade/lista/borra conceptos de event_budget_item_concepts', () => {
    const panel = window_(UI, 'function BudgetItemConceptsPanel(', '\n// EVT-D7')
    expect(panel).toContain('listEventBudgetItemConcepts(budgetItemId)')
    expect(panel).toContain('addEventBudgetItemConcept(budgetItemId, name,')
    expect(panel).toContain('deleteEventBudgetItemConcept(c.id)')
  })
  it('nunca sustituye plannedAmount — está plegado dentro de "Proveedor, encargo, desglose e historial"', () => {
    const inline = window_(UI, 'function EditBudgetItemInline(', '\n// EVT-D3')
    expect(inline).toContain('▸ Proveedor, encargo, desglose e historial')
    expect(inline).toContain('<BudgetItemConceptsPanel budgetItemId={item.id} />')
  })
})

describe('Parte D7 — historial de cambios de una partida, append-only, nunca editable', () => {
  it('BudgetItemHistoryPanel es de solo lectura: ninguna llamada a update/delete sobre el historial', () => {
    const panel = window_(UI, 'function BudgetItemHistoryPanel(', '\n// ---------------------------------------------------------------------\n// Proveedores.')
    expect(panel).not.toContain('updateEvent')
    expect(panel).not.toContain('deleteEvent')
    expect(panel).toContain('listEventBudgetItemHistory(budgetItemId)')
  })
  it('updateEventBudgetItem escribe una fila de historial por cada campo que de verdad cambia', () => {
    const fn = window_(DATA, 'export async function updateEventBudgetItem(', '\nexport async function deleteEventBudgetItem')
    expect(fn).toContain("from('event_budget_item_history').insert(")
    expect(fn).toContain('String(e.oldValue ?? \'\') !== String(e.newValue ?? \'\')')
  })
})

describe('Parte E2 — 8 campos visibles sin desplegar + barra de progreso', () => {
  const paymentsSection = window_(UI, 'function PaymentsSection(', '\nfunction PaymentEntriesPanel(')

  it('la cabecera muestra concepto, proveedor, categoría, total, pagado, pendiente, vencimiento y estado', () => {
    expect(paymentsSection).toContain('{p.providerName &&')
    expect(paymentsSection).toContain('{p.category &&')
    expect(paymentsSection).toContain('pagado {p.depositPaid.toFixed(2)} € · pendiente {remaining.toFixed(2)} €')
    expect(paymentsSection).toContain('PAYMENT_STATUS_LABELS[p.status]')
  })
  it('usa paymentProgress (dominio puro) para pintar una barra de progreso real', () => {
    expect(paymentsSection).toContain('const progress = paymentProgress(p)')
    expect(paymentsSection).toContain('width: `${Math.round(progress * 100)}%`')
  })
})

describe('Parte E3 — 6 criterios de ordenación', () => {
  it('expone los 6 criterios y ordena con sortPayments (dominio puro)', () => {
    for (const label of ['Vencimiento', 'Importe', 'Pendiente', 'Proveedor', 'Concepto', 'Estado']) {
      expect(UI).toContain(`label: '${label}'`)
    }
    const paymentsSection = window_(UI, 'function PaymentsSection(', '\nfunction PaymentEntriesPanel(')
    expect(paymentsSection).toContain('const visiblePayments = sortPayments(filtered, sortBy)')
  })
})

describe('Parte E5 — agrupar pagos por categoría o proveedor, con subtotal', () => {
  it('usa groupKeyForPayment (dominio puro) y muestra el subtotal de cada grupo', () => {
    const paymentsSection = window_(UI, 'function PaymentsSection(', '\nfunction PaymentEntriesPanel(')
    expect(paymentsSection).toContain('groupKeyForPayment(p, groupBy)')
    expect(paymentsSection).toContain('subtotal.toFixed(2)')
  })
})

describe('Parte E6/EVT-005 — diario de abonos fechados, fianzas y documentos', () => {
  it('PaymentEntriesPanel añade un abono fechado y lo SUMA a depositPaid (nunca sustituye "Corregir lo pagado")', () => {
    const panel = window_(UI, 'function PaymentEntriesPanel(', '\n// Fianza')
    expect(panel).toContain('addEventPaymentEntry(payment, { amount: value, paidAt: paidAt || null })')
  })
  it('el diario (data layer) incrementa depositPaid al añadir, nunca lo sustituye ni lo deja desincronizado', () => {
    const fn = window_(DATA, 'export async function addEventPaymentEntry(', '\n}')
    expect(fn).toContain('const newDepositPaid = payment.depositPaid + input.amount')
    expect(fn).toContain('updateEventPayment(payment.id, { depositPaid: newDepositPaid,')
  })
  it('el backfill de la migración 0236 nunca inventa fecha (paid_at null) ni toca deposit_paid ya existente', () => {
    expect(MIGRATION_0236).toContain('select id, family_id, deposit_paid, null, ')
    expect(MIGRATION_0236).not.toContain('update event_payments set deposit_paid')
  })
  it('PaymentBondPanel guarda bondAmount y permite marcar devuelta con fecha real (nunca inventada de antemano)', () => {
    const panel = window_(UI, 'function PaymentBondPanel(', '\n// Documento adjunto')
    expect(panel).toContain("updateEventPayment(payment.id, { bondAmount: amount.trim() === '' ? null : Number(amount) })")
    expect(panel).toContain("updateEventPayment(payment.id, { bondReturnedAt: new Date().toISOString().slice(0, 10) })")
  })
  it('PaymentAttachmentPanel sube/ve un documento, mismo patrón que proveedores/ofertas', () => {
    const panel = window_(UI, 'function PaymentAttachmentPanel(', '\nfunction AddPaymentModal(')
    expect(panel).toContain('saveEventPaymentAttachment(payment, file)')
    expect(panel).toContain('getEventPaymentAttachmentUrl(payment.attachmentStoragePath)')
  })
})

describe('Parte C2c — trazabilidad pago↔presupuesto', () => {
  it('AddPaymentModal puede enlazar el pago a una partida de presupuesto existente', () => {
    const modal = window_(UI, 'function AddPaymentModal(', '\n// ---------------------------------------------------------------------\n// Invitaciones')
    expect(modal).toContain('budgetItemId: budgetItemId || null')
    expect(modal).toContain('Partida de presupuesto (opcional)')
  })
  it('la tarjeta de pago abierta muestra la partida enlazada si existe', () => {
    const paymentsSection = window_(UI, 'function PaymentsSection(', '\nfunction PaymentEntriesPanel(')
    expect(paymentsSection).toContain('📁 Partida de presupuesto: {budgetItemLabel(p.budgetItemId)}')
  })
})

describe('Parte C2b (migración 0237) — contratar con varios proveedores en el mismo encargo', () => {
  it('event_task_group_resolutions gana "active"; resolver/sustituir sigue dejando UNA sola activa', () => {
    const fn = window_(GROUPS_DATA, 'export async function resolveEventTaskGroup(', '\n}\n\n// Orden de recuperación')
    expect(fn).toContain("update({ active: false }).eq('group_id', groupId)")
    expect(fn).toContain('active: true,')
  })
  it('addAdditionalEventTaskGroupResolution añade una activa MÁS sin desactivar las demás ni tocar event_task_groups', () => {
    const fn = window_(GROUPS_DATA, 'export async function addAdditionalEventTaskGroupResolution(', '\n}')
    expect(fn).not.toContain("from('event_task_groups')\n    .update")
    expect(fn).not.toContain('active: false')
    expect(fn).toContain('active: true,')
  })
  it('AdditionalProvidersPanel solo se muestra cuando el encargo YA tiene una resolución principal', () => {
    expect(UI).toContain('{item.group.resolvedAt && <AdditionalProvidersPanel group={item.group} />}')
  })
  it('quitar un proveedor adicional desactiva (nunca borra) su resolución', () => {
    const panel = window_(UI, 'function AdditionalProvidersPanel(', '\n// "Marcar encargo como resuelto"')
    expect(panel).toContain('deactivateEventTaskGroupResolution(r.id)')
    expect(panel).not.toContain('.delete()')
  })
})
