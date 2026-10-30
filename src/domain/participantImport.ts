// Importar participantes de un grupo (texto pegado, CSV, Excel, o lo que lea la IA de una foto o un PDF). Dominio puro.
// Regla: NO se inventa nada. Cada dato va a su campo solo si está claro (cabecera conocida, o tipo evidente: teléfono, correo); lo dudoso se marca para revisar.
// Los duplicados se detectan y se ofrece COMPLETAR la ficha existente; nunca se fusiona nada automáticamente.
import { foldText, participantName, type Participant } from '@/domain/groups'

export interface ImportRow {
  /** Identificador estable dentro de la vista previa. */
  key: string
  name: string
  surname: string | null
  guardianName: string | null
  phone: string | null
  email: string | null
  /** Motivos por los que la fila pide revisión (vacío = clara). */
  doubts: string[]
}

export type ImportColumn = 'name' | 'surname' | 'guardian' | 'phone' | 'email'

export interface ImportResult {
  rows: ImportRow[]
  /** Avisos generales (p. ej. «Sin cabecera: he supuesto…»). */
  notices: string[]
}

// ---------------------------------------------------------------------------------------------- teléfonos y correos
export interface PhoneParse {
  phone: string | null
  doubt: string | null
}

/** Normaliza un teléfono: españoles a 9 dígitos (sin +34), internacionales con «+». Lo que no cuadra se devuelve igualmente limpio pero marcado como dudoso. */
export function parsePhone(raw: string): PhoneParse {
  const s = raw.trim()
  if (!s) return { phone: null, doubt: null }
  const intl = /^\s*(\+|00)/.test(s)
  let digits = s.replace(/\D/g, '')
  if (s.trim().startsWith('00')) digits = digits.replace(/^00/, '')
  if (intl && digits.startsWith('34') && digits.length === 11) digits = digits.slice(2)
  if (/^[6-9]\d{8}$/.test(digits)) return { phone: digits, doubt: null }
  if (intl && digits.length >= 8 && digits.length <= 15) return { phone: `+${digits}`, doubt: null }
  if (digits.length === 0) return { phone: null, doubt: null }
  return { phone: digits.length >= 6 && digits.length <= 15 ? digits : null, doubt: `Teléfono dudoso: «${s}»` }
}

const PHONE_IN_TEXT = /(?:\+|00)?\d[\d .\-()]{6,}\d/g
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

function isEmailCell(c: string): boolean {
  return new RegExp(`^${EMAIL_RE.source}$`).test(c.trim())
}
function isPhoneCell(c: string): boolean {
  const t = c.trim()
  return t.length > 0 && /^[+\d][\d .\-()/]*$/.test(t) && t.replace(/\D/g, '').length >= 7
}

// ---------------------------------------------------------------------------------------------- nombres
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'dos', 'van', 'von', 'di'])

/** «ERIC GARCÍA PÉREZ» → «Eric García Pérez»; si ya viene con minúsculas, se respeta tal cual (nombres compuestos, acentos, «de la»…). */
export function tidyName(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim()
  if (!s) return ''
  const letters = s.replace(/[^\p{L}]/gu, '')
  const shouting = letters.length > 2 && letters === letters.toUpperCase()
  const lowered = letters.length > 1 && letters === letters.toLowerCase()
  if (!shouting && !lowered) return s
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && PARTICLES.has(w) ? w : w.replace(/(^|[-'’])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())))
    .join(' ')
}

// ---------------------------------------------------------------------------------------------- tabla
const HEADER_WORDS: Record<ImportColumn, string[]> = {
  name: ['nombre', 'alumno', 'alumna', 'alumnos', 'nino', 'nina', 'ninos', 'participante', 'participantes', 'hijo', 'hija', 'jugador', 'jugadora', 'integrante', 'socio', 'socia', 'estudiante', 'menor', 'chaval'],
  surname: ['apellido', 'apellidos'],
  guardian: ['madre', 'padre', 'tutor', 'tutora', 'tutores', 'responsable', 'progenitor', 'progenitora', 'familiar', 'mama', 'papa', 'contacto', 'padres', 'familia', 'representante'],
  phone: ['telefono', 'tel', 'tlf', 'tlfno', 'movil', 'celular', 'whatsapp', 'telf'],
  email: ['email', 'correo', 'mail', 'e-mail', 'electronico'],
}

function headerColumn(cell: string): ImportColumn | null {
  const toks = foldText(cell).replace(/[^a-z0-9\- ]/g, ' ').split(/\s+/).filter(Boolean)
  if (toks.length === 0) return null
  // Teléfono/correo ganan sobre «madre»: «Teléfono madre» es un teléfono.
  for (const col of ['phone', 'email', 'surname', 'guardian', 'name'] as ImportColumn[]) {
    if (toks.some((t) => HEADER_WORDS[col].includes(t))) return col
  }
  return null
}

/**
 * «Aboutaleb Bassry, Seifeddine» → apellidos «Aboutaleb Bassry», nombre «Seifeddine». Solo se separa cuando hay UNA coma con texto a los dos lados: es el formato
 * «Apellidos, Nombre». Sin coma NO se adivina dónde acaban los nombres y empiezan los apellidos (nombres y apellidos compuestos): se deja tal cual para revisar.
 */
export function splitSurnameFirst(raw: string): { name: string; surname: string } | null {
  const parts = raw.split(',')
  if (parts.length !== 2) return null
  const surname = parts[0].replace(/\s+/g, ' ').trim()
  const name = parts[1].replace(/\s+/g, ' ').trim()
  if (!surname || !name || !/\p{L}/u.test(surname) || !/\p{L}/u.test(name)) return null
  return { name: tidyName(name), surname: tidyName(surname) }
}

export type NameOrder = 'auto' | 'surname-first' | 'name-first'

export interface SplitCellsResult {
  cells: string[][]
  /** Con qué se separaron las columnas (null = una sola columna por línea). */
  delimiter: 'tab' | 'semicolon' | 'pipe' | 'comma' | null
}

/** Separa un texto en celdas. Prioridad: tabulador, «;», «|»; la coma solo si todas las líneas tienen el mismo número de columnas. */
export function splitCells(text: string): string[][] {
  return splitCellsDetailed(text).cells
}

export function splitCellsDetailed(text: string): SplitCellsResult {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { cells: [], delimiter: null }
  const pick = (re: RegExp, strict: boolean): RegExp | null => {
    const counts = lines.map((l) => l.split(re).length)
    const multi = counts.filter((c) => c > 1).length
    if (multi === 0) return null
    if (strict && new Set(counts).size !== 1) return null
    return multi >= Math.ceil(lines.length * 0.6) ? re : null
  }
  const found: [RegExp, SplitCellsResult['delimiter']][] = [
    [/\t/, 'tab'],
    [/;/, 'semicolon'],
    [/\|/, 'pipe'],
    [/,(?=(?:[^"]*"[^"]*")*[^"]*$)/, 'comma'],
  ]
  for (const [re, name] of found) {
    const delim = pick(re, name === 'comma')
    if (delim) return { cells: lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim())), delimiter: name }
  }
  return { cells: lines.map((l) => [l.trim()]), delimiter: null }
}

let keySeq = 0
const nextKey = () => `imp-${++keySeq}`

/**
 * Interpreta filas de celdas. Con cabecera conocida se respeta; sin cabecera se usa el contenido (teléfono, correo) y el orden (nombre, luego madre/padre).
 */
export function interpretTable(cells: string[][], opts: { surnameFirst?: boolean } = {}): ImportResult {
  const notices: string[] = []
  const rowsIn = cells.map((r) => r.map((c) => (c ?? '').toString().trim())).filter((r) => r.some((c) => c))
  if (rowsIn.length === 0) return { rows: [], notices }

  // Cabecera: la primera fila si al menos una celda es un nombre de columna conocido y ninguna parece teléfono/correo.
  let mapping: (ImportColumn | null)[] | null = null
  const first = rowsIn[0]
  const firstCols = first.map(headerColumn)
  if (firstCols.some((c) => c) && !first.some((c) => isPhoneCell(c) || isEmailCell(c))) {
    mapping = firstCols
    rowsIn.shift()
  }

  const out: ImportRow[] = []
  let assumed = false
  for (const r of rowsIn) {
    const row: ImportRow = { key: nextKey(), name: '', surname: null, guardianName: null, phone: null, email: null, doubts: [] }
    const texts: string[] = []
    const phones: string[] = []
    r.forEach((cell, i) => {
      if (!cell) return
      const col = mapping ? mapping[i] ?? null : null
      if (col === 'phone') phones.push(...(cell.match(PHONE_IN_TEXT) ?? [cell]))
      else if (col === 'email') row.email = row.email ?? cell
      else if (col === 'name') {
        // Una coma dentro de la columna de nombre es «Apellidos, Nombre».
        const sp = !row.name && !row.surname ? splitSurnameFirst(cell) : null
        if (sp) {
          row.name = sp.name
          row.surname = sp.surname
        } else row.name = row.name ? `${row.name} ${cell}` : cell
      }
      else if (col === 'surname') row.surname = row.surname ? `${row.surname} ${cell}` : cell
      else if (col === 'guardian') row.guardianName = row.guardianName ? `${row.guardianName} ${cell}` : cell
      else if (isEmailCell(cell)) row.email = row.email ?? cell
      else if (isPhoneCell(cell)) phones.push(cell)
      else texts.push(cell)
    })

    // Teléfono o correo metidos dentro de una celda de texto («Eric García 612 345 678»).
    const rest: string[] = []
    for (const t of texts) {
      let s = t
      const em = s.match(EMAIL_RE)
      if (em) {
        row.email = row.email ?? em[0]
        s = s.replace(em[0], ' ')
      }
      const ph = s.match(PHONE_IN_TEXT)
      if (ph) {
        for (const p of ph) {
          if (p.replace(/\D/g, '').length >= 7) {
            phones.push(p)
            s = s.replace(p, ' ')
          }
        }
      }
      s = s.replace(/[:\-–—,]+\s*$/g, '').replace(/\s+/g, ' ').trim()
      if (s) rest.push(s)
    }
    // Sin cabecera, el orden decide: primero el nombre, luego quien responde.
    if (!mapping) {
      const sp = rest.length === 1 || (rest.length === 2 && opts.surnameFirst) ? splitSurnameFirst(rest.join(', ')) : null
      if (sp) {
        row.name = sp.name
        row.surname = sp.surname
      } else if (rest.length >= 1) row.name = rest[0]
      if (!sp && rest.length >= 2) {
        row.guardianName = rest[1]
        assumed = true
      }
      if (!sp && rest.length > 2) row.doubts.push(`Texto sobrante: «${rest.slice(2).join(' · ')}»`)
    } else if (rest.length) {
      if (!row.name) row.name = rest[0]
      else row.doubts.push(`Texto sin columna conocida: «${rest.join(' · ')}»`)
    }

    row.name = tidyName(row.name)
    row.surname = row.surname ? tidyName(row.surname) : null
    if (row.surname && !row.name) row.doubts.push('Falta el nombre')
    row.guardianName = row.guardianName ? tidyName(row.guardianName) : null

    if (phones.length > 0) {
      const p = parsePhone(phones[0])
      row.phone = p.phone
      if (p.doubt) row.doubts.push(p.doubt)
      if (phones.length > 1) row.doubts.push(`Hay más de un teléfono (${phones.slice(1).join(', ')}); se ha usado el primero`)
    }
    if (row.email && !isEmailCell(row.email)) {
      row.doubts.push(`Correo dudoso: «${row.email}»`)
    }
    if (!row.name) {
      row.doubts.push('Falta el nombre')
    }
    out.push(row)
  }
  if (!mapping && assumed) notices.push('Sin cabecera de columnas: he supuesto «Nombre · Madre/padre · Teléfono». Revisa que cada dato esté en su sitio antes de importar.')
  return { rows: out, notices }
}

/**
 * Texto pegado o CSV. Una lista sin cabecera con dos textos por línea separados por coma es, casi siempre, «Apellidos, Nombre» (el formato de las listas de clase):
 * se lee así y se AVISA, con la opción de volver a leerla como «Nombre, madre/padre» (order = 'name-first'). Con otras separaciones (tabulador, «;») no se supone nada.
 */
export function parseParticipantsText(text: string, order: NameOrder = 'auto'): ImportResult {
  const { cells, delimiter } = splitCellsDetailed(text)
  let surnameFirst = order === 'surname-first'
  let guessed = false
  if (order === 'auto' && delimiter === 'comma') {
    const first = cells[0] ?? []
    const hasHeader = first.some((c) => headerColumn(c)) && !first.some((c) => isPhoneCell(c) || isEmailCell(c))
    const texts = (r: string[]) => r.filter((c) => c && !isPhoneCell(c) && !isEmailCell(c))
    const body = hasHeader ? cells.slice(1) : cells
    if (!hasHeader && body.length > 0 && body.every((r) => texts(r).length === 2)) {
      surnameFirst = true
      guessed = true
    }
  }
  const result = interpretTable(cells, { surnameFirst })
  if (guessed) result.notices.push('He leído cada línea como «Apellidos, Nombre». Si en tu lista la segunda palabra es la madre o el padre, cámbialo abajo.')
  return result
}

// ---------------------------------------------------------------------------------------------- lo que devuelve la IA (foto o PDF)
export interface AiParticipantRow {
  name?: string | null
  surname?: string | null
  guardian?: string | null
  phone?: string | null
  email?: string | null
  /** La lectura no estaba clara (borroso, tachado, fila cortada). */
  uncertain?: boolean
}

export function fromAiRows(rows: AiParticipantRow[]): ImportResult {
  const out: ImportRow[] = []
  for (const r of rows) {
    const doubts: string[] = []
    const phone = r.phone ? parsePhone(String(r.phone)) : { phone: null, doubt: null }
    if (phone.doubt) doubts.push(phone.doubt)
    const email = r.email ? String(r.email).trim() : null
    if (email && !isEmailCell(email)) doubts.push(`Correo dudoso: «${email}»`)
    let name = tidyName(String(r.name ?? ''))
    let surname = r.surname ? tidyName(String(r.surname)) : null
    // «Apellidos, Nombre» que la lectura dejó junto en una sola celda.
    const sp = !surname ? splitSurnameFirst(name) : null
    if (sp) {
      name = sp.name
      surname = sp.surname
    }
    if (!name) doubts.push('Falta el nombre')
    if (r.uncertain) doubts.push('La lectura de esta fila no estaba clara: compruébala')
    out.push({
      key: nextKey(),
      name,
      surname,
      guardianName: r.guardian ? tidyName(String(r.guardian)) : null,
      phone: phone.phone,
      email: email && isEmailCell(email) ? email : null,
      doubts,
    })
  }
  return { rows: out, notices: [] }
}

// ---------------------------------------------------------------------------------------------- duplicados
export type DuplicateKind = 'telefono' | 'nombre'

export interface DuplicateInfo {
  rowKey: string
  kind: DuplicateKind
  /** Fichas existentes que coinciden. Si hay más de una, la coincidencia es ambigua: se pide elegir, no se fusiona nada. */
  matches: Participant[]
  /** Con una sola coincidencia: datos que la ficha existente no tiene y la fila sí (completar). */
  patch: Partial<Pick<Participant, 'surname' | 'guardianName' | 'phone' | 'email'>>
  /** Datos que ya tiene la ficha existente y la fila trae distintos (no se pisan). */
  conflicts: string[]
}

export function findDuplicates(rows: ImportRow[], existing: Participant[]): DuplicateInfo[] {
  const out: DuplicateInfo[] = []
  const live = existing.filter((p) => !p.leftAt)
  for (const r of rows) {
    const byPhone = r.phone ? live.filter((p) => p.phone && p.phone.replace(/\D/g, '') === r.phone!.replace(/\D/g, '')) : []
    const full = foldText([r.name, r.surname].filter(Boolean).join(' '))
    const byName = full ? live.filter((p) => foldText(participantName(p)) === full) : []
    let kind: DuplicateKind | null = null
    let matches: Participant[] = []
    // Mismo teléfono SOLO es duplicado si además el nombre es compatible: dos hermanos comparten teléfono y son personas distintas.
    const phoneAndName = byPhone.filter((p) => byName.some((n) => n.id === p.id))
    if (phoneAndName.length > 0) {
      kind = 'telefono'
      matches = phoneAndName
    } else if (byName.length > 0) {
      kind = 'nombre'
      matches = byName
    }
    if (!kind) continue
    const patch: DuplicateInfo['patch'] = {}
    const conflicts: string[] = []
    if (matches.length === 1) {
      const m = matches[0]
      const fill = <K extends 'surname' | 'guardianName' | 'phone' | 'email'>(k: K, v: string | null, label: string) => {
        if (!v) return
        if (!m[k]) patch[k] = v as Participant[K]
        else if (foldText(m[k] as string) !== foldText(v)) conflicts.push(`${label}: ya consta «${m[k]}», el archivo trae «${v}»`)
      }
      fill('surname', r.surname, 'Apellidos')
      fill('guardianName', r.guardianName, 'Madre/padre')
      fill('phone', r.phone, 'Teléfono')
      fill('email', r.email, 'Correo')
    }
    out.push({ rowKey: r.key, kind, matches, patch, conflicts })
  }
  return out
}

/** Filas repetidas dentro del propio archivo (mismo nombre completo y mismo teléfono). */
export function findInternalDuplicates(rows: ImportRow[]): Set<string> {
  const seen = new Map<string, string>()
  const dup = new Set<string>()
  for (const r of rows) {
    const k = `${foldText([r.name, r.surname].filter(Boolean).join(' '))}|${(r.phone ?? '').replace(/\D/g, '')}`
    if (!foldText(r.name)) continue
    if (seen.has(k)) dup.add(r.key)
    else seen.set(k, r.key)
  }
  return dup
}

// ---------------------------------------------------------------------------------------------- corregir nombres ya importados
export interface NameFix {
  participantId: string
  /** 'seguro': la coma deja claro «Apellidos, Nombre». 'dudoso': posible orden cambiado; se propone pero NO viene marcado. */
  confidence: 'seguro' | 'dudoso'
  reason: string
  from: { name: string; surname: string | null; guardianName: string | null }
  to: { name: string; surname: string | null; guardianName: string | null }
}

/**
 * Propuestas para arreglar fichas importadas antes de que el importador entendiera «Apellidos, Nombre». Solo toca nombre, apellidos y madre/padre de la MISMA ficha
 * (por tanto no duplica nada ni rompe vínculos, botes o contactos). Nada se aplica sin que la persona lo marque.
 */
export function findNameFixes(list: Participant[]): NameFix[] {
  const out: NameFix[] = []
  for (const p of list) {
    if (p.leftAt) continue
    if (!p.surname) {
      const sp = splitSurnameFirst(p.name)
      if (sp) {
        out.push({
          participantId: p.id,
          confidence: 'seguro',
          reason: `«${p.name}» venía como «Apellidos, Nombre»`,
          from: { name: p.name, surname: null, guardianName: p.guardianName },
          to: { name: sp.name, surname: sp.surname, guardianName: p.guardianName },
        })
        continue
      }
      // «Aboutaleb Bassry» + madre/padre «Seifeddine» (una sola palabra): probablemente eran apellidos y nombre de la misma persona.
      const g = (p.guardianName ?? '').trim()
      if (g && !/\s/.test(g) && /\s/.test(p.name.trim())) {
        out.push({
          participantId: p.id,
          confidence: 'dudoso',
          reason: `¿«${p.name}» son los apellidos y «${g}» el nombre?`,
          from: { name: p.name, surname: null, guardianName: g },
          to: { name: tidyName(g), surname: tidyName(p.name), guardianName: null },
        })
      }
    }
  }
  return out
}
