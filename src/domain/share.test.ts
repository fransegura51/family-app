import { describe, expect, it } from 'vitest'
import { icsForEvent, recipeText, shoppingListText, vCardForContact, vCardForContacts } from './share'

describe('icsForEvent', () => {
  it('genera una cita con hora, sin RRULE aunque el original se repita', () => {
    const ics = icsForEvent({
      title: 'Cena familiar',
      startAt: '2026-09-14T18:00:00.000Z',
      endAt: '2026-09-14T19:00:00.000Z',
      allDay: false,
    })
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('SUMMARY:Cena familiar')
    expect(ics).toContain('DTSTART:20260914T180000Z')
    expect(ics).toContain('DTEND:20260914T190000Z')
    expect(ics).not.toContain('RRULE')
  })

  it('sin hora de fin, dura 1 hora por defecto', () => {
    const ics = icsForEvent({ title: 'Llamada', startAt: '2026-09-14T10:00:00.000Z', endAt: null, allDay: false })
    expect(ics).toContain('DTSTART:20260914T100000Z')
    expect(ics).toContain('DTEND:20260914T110000Z')
  })

  it('evento de todo el día usa VALUE=DATE y dura hasta el día siguiente', () => {
    const ics = icsForEvent({ title: 'Vacaciones', startAt: '2026-09-14T00:00:00.000Z', endAt: null, allDay: true })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260914')
    expect(ics).toContain('DTEND;VALUE=DATE:20260915')
  })

  it('escapa comas, puntos y coma y saltos de línea en el título/descripción', () => {
    const ics = icsForEvent({
      title: 'Reunión, importante; urgente',
      startAt: '2026-09-14T10:00:00.000Z',
      endAt: null,
      allDay: false,
      description: 'Línea 1\nLínea 2',
    })
    expect(ics).toContain('SUMMARY:Reunión\\, importante\\; urgente')
    expect(ics).toContain('DESCRIPTION:Línea 1\\nLínea 2')
  })
})

describe('vCardForContact / vCardForContacts', () => {
  it('incluye teléfono y email cuando existen', () => {
    const vcf = vCardForContact({ name: 'Colegio Los Álamos', phone: '912345678', email: 'info@colegio.es' })
    expect(vcf).toContain('FN:Colegio Los Álamos')
    expect(vcf).toContain('TEL;TYPE=CELL:912345678')
    expect(vcf).toContain('EMAIL:info@colegio.es')
  })

  it('omite TEL/EMAIL cuando son null', () => {
    const vcf = vCardForContact({ name: 'Sin datos', phone: null, email: null })
    expect(vcf).not.toContain('TEL')
    expect(vcf).not.toContain('EMAIL')
  })

  it('concatena varios contactos en bloques BEGIN/END VCARD válidos', () => {
    const vcf = vCardForContacts([
      { name: 'Ana', phone: '600000001', email: null },
      { name: 'Bea', phone: null, email: 'bea@example.com' },
    ])
    expect(vcf.match(/BEGIN:VCARD/g)).toHaveLength(2)
    expect(vcf.match(/END:VCARD/g)).toHaveLength(2)
    expect(vcf).toContain('FN:Ana')
    expect(vcf).toContain('FN:Bea')
  })
})

describe('shoppingListText', () => {
  it('agrupa por tienda con cantidad y unidad', () => {
    const text = shoppingListText([
      {
        store: 'Mercadona',
        items: [
          { name: 'Leche', quantity: '2', unit: 'l' },
          { name: 'Pan', quantity: null, unit: null },
        ],
      },
      { store: 'Sin tienda', items: [{ name: 'Pilas', quantity: '4', unit: null }] },
    ])
    expect(text).toContain('— Mercadona —')
    expect(text).toContain('• Leche (2 l)')
    expect(text).toContain('• Pan')
    expect(text).not.toContain('Pan (')
    expect(text).toContain('— Sin tienda —')
    expect(text).toContain('• Pilas (4)')
  })

  it('omite tiendas sin productos', () => {
    const text = shoppingListText([{ store: 'Vacía', items: [] }])
    expect(text).not.toContain('Vacía')
  })
})

describe('recipeText', () => {
  it('incluye título, ingredientes con cantidad y preparación', () => {
    const text = recipeText({
      title: 'Tortilla de patatas',
      ingredients: [
        { name: 'Patatas', quantity: '1', unit: 'kg' },
        { name: 'Huevos', quantity: '6', unit: null },
      ],
      notes: 'Freír y cuajar.',
    })
    expect(text).toContain('🍽️ Tortilla de patatas')
    expect(text).toContain('• Patatas — 1 kg')
    expect(text).toContain('• Huevos — 6')
    expect(text).toContain('Preparación:')
    expect(text).toContain('Freír y cuajar.')
  })

  it('sin ingredientes ni notas, solo el título', () => {
    const text = recipeText({ title: 'Receta vacía', ingredients: [], notes: null })
    expect(text).toBe('🍽️ Receta vacía')
  })
})
