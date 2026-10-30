import { describe, expect, it } from 'vitest'
import { applyContactMerge, findContactCandidates, hasPatch, planContactMerge, samePhone } from '@/domain/contactsModel'
import { buildContactEntries, cleanPresets, emailsOnly, renderContactShare, toCsv, toWhatsAppText, type LinkedContactRow, type ShareConfig } from '@/domain/contactShare'
import { displayNames, makeNamer, sortByPrefs } from '@/domain/groupNames'
import type { Participant } from '@/domain/groups'
import { findPersonMatches, groupKnownPeople, reusedParticipantData } from '@/domain/participantMatch'
import { writePdf, writeXlsx } from '@/domain/tableFiles'
import type { Contact } from '@/domain/types'
import { readXlsx } from '@/services/spreadsheet'

const person = (over: Partial<Participant>): Participant => ({
  id: 'p', groupId: 'g1', name: 'X', surname: null, guardianName: null, phone: null, email: null, payerAlias: null, notes: null, leftAt: null, createdAt: '2026-01-01', ...over,
})
const contact = (over: Partial<Contact>): Contact => ({
  id: 'c1', familyId: 'f', name: 'Jennifer', category: 'Colegio', phone: null, email: null, notes: null, birthDate: null, birthdayFavorite: false, ...over,
})

describe('BLOQUE 1.3 · datos nuevos de un contacto que ya existe', () => {
  it('sin teléfono y con identidad confirmada: se añade solo', () => {
    const plan = planContactMerge(contact({}), { phone: '612 345 678' }, true)
    expect(plan.auto.phone).toBe('612 345 678')
    expect(plan.conflicts).toEqual([])
  })
  it('sin teléfono pero identidad SIN confirmar: no se aplica nada solo', () => {
    const plan = planContactMerge(contact({}), { phone: '612345678' }, false)
    expect(plan.auto).toEqual({})
    expect(plan.identityUnconfirmed).toBe(true)
    expect(hasPatch(plan.auto)).toBe(false)
  })
  it('con otro teléfono: pregunta y NUNCA sobrescribe por defecto', () => {
    const c = contact({ phone: '600111222' })
    const plan = planContactMerge(c, { phone: '612345678' }, true)
    expect(plan.auto.phone).toBeUndefined()
    expect(plan.conflicts[0]).toMatchObject({ field: 'phone', options: ['anadir', 'sustituir', 'conservar'] })
    expect(applyContactMerge(c, plan, {})).toEqual({}) // sin decisión = conservar
  })
  it('las tres decisiones: añadir como adicional, sustituir, conservar', () => {
    const c = contact({ phone: '600111222', extraPhones: ['700000000'] })
    const plan = planContactMerge(c, { phone: '612345678' }, true)
    expect(applyContactMerge(c, plan, { phone: 'anadir' }).extraPhones).toEqual(['700000000', '612345678'])
    expect(applyContactMerge(c, plan, { phone: 'sustituir' }).phone).toBe('612345678')
    expect(hasPatch(applyContactMerge(c, plan, { phone: 'conservar' }))).toBe(false)
  })
  it('el mismo teléfono escrito de otra forma no es un conflicto', () => {
    const c = contact({ phone: '612 345 678' })
    expect(samePhone('+34 612345678', '612345678')).toBe(true)
    const plan = planContactMerge(c, { phone: '+34612345678' }, true)
    expect(plan.conflicts).toEqual([])
    expect(plan.same.length).toBe(1)
  })
  it('un correo distinto se pregunta igual que el teléfono; otros datos contradictorios, también', () => {
    const c = contact({ email: 'a@x.es', address: 'Calle Sol 1' })
    const plan = planContactMerge(c, { email: 'b@x.es', address: 'Calle Luna 2', surname: 'Hepburn' }, true)
    expect(plan.auto.surname).toBe('Hepburn')
    expect(plan.conflicts.map((x) => x.field).sort()).toEqual(['address', 'email'])
    expect(applyContactMerge(c, plan, { email: 'anadir', address: 'sustituir' })).toMatchObject({ extraEmails: ['b@x.es'], address: 'Calle Luna 2', surname: 'Hepburn' })
  })
  it('candidatos: teléfono = fuerte, solo nombre = posible', () => {
    const list = [contact({ id: 'a', name: 'Ana', phone: '611111111' }), contact({ id: 'b', name: 'Jennifer', whatsappName: 'Jenni ❤️' })]
    expect(findContactCandidates(list, { phone: '+34 611 111 111' })).toMatchObject([{ by: 'telefono', contact: { id: 'a' } }])
    expect(findContactCandidates(list, { name: 'jennifer' })).toMatchObject([{ by: 'nombre', contact: { id: 'b' } }])
    expect(findContactCandidates(list, { whatsappName: 'Jenni ❤️' })).toMatchObject([{ by: 'nombre', contact: { id: 'b' } }])
  })
})

describe('BLOQUE 5.1 · formato de nombres', () => {
  const list = [
    person({ id: '1', name: 'Eric', surname: 'García' }),
    person({ id: '2', name: 'Lucía', surname: 'Martínez' }),
    person({ id: '3', name: 'Lucas', surname: 'Alonso' }),
    person({ id: '4', name: 'Lucas', surname: 'Bravo' }),
  ]
  it('solo nombre', () => {
    expect([...displayNames(list, 'first').values()]).toEqual(['Eric', 'Lucía', 'Lucas', 'Lucas'])
  })
  it('solo nombre diferenciando repetidos: «Lucas A.» y «Lucas B.»', () => {
    const m = displayNames(list, 'first_unique')
    expect(m.get('1')).toBe('Eric')
    expect(m.get('3')).toBe('Lucas A.')
    expect(m.get('4')).toBe('Lucas B.')
  })
  it('si las iniciales coinciden se amplía el apellido lo necesario', () => {
    const m = displayNames([person({ id: 'a', name: 'Lucas', surname: 'Alonso' }), person({ id: 'b', name: 'Lucas', surname: 'Alvarez' }), person({ id: 'c', name: 'Lucas', surname: 'Bravo' })], 'first_unique')
    expect(m.get('a')).toBe('Lucas Alo.')
    expect(m.get('b')).toBe('Lucas Alv.')
    expect(m.get('c')).toBe('Lucas B.')
    expect(new Set(m.values()).size).toBe(3)
  })
  it('idénticos del todo: se numeran, sin inventar nada', () => {
    const m = displayNames([person({ id: 'a', name: 'Ana' }), person({ id: 'b', name: 'Ana' })], 'first_unique')
    expect([...m.values()]).toEqual(['Ana (1)', 'Ana (2)'])
  })
  it('nombre y apellidos / apellidos, nombre, y orden por apellidos', () => {
    expect(displayNames(list, 'full').get('1')).toBe('Eric García')
    expect(displayNames(list, 'surname_first').get('1')).toBe('García, Eric')
    expect(sortByPrefs(list, 'surname').map((p) => p.id)).toEqual(['3', '4', '1', '2'])
    expect(sortByPrefs(list, 'name').map((p) => p.id)).toEqual(['1', '3', '4', '2'])
    expect(makeNamer(list, { format: 'surname_first', sortBy: 'name' })(list[1])).toBe('Martínez, Lucía')
  })
})

describe('BLOQUE 2.2 · reconocer participantes de otros grupos', () => {
  const clase = { participant: person({ id: 'a', groupId: 'g1', name: 'Pepito', surname: 'García', guardianName: 'Ana', phone: '611111111' }), groupName: 'Clase de Eric' }
  const futbol = { participant: person({ id: 'b', groupId: 'g2', name: 'Pepito', surname: 'García', phone: null }), groupName: 'Fútbol' }
  const otro = { participant: person({ id: 'c', groupId: 'g3', name: 'Pepito', surname: 'García', guardianName: 'Otra' }), groupName: 'Cumple' }

  it('junta las fichas de la misma identidad y enseña todos sus grupos', () => {
    const linked = { participant: { ...futbol.participant, personId: 'a' }, groupName: 'Fútbol' }
    const known = groupKnownPeople([clase, linked, otro], [{ participantId: 'a', name: 'Ana', relation: 'madre' }])
    expect(known).toHaveLength(2) // Pepito (clase + fútbol, misma identidad) y el otro Pepito, que NO se fusiona solo por llamarse igual
    const same = known.find((k) => k.personKey === 'a')!
    expect(same.sheets.map((x) => x.groupName).sort()).toEqual(['Clase de Eric', 'Fútbol'])
    expect(same.linkedContacts).toEqual([{ name: 'Ana', relation: 'madre' }])
  })
  it('coincidencia por nombre completo: muestra grupos, datos que hereda y diferencias; nunca fusiona sola', () => {
    const known = groupKnownPeople([clase, otro])
    const m = findPersonMatches({ name: 'Pepito', surname: 'García', phone: '622222222', guardianName: 'Ana' }, known, 'g9')
    expect(m).toHaveLength(2) // dos fichas distintas con el mismo nombre → dos candidatos, no una fusión
    expect(m[0].person.sheets[0].groupName).toBeTruthy()
    const withDiff = m.find((x) => x.person.reference.id === 'a')!
    expect(withDiff.differences.join(' ')).toContain('Teléfono')
    expect(withDiff.inherits).toEqual([])
  })
  it('mismo nombre y mismo teléfono = coincidencia más fuerte (va primero)', () => {
    const m = findPersonMatches({ name: 'Pepito', surname: 'García', phone: '611 111 111' }, groupKnownPeople([otro, clase]), 'g9')
    expect(m[0].reason).toBe('nombre y teléfono')
    expect(m[0].person.reference.id).toBe('a')
  })
  it('no ofrece reutilizar a quien ya está en el grupo destino', () => {
    expect(findPersonMatches({ name: 'Pepito', surname: 'García' }, groupKnownPeople([clase]), 'g1')).toEqual([])
  })
  it('sin coincidencia de nombre no hay candidatos', () => {
    expect(findPersonMatches({ name: 'Eric', surname: 'García' }, groupKnownPeople([clase]), 'g9')).toEqual([])
  })
  it('al reutilizar solo viajan identidad y datos personales, nunca observaciones ni alias de pago', () => {
    const ref = person({ id: 'a', name: 'Pepito', surname: 'García', guardianName: 'Ana', notes: 'alergia', payerAlias: 'Ana G' })
    const [m] = findPersonMatches({ name: 'Pepito', surname: 'García' }, groupKnownPeople([{ participant: ref, groupName: 'Clase' }]), 'g9')
    const data = reusedParticipantData({ name: 'Pepito', surname: 'García' }, m)
    expect(data).toEqual({ name: 'Pepito', surname: 'García', guardianName: 'Ana', phone: null, email: null, personId: 'a' })
    expect(Object.keys(data)).not.toContain('notes')
    expect(Object.keys(data)).not.toContain('payerAlias')
  })
})

describe('BLOQUE 5.2 · compartir lista de contactos', () => {
  const people = [
    person({ id: '1', name: 'Eric', surname: 'García', guardianName: 'Jennifer', phone: '600000001' }),
    person({ id: '2', name: 'Lucía', surname: 'Martínez' }),
    person({ id: '3', name: 'Marcos', surname: 'Ruiz' }),
  ]
  const links: LinkedContactRow[] = [
    { participantId: '1', contactId: 'c1', relation: 'madre', name: 'Jennifer', surname: 'Hepburn', phone: '611111111', email: 'j@x.es', extraPhones: [], extraEmails: [] },
    { participantId: '1', contactId: 'c2', relation: 'padre', name: 'Paco', surname: null, phone: null, email: null, extraPhones: ['622222222'], extraEmails: [] },
    { participantId: '2', contactId: 'c1', relation: 'madre', name: 'Jennifer', surname: 'Hepburn', phone: '611111111', email: 'j@x.es', extraPhones: [], extraEmails: [] },
  ]
  const cfg = (over: Partial<ShareConfig> = {}): ShareConfig => ({ fields: ['student', 'guardian', 'relation', 'phone', 'email'], excluded: [], skipEmpty: true, dedupe: true, names: { format: 'full', sortBy: 'name' }, ...over })
  const entries = buildContactEntries(people, links)

  it('un alumno con dos contactos sale en dos filas; sin contactos vinculados se usa su ficha', () => {
    const r = renderContactShare(entries, cfg({ skipEmpty: false }))
    expect(r.rows.map((x) => x[0])).toEqual(['Eric García', 'Eric García', 'Lucía Martínez', 'Marcos Ruiz'])
    expect(r.rows[1]).toEqual(['Eric García', 'Paco', 'Padre', '622222222', ''])
  })
  it('excluye filas sin datos, repetidos y filas marcadas', () => {
    const r = renderContactShare(entries, cfg())
    expect(r.skippedEmpty).toBe(1) // Marcos no tiene ningún contacto
    expect(r.rows).toHaveLength(3)
    const r2 = renderContactShare(entries, cfg({ excluded: ['1:c2'] }))
    expect(r2.rows).toHaveLength(2)
  })
  it('elimina duplicados exactos (mismos valores en los campos elegidos)', () => {
    const dup = buildContactEntries([person({ id: 'a', name: 'Ana', surname: 'X' }), person({ id: 'b', name: 'Ana', surname: 'X' })], [])
    const e2 = dup.map((e) => ({ ...e, guardian: 'Mamá', phone: '600' }))
    const r = renderContactShare(e2, cfg({ fields: ['student', 'guardian', 'phone'] }))
    expect(r.rows).toHaveLength(1)
    expect(r.skippedDuplicates).toBe(1)
  })
  it('solo los campos elegidos (nunca notas ni alias) y apellidos del alumno aparte si se piden', () => {
    const r = renderContactShare(entries, cfg({ fields: ['student', 'studentSurname', 'phone'] }))
    expect(r.headers).toEqual(['Nombre del alumno', 'Apellidos del alumno', 'Teléfono'])
    expect(r.rows[0]).toEqual(['Eric', 'García', '611111111'])
    expect(JSON.stringify(r)).not.toContain('alergia')
  })
  it('texto de WhatsApp sin huecos', () => {
    const r = renderContactShare(entries, cfg())
    const t = toWhatsAppText('Contactos de Clase', r, cfg().fields)
    expect(t).toContain('Eric García · Jennifer Hepburn (madre) · 611111111 · j@x.es')
    expect(t).toContain('Eric García · Paco (padre) · 622222222')
  })
  it('solo correos, sin repetir', () => {
    expect(emailsOnly(entries, [])).toEqual(['j@x.es'])
  })
  it('CSV con «;», BOM y protección ante fórmulas', () => {
    const csv = toCsv({ headers: ['A', 'B'], rows: [['=1+1', 'a;b'], ['+34 612345678', 'ok']], skippedEmpty: 0, skippedDuplicates: 0 })
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain("'=1+1;\"a;b\"")
    expect(csv).toContain('+34 612345678;ok')
  })
  it('configuraciones guardadas: se limpian y se ignoran las malas', () => {
    const ok = cleanPresets([{ id: '1', name: 'Emails', fields: ['email', 'zzz'] }, { id: '2', name: 'x', fields: [] }, null, 'x'])
    expect(ok).toEqual([{ id: '1', name: 'Emails', fields: ['email'], skipEmpty: true, dedupe: true }])
  })
})

describe('archivos Excel y PDF sin librerías', () => {
  const rows = [['Nombre', 'Teléfono'], ['Eric García', '0612345678'], ['Ñandú <&> "x"', '']]
  it('el Excel se vuelve a leer igual (ceros iniciales, acentos y caracteres especiales)', async () => {
    const back = await readXlsx(writeXlsx('Contactos', rows).buffer as ArrayBuffer)
    expect(back[0]).toEqual(['Nombre', 'Teléfono'])
    expect(back[1]).toEqual(['Eric García', '0612345678'])
    expect(back[2][0]).toBe('Ñandú <&> "x"')
  })
  it('el PDF tiene estructura válida, acentos en WinAnsi y varias páginas si hace falta', () => {
    const many = [['Nombre', 'Teléfono'], ...Array.from({ length: 120 }, (_, i) => [`Alumno número ${i} Ñ`, `6${String(i).padStart(8, '0')}`])]
    const pdf = writePdf('Contactos (ñ)', many, 'Clase de Eric')
    const text = new TextDecoder('latin1').decode(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(Number(/\/Count (\d+)/.exec(text)?.[1])).toBeGreaterThan(1)
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    expect(text).toContain('Alumno n\xfamero 7')
  })
})
