import { describe, expect, it } from 'vitest'
import { findKnownStore } from './voiceQuery'
import { withReceiptStoreBases } from './storeNames'

describe('withReceiptStoreBases', () => {
  it('une «MERCADONA S.A.» y «Mercadona» sin tienda registrada', () => {
    const stores = withReceiptStoreBases([], ['MERCADONA S.A.', 'Mercadona', 'Mercadona Av. Valencia'])
    expect(stores).toEqual(['Mercadona'])
    expect(findKnownStore('MERCADONA S.A.', stores)?.store).toBe('Mercadona')
  })
  it('no une nombres distintos', () => {
    expect(withReceiptStoreBases([], ['Lidl', 'Aldi'])).toEqual(['Lidl', 'Aldi'])
  })
  it('respeta las registradas', () => {
    expect(withReceiptStoreBases(['Dia'], ['DIA Y MEDIA', 'Dia'])).toEqual(['Dia'])
  })
})
