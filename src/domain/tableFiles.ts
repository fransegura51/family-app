// Archivos de tabla SIN librerías: Excel (.xlsx) y PDF. Dominio puro (devuelven bytes): la descarga o el menú de compartir viven en services/.
// Excel: un ZIP «sin comprimir» (método 0) con las partes mínimas de un libro de una hoja; los textos van en línea (inlineStr), por lo que no hace falta tabla de cadenas.
// PDF: texto en Helvetica con codificación WinAnsi (acentos y eñes del español), tabla con cabecera, ajuste de línea y cambio de página.

// ------------------------------------------------------------------------------------------------------------------ ZIP (sin comprimir)
let CRC_TABLE: Uint32Array | null = null
function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const push = (b: Uint8Array) => {
    chunks.push(b)
    offset += b.length
  }
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // nombres UTF-8
    local.setUint32(14, crc, true)
    local.setUint32(18, f.data.length, true)
    local.setUint32(22, f.data.length, true)
    local.setUint16(26, name.length, true)
    const headerOffset = offset
    push(new Uint8Array(local.buffer))
    push(name)
    push(f.data)
    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true)
    cd.setUint16(6, 20, true)
    cd.setUint16(8, 0x0800, true)
    cd.setUint32(16, crc, true)
    cd.setUint32(20, f.data.length, true)
    cd.setUint32(24, f.data.length, true)
    cd.setUint16(28, name.length, true)
    cd.setUint32(42, headerOffset, true)
    central.push(new Uint8Array(cd.buffer), name)
  }
  const cdStart = offset
  for (const c of central) push(c)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, offset - cdStart, true)
  end.setUint32(16, cdStart, true)
  push(new Uint8Array(end.buffer))
  const out = new Uint8Array(offset)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

const xmlEsc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')

function colName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** Libro de Excel de una hoja con la primera fila como cabecera. Todo se guarda como TEXTO (un teléfono «0612…» no pierde sus ceros ni se interpreta como fórmula). */
export function writeXlsx(sheetName: string, rows: string[][]): Uint8Array {
  const enc = new TextEncoder()
  const sheetRows = rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === '' ? '' : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`)).join('')}</row>`)
    .join('')
  const widths = rows[0]?.map((_, ci) => Math.min(48, Math.max(10, ...rows.map((r) => (r[ci] ?? '').length + 2)))) ?? []
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  const files: [string, string][] = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Hoja1')}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${sheetRows}</sheetData></worksheet>`],
  ]
  return zipStore(files.map(([name, text]) => ({ name, data: enc.encode(text) })))
}

// ------------------------------------------------------------------------------------------------------------------ PDF
const WIN_ANSI_EXTRA: Record<number, number> = { 0x20ac: 0x80, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2026: 0x85 }

function winAnsiBytes(s: string): number[] {
  const out: number[] = []
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0) ?? 63
    let b = c < 256 ? c : WIN_ANSI_EXTRA[c] ?? 63
    if (b < 32) b = 32
    if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c) // ( ) \ se escapan
    out.push(b)
  }
  return out
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (let w of words) {
    while (w.length > maxChars) {
      if (line) {
        lines.push(line)
        line = ''
      }
      lines.push(w.slice(0, maxChars))
      w = w.slice(maxChars)
    }
    if (!line) line = w
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

/** PDF con un título y una tabla (primera fila = cabecera). Apaisado si hay más de 4 columnas. */
export function writePdf(title: string, rows: string[][], subtitle = ''): Uint8Array {
  const landscape = (rows[0]?.length ?? 0) > 4
  const W = landscape ? 842 : 595
  const H = landscape ? 595 : 842
  const M = 40
  const SIZE = 10
  const LINE = 13
  const CHAR = SIZE * 0.52 // ancho medio de un carácter de Helvetica
  const cols = rows[0]?.length ?? 1
  const avail = W - 2 * M
  const natural = Array.from({ length: cols }, (_, ci) => Math.max(6, ...rows.map((r) => Math.min(60, (r[ci] ?? '').length))) * CHAR + 10)
  const total = natural.reduce((a, b) => a + b, 0)
  const widths = total > avail ? natural.map((w) => (w * avail) / total) : natural

  const pages: string[][] = [[]]
  let y = H - M
  const cur = () => pages[pages.length - 1]
  const text = (font: 'F1' | 'F2', size: number, x: number, yy: number, s: string) => {
    const bytes = winAnsiBytes(s)
    cur().push(`BT /${font} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${String.fromCharCode(...bytes)}) Tj ET`)
  }
  text('F2', 14, M, y - 6, title)
  y -= 24
  if (subtitle) {
    text('F1', 9, M, y, subtitle)
    y -= 16
  }
  const drawRow = (r: string[], bold: boolean) => {
    const wrapped = r.map((cell, ci) => wrapText(cell ?? '', Math.max(3, Math.floor((widths[ci] - 8) / CHAR))))
    const lines = Math.max(...wrapped.map((w) => w.length))
    const h = lines * LINE + 6
    if (y - h < M) {
      pages.push([])
      y = H - M
      if (!bold) drawRow(rows[0], true)
    }
    let x = M
    wrapped.forEach((w, ci) => {
      w.forEach((l, li) => text(bold ? 'F2' : 'F1', SIZE, x + 3, y - 10 - li * LINE, l))
      x += widths[ci]
    })
    cur().push(`0.8 G ${M} ${(y - h).toFixed(1)} m ${(M + widths.reduce((a, b) => a + b, 0)).toFixed(1)} ${(y - h).toFixed(1)} l S`)
    y -= h
  }
  rows.forEach((r, i) => drawRow(r, i === 0))

  // Objetos: 1 catálogo, 2 páginas, 3 fuente normal, 4 fuente negrita, luego (página, contenido) por cada página.
  const objs: (Uint8Array | string)[] = []
  const kids: number[] = []
  pages.forEach((_, i) => kids.push(5 + i * 2))
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  pages.forEach((p, i) => {
    const content = p.join('\n')
    const bytes = new Uint8Array(content.length)
    for (let k = 0; k < content.length; k++) bytes[k] = content.charCodeAt(k) & 0xff
    objs[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`
    const head = new TextEncoder().encode(`<< /Length ${bytes.length} >>\nstream\n`)
    const tail = new TextEncoder().encode('\nendstream')
    const all = new Uint8Array(head.length + bytes.length + tail.length)
    all.set(head, 0)
    all.set(bytes, head.length)
    all.set(tail, head.length + bytes.length)
    objs[6 + i * 2] = all
  })

  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let pos = 0
  const add = (b: Uint8Array) => {
    parts.push(b)
    pos += b.length
  }
  const ascii = (s: string) => new TextEncoder().encode(s)
  add(ascii('%PDF-1.4\n'))
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = pos
    add(ascii(`${i} 0 obj\n`))
    const o = objs[i]
    add(typeof o === 'string' ? ascii(o) : o)
    add(ascii('\nendobj\n'))
  }
  const xref = pos
  add(ascii(`xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')))
  add(ascii(`trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`))
  const out = new Uint8Array(pos)
  let p = 0
  for (const c of parts) {
    out.set(c, p)
    p += c.length
  }
  return out
}
