// Gestión de grupos: carpetas, botes, Bizum, informes de WhatsApp e importación de participantes (lógica pura).
import { describe, expect, it } from 'vitest'
import { organizeGroups, participantName, schoolYearLabel, type GroupFolder, type GroupItem, type Participant } from '@/domain/groups'
import {
  buildDetailedReport,
  buildFundReport,
  closeWarnings,
  fmtEuro,
  isClearMatch,
  splitEvenly,
  suggestPayerMatches,
  summarizeFund,
  type FundEntry,
  type FundMemberInput,
} from '@/domain/groupFunds'
import { findDuplicates, findInternalDuplicates, fromAiRows, parsePhone, parseParticipantsText, tidyName } from '@/domain/participantImport'

const g = (id: string, name: string, extra: Partial<GroupItem> = {}): GroupItem => ({
  id,
  nameFormat: 'full',
  sortBy: 'name',
  contactSharePresets: [],
  familyId: 'f',
  name,
  periodLabel: null,
  createdBy: 'u',
  archivedAt: null,
  copiedFrom: null,
  createdAt: '2026-01-01',
  folderId: null,
  ...extra,
})
const folders: GroupFolder[] = [
  { id: 'f1', name: 'Cole', sortOrder: 2 },
  { id: 'f2', name: 'Guardería', sortOrder: 1 },
]
const p = (id: string, name: string, extra: Partial<Participant> = {}): Participant => ({
  id,
  groupId: 'g',
  name,
  surname: null,
  guardianName: null,
  phone: null,
  email: null,
  payerAlias: null,
  notes: null,
  leftAt: null,
  createdAt: '2026-01-01',
  ...extra,
})

describe('carpetas y grupos', () => {
  const groups = [g('1', 'Clase de Eric', { folderId: 'f1' }), g('2', 'Clase de Fernando', { folderId: 'f2' }), g('3', 'Equipo de fútbol'), g('4', 'Clase antigua', { archivedAt: '2026-06-30', folderId: 'f1' })]
  it('las carpetas van ordenadas, los grupos sin carpeta quedan sueltos y los archivados aparte', () => {
    const h = organizeGroups(groups, folders)
    expect(h.folders.map((x) => x.folder.name)).toEqual(['Guardería', 'Cole'])
    expect(h.folders[1].groups.map((x) => x.id)).toEqual(['1'])
    expect(h.loose.map((x) => x.id)).toEqual(['3'])
    expect(h.archived.map((x) => x.id)).toEqual(['4'])
  })
  it('un grupo colocado en una carpeta que ya no existe vuelve a la pantalla principal (borrar una carpeta no pierde grupos)', () => {
    const h = organizeGroups([g('9', 'Huérfano', { folderId: 'borrada' })], folders)
    expect(h.loose.map((x) => x.id)).toEqual(['9'])
  })
  it('la búsqueda ignora acentos y mayúsculas y oculta carpetas sin coincidencias', () => {
    const h = organizeGroups(groups, folders, 'FUTBOL')
    expect(h.loose.map((x) => x.id)).toEqual(['3'])
    expect(h.folders).toHaveLength(0)
    expect(organizeGroups(groups, folders, 'fernando').folders.map((x) => x.folder.id)).toEqual(['f2'])
  })
  it('curso escolar', () => {
    expect(schoolYearLabel(new Date(2026, 9, 29))).toBe('2026/27')
    expect(schoolYearLabel(new Date(2027, 2, 1))).toBe('2026/27')
  })
})

describe('bote: recaudado, pendiente y participación independiente', () => {
  const cfg = { contributionType: 'igual' as const, defaultAmount: 10 }
  const members: FundMemberInput[] = [
    { participantId: 'a', state: 'participa', requiredAmount: null },
    { participantId: 'b', state: 'participa', requiredAmount: null },
    { participantId: 'c', state: 'exento', requiredAmount: null },
    { participantId: 'd', state: 'no_participa', requiredAmount: null },
    { participantId: 'e', state: 'participa', requiredAmount: 15 },
  ]
  it('pagos completos, parciales, pendientes, exentos y fuera', () => {
    const entries = [
      { id: 'e1', kind: 'aportacion' as const, amount: 10, voided: false },
      { id: 'e2', kind: 'aportacion' as const, amount: 4, voided: false },
    ]
    const s = summarizeFund(cfg, members, entries, [
      { entryId: 'e1', participantId: 'a', amount: 10 },
      { entryId: 'e2', participantId: 'b', amount: 4 },
    ])
    const by = Object.fromEntries(s.rows.map((r) => [r.participantId, r]))
    expect(by.a.status).toBe('pagado')
    expect(by.b.status).toBe('parcial')
    expect(by.b.pending).toBe(6)
    expect(by.c.status).toBe('exento')
    expect(by.d.status).toBe('no_participa')
    expect(by.e.status).toBe('pendiente')
    expect(by.e.required).toBe(15)
    expect(s.expected).toBe(35)
    expect(s.collected).toBe(14)
    expect(s.pending).toBe(21)
    expect(s.balance).toBe(14)
  })
  it('un pago superior al exigido figura como pagó de más y no genera pendiente', () => {
    const s = summarizeFund(cfg, [members[0]], [{ id: 'x', kind: 'aportacion', amount: 12, voided: false }], [{ entryId: 'x', participantId: 'a', amount: 12 }])
    expect(s.rows[0].status).toBe('sobrepago')
    expect(s.rows[0].surplus).toBe(2)
    expect(s.pending).toBe(0)
  })
  it('un Bizum para dos hermanos se reparte sin contar el dinero dos veces', () => {
    const s = summarizeFund(cfg, [members[0], members[1]], [{ id: 'x', kind: 'aportacion', amount: 20, voided: false }], [
      { entryId: 'x', participantId: 'a', amount: 10 },
      { entryId: 'x', participantId: 'b', amount: 10 },
    ])
    expect(s.collected).toBe(20)
    expect(s.balance).toBe(20)
    expect(s.counts.pagado).toBe(2)
    expect(splitEvenly(20, 2)).toEqual([10, 10])
    expect(splitEvenly(10, 3)).toEqual([3.34, 3.33, 3.33])
  })
  it('un ingreso sin identificar suma al saldo pero no marca a nadie como pagado', () => {
    const s = summarizeFund(cfg, [members[0]], [{ id: 'x', kind: 'aportacion', amount: 10, voided: false }], [])
    expect(s.balance).toBe(10)
    expect(s.unidentified).toBe(10)
    expect(s.rows[0].status).toBe('pendiente')
    expect(s.pending).toBe(10)
  })
  it('modificar lo exigido recalcula lo pendiente sin tocar los apuntes', () => {
    const entries = [{ id: 'x', kind: 'aportacion' as const, amount: 10, voided: false }]
    const alloc = [{ entryId: 'x', participantId: 'a', amount: 10 }]
    expect(summarizeFund(cfg, [{ ...members[0], requiredAmount: 25 }], entries, alloc).pending).toBe(15)
    expect(summarizeFund(cfg, [{ ...members[0], requiredAmount: 5 }], entries, alloc).rows[0].status).toBe('sobrepago')
  })
  it('lo anulado no cuenta; gastos, devoluciones y traspasos restan; traspasos recibidos suman', () => {
    const entries = [
      { id: '1', kind: 'aportacion' as const, amount: 100, voided: false },
      { id: '2', kind: 'aportacion' as const, amount: 50, voided: true },
      { id: '3', kind: 'gasto' as const, amount: 30, voided: false },
      { id: '4', kind: 'devolucion' as const, amount: 10, voided: false },
      { id: '5', kind: 'traspaso_out' as const, amount: 5, voided: false },
      { id: '6', kind: 'traspaso_in' as const, amount: 20, voided: false },
    ]
    const s = summarizeFund(cfg, [], entries, [])
    expect(s.collected).toBe(100)
    expect(s.spent).toBe(45)
    expect(s.transferredIn).toBe(20)
    expect(s.balance).toBe(75)
  })
  it('voluntaria: nadie debe nada', () => {
    const s = summarizeFund({ contributionType: 'voluntaria', defaultAmount: null }, [members[0], members[1]], [{ id: 'x', kind: 'aportacion', amount: 5, voided: false }], [{ entryId: 'x', participantId: 'a', amount: 5 }])
    expect(s.pending).toBe(0)
    expect(s.rows.map((r) => r.status)).toEqual(['aporto', 'sin_aportar'])
  })
  it('céntimos exactos', () => {
    const s = summarizeFund({ contributionType: 'igual', defaultAmount: 0.1 }, [members[0]], [{ id: 'x', kind: 'aportacion', amount: 0.3, voided: false }], [{ entryId: 'x', participantId: 'a', amount: 0.3 }])
    expect(s.rows[0].surplus).toBe(0.2)
    expect(s.balance).toBe(0.3)
  })
})

describe('Bizum: sugerir sin asignar', () => {
  const list = [p('1', 'Eric', { surname: 'García', guardianName: 'Jennifer Hepburn', payerAlias: 'J Hepburn; Jenni H' }), p('2', 'Lucía', { surname: 'Martínez', guardianName: 'Ana Martínez' }), p('3', 'Hugo', { guardianName: 'Ana' })]
  it('coincidencia por alias guardado', () => {
    const c = suggestPayerMatches('Bizum de J Hepburn', list)
    expect(c[0]).toMatchObject({ participantId: '1', reason: 'alias' })
    expect(isClearMatch(c)).toBe(true)
  })
  it('por nombre de la madre/padre', () => {
    const c = suggestPayerMatches('BIZUM DE ANA MARTINEZ', list)
    expect(c[0].participantId).toBe('2')
    expect(c[0].reason).toBe('tutor')
    expect(isClearMatch(c)).toBe(false)
  })
  it('un nombre suelto y ambiguo no se propone como claro', () => {
    const c = suggestPayerMatches('Ana', list)
    expect(c.every((x) => x.score < 0.7)).toBe(true)
    expect(isClearMatch(c)).toBe(false)
  })
  it('sin coincidencias, nada', () => {
    expect(suggestPayerMatches('Pedro Ruiz', list)).toEqual([])
    expect(suggestPayerMatches('', list)).toEqual([])
  })
})

describe('informes para WhatsApp', () => {
  const cfg = { contributionType: 'igual' as const, defaultAmount: 10 }
  const people = [p('a', 'Eric', { surname: 'García', phone: '612345678', payerAlias: 'secreto' }), p('b', 'Lucía', { email: 'x@y.es' }), p('c', 'Hugo')]
  const members: FundMemberInput[] = people.map((x) => ({ participantId: x.id, state: 'participa' as const, requiredAmount: null }))
  const s = summarizeFund(cfg, members, [{ id: 'e', kind: 'aportacion', amount: 14, voided: false }], [
    { entryId: 'e', participantId: 'a', amount: 10 },
    { entryId: 'e', participantId: 'b', amount: 4 },
  ])
  const rows = people.map((x, i) => ({ name: participantName(x), row: s.rows[i] }))
  it('pendientes: nombres de los niños, importes, sin teléfonos ni correos ni alias', () => {
    const t = buildFundReport('pendientes', 'Excursión', s, rows)
    expect(t).toContain('*Excursión*')
    expect(t).toContain('• Lucía — faltan 6 € (ya pagó 4 €)')
    expect(t).toContain('• Hugo — 10 €')
    expect(t).not.toContain('Eric')
    expect(t).toContain('Pendientes de pago (2 de 3)')
    for (const secret of ['612345678', 'x@y.es', 'secreto']) expect(t).not.toContain(secret)
  })
  it('pagados y resumen', () => {
    expect(buildFundReport('pagados', 'Excursión', s, rows)).toContain('• Eric García')
    const r = buildFundReport('resumen', 'Excursión', s, rows)
    expect(r).toContain('Previsto: 30 €')
    expect(r).toContain('Recaudado: 14 €')
    expect(r).toContain('Saldo disponible: 14 €')
  })
  it('todo cobrado', () => {
    const done = summarizeFund(cfg, [members[0]], [{ id: 'e', kind: 'aportacion', amount: 10, voided: false }], [{ entryId: 'e', participantId: 'a', amount: 10 }])
    expect(buildFundReport('pendientes', 'X', done, [{ name: 'Eric', row: done.rows[0] }])).toContain('Todo cobrado')
  })
  it('informe detallado: fechas e importes, sin anulados', () => {
    const entries: FundEntry[] = [
      { id: '1', fundId: 'f', kind: 'aportacion', amount: 14, entryDate: '2026-11-02', payerLabel: null, method: 'bizum', concept: null, receiptPath: null, hadReceipt: false, bankTransactionId: null, transferId: null, counterpartFundId: null, voidedAt: null, voidReason: null, createdAt: '2026-11-02T10:00' },
      { id: '2', fundId: 'f', kind: 'gasto', amount: 9.5, entryDate: '2026-11-05', payerLabel: null, method: null, concept: 'Entradas', receiptPath: 'g/a.jpg', hadReceipt: false, bankTransactionId: null, transferId: null, counterpartFundId: null, voidedAt: null, voidReason: null, createdAt: '2026-11-05T10:00' },
      { id: '3', fundId: 'f', kind: 'gasto', amount: 99, entryDate: '2026-11-06', payerLabel: null, method: null, concept: 'Error', receiptPath: null, hadReceipt: false, bankTransactionId: null, transferId: null, counterpartFundId: null, voidedAt: '2026-11-06', voidReason: 'x', createdAt: '2026-11-06T10:00' },
    ]
    const t = buildDetailedReport('Excursión', s, entries)
    expect(t).toContain('02/11 Aportación: +14 €')
    expect(t).toContain('05/11 Gasto (Entradas): −9,50 € 🧾')
    expect(t).not.toContain('Error')
  })
  it('avisos antes de cerrar', () => {
    const w = closeWarnings(s)
    expect(w.join(' ')).toContain('2 personas tienen pagos pendientes')
    expect(w.join(' ')).toContain('saldo de 14 €')
  })
  it('formato de euros', () => {
    expect(fmtEuro(10)).toBe('10 €')
    expect(fmtEuro(9.5)).toBe('9,50 €')
  })
})

describe('importar participantes', () => {
  it('el ejemplo del encargo: alumno, madre/padre y teléfono', () => {
    const r = parseParticipantsText('Alumno\tMadre/padre\tTeléfono\nEric García\tJennifer\t612 345 678\nLucía Martínez\tAna\t623 456 789')
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toMatchObject({ name: 'Eric García', guardianName: 'Jennifer', phone: '612345678' })
    expect(r.rows[1]).toMatchObject({ name: 'Lucía Martínez', guardianName: 'Ana', phone: '623456789' })
    expect(r.rows.every((x) => x.doubts.length === 0)).toBe(true)
    expect(r.notices).toEqual([])
  })
  it('CSV con punto y coma y columnas en otro orden, con apellidos y correo', () => {
    const r = parseParticipantsText('Teléfono;Nombre;Apellidos;Correo;Tutor\n+34 611 22 33 44;José Ángel;Núñez de la Torre;ja@example.com;María')
    expect(r.rows[0]).toMatchObject({ name: 'José Ángel', surname: 'Núñez de la Torre', phone: '611223344', email: 'ja@example.com', guardianName: 'María' })
  })
  it('CSV con comas', () => {
    const r = parseParticipantsText('Nombre,Teléfono\nEric,612345678\nLucía,623456789')
    expect(r.rows.map((x) => x.phone)).toEqual(['612345678', '623456789'])
  })
  it('líneas sueltas con el teléfono dentro del texto', () => {
    const r = parseParticipantsText('Eric García 612 345 678\nLucía Martínez - 623.456.789')
    expect(r.rows[0]).toMatchObject({ name: 'Eric García', phone: '612345678' })
    expect(r.rows[1]).toMatchObject({ name: 'Lucía Martínez', phone: '623456789' })
  })
  it('sin cabecera con nombre y madre/padre: se avisa de la suposición', () => {
    const r = parseParticipantsText('Eric García;Jennifer;612345678')
    expect(r.rows[0]).toMatchObject({ name: 'Eric García', guardianName: 'Jennifer', phone: '612345678' })
    expect(r.notices[0]).toContain('Sin cabecera')
  })
  it('lo dudoso se marca y nunca se inventa: teléfono corto, varios teléfonos, sin nombre', () => {
    const r = parseParticipantsText('Nombre;Teléfono\nPedro;1234\nAna;612345678 / 623456789\n;611111111')
    expect(r.rows[0].doubts[0]).toContain('Teléfono dudoso')
    expect(r.rows[1].doubts[0]).toContain('más de un teléfono')
    expect(r.rows[1].phone).toBe('612345678')
    expect(r.rows[2].doubts).toContain('Falta el nombre')
  })
  it('mayúsculas sostenidas se normalizan, y lo ya bien escrito (acentos, partículas) no se toca', () => {
    expect(tidyName('MARÍA DEL CARMEN NÚÑEZ')).toBe('María del Carmen Núñez')
    expect(tidyName('Jean-Pierre de la Fuente')).toBe('Jean-Pierre de la Fuente')
    expect(tidyName("O'NEILL")).toBe("O'Neill")
  })
  it('teléfonos', () => {
    expect(parsePhone('0034 612 345 678').phone).toBe('612345678')
    expect(parsePhone('+34612345678').phone).toBe('612345678')
    expect(parsePhone('+44 7700 900123').phone).toBe('+447700900123')
    expect(parsePhone('12').doubt).toBeTruthy()
    expect(parsePhone('').phone).toBeNull()
  })
  it('lectura de IA: filas dudosas piden revisión', () => {
    const r = fromAiRows([
      { name: 'ERIC GARCÍA', guardian: 'jennifer', phone: '612 345 678' },
      { name: 'Lucía', phone: '99', uncertain: true },
    ])
    expect(r.rows[0]).toMatchObject({ name: 'Eric García', guardianName: 'Jennifer', phone: '612345678' })
    expect(r.rows[1].doubts.length).toBe(2)
  })
  it('duplicados: completar la ficha existente sin pisar nada; ambiguos sin fusionar', () => {
    const existing = [p('1', 'Eric García', { phone: null, guardianName: 'Jennifer' }), p('2', 'Ana López'), p('3', 'Ana López')]
    const rows = parseParticipantsText('Nombre;Madre;Teléfono\nEric García;Otra persona;612345678\nAna López;X;600000000\nNuevo;Y;611111111').rows
    const d = findDuplicates(rows, existing)
    expect(d).toHaveLength(2)
    const eric = d.find((x) => x.rowKey === rows[0].key)!
    expect(eric.matches).toHaveLength(1)
    expect(eric.patch).toEqual({ phone: '612345678' })
    expect(eric.conflicts[0]).toContain('Madre/padre')
    const ana = d.find((x) => x.rowKey === rows[1].key)!
    expect(ana.matches).toHaveLength(2)
    expect(ana.patch).toEqual({})
  })
  it('dos hermanos con el mismo teléfono no son duplicados; los dados de baja no cuentan', () => {
    const existing = [p('1', 'Eric', { phone: '612345678' }), p('2', 'Baja', { leftAt: '2026-01-01' })]
    const rows = parseParticipantsText('Nombre;Teléfono\nHermana de Eric;612345678\nBaja;600000000').rows
    expect(findDuplicates(rows, existing)).toEqual([])
  })
  it('repetidos dentro del archivo', () => {
    const rows = parseParticipantsText('Nombre;Teléfono\nEric;612345678\nERIC;612 345 678\nLucía;623456789').rows
    expect([...findInternalDuplicates(rows)]).toEqual([rows[1].key])
  })
})
