import { describe, expect, it } from 'vitest'
import {
  decoracionZonasSinAsignar,
  desiredForDecoracionExtraConfirm,
  desiredForDecoracionOrganizacion,
  DECORACION_ZONAS_CATALOG,
} from '@/domain/eventOtrosDecoracion'

const NONE = { taskTitle: null, budgetCategory: null, providerCategory: null, resolved: false, groupKind: null, groupDefaultName: null }

describe('Otros y decoración — derivados muy conservadores', () => {
  it('desiredForDecoracionOrganizacion solo genera algo con "contrataremos"', () => {
    expect(desiredForDecoracionOrganizacion(undefined)).toEqual(NONE)
    expect(desiredForDecoracionOrganizacion({ choice: 'nosotros' })).toEqual(NONE)
    expect(desiredForDecoracionOrganizacion({ choice: 'combinacion' })).toEqual(NONE)
    expect(desiredForDecoracionOrganizacion({ choice: 'contrataremos' }).taskTitle).toBe('Contratar decoración')
  })
  it('desiredForDecoracionExtraConfirm solo genera algo con "sí"', () => {
    expect(desiredForDecoracionExtraConfirm({ choice: 'no' })).toEqual(NONE)
    expect(desiredForDecoracionExtraConfirm({ choice: 'si' }).taskTitle).toBe('Organizar decoración adicional')
  })
})

// Orden de recuperación de requisitos (Parte G5) — "el caso 'combinación' no desglosa qué zona se
// contrata vs. cuál hace la familia".
describe('decoracionZonasSinAsignar (Parte G5) — solo tiene sentido en "combinación"', () => {
  it('con "contrataremos" o "nosotros" nunca hay nada sin asignar — esa pregunta no aplica', () => {
    const zonas = { selected: ['mesas' as const], customItems: [] }
    expect(decoracionZonasSinAsignar('contrataremos', zonas)).toEqual([])
    expect(decoracionZonasSinAsignar('nosotros', zonas)).toEqual([])
    expect(decoracionZonasSinAsignar(undefined, zonas)).toEqual([])
  })
  it('en "combinación", una zona seleccionada sin asignación cuenta como sin asignar', () => {
    const zonas = { selected: ['mesas' as const, 'entrada' as const], customItems: [] }
    expect(decoracionZonasSinAsignar('combinacion', zonas)).toEqual(['mesas', 'entrada'])
  })
  it('asignar una zona la saca de la lista de pendientes, sin tocar las demás', () => {
    const zonas = { selected: ['mesas' as const, 'entrada' as const], customItems: [], assignacion: { mesas: 'contratada' as const } }
    expect(decoracionZonasSinAsignar('combinacion', zonas)).toEqual(['entrada'])
  })
  it('todas asignadas: ninguna pendiente', () => {
    const zonas = {
      selected: ['mesas' as const, 'entrada' as const],
      customItems: [],
      assignacion: { mesas: 'contratada' as const, entrada: 'nosotros' as const },
    }
    expect(decoracionZonasSinAsignar('combinacion', zonas)).toEqual([])
  })
  it('sin lista de zonas todavía: nada que mostrar como pendiente', () => {
    expect(decoracionZonasSinAsignar('combinacion', undefined)).toEqual([])
  })
})

describe('Catálogo de zonas — nunca una lista de compras, solo QUÉ zonas', () => {
  it('5 zonas fijas, ninguna con cantidades/materiales', () => {
    expect(DECORACION_ZONAS_CATALOG.map((z) => z.key)).toEqual(['ceremonia', 'mesas', 'entrada', 'photocall', 'zona_fiesta'])
  })
})
