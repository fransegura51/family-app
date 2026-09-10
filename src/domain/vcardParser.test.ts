import { describe, expect, it } from 'vitest'
import { parseVcf } from '@/domain/vcardParser'

const VCF = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:García;María;;;',
  'FN:María García\\, pediatra',
  'TEL;type=CELL:+34 600 111 222',
  'TEL;type=HOME:+34 965 000 000',
  'EMAIL;type=INTERNET:maria@example.com',
  'BDAY:1980-05-21',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:López;Juan;;;',
  'BDAY:19751203',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  // El plegado quita CRLF + UN espacio: el espacio entre palabras va doblado.
  'FN:Colegio Santa Ana con un nombre tan largo que el exportador',
  '  lo pliega',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'TEL:+34 600 999 999',
  'END:VCARD',
].join('\r\n')

describe('parseVcf', () => {
  const cards = parseVcf(VCF)

  it('FN manda; solo el primer teléfono y email; BDAY con guiones; coma desescapada', () => {
    expect(cards[0]).toEqual({
      name: 'María García, pediatra',
      phone: '+34 600 111 222',
      email: 'maria@example.com',
      birthDate: '1980-05-21',
    })
  })

  it('sin FN, se construye "Nombre Apellidos" desde N; BDAY compacto también vale', () => {
    expect(cards[1]).toEqual({ name: 'Juan López', phone: null, email: null, birthDate: '1975-12-03' })
  })

  it('líneas plegadas se unen', () => {
    expect(cards[2].name).toBe('Colegio Santa Ana con un nombre tan largo que el exportador lo pliega')
  })

  it('una tarjeta sin nombre se descarta', () => {
    expect(cards).toHaveLength(3)
  })

  it('texto vacío: lista vacía', () => {
    expect(parseVcf('')).toEqual([])
  })
})
