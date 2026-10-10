import { describe, expect, it } from 'vitest'

// PEPA — Prompt maestro "Continuidad automática", Bloque B3/B4: formulario de oferta unificado. "Qué
// incluye"/"Servicios" se funden en un único "¿Qué incluye la oferta?" con Texto libre | Desglosado;
// los servicios se pueden añadir ANTES de guardar la oferta (borrador local, igual que ya hacía la
// importación con IA); el mismo formulario (OfferFormFields) sirve para alta Y edición, con Más detalles
// plegado. Migración 0232 añade el nombre opcional de la oferta.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const MIGRATION = (import.meta.glob('/supabase/migrations/0232_event_task_group_offer_name.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/migrations/0232_event_task_group_offer_name.sql']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const OFFER_FORM_FIELDS = window_(UI, 'function OfferFormFields(', '\nfunction OfferCardMenu(')
const ADD_OFFER_FORM = window_(UI, 'function AddOfferForm({', '\nfunction EditOfferForm(')
const EDIT_OFFER_FORM = window_(UI, 'function EditOfferForm({', '\nfunction ProviderOffersPanel(')
const ADD_LOOSE_OFFER_FORM = window_(UI, 'function AddLooseOfferForm({', '\nfunction OfferItemsPanel(')
const OFFERS_COMPARISON = window_(UI, 'function OffersComparison(', '\nfunction AddOfferForm(')
const PROVIDER_OFFERS_PANEL = window_(UI, 'function ProviderOffersPanel({', '\nfunction AddLooseOfferForm(')

describe('Migración 0232 — nombre opcional de la oferta, aditiva, sin tocar ofertas ya existentes', () => {
  it('añade la columna "name", nullable, con límite de longitud', () => {
    expect(MIGRATION).toContain('alter table event_task_group_offers add column name text null')
    expect(MIGRATION).toContain('char_length(name) <= 200')
  })
})

describe('OfferFormFields — un único "¿Qué incluye la oferta?" con Texto libre | Desglosado, nunca dos secciones separadas', () => {
  it('el interruptor tiene exactamente esas 2 opciones', () => {
    expect(OFFER_FORM_FIELDS).toContain('Texto libre')
    expect(OFFER_FORM_FIELDS).toContain('Desglosado')
    expect(OFFER_FORM_FIELDS).toContain("mode === 'texto'")
    expect(OFFER_FORM_FIELDS).toContain("mode === 'desglosado'")
  })
  it('en Desglosado se puede añadir un servicio directamente sobre el borrador local (items), nunca obliga a guardar la oferta antes', () => {
    expect(OFFER_FORM_FIELDS).toContain('no hace falta guardar la oferta antes')
    expect(OFFER_FORM_FIELDS).toContain('setItems((prev) => [...prev, item])')
  })
  it('"Más detalles (opcional)" agrupa los campos secundarios (qué NO incluye, fechas, condiciones, notas, adjunto)', () => {
    const details = window_(OFFER_FORM_FIELDS, '{showMoreDetails && (', '\n    </>')
    expect(details).toContain('Qué NO incluye (opcional)')
    expect(details).toContain('Fecha de la oferta (opcional)')
    expect(details).toContain('Válida hasta (opcional)')
    expect(details).toContain('Condiciones (opcional)')
    expect(details).toContain('Notas (opcional)')
    expect(details).toContain('Adjunto (opcional)')
  })
  it('"Más detalles" empieza plegado salvo que ya hubiera algo relevante rellenado (edición)', () => {
    expect(OFFER_FORM_FIELDS).toContain(
      'Boolean(scopeExcluded || discountAmount || taxAmount || offerDate || validUntil || conditions || notes || hasExistingAttachment)',
    )
  })
  it('el aviso de descuadre compara la suma de servicios con el importe TOTAL, sin recalcularlo nunca', () => {
    expect(OFFER_FORM_FIELDS).toContain('El importe total no coincide')
    expect(OFFER_FORM_FIELDS).not.toMatch(/setAmount\(.*sumItems/)
  })
})

describe('AddOfferForm / AddLooseOfferForm — usan OfferFormFields, nunca repiten los campos a mano (Bloque C, no duplicar)', () => {
  it('AddOfferForm renderiza OfferFormFields y empieza en modo texto', () => {
    expect(ADD_OFFER_FORM).toContain('<OfferFormFields')
    expect(ADD_OFFER_FORM).toContain("useState<'texto' | 'desglosado'>('texto')")
  })
  it('AddLooseOfferForm también usa OfferFormFields', () => {
    expect(ADD_LOOSE_OFFER_FORM).toContain('<OfferFormFields')
  })
  it('el nombre de la oferta se guarda al crear, en los dos sitios', () => {
    expect(ADD_OFFER_FORM).toContain('name: name.trim() || null,')
    expect(ADD_LOOSE_OFFER_FORM).toContain('name: name.trim() || null,')
  })
  it('en modo texto, scopeIncluded se guarda; en Desglosado, se manda null (el desglose vive en los servicios, nunca los dos a la vez)', () => {
    expect(ADD_OFFER_FORM).toContain("scopeIncluded: mode === 'texto' ? scopeIncluded.trim() || null : null,")
  })
})

describe('EditOfferForm — EL MISMO formulario que alta, con los servicios ya guardados cargados como borrador', () => {
  it('usa OfferFormFields, igual que AddOfferForm/AddLooseOfferForm', () => {
    expect(EDIT_OFFER_FORM).toContain('<OfferFormFields')
  })
  it('carga los servicios existentes con listEventTaskGroupOfferItems y pasa sola a Desglosado si ya había alguno', () => {
    const loadFn = window_(EDIT_OFFER_FORM, 'useEffect(() => {', '\n  }, [offer.id])')
    expect(loadFn).toContain('listEventTaskGroupOfferItems(offer.id)')
    expect(loadFn).toContain("if (existing.length > 0) setMode('desglosado')")
  })
  it('también ofrece "Importar presupuesto" (petición real: la misma interfaz para alta Y edición)', () => {
    expect(EDIT_OFFER_FORM).toContain('function applyImported(')
  })
  it('guarda el nombre de la oferta al editar', () => {
    expect(EDIT_OFFER_FORM).toContain('name: name.trim() || null,')
  })
})

describe('Cambiar de modo nunca borra información en silencio (petición real explícita)', () => {
  const saveFn = window_(EDIT_OFFER_FORM, 'async function save(', '\n  }')

  it('los servicios SOLO se sincronizan (añadir/actualizar/borrar) si se guarda estando en modo Desglosado', () => {
    expect(saveFn).toContain("if (mode === 'desglosado') {")
  })
  it('en modo Texto libre, guardar NO borra ni toca los servicios ya existentes — se quedan tal cual en la base de datos', () => {
    const outsideDesglosado = saveFn.slice(0, saveFn.indexOf("if (mode === 'desglosado') {"))
    expect(outsideDesglosado).not.toContain('deleteEventTaskGroupOfferItem')
  })
  it('un servicio quitado del borrador SÍ se borra de verdad al guardar en Desglosado (acción explícita del usuario, el botón ✕, no el cambio de modo)', () => {
    expect(saveFn).toContain('await deleteEventTaskGroupOfferItem(removedId)')
  })
  it('un servicio ya existente se actualiza (no se duplica); uno nuevo (sin id) se crea', () => {
    expect(saveFn).toContain('if (item.id) await updateEventTaskGroupOfferItem(item.id, item)')
    expect(saveFn).toContain('else await addEventTaskGroupOfferItem(offer, item)')
  })
})

describe('El nombre de la oferta (cuando se puso) se ve en las dos listas de tarjetas — si no, no sirve para distinguir varias del mismo proveedor', () => {
  it('OffersComparison (dentro de un encargo) muestra o.name junto al proveedor', () => {
    expect(OFFERS_COMPARISON).toContain('{o.name ? ` · ${o.name}` : \'\'}')
  })
  it('ProviderOffersPanel (ofertas sueltas de un proveedor) muestra o.name junto al importe', () => {
    expect(PROVIDER_OFFERS_PANEL).toContain('{o.name ? `${o.name} · ` : \'\'}')
  })
})

describe('resolveEventTaskGroup / contratar un encargo sigue sin completar tareas (Bloque C, regla 8) — nada de B3/B4 lo toca', () => {
  it('ni OfferFormFields ni los 3 formularios de oferta llaman a resolveEventTaskGroup ni a completar tareas', () => {
    expect(OFFER_FORM_FIELDS).not.toContain('resolveEventTaskGroup')
    expect(ADD_OFFER_FORM).not.toContain('resolveEventTaskGroup')
    expect(EDIT_OFFER_FORM).not.toContain('resolveEventTaskGroup')
  })
})
