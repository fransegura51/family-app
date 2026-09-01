// Lee el formato .ics (iCalendar, RFC 5545) que exportan Google
// Calendar, Outlook, Apple/iPhone y prácticamente cualquier calendario —
// un único parser sirve para todos los proveedores, porque todos usan
// el mismo estándar de texto plano. Deliberadamente no cubre el 100% de
// la especificación (que es enorme): interpreta bien los casos
// habituales de un calendario personal y, ante algo raro, se queda con
// la mejor aproximación en vez de fallar entero.

export interface ParsedIcsEvent {
  uid: string
  title: string
  startAt: string // ISO
  endAt: string | null // ISO
  allDay: boolean
  recurrenceRule: string | null // formato interno (RRULE-lite), no el RRULE crudo del .ics
}

// Las líneas largas vienen "plegadas" en varias líneas físicas — una
// continuación empieza con un espacio o tabulador y hay que unirla a la
// anterior antes de poder leer nada.
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

// "PROP;PARAM1=X;PARAM2=Y:valor" -> { name: 'PROP', params: {...}, value: 'valor' }
function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return null
  const head = line.slice(0, colonIdx)
  const value = line.slice(colonIdx + 1)
  const [name, ...paramParts] = head.split(';')
  const params: Record<string, string> = {}
  for (const p of paramParts) {
    const [k, v] = p.split('=')
    if (k && v) params[k.toUpperCase()] = v
  }
  return { name: name.toUpperCase(), params, value }
}

// "20260914T180000Z" / "20260914T180000" / "20260920" (solo fecha, todo
// el día) -> ISO. Las horas "flotantes" (sin Z ni TZID reconocible) se
// tratan como hora local del navegador — sin una base de datos de husos
// horarios no hay forma exacta de saberlo, es la mejor aproximación
// razonable para un calendario familiar de una sola zona horaria.
function parseIcsDate(value: string, isDateOnly: boolean): { iso: string; allDay: boolean } | null {
  const v = value.trim()
  if (isDateOnly || /^\d{8}$/.test(v)) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})/)
    if (!m) return null
    const [, y, mo, d] = m
    return { iso: new Date(`${y}-${mo}-${d}T00:00:00`).toISOString(), allDay: true }
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  const iso = z
    ? new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`).toISOString()
    : new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`).toISOString()
  return { iso, allDay: false }
}

// Solo estos 4 los sabe expandir el calendario propio (domain/calendar.ts
// expandOccurrences) — cualquier otro FREQ del .ics (p. ej. HOURLY, o
// reglas con BYMONTHDAY/BYSETPOS complejas) se descarta y el evento se
// trata como uno suelto, en su primera fecha, en vez de arriesgarse a
// expandirlo mal o a que no aparezca ninguna ocurrencia.
const SUPPORTED_FREQ = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])

// El RRULE de un .ics real (p. ej. "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z")
// es casi compatible con el RRULE-lite propio — la única diferencia real
// es el formato de UNTIL (con hora y Z en el .ics, solo fecha aquí). Se
// ignora deliberadamente COUNT (repetir N veces): no hay equivalente en
// el modelo propio, así que esas reglas se expanden sin límite de
// repeticiones (acotado igualmente por el tope de seguridad de
// expandOccurrences, ~10 años) — mejor de más que no expandir nada.
function normalizeIcsRRule(raw: string): string | null {
  const parts = Object.fromEntries(raw.split(';').map((p) => p.split('=') as [string, string]))
  const freq = parts.FREQ
  if (!freq || !SUPPORTED_FREQ.has(freq)) return null

  const out = [`FREQ=${freq}`]
  if (parts.BYDAY) out.push(`BYDAY=${parts.BYDAY}`)
  const interval = Number(parts.INTERVAL)
  if (Number.isFinite(interval) && interval > 1) out.push(`INTERVAL=${interval}`)
  if (parts.UNTIL) {
    const m = parts.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/)
    if (m) out.push(`UNTIL=${m[1]}-${m[2]}-${m[3]}`)
  }
  return out.join(';')
}

export function parseIcs(icsText: string): ParsedIcsEvent[] {
  const lines = unfold(icsText)
  const events: ParsedIcsEvent[] = []
  let current: Record<string, { params: Record<string, string>; value: string }> | null = null

  for (const rawLine of lines) {
    const line = parseLine(rawLine)
    if (!line) continue

    if (line.name === 'BEGIN' && line.value === 'VEVENT') {
      current = {}
      continue
    }
    if (line.name === 'END' && line.value === 'VEVENT') {
      if (current) {
        const uid = current.UID?.value ?? crypto.randomUUID()
        const summary = current.SUMMARY ? unescapeText(current.SUMMARY.value) : '(sin título)'
        const dtstart = current.DTSTART
        if (dtstart) {
          const start = parseIcsDate(dtstart.value, dtstart.params.VALUE === 'DATE')
          if (start) {
            const dtend = current.DTEND
            const end = dtend ? parseIcsDate(dtend.value, dtend.params.VALUE === 'DATE') : null
            const recurrenceRule = current.RRULE ? normalizeIcsRRule(current.RRULE.value) : null
            events.push({
              uid,
              title: summary,
              startAt: start.iso,
              endAt: end ? end.iso : null,
              allDay: start.allDay,
              recurrenceRule,
            })
          }
        }
      }
      current = null
      continue
    }
    if (current && line.name) {
      current[line.name] = { params: line.params, value: line.value }
    }
  }

  return events
}
