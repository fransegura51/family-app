import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro — Fase 6, Parte B3: "📷 Importar presupuesto" dentro de AddOfferForm (un
// encargo) y AddLooseOfferForm (registro global / proveedores de un evento). SIEMPRE una propuesta
// revisable (incluida la lista de servicios, línea a línea) antes de aplicarse — nunca se guarda nada
// directamente desde el botón de importar.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const IMPORT_BUTTON = window_(UI, 'function ImportOfferBudgetButton({', '\nfunction AddOfferForm(')
const ADD_OFFER_FORM = window_(UI, 'function AddOfferForm({', '\nfunction EditOfferForm(')
const ADD_LOOSE_OFFER_FORM = window_(UI, 'function AddLooseOfferForm({', '\nconst RESOLUTION_METHOD_OPTIONS')

describe('ImportOfferBudgetButton — cada servicio leído se puede incluir o excluir antes de aplicar nada', () => {
  it('llama a analyzeOfferBudgetDocument, nunca guarda nada por sí sola (ni addEventTaskGroupOffer ni addEventTaskGroupOfferItem)', () => {
    expect(IMPORT_BUTTON).toContain('await analyzeOfferBudgetDocument(file)')
    expect(IMPORT_BUTTON).not.toMatch(/addEventTaskGroupOffer\(|addLooseTaskGroupOffer\(|addEventTaskGroupOfferItem\(/)
  })
  it('todos los servicios empiezan incluidos, pero cada uno tiene su propia casilla para excluirlo', () => {
    expect(IMPORT_BUTTON).toContain('setIncluded(new Set(scanned.items.map((_, i) => i)))')
    expect(IMPORT_BUTTON).toContain('<input type="checkbox" checked={included.has(i)} onChange={() => toggleItem(i)} />')
  })
  it('"Usar estos datos" entrega solo los servicios marcados — nunca todos de golpe sin filtrar por included', () => {
    expect(IMPORT_BUTTON).toContain('result.items.filter((_, i) => included.has(i))')
  })
})

describe('AddOfferForm — importar un presupuesto solo rellena lo que está vacío, y guarda los servicios tras crear la oferta', () => {
  it('applyImported respeta cualquier dato ya escrito a mano (nunca lo sobrescribe)', () => {
    const applyFn = window_(ADD_OFFER_FORM, 'function applyImported(', '\n  }')
    expect(applyFn).toContain('if (!amount && result.amount !== null) setAmount(String(result.amount))')
    expect(applyFn).toContain('if (!offerDate && result.offerDate) setOfferDate(result.offerDate)')
  })
  it('los servicios pendientes se crean DESPUÉS de crear la oferta (nunca antes, nunca sin oferta real)', () => {
    const submitFn = window_(ADD_OFFER_FORM, 'async function handleSubmit(', '\n  }')
    const offerIdx = submitFn.indexOf('const offer = await addEventTaskGroupOffer(')
    const itemsIdx = submitFn.indexOf('for (const item of pendingItems)')
    expect(offerIdx).toBeGreaterThan(-1)
    expect(itemsIdx).toBeGreaterThan(offerIdx)
    expect(submitFn).toContain('await addEventTaskGroupOfferItem(offer, {')
  })
})

describe('AddLooseOfferForm — igual que AddOfferForm, pero el proveedor del documento nunca sustituye al ya fijado por contexto', () => {
  it('applyImported no toca providerName (viene fijo de fuera, no del documento)', () => {
    const applyFn = window_(ADD_LOOSE_OFFER_FORM, 'function applyImported(', '\n  }')
    expect(applyFn).not.toContain('setProviderName')
  })
  it('los servicios pendientes se crean DESPUÉS de crear la oferta suelta', () => {
    const submitFn = window_(ADD_LOOSE_OFFER_FORM, 'async function handleSubmit(', '\n  }')
    const offerIdx = submitFn.indexOf('const offer = await addLooseTaskGroupOffer(')
    const itemsIdx = submitFn.indexOf('for (const item of pendingItems)')
    expect(offerIdx).toBeGreaterThan(-1)
    expect(itemsIdx).toBeGreaterThan(offerIdx)
  })
})
