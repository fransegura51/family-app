import { describe, expect, it } from 'vitest'

// PEPA Eventos — orden de recuperación de requisitos (Parte A5+B3): "extracción correcta de... número de
// presupuesto... y fechas" y "nombre descriptivo de la oferta y del archivo adjunto a partir del número
// de presupuesto". El documento solo PROPONE (igual que el resto del importador); el nombre del adjunto
// que se muestra cambia, nunca el archivo real subido.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const DATA = (import.meta.glob('/src/data/eventTaskGroups.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventTaskGroups.ts']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const DISPLAY_NAME_FN = window_(UI, 'function offerAttachmentDisplayName(', '\nfunction DraftItemForm(')
const ADD_OFFER_FORM = window_(UI, 'function AddOfferForm({', '\nfunction EditOfferForm(')
const EDIT_OFFER_FORM = window_(UI, 'function EditOfferForm({', '\nfunction AddLooseOfferForm(')
const ADD_LOOSE_OFFER_FORM = window_(UI, 'function AddLooseOfferForm({', '\nfunction OfferItemsPanel(')
const SAVE_ATTACHMENT_FN = window_(DATA, 'export async function saveEventTaskGroupOfferAttachment(', '\nexport async function')

describe('offerAttachmentDisplayName — nombre descriptivo del adjunto, nunca cambia el archivo real', () => {
  it('sin nombre de oferta, no propone ningún displayName (se usa el nombre real del archivo)', () => {
    expect(DISPLAY_NAME_FN).toContain('if (!trimmed) return undefined')
  })
  it('conserva la extensión real del archivo subido', () => {
    expect(DISPLAY_NAME_FN).toContain("file.name.split('.').pop()")
  })
})

describe('saveEventTaskGroupOfferAttachment — displayName es opcional y nunca toca el storage_path real', () => {
  it('displayName solo afecta a attachment_original_name', () => {
    expect(SAVE_ATTACHMENT_FN).toContain('attachment_original_name: (displayName ?? file.name).slice(0, 160)')
  })
})

for (const [label, FORM] of [
  ['AddOfferForm', ADD_OFFER_FORM],
  ['EditOfferForm', EDIT_OFFER_FORM],
  ['AddLooseOfferForm', ADD_LOOSE_OFFER_FORM],
] as const) {
  describe(`${label} — importar presupuesto propone nombre descriptivo, exclusiones y nombre de adjunto`, () => {
    it('propone el nombre de la oferta a partir de quoteNumber, solo si no había nombre ya puesto', () => {
      expect(FORM).toContain('if (!name && result.quoteNumber)')
      expect(FORM).toContain('setName(`Presupuesto nº ${result.quoteNumber}`)')
    })
    it('rellena scopeExcluded (qué NO incluye) desde el documento, solo si estaba vacío', () => {
      expect(FORM).toContain('if (!scopeExcluded && result.scopeExcluded) setScopeExcluded(result.scopeExcluded)')
    })
    it('el adjunto se guarda con el nombre descriptivo de la oferta, no con el nombre real del archivo', () => {
      expect(FORM).toContain('saveEventTaskGroupOfferAttachment(offer, file, offerAttachmentDisplayName(name, file))')
    })
  })
}
