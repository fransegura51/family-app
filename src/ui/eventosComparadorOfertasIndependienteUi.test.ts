import { describe, expect, it } from 'vitest'

// PEPA Eventos — orden de recuperación de requisitos, Fase 1 (Partes C1+B4 del prompt maestro
// consolidado): "Consultar ofertas disponibles" sin obligar a resolver el encargo, y "diferenciar
// claramente descartar, desvincular y eliminar" para una oferta ya vinculada a un encargo.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const DATA = (import.meta.glob('/src/data/eventTaskGroups.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventTaskGroups.ts']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const OFFER_CARD_MENU = window_(UI, 'function OfferCardMenu(', '\nfunction OffersComparisonModal(')
const OFFERS_COMPARISON_MODAL = window_(UI, 'function OffersComparisonModal(', '\nfunction ResolveGroupModal(')
const UNLINK_FN = window_(DATA, 'export async function unlinkTaskGroupOfferFromGroup(', '\n}')

describe('Parte C1 — "Consultar ofertas disponibles" accesible sin tener que resolver el encargo', () => {
  it('hay un botón propio "📋 Consultar ofertas" junto a "Resolver encargo", no dentro de él', () => {
    expect(UI).toContain('📋 Consultar ofertas')
    expect(UI).toContain('onClick={() => setComparingOffersGroup(item.group)}')
  })
  it('OffersComparisonModal reutiliza OffersComparison tal cual — nunca duplica el comparador', () => {
    expect(OFFERS_COMPARISON_MODAL).toContain('<OffersComparison group={group} providers={providers} onUseOffer={onResolveWithOffer} />')
  })
  it('elegir "usar esta oferta" aquí pasa el testigo a Resolver encargo ya con esa oferta — nunca resuelve por su cuenta', () => {
    expect(UI).toContain('onResolveWithOffer={(offer) => {')
    expect(UI).toContain('setResolveWithOffer(offer)')
    expect(UI).toContain('setResolvingGroup(group)')
  })
})

describe('Parte B4 — "Desvincular" una oferta es distinto de Descartar y de Eliminar', () => {
  it('unlinkTaskGroupOfferFromGroup solo quita el group_id — nunca borra la oferta ni toca su proveedor/importe', () => {
    expect(UNLINK_FN).toContain(".update({ group_id: null })")
    expect(UNLINK_FN).not.toContain('.delete()')
  })
  it('OfferCardMenu ofrece "Desvincular" solo cuando se le pasa onUnlink (ofertas ya vinculadas a un encargo)', () => {
    expect(OFFER_CARD_MENU).toContain('onUnlink?: () => void')
    expect(OFFER_CARD_MENU).toContain('{onUnlink && (')
    expect(OFFER_CARD_MENU).toContain('label="Desvincular"')
  })
  it('pide confirmación antes de desvincular, igual que el resto de acciones sensibles del menú', () => {
    expect(OFFER_CARD_MENU).toContain('confirmMessage="¿Desvincular esta oferta del encargo? Sigue disponible como oferta suelta de este evento, sin encargo."')
  })
  it('OffersComparison (ofertas dentro de un encargo) pasa onUnlink; ProviderOffersPanel (ofertas sueltas) no lo necesita', () => {
    expect(UI).toContain('onUnlink={() => unlinkTaskGroupOfferFromGroup(o.id).then(reload)}')
  })
})
