import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro Parte A1 — "Proveedores y ofertas" accesible desde Eventos → Inicio SIN
// depender de entrar en un evento concreto.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('EventosScreen — "📇 Proveedores y ofertas" se ve en Inicio sin elegir ningún evento', () => {
  it('el botón existe junto a "+ Nuevo evento", fuera de cualquier evento seleccionado', () => {
    expect(UI).toContain("onClick={() => setShowGlobalProviders(true)}")
    expect(UI).toContain('📇 Proveedores y ofertas')
  })
  it('mostrar el registro global nunca depende de selectedId (un evento elegido)', () => {
    expect(UI).toContain('showGlobalProviders ? (\n        <ProvidersGlobalScreen')
  })
  it('volver a Inicio desde cualquier sección (useSectionHome) también cierra el registro global', () => {
    const hook = window_(UI, 'useSectionHome(() => {', '})')
    expect(hook).toContain('setShowGlobalProviders(false)')
  })
})

describe('ProvidersGlobalScreen — CRUD real, no solo diseñado (regla 12 del encargo)', () => {
  const SCREEN = window_(UI, 'function ProvidersGlobalScreen(', '\nfunction AddProviderGlobalForm(')

  it('lista, busca (nombre/categoría/teléfono/email/persona de contacto) y filtra activos/archivados', () => {
    expect(SCREEN).toContain('listProvidersGlobal()')
    expect(SCREEN).toContain('[p.name, p.type, p.phone, p.email, p.contactPerson]')
    expect(SCREEN).toContain("filter((p) => p.archived === showArchived)")
  })
  it('archivar nunca borra — usa updateProviderGlobal({ archived }), nunca un delete', () => {
    expect(SCREEN).toContain('updateProviderGlobal(p.id, { archived: !p.archived })')
    expect(SCREEN).not.toContain('deleteProviderGlobal')
  })
})

describe('AddProviderGlobalForm/EditProviderGlobalForm — reutilizan ProviderExtraFields (Fase 5), ningún formulario paralelo', () => {
  it('ambos usan el mismo componente de campos opcionales que ya usa el alta de proveedor por evento', () => {
    const addForm = window_(UI, 'function AddProviderGlobalForm(', '\nfunction EditProviderGlobalForm(')
    const editForm = window_(UI, 'function EditProviderGlobalForm(', '\nfunction ProvidersSection(')
    expect(addForm).toContain('<ProviderExtraFields')
    expect(editForm).toContain('<ProviderExtraFields')
  })
})
