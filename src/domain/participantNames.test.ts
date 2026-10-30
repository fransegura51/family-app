import { describe, expect, it } from 'vitest'
import type { Participant } from '@/domain/groups'
import { findNameFixes, fromAiRows, interpretTable, parseParticipantsText, splitSurnameFirst } from '@/domain/participantImport'

const person = (over: Partial<Participant>): Participant => ({
  id: 'p1', groupId: 'g1', name: 'X', surname: null, guardianName: null, phone: null, email: null, payerAlias: null, notes: null, leftAt: null, createdAt: '2026-01-01', ...over,
})

describe('BLOQUE 2.1 · nombre y apellidos al importar', () => {
  it('el ejemplo del encargo: «Aboutaleb Bassry, Seifeddine»', () => {
    expect(splitSurnameFirst('Aboutaleb Bassry, Seifeddine')).toEqual({ name: 'Seifeddine', surname: 'Aboutaleb Bassry' })
  })
  it('respeta nombres y apellidos compuestos y acentos', () => {
    expect(splitSurnameFirst('García de la Fuente, María José')).toEqual({ name: 'María José', surname: 'García de la Fuente' })
  })
  it('sin coma, o con más de una, no se inventa ninguna división', () => {
    expect(splitSurnameFirst('Eric García Pérez')).toBeNull()
    expect(splitSurnameFirst('a, b, c')).toBeNull()
    expect(splitSurnameFirst(', Eric')).toBeNull()
  })
  it('texto pegado con comas: «Apellidos, Nombre» y se avisa', () => {
    const r = parseParticipantsText('Aboutaleb Bassry, Seifeddine\nGarcía Pérez, Eric')
    expect(r.rows[0]).toMatchObject({ name: 'Seifeddine', surname: 'Aboutaleb Bassry', guardianName: null })
    expect(r.rows[1]).toMatchObject({ name: 'Eric', surname: 'García Pérez' })
    expect(r.notices.join(' ')).toContain('Apellidos, Nombre')
  })
  it('se puede forzar la otra lectura (nombre, madre/padre)', () => {
    const r = parseParticipantsText('Eric García, Jennifer\nLucía Martínez, Ana', 'name-first')
    expect(r.rows[0]).toMatchObject({ name: 'Eric García', surname: null, guardianName: 'Jennifer' })
  })
  it('con tabulador y teléfono, la coma dentro de la celda sigue siendo «Apellidos, Nombre»', () => {
    const r = parseParticipantsText('Aboutaleb Bassry, Seifeddine\t612 345 678\nLópez Ruiz, Ana\t623 456 789')
    expect(r.rows[0]).toMatchObject({ name: 'Seifeddine', surname: 'Aboutaleb Bassry', phone: '612345678' })
  })
  it('columna «Alumno» de un Excel con «Apellidos, Nombre»', () => {
    const r = interpretTable([['Alumno', 'Teléfono'], ['Aboutaleb Bassry, Seifeddine', '612345678']])
    expect(r.rows[0]).toMatchObject({ name: 'Seifeddine', surname: 'Aboutaleb Bassry', phone: '612345678' })
  })
  it('columnas independientes de nombre y apellidos se respetan', () => {
    const r = parseParticipantsText('Apellidos;Nombre\nAboutaleb Bassry;Seifeddine')
    expect(r.rows[0]).toMatchObject({ name: 'Seifeddine', surname: 'Aboutaleb Bassry' })
  })
  it('«Nombre Apellidos» sin pistas queda junto, para revisar, sin inventar', () => {
    const r = parseParticipantsText('Eric García Pérez\nLucía Martínez')
    expect(r.rows[0]).toMatchObject({ name: 'Eric García Pérez', surname: null })
  })
  it('la lectura de una foto o PDF también separa «Apellidos, Nombre»', () => {
    const r = fromAiRows([{ name: 'Aboutaleb Bassry, Seifeddine' }, { name: 'Eric', surname: 'García' }])
    expect(r.rows[0]).toMatchObject({ name: 'Seifeddine', surname: 'Aboutaleb Bassry' })
    expect(r.rows[1]).toMatchObject({ name: 'Eric', surname: 'García' })
  })
})

describe('BLOQUE 2.1 · corregir participantes ya importados', () => {
  it('coma en el nombre: corrección segura', () => {
    const fixes = findNameFixes([person({ id: 'a', name: 'Aboutaleb Bassry, Seifeddine' })])
    expect(fixes).toHaveLength(1)
    expect(fixes[0]).toMatchObject({ participantId: 'a', confidence: 'seguro', to: { name: 'Seifeddine', surname: 'Aboutaleb Bassry' } })
  })
  it('apellidos en el nombre y el nombre en «madre/padre»: solo propuesta dudosa', () => {
    const fixes = findNameFixes([person({ id: 'b', name: 'Aboutaleb Bassry', guardianName: 'Seifeddine' })])
    expect(fixes[0].confidence).toBe('dudoso')
    expect(fixes[0].to).toEqual({ name: 'Seifeddine', surname: 'Aboutaleb Bassry', guardianName: null })
  })
  it('no toca fichas correctas, con apellidos, con madre/padre de varias palabras o dadas de baja', () => {
    const fixes = findNameFixes([
      person({ id: 'c', name: 'Eric', surname: 'García', guardianName: 'Jennifer' }),
      person({ id: 'd', name: 'Eric García', guardianName: 'Jennifer Hepburn' }),
      person({ id: 'e', name: 'Ana', guardianName: 'Lucía' }),
      person({ id: 'f', name: 'López, Ana', leftAt: '2026-02-01' }),
    ])
    expect(fixes).toEqual([])
  })
})
