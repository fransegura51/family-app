import { describe, expect, it } from 'vitest'

// PEPA Eventos — orden de recuperación de requisitos, Fase 1 (Parte A5 del prompt maestro consolidado):
// "Al registrar una oferta: si el proveedor existe, reutilizar su ficha; si no existe, crear una ficha
// provisional en el registro global... sugerir proveedores ya registrados... detectar posibles
// duplicados, pero nunca fusionarlos automáticamente sin confirmación."
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const DATA = (import.meta.glob('/src/data/providersGlobal.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/providersGlobal.ts']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const NORMALIZE_FN = window_(DATA, 'function normalizeProviderName(', '\n}')
const MATCH_FN = window_(DATA, 'export function findProviderGlobalMatch(', '\n}')
const ADD_OFFER_FORM = window_(UI, 'function AddOfferForm({', '\nfunction EditOfferForm(')

describe('findProviderGlobalMatch — coincidencia exacta se reutiliza sola; parecida se ofrece, nunca se fusiona', () => {
  it('normaliza mayúsculas y acentos antes de comparar', () => {
    expect(NORMALIZE_FN).toContain('.toLowerCase()')
    expect(NORMALIZE_FN).toContain(".normalize('NFD')")
    expect(MATCH_FN).toContain('normalizeProviderName(name)')
  })
  it('una coincidencia exacta no se marca como "similar" (no hace falta confirmar nada)', () => {
    expect(MATCH_FN).toContain('return { exact: p, similar: null }')
  })
})

describe('AddOfferForm — proveedor existente reutiliza su globalProviderId; proveedor nuevo sugiere y detecta duplicados', () => {
  it('carga el registro global una vez, solo para sugerir/detectar (nunca para vincular nada por sí sola)', () => {
    expect(ADD_OFFER_FORM).toContain('listProvidersGlobal().then(setGlobalProviders)')
  })
  it('el proveedor "existente" usa el globalProviderId que ya tuviera su ficha del evento', () => {
    expect(ADD_OFFER_FORM).toContain('providers.find((p) => p.id === selectedProviderId)?.globalProviderId ?? null')
  })
  it('coincidencia exacta: reutiliza la ficha sin preguntar', () => {
    expect(ADD_OFFER_FORM).toContain('if (exact) {\n          globalProviderId = exact.id')
  })
  it('coincidencia parecida: pregunta antes de decidir, nunca fusiona sola', () => {
    expect(ADD_OFFER_FORM).toContain('window.confirm(')
    expect(ADD_OFFER_FORM).toContain('¿Es el mismo proveedor?')
  })
  it('sin ninguna coincidencia: crea una ficha nueva en el registro global (provisional, sin más datos que el nombre)', () => {
    expect(ADD_OFFER_FORM).toContain("globalProviderId = (await addProviderGlobal({ name: providerName })).id")
  })
  it('el nombre nuevo tiene sugerencias del registro global (datalist nativo, mismo patrón que el resto de la app)', () => {
    expect(ADD_OFFER_FORM).toContain('list="add-offer-global-providers"')
    expect(ADD_OFFER_FORM).toContain('id="add-offer-global-providers"')
  })
  it('el globalProviderId resuelto viaja a la oferta', () => {
    expect(ADD_OFFER_FORM).toContain('globalProviderId,\n        providerName,')
  })
})
