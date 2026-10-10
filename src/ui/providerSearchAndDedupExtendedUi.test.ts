import { describe, expect, it } from 'vitest'

// Punto 1.3 (prompt de correcciones) — "incorporar búsqueda de proveedores dentro de cada evento" (antes
// solo existía en el registro global, EVT-A4) y "detectar proveedores existentes también al resolver
// encargos y al dar de alta proveedores directamente" (antes el patrón de findProviderGlobalMatch, ya
// probado en AddOfferForm, no se aplicaba ni en ResolveGroupModal ni en AddProviderAndLinkForm, EVT-A5).
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('ProvidersSection — buscador dentro del evento, mismo criterio que el registro global', () => {
  const SECTION = window_(UI, 'function ProvidersSection({', '\nfunction LinkExistingProviderForm(')
  it('filtra por nombre/categoría/teléfono/email/persona de contacto', () => {
    expect(SECTION).toContain('[g.name, g.type, g.phone, g.email, g.contactPerson].some((v) => v?.toLowerCase().includes(q))')
  })
  it('nunca busca fuera de este evento — filtra sobre los links ya vinculados, no sobre todo el registro global', () => {
    expect(SECTION).toContain('const visibleLinks = links')
    expect(SECTION).toContain(".filter((l) => (filter === 'todos' ? true : l.status === filter))")
  })
  it('mensaje distinto cuando la búsqueda no encuentra nada (no lo confunde con "sin proveedores todavía")', () => {
    expect(SECTION).toContain("q\n              ? 'Nada coincide con esa búsqueda.'")
  })
})

describe('AddProviderAndLinkForm — detecta duplicados antes de crear un proveedor global nuevo', () => {
  const FORM = window_(UI, 'function AddProviderAndLinkForm(', '\nfunction ImportProviderPhotoButton(')
  it('carga el registro global aparte para poder comprobar', () => {
    expect(FORM).toContain('listProvidersGlobal().then(setGlobalProviders).catch(() => {})')
  })
  it('exacto se reutiliza, parecido se confirma, nunca se crea a ciegas', () => {
    expect(FORM).toContain('const { exact, similar } = findProviderGlobalMatch(globalProviders, name)')
    expect(FORM).toContain('global = exact')
    expect(FORM).toContain('global = similar')
  })
})

describe('ResolveGroupModal — "proveedor nuevo" al resolver un encargo también detecta duplicados y queda enlazado al registro global', () => {
  const RESOLVE_MODAL = window_(UI, 'function ResolveGroupModal(', '\nfunction NextStepPromptModal(')
  it('carga el registro global', () => {
    expect(RESOLVE_MODAL).toContain('listProvidersGlobal().then(setGlobalProviders).catch(() => {})')
  })
  it('detecta duplicados antes de crear uno nuevo', () => {
    expect(RESOLVE_MODAL).toContain('const { exact, similar } = findProviderGlobalMatch(globalProviders, trimmedName)')
  })
  it('la ficha del evento queda enlazada al proveedor global (globalProviderId), nunca suelta', () => {
    expect(RESOLVE_MODAL).toContain('globalProviderId: global.id')
  })
})
