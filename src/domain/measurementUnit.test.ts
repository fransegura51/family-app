import { describe, expect, it } from 'vitest'
import { displayMeasurementUnit, groupBySafeMagnitude, lastComparablePriceByStore, normalizeMeasurementUnit, sameMeasurementUnit } from '@/domain/measurementUnit'

describe('normalizeMeasurementUnit', () => {
  it('solo el literal exacto "kg" o "ud" cuenta — cualquier otra cosa (incluido null) es desconocida', () => {
    expect(normalizeMeasurementUnit('kg')).toBe('kg')
    expect(normalizeMeasurementUnit('ud')).toBe('ud')
    for (const v of [null, undefined, '', 'Kg', 'KG', 'gr', 'g', 'unidad', 'peso']) {
      expect(normalizeMeasurementUnit(v)).toBeNull()
    }
  })
})

describe('displayMeasurementUnit / sameMeasurementUnit', () => {
  it('etiqueta correcta y comparación trivial', () => {
    expect(displayMeasurementUnit('kg')).toBe('€/kg')
    expect(displayMeasurementUnit('ud')).toBe('€/ud')
    expect(sameMeasurementUnit('kg', 'kg')).toBe(true)
    expect(sameMeasurementUnit('kg', 'ud')).toBe(false)
  })
})

describe('groupBySafeMagnitude', () => {
  it('kg y ud explícitos van cada uno a su grupo', () => {
    const r = groupBySafeMagnitude([{ unit: 'kg', id: 1 }, { unit: 'ud', id: 2 }])
    expect(r.kg.map((x) => x.id)).toEqual([1])
    expect(r.ud.map((x) => x.id)).toEqual([2])
    expect(r.unknown).toEqual([])
  })

  it('CASO D — legacy null sin ningún "kg" en la serie: compatible con "ud" (Leche)', () => {
    const r = groupBySafeMagnitude([{ unit: null, id: 'old' }, { unit: 'ud', id: 'new' }])
    expect(r.ud.map((x) => x.id).sort()).toEqual(['new', 'old'])
    expect(r.kg).toEqual([])
    expect(r.unknown).toEqual([])
  })

  it('CASO C — legacy null en una serie que SÍ tiene "kg" (Pepino real): el legacy se aparta, nunca entra en kg ni en ud', () => {
    const r = groupBySafeMagnitude([{ unit: null, id: 'old-2.64' }, { unit: 'kg', id: 'new-1.70' }])
    expect(r.kg.map((x) => x.id)).toEqual(['new-1.70'])
    expect(r.ud).toEqual([])
    expect(r.unknown.map((x) => x.id)).toEqual(['old-2.64'])
  })

  it('CASO E — nombre engañoso no importa aquí: solo se agrupa por el campo unit, nunca por nombre', () => {
    const r = groupBySafeMagnitude([{ unit: 'ud', id: 'patata-5kg' }])
    expect(r.ud.map((x) => x.id)).toEqual(['patata-5kg'])
    expect(r.kg).toEqual([])
  })
})

describe('lastComparablePriceByStore', () => {
  it('sin registros, null', () => {
    expect(lastComparablePriceByStore([])).toBeNull()
  })

  it('CASO F — dos tiendas con kg: comparación válida', () => {
    const res = lastComparablePriceByStore([
      { unit: 'kg', store: 'Mercadona', price: 1.7, recordedDate: '2026-09-18' },
      { unit: 'kg', store: 'Hiperber', price: 1.95, recordedDate: '2026-09-19' },
    ])
    expect(res!.unit).toBe('kg')
    expect(res!.count).toBe(2)
    expect(res!.byStore.get('Mercadona')?.price).toBe(1.7)
    expect(res!.byStore.get('Hiperber')?.price).toBe(1.95)
  })

  it('CASO G — una tienda kg y otra ud: la de ud queda fuera, nunca se declara "más barata" por magnitudes distintas', () => {
    const res = lastComparablePriceByStore([
      { unit: 'kg', store: 'Mercadona', price: 1.7, recordedDate: '2026-09-19' },
      { unit: 'ud', store: 'Hiperber', price: 1.5, recordedDate: '2026-09-18' },
    ])
    // La magnitud dominante es la del registro comparable más reciente (kg, 19/09) — Hiperber (ud) no entra.
    expect(res!.unit).toBe('kg')
    expect([...res!.byStore.keys()]).toEqual(['Mercadona'])
  })

  it('CASO C — el legacy ambiguo nunca entra en el resultado', () => {
    const res = lastComparablePriceByStore([
      { unit: null, store: 'Mercadona', price: 2.64, recordedDate: '2026-08-01' },
      { unit: 'kg', store: 'Mercadona', price: 1.7, recordedDate: '2026-09-18' },
    ])
    expect(res!.unit).toBe('kg')
    expect(res!.count).toBe(1)
    expect(res!.byStore.get('Mercadona')?.price).toBe(1.7)
  })
})
