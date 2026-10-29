// Lectura de Excel sin librerías: se construye un .xlsx mínimo en la prueba (ZIP con XML) y se comprueba que los teléfonos numéricos, los acentos y las celdas vacías salen bien.
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeCsv, readXlsx, spreadsheetKind } from '@/services/spreadsheet'
import { interpretTable } from '@/domain/participantImport'

function zip(files: Record<string, string>, deflate = true): ArrayBuffer {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const le = (n: number, bytes: number) => Array.from({ length: bytes }, (_, i) => (n >>> (8 * i)) & 0xff)
  for (const [name, text] of Object.entries(files)) {
    const nameB = enc.encode(name)
    const raw = enc.encode(text)
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw
    const method = deflate ? 8 : 0
    const local = new Uint8Array([...le(0x04034b50, 4), ...le(20, 2), ...le(0, 2), ...le(method, 2), ...le(0, 4), ...le(0, 4), ...le(data.length, 4), ...le(raw.length, 4), ...le(nameB.length, 2), ...le(0, 2), ...nameB, ...data])
    const cen = new Uint8Array([...le(0x02014b50, 4), ...le(20, 2), ...le(20, 2), ...le(0, 2), ...le(method, 2), ...le(0, 4), ...le(0, 4), ...le(data.length, 4), ...le(raw.length, 4), ...le(nameB.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(offset, 4), ...nameB])
    locals.push(local)
    central.push(cen)
    offset += local.length
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array([...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2), ...le(central.length, 2), ...le(central.length, 2), ...le(cdSize, 4), ...le(offset, 4), ...le(0, 2)])
  const all = new Uint8Array([...locals.flatMap((l) => [...l]), ...central.flatMap((c) => [...c]), ...eocd])
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer
}

const SHARED = `<?xml version="1.0"?><sst><si><t>Alumno</t></si><si><t>Madre/padre</t></si><si><t>Teléfono</t></si><si><t>Eric García</t></si><si><t>Jennifer</t></si><si><r><t>Lucía </t></r><r><t>Martínez</t></r></si><si><t>Ana &amp; Co</t></si></sst>`
const SHEET = `<?xml version="1.0"?><worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2"><v>612345678</v></c></row>
<row r="3"><c r="A3" t="s"><v>5</v></c><c r="C3"><v>623456789</v></c></row>
<row r="4"><c r="A4" t="inlineStr"><is><t>Pedro</t></is></c><c r="B4" t="s"><v>6</v></c></row>
</sheetData></worksheet>`

describe('lectura de Excel', () => {
  for (const deflate of [true, false]) {
    it(`lee la primera hoja (${deflate ? 'comprimido' : 'sin comprimir'}): textos compartidos, teléfonos numéricos, huecos y entidades`, async () => {
      const rows = await readXlsx(zip({ 'xl/sharedStrings.xml': SHARED, 'xl/worksheets/sheet1.xml': SHEET, 'xl/worksheets/sheet2.xml': '<worksheet/>' }, deflate))
      expect(rows[0]).toEqual(['Alumno', 'Madre/padre', 'Teléfono'])
      expect(rows[1]).toEqual(['Eric García', 'Jennifer', '612345678'])
      expect(rows[2]).toEqual(['Lucía Martínez', '', '623456789']) // la celda B3 no existe: queda vacía y el teléfono NO se corre de columna
      expect(rows[3]).toEqual(['Pedro', 'Ana & Co'])
    })
  }
  it('el resultado alimenta la importación con nombres, madre/padre y teléfono bien relacionados', async () => {
    const rows = await readXlsx(zip({ 'xl/sharedStrings.xml': SHARED, 'xl/worksheets/sheet1.xml': SHEET }))
    const r = interpretTable(rows)
    expect(r.rows[0]).toMatchObject({ name: 'Eric García', guardianName: 'Jennifer', phone: '612345678' })
    expect(r.rows[1]).toMatchObject({ name: 'Lucía Martínez', guardianName: null, phone: '623456789' })
  })
  it('un archivo que no es Excel da un error claro', async () => {
    await expect(readXlsx(new TextEncoder().encode('hola').buffer as ArrayBuffer)).rejects.toThrow(/no es un Excel/)
  })
  it('sin hojas', async () => {
    await expect(readXlsx(zip({ 'otra.xml': '<a/>' }))).rejects.toThrow(/ninguna hoja/)
  })
  it('CSV de Excel en Windows-1252 (acentos) y con BOM', () => {
    const latin = new Uint8Array([0x4d, 0x61, 0x72, 0xed, 0x61]) // «María» en Windows-1252
    expect(decodeCsv(latin.buffer as ArrayBuffer)).toBe('María')
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x41])
    expect(decodeCsv(bom.buffer as ArrayBuffer)).toBe('A')
  })
  it('tipos de archivo', () => {
    expect(spreadsheetKind({ name: 'Clase.XLSX' })).toBe('xlsx')
    expect(spreadsheetKind({ name: 'lista.csv' })).toBe('text')
    expect(spreadsheetKind({ name: 'viejo.xls' })).toBe('unsupported')
  })
})
