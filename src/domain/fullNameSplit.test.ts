import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectOrder, splitFullNames } from '@/domain/fullNameSplit'
import { findNameFixes, interpretTable, parseParticipantsText, type ImportRow } from '@/domain/participantImport'
import type { Participant } from '@/domain/groups'

const rowsOf = (...names: string[]): ImportRow[] => names.map((name, i) => ({ key: `k${i}`, name, surname: null, guardianName: null, phone: null, email: null, doubts: [] }))

describe('«Nombre Apellidos» sin coma: se propone, nunca se impone', () => {
  it('una lista de clase ordenada por la primera palabra se lee «Apellidos Nombre», con vista previa y sin dudas en las filas normales', () => {
    const r = parseParticipantsText(
      ['Aboutaleb Bassry Seifeddine', 'Garcia Lopez Eric', 'Martinez Ruiz Lucia', 'Mellado Vintila Beatriz', 'Navarro Perez Hugo', 'Pons Soler Marta', 'Vidal Ortega Pablo'].join('\n'),
    )
    expect(r.rows.map((x) => [x.name, x.surname])).toEqual([
      ['Seifeddine', 'Aboutaleb Bassry'],
      ['Eric', 'Garcia Lopez'],
      ['Lucia', 'Martinez Ruiz'],
      ['Beatriz', 'Mellado Vintila'],
      ['Hugo', 'Navarro Perez'],
      ['Marta', 'Pons Soler'],
      ['Pablo', 'Vidal Ortega'],
    ])
    expect(r.rows.every((x) => x.doubts.length === 0)).toBe(true)
    expect(r.notices.join(' ')).toMatch(/Nombre y apellidos sin coma.*«Apellidos Nombre».*alfabéticamente/)
  })
  it('«Eric García Pérez» y «Lucía Martínez Ruiz»: nombre de pila conocido al principio → «Nombre Apellidos»', () => {
    const r = parseParticipantsText('Eric García Pérez\nLucía Martínez Ruiz\nPablo de la Cruz Soler')
    expect(r.rows.map((x) => [x.name, x.surname])).toEqual([
      ['Eric', 'García Pérez'],
      ['Lucía', 'Martínez Ruiz'],
      ['Pablo', 'de la Cruz Soler'],
    ])
  })
  it('un nombre compuesto o una línea larga NO se da por buena: se separa como propuesta y se pide confirmación', () => {
    const r = parseParticipantsText('María José García\nEric García Pérez\nPablo Ruiz')
    const mj = r.rows[0]
    expect(`${mj.name} | ${mj.surname}`).toBe('María José | García')
    expect(mj.doubts.join(' ')).toMatch(/Compruébalo/)
    expect(r.rows[1].doubts).toEqual([])
    const largo = splitFullNames(rowsOf('Juan Carlos Pérez de la Torre Gómez')).rows[0]
    expect(largo.doubts.length).toBe(1)
  })
  it('sin ninguna pista y una sola línea desconocida: se deja tal cual (no se inventa)', () => {
    const r = splitFullNames(rowsOf('Seifeddine'))
    expect(r.rows[0].surname).toBeNull()
    expect(r.notices).toEqual([])
  })
  it('un nombre exótico sin pistas se propone pero queda marcado para confirmar', () => {
    const r = splitFullNames(rowsOf('Zzyx Qwrt'), 'auto').rows[0]
    expect(r.surname).toBe('Qwrt')
    expect(r.doubts.length).toBe(1)
  })
  it('si la lista ya trae apellidos o madre/padre, no se toca nada', () => {
    const t = interpretTable([['Nombre', 'Apellidos'], ['Eric', 'García Pérez'], ['Ana María', 'López']])
    expect(t.rows.map((x) => [x.name, x.surname])).toEqual([['Eric', 'García Pérez'], ['Ana María', 'López']])
    const g = parseParticipantsText('Eric García\tJennifer\nLucía Martínez\tAna')
    expect(g.rows.map((x) => [x.name, x.surname, x.guardianName])).toEqual([['Eric García', null, 'Jennifer'], ['Lucía Martínez', null, 'Ana']])
  })
  it('volver a leer con otro criterio o «No separar» restaura el texto original', () => {
    const first = splitFullNames(rowsOf('Eric García', 'Lucía Martínez'), 'auto')
    expect(first.rows[0].fullName).toBe('Eric García')
    const flipped = splitFullNames(first.rows, 'surnames-first').rows
    expect(flipped.map((x) => [x.name, x.surname])).toEqual([['García', 'Eric'], ['Martínez', 'Lucía']])
    const none = splitFullNames(flipped, 'none').rows
    expect(none.map((x) => [x.name, x.surname, x.fullName])).toEqual([['Eric García', null, undefined], ['Lucía Martínez', null, undefined]])
  })
  it('detecta el orden por el alfabeto o por los nombres de pila', () => {
    const sorted = ['Abad Sara', 'Blanco Leo', 'Campos Ana', 'Diaz Pau', 'Egea Mar', 'Fuentes Eva', 'Gil Iker'].map((full) => ({ full }))
    expect(detectOrder(sorted)).toMatchObject({ order: 'surnames-first', strong: true })
    expect(detectOrder([{ full: 'Eric Zapata' }, { full: 'Ana Bravo' }, { full: 'Hugo Alba' }, { full: 'Marta Cano' }])).toMatchObject({ order: 'names-first' })
  })
})

describe('fichas ya guardadas «Nombre Apellidos»: solo propuesta, nunca marcada de antemano', () => {
  const p = (id: string, name: string, over: Partial<Participant> = {}): Participant => ({ id, groupId: 'g', name, surname: null, guardianName: null, phone: null, email: null, payerAlias: null, notes: null, leftAt: null, createdAt: '2026-01-01', personId: null, ...over })
  it('propone como dudoso y no toca fichas con apellidos', () => {
    const fixes = findNameFixes([p('1', 'Eric García Pérez'), p('2', 'Lucía Martínez')])
    expect(fixes.map((f) => [f.participantId, f.confidence, f.to.name, f.to.surname])).toEqual([
      ['1', 'dudoso', 'Eric', 'García Pérez'],
      ['2', 'dudoso', 'Lucía', 'Martínez'],
    ])
    expect(findNameFixes([p('1', 'Eric García Pérez'), p('3', 'Ana', { surname: 'Ruiz' })])).toEqual([])
  })
  it('las fichas «Apellidos, Nombre» de la clase se siguen proponiendo como seguras (no cambia)', () => {
    const fixes = findNameFixes([p('1', 'Aboutaleb Bassry, Seifeddine'), p('2', 'Mellado Vintila, Beatriz')])
    expect(fixes.every((f) => f.confidence === 'seguro')).toBe(true)
  })
})

describe('datos comunes sincronizados entre grupos (migración 0358)', () => {
  const sql = readFileSync('supabase/migrations/0358_group_person_sync.sql', 'utf8')
  it('solo se igualan nombre, apellidos, teléfono y correo; lo propio de cada grupo no se toca', () => {
    expect(sql).toMatch(/set name = new\.name, surname = new\.surname, phone = new\.phone, email = new\.email/)
    const upd = /update group_participants s[\s\S]*?;/.exec(sql.replace(/--.*$/gm, ''))![0]
    for (const col of ['notes', 'payer_alias', 'guardian_name', 'left_at', 'group_id']) expect(upd).not.toMatch(new RegExp(`\\b${col}\\b`))
  })
  it('no se puede enlazar con una ficha ajena adivinando su id, ni propagar en cadena', () => {
    expect(sql).toMatch(/person_sheet_ok\(new\.person_id\)/)
    expect(sql).toMatch(/pg_trigger_depth\(\) > 1/)
  })
  it('tiene su reversión', () => {
    expect(readFileSync('supabase/rollbacks/0358_group_person_sync_down.sql', 'utf8')).toMatch(/drop trigger/)
  })
})
