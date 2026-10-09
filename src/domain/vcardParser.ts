// Lee el formato .vcf (vCard), el que exportan los Contactos de
// iPhone/iCloud (y prácticamente cualquier agenda) — mismo motivo que
// el parser de .ics: la Contact Picker API que ya usa "Importar del
// teléfono" solo la soportan Chrome/Edge en Android, en iPhone no
// existe ese botón. Petición real: "¿se puede hacer algo similar para
// poder importar contactos desde el iPhone?" — se exportan a un
// archivo .vcf (Contactos → seleccionar todos → Compartir → vCard, o
// desde icloud.com) y se leen aquí igual que ya se hace con el .ics de
// cumpleaños.

export interface ParsedVCard {
  name: string
  phone: string | null
  email: string | null
  birthDate: string | null // YYYY-MM-DD
}

// Mismo plegado de líneas largas que el .ics (RFC 6350 lo hereda de RFC 5545).
function unfold(text: string): string[] {
  const rawLines = text.split(/\r\n|\n|\r/)
  const lines: string[] = []
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

function parseLine(line: string): { name: string; value: string } | null {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return null
  const head = line.slice(0, colonIdx)
  const value = line.slice(colonIdx + 1)
  const name = head.split(';')[0]
  return { name: name.toUpperCase(), value }
}

// PEPA Eventos, prompt maestro Parte A7 — "Guardar en contactos" genera un .vcf a partir de un proveedor,
// dirección contraria a parseVcf de arriba. Escapado inverso de unescapeText (RFC 6350: \, ; y saltos de
// línea). Ficha de EMPRESA (no de persona): FN/ORG llevan el nombre del proveedor; la persona de contacto
// (si la hay) va en NOTE, igual que categoría y notas propias — nunca se inventa un campo que no exista.
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

export function buildVcf(provider: {
  name: string
  type?: string | null
  contactPerson?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  address?: string | null
  notes?: string | null
}): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeText(provider.name)}`, `ORG:${escapeText(provider.name)}`]
  if (provider.phone) lines.push(`TEL;TYPE=WORK,VOICE:${provider.phone}`)
  if (provider.email) lines.push(`EMAIL:${provider.email}`)
  if (provider.website) lines.push(`URL:${provider.website}`)
  if (provider.address) lines.push(`ADR;TYPE=WORK:;;${escapeText(provider.address)};;;;`)
  const noteParts = [
    provider.type ? `Categoría: ${provider.type}` : null,
    provider.contactPerson ? `Contacto: ${provider.contactPerson}` : null,
    provider.notes ?? null,
  ].filter((v): v is string => Boolean(v))
  if (noteParts.length > 0) lines.push(`NOTE:${escapeText(noteParts.join(' — '))}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

export function parseVcf(text: string): ParsedVCard[] {
  const lines = unfold(text)
  const cards: ParsedVCard[] = []
  let current: { name: string | null; phone: string | null; email: string | null; birthDate: string | null } | null = null

  for (const raw of lines) {
    const line = parseLine(raw)
    if (!line) continue

    if (line.name === 'BEGIN' && line.value.toUpperCase() === 'VCARD') {
      current = { name: null, phone: null, email: null, birthDate: null }
      continue
    }
    if (line.name === 'END' && line.value.toUpperCase() === 'VCARD') {
      if (current?.name) {
        cards.push({ name: current.name, phone: current.phone, email: current.email, birthDate: current.birthDate })
      }
      current = null
      continue
    }
    if (!current) continue

    // FN ("nombre completo") manda siempre que exista — es el campo
    // pensado para mostrar, N ("Apellidos;Nombre;...") es solo
    // respaldo si un contacto raro no trajera FN.
    if (line.name === 'FN') {
      current.name = unescapeText(line.value)
    } else if (line.name === 'N' && !current.name) {
      const [family, given] = line.value.split(';')
      const joined = `${given ?? ''} ${family ?? ''}`.trim()
      if (joined) current.name = unescapeText(joined)
    } else if (line.name === 'TEL' && !current.phone) {
      current.phone = line.value.trim()
    } else if (line.name === 'EMAIL' && !current.email) {
      current.email = line.value.trim()
    } else if (line.name === 'BDAY' && !current.birthDate) {
      const m = line.value.trim().match(/^(\d{4})-?(\d{2})-?(\d{2})/)
      if (m) current.birthDate = `${m[1]}-${m[2]}-${m[3]}`
    }
  }

  return cards
}
