import { describe, expect, it } from 'vitest'
import { compareMerchantIdentity, merchantIdentityTokens } from './forecastMerchantIdentity'

// ECO-02 — identidad comercial: tri-estado (match / conflict / unknown) y sin coincidencias parciales débiles.
const kind = (forecast: string, bank: string | null) => compareMerchantIdentity(forecast, bank).kind

describe('identidad comercial — lo que SÍ es el mismo comercio', () => {
  it('ENDESA ENERGIA S.A. ↔ ENDESA ENERGÍA (mayúsculas, tildes, puntuación y forma jurídica)', () => {
    const r = compareMerchantIdentity('ENDESA ENERGÍA', 'ENDESA ENERGIA S.A.')
    expect(r.kind).toBe('match')
    expect(r.kind === 'match' && r.strong).toBe(true)
  })

  it('ORANGE ESPAGNE SAU ↔ Orange', () => {
    expect(kind('Orange', 'ORANGE ESPAGNE SAU')).toBe('match')
  })

  it('NETFLIX.COM ↔ Netflix, con el boilerplate de tarjeta y la localidad que añade el banco', () => {
    expect(kind('Netflix', 'COMPRA TARJ. 5402XXXXXXXX4041 NETFLIX.COM-Madrid')).toBe('match')
    expect(kind('NETFLIX.COM', 'Netflix')).toBe('match')
  })

  it('SEQURA-BARCELONA ↔ Aire acondicionado SEQURA (la localidad añadida no cuenta; las palabras de sector tampoco)', () => {
    expect(kind('Aire acondicionado SEQURA', 'SEQURA-BARCELONA')).toBe('match')
  })

  it('una referencia de contrato común basta aunque los nombres no se parezcan', () => {
    const r = compareMerchantIdentity('Hipoteca Casa N.8078183410', 'PRESTAMOS ADEUDO CUOTA N.8078183410')
    expect(r).toMatchObject({ kind: 'match', via: 'reference', strong: true })
  })

  it('el nombre escrito con o sin espacio es el mismo (mas movil ↔ masmovil)', () => {
    expect(kind('Mas Movil', 'MASMOVIL BROADBAND')).toBe('match')
  })

  it('casos reales ya conciliados: la misma marca + producto (GOOGLE ONE) y los nombres que el propio banco escribe distinto cada mes', () => {
    expect(kind('FLOW GOOGLE*GOOGLE ONE-DUBLIN', 'GOOGLE*GOOGLE ONE-DUBLIN')).toBe('match')
    expect(kind('APPLE.COM/BILL-CORK ChatGPT', 'APPLE.COM/BILL-CORK')).toBe('match')
    expect(kind('NETFLIX.COM-Madrid', 'Netflix.com-Los Gatos')).toBe('match')
    expect(kind('Aire acondicionado SEQURA-BARCELONA', 'SeQura-BARCELONA')).toBe('match')
    expect(kind('Préstamo Hyundai BANCO BILBAO VIZCAYA ARGENTARIA S.A.', 'BANCO BILBAO VIZCAYA ARGENTARIA S.A.')).toBe('match')
    expect(kind('ANTHROPIC* CLAUDE SUB-DUBLIN', 'ANTHROPIC* CLAUDE SUB-DUBLIN 4')).toBe('match')
  })

  it('variantes comerciales verificadas (Telefónica ↔ Movistar)', () => {
    const r = compareMerchantIdentity('Telefónica', 'MOVISTAR FUSION')
    expect(r).toMatchObject({ kind: 'match', via: 'alias' })
  })
})

describe('identidad comercial — lo que NO es el mismo comercio', () => {
  it('ENDESA ↔ AMAZON, ASADOR SESE', () => {
    expect(kind('ENDESA ENERGIA S.A.', 'WWW.AMAZON-LUXEMBOURG')).toBe('conflict')
    expect(kind('ENDESA ENERGIA S.A.', 'ASADOR SESE-RAFAL')).toBe('conflict')
  })

  it('GOOGLE FLOW ↔ SUPERMERCADO CONSUM', () => {
    expect(kind('FLOW GOOGLE', 'SUPERMERCADO CONSUM RAFAL')).toBe('conflict')
  })

  it('SEQURA ↔ Eric Segura Hepburn: compartir «segura» con «sequra» no demuestra nada', () => {
    expect(kind('Aire acondicionado SEQURA', 'Eric Segura Hepburn')).toBe('conflict')
  })

  it('compartir solo la marca multiproducto (Google, Amazon…) no basta', () => {
    expect(kind('FLOW GOOGLE', 'GOOGLE YOUTUBE PREMIUM')).toBe('conflict')
    expect(kind('Amazon Prime', 'AMAZON EU SARL')).toBe('conflict')
    // …pero con otra palabra distintiva en común sí es el mismo servicio.
    expect(kind('FLOW GOOGLE', 'GOOGLE *FLOW')).toBe('match')
  })

  it('compartir solo una palabra de sector o una localidad no es identidad (energía, seguro, Rafal)', () => {
    expect(kind('Iberdrola energía', 'ENDESA ENERGIA SA')).toBe('conflict')
    // Con una sola palabra de sector o de localidad en común no hay evidencia (según el caso es «conflict» o «unknown», nunca «match»).
    expect(kind('Seguro coche Mapfre', 'SEGUROS AXA')).not.toBe('match')
    expect(kind('Gimnasio Rafal', 'SUPERMERCADO CONSUM RAFAL')).not.toBe('match')
  })

  it('el boilerplate de tarjeta y de banco no cuenta (misma tarjeta, distinto comercio)', () => {
    expect(kind('Netflix', 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN')).toBe('conflict')
  })
})

describe('identidad comercial — cuando no se puede comprobar', () => {
  it('un título solo con palabras genéricas, o un banco sin concepto, es «unknown» (nunca match)', () => {
    expect(kind('Luz', 'ENDESA ENERGIA S.A.')).toBe('unknown')
    expect(kind('Hipoteca casa', 'PRESTAMOS ADEUDO CUOTA')).toBe('unknown')
    expect(kind('Endesa', null)).toBe('unknown')
    expect(kind('Endesa', '   ')).toBe('unknown')
  })

  it('merchantIdentityTokens: normaliza y separa referencias de nombres', () => {
    expect(merchantIdentityTokens('COMPRA TARJ. 5402XXXXXXXX4041 NETFLIX.COM-Madrid', { bankConcept: true })).toMatchObject({ names: ['netflix'], refs: [] })
    expect(merchantIdentityTokens('ADEUDO ENDESA ENERGÍA S.A. 123456789')).toMatchObject({ names: ['endesa'], refs: ['123456789'] })
  })
})
