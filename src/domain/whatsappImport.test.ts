import { describe, expect, it } from 'vitest'
import type { Participant } from '@/domain/groups'
import type { Contact } from '@/domain/types'
import { fromWhatsappAi, matchStudent, mergeWhatsappBatch, proposeWhatsapp, suggestContactName } from '@/domain/whatsappImport'

const person = (over: Partial<Participant>): Participant => ({
  id: 'p', groupId: 'g1', name: 'X', surname: null, guardianName: null, phone: null, email: null, payerAlias: null, notes: null, leftAt: null, createdAt: '2026-01-01', ...over,
})
const contact = (over: Partial<Contact>): Contact => ({
  id: 'c1', familyId: 'f', name: 'Jennifer', category: 'Colegio', phone: null, email: null, notes: null, birthDate: null, birthdayFavorite: false, ...over,
})

describe('BLOQUE 3 · contactos desde capturas de WhatsApp', () => {
  it('transcribe lo visible, normaliza el teléfono y conserva el nombre original (emojis incluidos)', () => {
    const rows = fromWhatsappAi([{ whatsappName: 'Mamá de Eric ❤️', phone: '+34 612 345 678', student: 'Eric' }])
    expect(rows[0]).toMatchObject({ whatsappName: 'Mamá de Eric ❤️', phone: '612345678', studentHint: 'Eric', guardianHint: null })
  })
  it('no inventa: sin nombre ni teléfono no hay fila; un teléfono raro se marca dudoso', () => {
    expect(fromWhatsappAi([{ whatsappName: null, phone: null }])).toEqual([])
    const r = fromWhatsappAi([{ whatsappName: 'Ana', phone: '12 34', uncertain: true }])
    expect(r[0].phone).toBeNull()
    expect(r[0].doubts.length).toBeGreaterThanOrEqual(1)
  })
  it('capturas acumulativas: el mismo teléfono completa y no duplica; nunca pisa lo ya leído', () => {
    const first = fromWhatsappAi([{ whatsappName: 'Lucía mamá', phone: '611 111 111' }, { whatsappName: null, phone: '622 222 222' }])
    const second = fromWhatsappAi([{ whatsappName: 'Lucía', phone: '+34611111111', student: 'Lucía G.' }, { whatsappName: 'Marcos', phone: '622222222' }, { whatsappName: 'Nuevo', phone: '633333333' }])
    const m = mergeWhatsappBatch(first, second)
    expect(m.rows).toHaveLength(3)
    expect(m.added).toBe(1)
    expect(m.completed).toBe(2) // la segunda completa el alumno de Lucía y el nombre del 622…
    const lucia = m.rows.find((r) => r.phone === '611111111')!
    expect(lucia.whatsappName).toBe('Lucía mamá') // se conserva el primero
    expect(lucia.studentHint).toBe('Lucía G.')
    expect(lucia.seenIn).toBe(2)
    expect(m.conflicts.join(' ')).toContain('Lucía')
    expect(m.rows.find((r) => r.phone === '622222222')!.whatsappName).toBe('Marcos')
  })
  it('propuestas: teléfono conocido → vincular; solo nombre → posible (pendiente); nada → crear si hay nombre y teléfono; duplicado de pendiente → omitir', () => {
    const rows = fromWhatsappAi([
      { whatsappName: 'Jenni', phone: '600 000 001' },
      { whatsappName: 'Jennifer', phone: null },
      { whatsappName: 'Persona nueva', phone: '699 999 999' },
      { whatsappName: 'Ya pendiente', phone: '655 555 555' },
    ])
    const contacts = [contact({ id: 'a', name: 'Madre de Eric', phone: '+34 600000001' }), contact({ id: 'b', name: 'Jennifer' })]
    const props = proposeWhatsapp(rows, contacts, new Set(['655555555']), [])
    expect(props[0]).toMatchObject({ suggested: 'vincular', suggestedContactId: 'a' })
    expect(props[1].suggested).toBe('pendiente') // coincide solo por nombre: se propone, no se aplica
    expect(props[1].candidates[0]).toMatchObject({ by: 'nombre' })
    expect(props[2].suggested).toBe('crear')
    expect(props[3]).toMatchObject({ suggested: 'omitir', alreadyPending: true })
  })
  it('un contacto sin teléfono y sin coincidencia no se crea solo: queda pendiente de identificar', () => {
    const [p] = proposeWhatsapp(fromWhatsappAi([{ whatsappName: 'Papá de Leo' }]), [], new Set(), [])
    expect(p.suggested).toBe('pendiente')
  })
  it('el alumno sugerido solo se enlaza si es único e inequívoco', () => {
    const list = [person({ id: '1', name: 'Eric', surname: 'García' }), person({ id: '2', name: 'Lucas', surname: 'Alonso' }), person({ id: '3', name: 'Lucas', surname: 'Bravo' })]
    expect(matchStudent('Eric', list)?.id).toBe('1')
    expect(matchStudent('Lucas', list)).toBeNull() // dos Lucas: ambiguo
    expect(matchStudent('Lucas Bravo', list)?.id).toBe('3')
    expect(matchStudent('Nadie', list)).toBeNull()
    expect(matchStudent('Eric', [person({ id: '9', name: 'Eric', leftAt: '2026-01-01' })])).toBeNull()
  })
  it('nombre inicial de un contacto nuevo: quita solo adornos del final', () => {
    expect(suggestContactName('Mamá de Eric ❤️', null)).toBe('Mamá de Eric')
    expect(suggestContactName(null, '612345678')).toBe('612345678')
  })
})
