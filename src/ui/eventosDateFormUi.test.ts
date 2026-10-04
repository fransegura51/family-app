// Candado de la UX de fecha/hora: un patrón COMÚN (DateTimeStatusFields) para Celebración, Ceremonia y celebración
// y cada momento — fecha, hora opcional, estado, y un único «Guardar fecha». Lee el código real como texto.
import { describe, expect, it } from 'vitest'

const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const RSVP = (import.meta.glob('/supabase/functions/event-rsvp/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/functions/event-rsvp/index.ts']

function slice(start: string, end: string): string {
  const i = SRC.indexOf(start)
  expect(i, start).toBeGreaterThan(-1)
  const j = SRC.indexOf(end, i + start.length)
  expect(j, end).toBeGreaterThan(i)
  return SRC.slice(i, j)
}

const FIELDS = slice('function DateTimeStatusFields(', '// Fecha del evento (Celebración simple')
const EVENT_FIELD = slice('function EventDateField(', '// Lugar registrado (nombre + dirección)')
const MOMENT_FORM = slice('function MomentForm(', '\nfunction MomentCard(')

describe('Patrón común: Fecha → Hora (opcional) → estado', () => {
  it('A. los campos llevan etiqueta visible dentro de <label>, no solo aria-label/placeholder', () => {
    expect(FIELDS).toContain('{DATE_FIELD_LABEL}')
    expect(FIELDS).toContain('{TIME_FIELD_LABEL}')
    expect((FIELDS.match(/<label>/g) ?? []).length).toBe(2)
    expect(FIELDS).not.toContain('aria-label=')
    expect(FIELDS).not.toContain('placeholder')
  })
  it('B. el orden es Fecha, Hora, pregunta de estado y chips', () => {
    const order = ['type="date"', 'type="time"', '{DATE_STATUS_QUESTION}', '<ChoiceRow options={DATE_CHOICES}']
    let last = -1
    for (const marker of order) {
      const idx = FIELDS.indexOf(marker)
      expect(idx, marker).toBeGreaterThan(last)
      last = idx
    }
  })
  it('C. la hora no es obligatoria en ningún sitio (ni required ni valor por defecto)', () => {
    expect(FIELDS).not.toMatch(/required/)
    expect(EVENT_FIELD).not.toMatch(/'00:00'|'12:00'|new Date\(\)/)
    expect(MOMENT_FORM).not.toMatch(/'00:00'|'12:00'/)
  })
  it('13. el MISMO componente lo usan Celebración/Ceremonia y celebración (EventDateField) y cada momento (MomentForm)', () => {
    expect((SRC.match(/function DateTimeStatusFields\(/g) ?? []).length).toBe(1)
    expect(EVENT_FIELD).toContain('<DateTimeStatusFields draft={draft}')
    expect(MOMENT_FORM).toContain('<DateTimeStatusFields')
    // Ya no hay inputs de fecha/hora sueltos en ninguno de los dos
    expect(EVENT_FIELD).not.toContain('<input type="date"')
    expect(MOMENT_FORM).not.toContain('<input type="date"')
    expect(MOMENT_FORM).not.toContain('<input type="time"')
  })
})

describe('«Todavía no lo sabemos» es una ALTERNATIVA a poner una fecha', () => {
  it('va antes y aparte de los campos, no dentro del grupo Provisional/Confirmada', () => {
    expect(EVENT_FIELD.indexOf('Todavía no lo sabemos')).toBeLessThan(EVENT_FIELD.indexOf('<DateTimeStatusFields'))
    expect(FIELDS).not.toContain('Todavía no lo sabemos')
    expect(EVENT_FIELD).not.toContain('DATE_STATUS_CHOICES')
  })
  it('quitar una fecha ya puesta pide confirmación y deja el evento en «pendiente» (misma semántica de siempre)', () => {
    expect(EVENT_FIELD).toContain('window.confirm(')
    expect(EVENT_FIELD).toContain("dateStatus: 'pendiente', eventDate: null, eventTime: null")
  })
  it('tras guardar una fecha, la respuesta «Todavía no lo sabemos» anterior deja de ser la activa (estado coherente)', () => {
    expect(EVENT_FIELD).toContain('await onDateSaved()')
    expect(SRC).toContain('if (previous) await deleteEventDecision(previous.id)')
    expect(SRC).toContain('todavia={!event.eventDate && decisions.some((d) => d.questionKey === CELEBRATION_DATE_QUESTION_KEY)}')
  })
})

describe('Guardar fecha — una sola operación, con validación', () => {
  it('pulsar Provisional/Confirmada solo cambia el borrador: no escribe nada', () => {
    expect(FIELDS).not.toMatch(/updateEvent|upsert/)
    expect(EVENT_FIELD).not.toContain('updateEvent(event.id, { dateStatus: next })')
  })
  it('Guardar fecha valida (sin fecha / sin estado) y escribe fecha + hora + estado juntos', () => {
    const save = slice('function saveDate() {', '  const label = dateWithStatusLabel')
    expect(save).toContain('validateDateDraft(draft)')
    expect(save).toContain('setError(problem)')
    expect((save.match(/updateEvent\(/g) ?? []).length).toBe(1)
    expect(save).toContain('updateEvent(event.id, dateDraftToPatch(draft))')
  })
  it('el botón solo se desactiva cuando hay una fecha guardada y no se ha cambiado nada (sin fecha sigue pulsable para dar la validación)', () => {
    expect(EVENT_FIELD).toContain('disabled={saving || (!dirty && Boolean(event.eventDate))}')
  })
  it('las tareas relativas se recalculan solo si el DÍA cambia (cambiar estado u hora no las toca)', () => {
    expect(EVENT_FIELD).toContain('if (draft.date !== event.eventDate) await recalculateAutoTasks(event.id, event.type, draft.date)')
  })
  it('un momento: si hay fecha, exige estado; sin fecha el estado queda null; hora vacía = null', () => {
    expect(MOMENT_FORM).toContain('if (momentDate && !dateStatus) {')
    expect(MOMENT_FORM).toContain('dateStatus: momentDate ? dateStatus : null')
    expect(MOMENT_FORM).toContain('momentTime: momentTime || null,')
  })
})

describe('No se toca lo demás', () => {
  it('la fecha principal sigue derivándose de los momentos (misma regla) y se sincroniza tras cada cambio', () => {
    expect((SRC.match(/await syncOperationalDateFromMoments\(event\.id\)/g) ?? []).length).toBe(3)
  })
  it('la invitación pública sigue marcando «(fecha provisional)» y no inventa hora', () => {
    expect(RSVP).toContain('(fecha provisional)')
    expect(RSVP).toContain('event.event_time ? ` a las ${event.event_time.slice(0, 5)}` : ""')
  })
  it('no se toca el sistema de lugares ni los servicios incluidos', () => {
    expect(SRC).toContain("{ value: 'en_casa', label: 'En casa' }")
    expect(SRC).toContain("{ value: 'restaurante_local', label: 'Restaurante / local' }")
    expect(SRC).toContain('<VenueServicesQuestion')
  })
})
