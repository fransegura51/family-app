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
