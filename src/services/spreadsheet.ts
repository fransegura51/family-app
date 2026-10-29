// Lectura de hojas de cálculo para importar participantes, SIN añadir librerías: un .xlsx es un ZIP con XML; se descomprime con DecompressionStream (disponible en Safari 16.4+,
// Chrome y Firefox actuales) y se leen las celdas con expresiones regulares. Solo se lee la primera hoja. Los .xls antiguos no se soportan (se pide guardarlos como .xlsx o .csv).

export class SpreadsheetError extends Error {}

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8)
}
function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new SpreadsheetError('Este navegador no puede abrir Excel. Guarda el archivo como CSV o pega el texto.')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  offset: number
}

/** Lista las entradas de un ZIP leyendo su directorio central. */
export function listZip(bytes: Uint8Array): ZipEntry[] {
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new SpreadsheetError('El archivo no es un Excel (.xlsx) válido.')
  const count = u16(bytes, eocd + 10)
  let p = u32(bytes, eocd + 16)
  const out: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (u32(bytes, p) !== 0x02014b50) break
    const method = u16(bytes, p + 10)
    const compressedSize = u32(bytes, p + 20)
    const nameLen = u16(bytes, p + 28)
    const extraLen = u16(bytes, p + 30)
    const commentLen = u16(bytes, p + 32)
    const offset = u32(bytes, p + 42)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    out.push({ name, method, compressedSize, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

async function readEntry(bytes: Uint8Array, e: ZipEntry): Promise<string> {
  const o = e.offset
  if (u32(bytes, o) !== 0x04034b50) throw new SpreadsheetError('El archivo Excel está dañado.')
  const start = o + 30 + u16(bytes, o + 26) + u16(bytes, o + 28)
  const raw = bytes.subarray(start, start + e.compressedSize)
  const data = e.method === 0 ? raw : e.method === 8 ? await inflateRaw(raw) : null
  if (!data) throw new SpreadsheetError('El archivo Excel usa una compresión no soportada.')
  return new TextDecoder('utf-8').decode(data)
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
}

function textOf(xml: string): string {
  const parts = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]))
  return parts.join('')
}

function colIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/) ?? ['A'])[0]
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Una celda numérica se muestra como entero si lo es (los teléfonos vienen como número). */
function numberText(v: string): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return v
  return Number.isInteger(n) ? String(n) : v
}

/** Lee la primera hoja de un .xlsx y devuelve sus filas como texto. */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer)
  const entries = listZip(bytes)
  const byName = new Map(entries.map((e) => [e.name, e]))
  const sheets = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => Number(a.name.match(/(\d+)\.xml$/)![1]) - Number(b.name.match(/(\d+)\.xml$/)![1]))
  if (sheets.length === 0) throw new SpreadsheetError('No encuentro ninguna hoja en el Excel.')
  const shared: string[] = []
  const ss = byName.get('xl/sharedStrings.xml')
  if (ss) {
    const xml = await readEntry(bytes, ss)
    for (const m of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]))
  }
  const sheetXml = await readEntry(bytes, sheets[0])
  const rows: string[][] = []
  for (const rm of sheetXml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    for (const cm of rm[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]
      const body = cm[2] ?? ''
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) ?? [])[1]
      const type = (attrs.match(/\bt="(\w+)"/) ?? [])[1]
      const idx = ref ? colIndex(ref) : row.length
      let value = ''
      if (type === 's') value = shared[Number((body.match(/<v>(\d+)<\/v>/) ?? [])[1])] ?? ''
      else if (type === 'inlineStr') value = textOf(body)
      else if (type === 'str') value = unescapeXml((body.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1] ?? '')
      else value = numberText(unescapeXml((body.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1] ?? ''))
      while (row.length < idx) row.push('')
      row[idx] = value.trim()
    }
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c))
}

/** Texto de un CSV/TXT: UTF-8 y, si trae caracteres rotos, Windows-1252 (lo que guarda Excel en español). */
export function decodeCsv(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  return new TextDecoder('windows-1252').decode(buffer)
}

export type SpreadsheetKind = 'xlsx' | 'text' | 'unsupported'

export function spreadsheetKind(file: { name: string; type?: string }): SpreadsheetKind {
  const n = file.name.toLowerCase()
  if (n.endsWith('.xlsx') || n.endsWith('.xlsm')) return 'xlsx'
  if (n.endsWith('.csv') || n.endsWith('.tsv') || n.endsWith('.txt')) return 'text'
  if (n.endsWith('.xls') || n.endsWith('.ods')) return 'unsupported'
  return 'text'
}
