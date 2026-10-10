import { describe, expect, it } from 'vitest'

// Punto 1.2 (prompt de correcciones) — valoración privada 1-5 (rating) y reconocimiento de "habitual"
// (≥2 eventos, ya calculado desde EVT-A2) ahora también visibles en el registro GLOBAL, no solo dentro de
// un evento. "Comentarios privados" ya los cubría `notes` (libre, nunca de cara a invitados/otras
// familias — providers_global solo tiene una política RLS, por family_id).
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const DATA = (import.meta.glob('/src/data/providersGlobal.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/providersGlobal.ts']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Capa de datos — rating viaja en el select, el alta y la edición', () => {
  it('PROVIDER_GLOBAL_SELECT incluye rating', () => {
    expect(DATA).toContain(
      "'id, family_id, name, type, contact_person, phone, whatsapp, email, website, address, notes, rating, archived, created_at, attachment_storage_path, attachment_original_name, attachment_mime_type'",
    )
  })
  it('addProviderGlobal y updateProviderGlobal aceptan rating', () => {
    expect(DATA).toContain('rating: input.rating ?? null,')
    expect(DATA).toContain('if (patch.rating !== undefined) update.rating = patch.rating')
  })
})

describe('StarRatingPicker — 5 estrellas pulsables, compacto, pulsar la ya marcada la quita', () => {
  const PICKER = window_(UI, 'function StarRatingPicker(', '\nfunction EditProviderGlobalForm(')
  it('las 5 estrellas', () => {
    expect(PICKER).toContain('[1, 2, 3, 4, 5].map')
  })
  it('pulsar la ya marcada vuelve a null (nunca se queda atascada en 1 como mínimo)', () => {
    expect(PICKER).toContain('onClick={() => onChange(value === n ? null : n)}')
  })
})

describe('EditProviderGlobalForm — guarda la valoración junto con el resto de la ficha', () => {
  const FORM = window_(UI, 'function EditProviderGlobalForm(', '\nfunction ProvidersSection(')
  it('usa StarRatingPicker con el valor inicial del proveedor', () => {
    expect(FORM).toContain('const [rating, setRating] = useState<number | null>(provider.rating)')
    expect(FORM).toContain('<StarRatingPicker value={rating} onChange={setRating} />')
  })
  it('envía rating en updateProviderGlobal', () => {
    expect(FORM).toContain('rating,')
  })
})

describe('Registro global (ProvidersGlobalScreen) — valoración y "Habitual" visibles, Punto 1.2 (antes solo dentro de un evento, EVT-A2)', () => {
  const SCREEN = window_(UI, 'function ProvidersGlobalScreen(', '\nfunction AddProviderGlobalForm(')
  it('calcula habitualCounts igual que ProvidersSection (countProviderGlobalEventLinks), nunca una marca aparte', () => {
    expect(SCREEN).toContain('countProviderGlobalEventLinks(p.id)')
  })
  it('muestra la valoración como estrellas y "Habitual" en la misma línea que nombre/categoría', () => {
    expect(SCREEN).toContain("p.rating ? \` · ${'⭐'.repeat(p.rating)}\` : ''")
    expect(SCREEN).toContain("(habitualCounts.get(p.id) ?? 0) >= 2 ? ' · ⭐ Habitual' : ''")
  })
})
