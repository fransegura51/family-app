// Formato de lo que se comparte con el botón nativo "Compartir" (petición
// real: "el típico botón de compartir que se le abra el menú del teléfono
// para compartir por donde quiera", no un chat propio). Todo aquí es
// texto puro, sin tocar el navegador (Web Share API vive en
// services/share.ts) — así se puede probar con tests normales.

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function icsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function icsDateOnly(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function addToIso(iso: string, deltaMs: number): string {
  return new Date(new Date(iso).getTime() + deltaMs).toISOString()
}

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

// Un evento concreto, para que quien lo reciba pueda darle "Añadir al
// calendario" en el suyo — no tiene por qué usar esta app (petición
// real: "no tiene por qué ser de nuestra app"). Por eso se manda siempre
// como una cita suelta, sin RRULE: aunque el original se repita, lo que
// se comparte es esa ocurrencia concreta, con su propio UID nuevo (no el
// de la app, para no arrastrar recordatorios ni miembros que no le
// sirven a quien lo recibe).
export function icsForEvent(event: {
  title: string
  startAt: string // ISO
  endAt: string | null // ISO
  allDay: boolean
  description?: string | null
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Family App//Evento compartido//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@family-app.fransegura51.github.io`,
    `SUMMARY:${icsEscape(event.title)}`,
  ]
  if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`)
  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${icsDateOnly(event.startAt)}`)
    lines.push(`DTEND;VALUE=DATE:${icsDateOnly(addToIso(event.startAt, DAY_MS))}`)
  } else {
    lines.push(`DTSTART:${icsUtc(event.startAt)}`)
    lines.push(`DTEND:${icsUtc(event.endAt ?? addToIso(event.startAt, HOUR_MS))}`)
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

function vEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

// Un contacto suelto — reutilizable para compartir uno o para
// concatenar varios BEGIN/END VCARD seguidos (vCardForContacts), que es
// formato válido y lo entienden tanto Contactos de iPhone como Android.
export function vCardForContact(contact: { name: string; phone: string | null; email: string | null }): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vEscape(contact.name)}`, `N:${vEscape(contact.name)};;;;`]
  if (contact.phone) lines.push(`TEL;TYPE=CELL:${contact.phone}`)
  if (contact.email) lines.push(`EMAIL:${contact.email}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

export function vCardForContacts(contacts: { name: string; phone: string | null; email: string | null }[]): string {
  return contacts.map(vCardForContact).join('\r\n') + '\r\n'
}

// Petición real: "compartir la lista de una tienda o de todas, que se
// pueda elegir en el momento de compartir" — texto plano legible en
// cualquier app de mensajería, agrupado igual que ya se ve en pantalla.
export function shoppingListText(
  groups: { store: string; items: { name: string; quantity: string | null; unit: string | null }[] }[],
): string {
  const parts = ['🛒 Lista de la compra']
  for (const g of groups) {
    if (g.items.length === 0) continue
    parts.push('', `— ${g.store} —`)
    for (const it of g.items) {
      const qty = [it.quantity, it.unit].filter(Boolean).join(' ')
      parts.push(`• ${it.name}${qty ? ` (${qty})` : ''}`)
    }
  }
  return parts.join('\n')
}

export function recipeText(recipe: {
  title: string
  ingredients: { name: string; quantity: string | null; unit: string | null }[]
  notes: string | null
}): string {
  const parts = [`🍽️ ${recipe.title}`]
  if (recipe.ingredients.length > 0) {
    parts.push('', 'Ingredientes:')
    for (const i of recipe.ingredients) {
      const qty = [i.quantity, i.unit].filter(Boolean).join(' ')
      parts.push(`• ${i.name}${qty ? ` — ${qty}` : ''}`)
    }
  }
  if (recipe.notes?.trim()) {
    parts.push('', 'Preparación:', recipe.notes.trim())
  }
  return parts.join('\n')
}
