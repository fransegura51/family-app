import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro Parte A3 — dentro de un evento se ve EXCLUSIVAMENTE lo vinculado a él
// (registro global, Fase 2): proveedores con los que ESTE evento tiene relación, filtrados por
// interés/descartado — "descartar" o "desvincular" aquí nunca borran nada del registro global ni afectan
// a otros eventos ("un proveedor descartado para una boda puede volver a ser útil para un cumpleaños").
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const PROVIDERS_SECTION = window_(UI, 'function ProvidersSection({ eventId }', '\nfunction LinkExistingProviderForm(')

describe('ProvidersSection — filtros De interés / Todos / Descartados (A3)', () => {
  it('por defecto solo "de interés"; "todos" no filtra; "descartados" cuenta cuántos hay', () => {
    expect(PROVIDERS_SECTION).toContain("useState<EventProviderLinkStatus | 'todos'>('interesado')")
    expect(PROVIDERS_SECTION).toContain("filter === 'todos' ? true : l.status === filter")
  })
  it('ningún filtro borra ni oculta el proveedor del registro global — solo cambia qué vínculos se ven en ESTE evento', () => {
    expect(PROVIDERS_SECTION).not.toContain('deleteProviderGlobal')
    expect(PROVIDERS_SECTION).not.toContain("from('providers_global').delete")
  })
})

describe('ProvidersSection — descartar/recuperar nunca borra el vínculo; desvincular sí lo quita pero nunca toca el registro global', () => {
  it('handleToggleDiscard usa setEventProviderLinkStatus (update), nunca borra la fila', () => {
    const fn = window_(PROVIDERS_SECTION, 'async function handleToggleDiscard(', '\n  }')
    expect(fn).toContain('setEventProviderLinkStatus(link.id,')
    expect(fn).not.toContain('unlinkProviderFromEvent')
  })
  it('"Desvincular" pide confirmación (ConfirmButton) y deja claro que el proveedor sigue en el registro familiar', () => {
    expect(PROVIDERS_SECTION).toContain('label="Desvincular"')
    expect(PROVIDERS_SECTION).toContain('Sigue disponible en el registro familiar')
    expect(PROVIDERS_SECTION).toContain('onConfirm={() => unlinkProviderFromEvent(link.id).then(reload)}')
  })
})

describe('ProvidersSection — vincular desde el registro global y crear nuevo (A3), nunca un proveedor "suelto" sin pasar por el registro', () => {
  it('"+ Vincular proveedor existente" solo ofrece proveedores de la familia que todavía NO están vinculados a este evento', () => {
    expect(PROVIDERS_SECTION).toContain('availableToLink')
    expect(PROVIDERS_SECTION).toContain('!g.archived && !linkedGlobalIds.has(g.id)')
  })
  it('vincular usa linkProviderGlobalToEvent (crea también la ficha event_providers utilizable en Pagos/Resolver encargo)', () => {
    const fn = window_(PROVIDERS_SECTION, 'async function handleLink(', '\n  }')
    expect(fn).toContain('await linkProviderGlobalToEvent(eventId, global)')
  })
  it('"+ Nuevo proveedor" (AddProviderAndLinkForm) crea en el registro GLOBAL y vincula, nunca una ficha de evento aislada', () => {
    const addForm = window_(UI, 'function AddProviderAndLinkForm(', '\nfunction ')
    expect(addForm).toContain('await addProviderGlobal({')
    expect(addForm).toContain('await linkProviderGlobalToEvent(eventId, global)')
  })
})

describe('ProvidersSection — editar edita SIEMPRE la ficha global (una sola fuente de datos, nunca un duplicado por evento)', () => {
  it('usa EditProviderGlobalForm (la misma que en Proveedores y ofertas de Inicio), no un formulario de evento aparte', () => {
    expect(PROVIDERS_SECTION).toContain('<EditProviderGlobalForm key={link.id} provider={g}')
  })
})

describe('ProvidersSection — "habitual" (A2) se calcula, nunca se inventa ni se guarda aparte', () => {
  it('cuenta en cuántos eventos está vinculado cada proveedor visible (countProviderGlobalEventLinks) y lo marca con ≥2', () => {
    expect(PROVIDERS_SECTION).toContain('countProviderGlobalEventLinks(l.globalProviderId)')
    expect(PROVIDERS_SECTION).toContain("(habitualCounts.get(g.id) ?? 0) >= 2 ? ' · ⭐ Habitual' : ''")
  })
})
