import { describe, expect, it } from 'vitest'
import { buildVcf, parseVcf } from '@/domain/vcardParser'

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

// PEPA Eventos, prompt maestro Parte A7 — "Guardar en contactos" (dirección contraria: proveedor → .vcf
// real, nunca modifica la ficha de PEPA). Ficha de EMPRESA: FN/ORG llevan el nombre del proveedor.
describe('buildVcf — genera un .vcf real a partir de un proveedor', () => {
  it('incluye FN/ORG (nombre), teléfono, email y web cuando existen', () => {
    const vcf = buildVcf({ name: 'Floristería Margarita', phone: '+34 600 111 222', email: 'info@margarita.es', website: 'https://margarita.es' })
    expect(vcf).toContain('BEGIN:VCARD')
    expect(vcf).toContain('FN:Floristería Margarita')
    expect(vcf).toContain('ORG:Floristería Margarita')
    expect(vcf).toContain('TEL;TYPE=WORK,VOICE:+34 600 111 222')
    expect(vcf).toContain('EMAIL:info@margarita.es')
    expect(vcf).toContain('URL:https://margarita.es')
    expect(vcf).toContain('END:VCARD')
  })
  it('nunca inventa un campo que no exista — sin teléfono/email/web/dirección, no salen esas líneas', () => {
    const vcf = buildVcf({ name: 'Solo nombre' })
    expect(vcf).not.toContain('TEL')
    expect(vcf).not.toContain('EMAIL')
    expect(vcf).not.toContain('URL')
    expect(vcf).not.toContain('ADR')
    expect(vcf).not.toContain('NOTE')
  })
  it('categoría, persona de contacto y notas se juntan en NOTE, nunca se pierden', () => {
    const vcf = buildVcf({ name: 'Catering Los Olivos', type: 'Catering', contactPerson: 'Marta', notes: 'Pide presupuesto con 2 semanas de margen' })
    expect(vcf).toContain('NOTE:Categoría: Catering — Contacto: Marta — Pide presupuesto con 2 semanas de margen')
  })
  it('escapa comas/punto y coma/saltos de línea (RFC 6350) — una dirección con comas no rompe el formato', () => {
    const vcf = buildVcf({ name: 'Proveedor, S.L.', address: 'Calle Mayor, 12; 2º' })
    expect(vcf).toContain('FN:Proveedor\\, S.L.')
    expect(vcf).toContain('ADR;TYPE=WORK:;;Calle Mayor\\, 12\\; 2º;;;;')
  })
  it('round-trip: lo que genera buildVcf, parseVcf lo vuelve a leer igual (nombre, teléfono, email)', () => {
    const vcf = buildVcf({ name: 'Pastelería La Dulce', phone: '+34 600 333 444', email: 'pedidos@ladulce.es' })
    const parsed = parseVcf(vcf)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('Pastelería La Dulce')
    expect(parsed[0].phone).toBe('+34 600 333 444')
    expect(parsed[0].email).toBe('pedidos@ladulce.es')
  })
})
