// Candado de la corrección estructural «alta mínima»: «Nuevo evento» solo identifica el evento (nombre, tipo,
// módulos) y la configuración estructural (edad, fecha con estado, lugar, servicios incluidos) vive en el
// primer bloque del configurador. Lee el código real como texto (sin jsdom), mismo estilo que el resto de
// candados de Eventos: comprueba arquitectura, compatibilidad con eventos antiguos y que nada se destruye.
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SOURCES = import.meta.glob(['/src/ui/EventosScreen.tsx', '/src/ui/AyudaScreen.tsx', '/src/data/events.ts', '/supabase/functions/event-rsvp/index.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const MIGRATION = Object.entries(MIGRATIONS).find(([f]) => f.includes('0193_event_moment_date_status'))?.[1] ?? ''
const SCREEN = SOURCES['/src/ui/EventosScreen.tsx']
const DATA = SOURCES['/src/data/events.ts']

function slice(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  expect(start, `no encuentro «${startMarker}»`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(end, `no encuentro «${endMarker}»`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('Migración 0193 — aditiva, nulable, sin reescribir datos (AJ…AO)', () => {
  it('solo añade una columna nulable a event_moments con los dos estados válidos', () => {
    const code = MIGRATION.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(code).toContain("alter table event_moments add column date_status text check (date_status is null or date_status in ('provisional', 'confirmada'))")
    expect(code).not.toMatch(/\b(update|delete|drop|truncate)\b/i)
    expect(code).not.toMatch(/not null/i)
  })
  it('no toca la tabla events ni sus columnas de fecha/lugar/servicios: los eventos antiguos conservan fecha, lugar, servicios y edad', () => {
    expect(MIGRATION).not.toMatch(/alter table events\b/i)
    for (const column of ['event_date', 'date_status', 'event_time', 'venue_label', 'venue_type', 'included_services', 'venue_address', 'venue_place_id']) {
      expect(DATA, column).toContain(column)
    }
  })
  it('la edad sigue siendo details.ageTurning (invitaciones y regalos la leen igual que siempre)', () => {
    expect(SCREEN).toContain('details.ageTurning = n')
  })
})

describe('Alta mínima — «Nuevo evento»', () => {
  const create = slice(SCREEN, 'function CreateEventModal(', '// Petición real: "reorganizar Eventos')
  it('solo escribe nombre, tipo, variante, tema y módulos; la fecha nace «Todavía no lo sabemos» y sin datos estructurales', () => {
    const call = slice(create, 'await createEvent({', '})')
    for (const field of ['type,', 'subtype:', 'title,', "dateStatus: 'pendiente'", 'eventDate: null', 'details: {}', 'enabledModules: modules', 'theme,']) expect(call).toContain(field)
    expect(call).not.toMatch(/venueType|includedServices|ageTurning|venueLabel/)
  })
  it('ni «Prefiero no decirlo ahora» ni preguntas de lugar/servicios/edad/fecha: eso es del configurador', () => {
    expect(create).not.toContain('Prefiero no decirlo')
    expect(create).not.toMatch(/Fotógrafo|Flores|Música\/DJ/)
  })
})

describe('Primer bloque del configurador (K…P, AH)', () => {
  const block = slice(SCREEN, 'function CelebracionBlock(', '// Corrección real (siguiente mejora tras validar la persistencia')
  it('es UN solo bloque que se adapta (structured) — no existen bloques «Datos generales», «Datos del cumpleaños»…', () => {
    expect((SCREEN.match(/function CelebracionBlock\(/g) ?? []).length).toBe(1)
    for (const forbidden of ['Datos del evento', 'Información general', 'Datos generales', 'Datos del cumpleaños', 'Fecha y lugar']) expect(SCREEN, forbidden).not.toContain(forbidden)
  })
  it('N/AH. la edad vive DENTRO de Celebración (solo cumpleaños, solo eventos sin ceremonia) y no hay ningún bloque de edad independiente', () => {
    expect(block).toContain("!structured && event.type === 'cumpleanos' && <EventAgeField event={event} onChanged={onChanged} />")
    expect((SCREEN.match(/¿Cuántos años cumple\?/g) ?? []).length).toBe(1)
    const configurator = slice(SCREEN, 'function EventPlanningConfigurator(', '\nconst LUGAR_CONTEXTO_OPTIONS')
    expect(configurator).not.toMatch(/ageTurning|EventAgeField|Cuántos años/)
  })
  it('O/P. fecha y lugar viven en el bloque, en este orden: edad → fecha → lugar → servicios', () => {
    const order = ['<EventAgeField', '<EventDateField', '<CustomAwareQuestion', '<VenuePlaceBlock', '<VenueServicesQuestion']
    let last = -1
    for (const marker of order) {
      const idx = block.indexOf(marker)
      expect(idx, marker).toBeGreaterThan(last)
      last = idx
    }
  })
  it('un evento por momentos reutiliza MomentsEditor (varios días y lugares) y solo ofrece la fecha general si ningún momento tiene fecha', () => {
    expect(block).toContain('<MomentsEditor event={event} onChanged={onChanged} />')
    expect(block).toContain('{!structured || !hasDatedMoment ? (')
    expect(block).toContain('Cuando pongas fecha a un momento, la del evento pasará a calcularse de ellos.')
  })
  it('Casa conserva su comportamiento validado: propone la Casa guardada y el evento se queda con su propia copia', () => {
    expect(block).toContain("!structured && contexto?.choice === 'en_casa' && <CasaLocationBlock event={event} onChanged={onChanged} />")
    expect(SCREEN).not.toMatch(/location_place_id|casaId|casa_id/)
  })
  it('abrir el configurador solo LEE: ninguna escritura al montar (AN: no se duplican decisiones)', () => {
    const load = slice(block, 'function reload(): Promise<void> {', 'const hasMomentLocation')
    expect(load).not.toMatch(/upsert|insert|update|delete|add[A-Z]/)
  })
  it('servicios: tras guardarlos reconcilia Comida y avisa para que se vuelva a leer (fuente única, sin preguntar dos veces)', () => {
    expect(block).toContain('await reconcileFoodForVenueChange(event, hasMomentLocation)')
    expect(block).toContain('notifyEventMomentsChanged(event.id)')
    expect(block).toContain('fromLegacy={venueServicesFromLegacy(decisions, event.includedServices)}')
  })
})

describe('Fecha con estado (Q…V)', () => {
  const field = slice(SCREEN, 'function EventDateField(', '// Lugar registrado (nombre + dirección)')
  it('Q/R. ofrece «Todavía no lo sabemos», «◷ Provisional» y «✓ Confirmada»', () => {
    expect(SCREEN).toContain('options={DATE_STATUS_CHOICES}')
  })
  it('S. con una fecha ya guardada, cambiar su estado solo actualiza el estado (la misma fecha, sin pedirla otra vez)', () => {
    expect(field).toContain('if (event.eventDate && next !== event.dateStatus) void run(() => updateEvent(event.id, { dateStatus: next }))')
  })
  it('volver a «Todavía no lo sabemos» pide confirmación antes de quitar una fecha puesta', () => {
    expect(field).toContain('window.confirm(')
  })
  it('un momento: estado propio, nueva fecha arranca Provisional, y tras cada cambio se sincroniza la fecha operativa', () => {
    const form = slice(SCREEN, 'function MomentForm(', '\nfunction MomentCard(')
    expect(form).toContain("useState<'provisional' | 'confirmada'>(initial ? (momentDateStatus(initial, eventDateStatus) ?? 'provisional') : 'provisional')")
    expect(form).toContain('dateStatus: momentDate ? dateStatus : null')
    const editor = slice(SCREEN, 'function MomentsEditor(', '// Fase 3 (reestructuración del diseñador)')
    expect((editor.match(/await syncOperationalDateFromMoments\(event\.id\)/g) ?? []).length).toBe(3)
  })
  it('U. la sincronización escribe SOLO si cambia algo y nunca sin ningún momento fechado', () => {
    const sync = slice(DATA, 'export async function syncOperationalDateFromMoments', '// Borrado seguro: event_guest_moments')
    expect(sync).toContain('if (!derived) return false')
    expect(sync).toContain('if (derived.eventDate === event.eventDate && derived.dateStatus === event.dateStatus) return false')
    expect(sync).toContain('recalculateAutoTasks(')
  })
  it('la cabecera muestra el estado de la fecha (✓ / ◷) sin ser un botón que abra «Gestionar evento»', () => {
    const hero = slice(SCREEN, '📅 {eventShortDateLabel(event)}', '</FitText>')
    expect(hero).toContain("event.dateStatus === 'confirmada' ? '✓' : '◷'")
    expect(hero).not.toContain('<button')
  })
})

describe('Gestionar evento — ya no es dueño de la fecha ni del lugar', () => {
  const manage = slice(SCREEN, 'function ManageEventModal(', '\n// Petición real: "Compras" en la rejilla del dashboard')
  it('solo nombre, tema y plazo de RSVP; la fecha y el lugar se deciden en el primer bloque', () => {
    expect(manage).not.toContain('type="date" value={eventDate}')
    expect(manage).not.toMatch(/setDateStatus|setEventDate|setVenueLabel|setVenueCoords/)
    expect(manage).toContain('La fecha, el lugar y lo que incluye se deciden en')
    const save = slice(manage, 'async function handleSaveInfo(', '\n  async function handleSaveModules')
    expect(save).not.toMatch(/eventDate|dateStatus|venue/)
  })
})

describe('Invitaciones y RSVP — una fecha provisional nunca parece cerrada', () => {
  const RSVP = SOURCES['/supabase/functions/event-rsvp/index.ts']
  it('la página pública marca «(fecha provisional)» (y el momento sin estado hereda el del evento)', () => {
    expect(RSVP).toContain('(fecha provisional)')
    expect(RSVP).toContain('eventDateStatus === "confirmada" ? "confirmada" : "provisional"')
  })
})

describe('Ayuda', () => {
  it('explica el alta mínima y dónde viven fecha, lugar, edad y servicios', () => {
    const help = SOURCES['/src/ui/AyudaScreen.tsx']
    for (const text of ['Nuevo evento', 'nombre, el tipo y qué quieres organizar', 'Provisional', 'Confirmada', 'Celebración']) expect(help, text).toContain(text)
  })
})
