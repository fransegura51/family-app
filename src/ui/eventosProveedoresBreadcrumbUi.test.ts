import { describe, expect, it } from 'vitest'

// PEPA Eventos — orden de recuperación de requisitos: "corregir «Inicio» en el breadcrumb y eliminar
// «Volver a Eventos» cuando duplique esa navegación". Bug real: SectionBreadcrumb ya antepone "Eventos"
// como primer nivel (y ese nivel SÍ vuelve aquí, vía useSectionHome) — un "Inicio" intermedio apuntando a
// la misma ruta /eventos era un nivel duplicado, y el botón manual "← Volver a Eventos" de
// ProvidersGlobalScreen hacía exactamente lo mismo que ese primer nivel.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const BREADCRUMB_BLOCK = window_(UI, '<SectionBreadcrumb', '/>')
const PROVIDERS_GLOBAL_SCREEN = window_(UI, 'function ProvidersGlobalScreen(', '\nfunction AddProviderGlobalForm(')

describe('Breadcrumb de "Proveedores y ofertas" — un solo nivel, sin "Inicio" duplicado', () => {
  it('ya no antepone un nivel "Inicio" apuntando a /eventos (SectionBreadcrumb ya pone "Eventos" como primer nivel)', () => {
    expect(BREADCRUMB_BLOCK).not.toContain("{ label: 'Inicio', to: '/eventos' }")
  })
  it('el subsection de Proveedores y ofertas es un único string', () => {
    expect(BREADCRUMB_BLOCK).toContain("showGlobalProviders\n            ? 'Proveedores y ofertas'")
  })
})

describe('ProvidersGlobalScreen — sin botón "Volver a Eventos" redundante con el breadcrumb', () => {
  it('no recibe ni usa ningún onBack', () => {
    expect(PROVIDERS_GLOBAL_SCREEN).not.toContain('onBack')
  })
  it('no queda ningún botón "Volver a Eventos"', () => {
    expect(PROVIDERS_GLOBAL_SCREEN).not.toContain('Volver a Eventos')
  })
  it('sigue mostrando su propio título — la pantalla no se queda sin cabecera', () => {
    expect(PROVIDERS_GLOBAL_SCREEN).toContain('📇 Proveedores y ofertas')
  })
})
