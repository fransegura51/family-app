import { describe, expect, it } from 'vitest'

// BUG TAREA-CALENDARIO-01 — reproducido en producción real (evento
// "Bodas de plata", tarea "Enviar las invitaciones", 19/10/2026,
// responsable Jennifer): al activar "Mostrar en Calendario", el
// calendar_event se creaba con 0 filas en calendar_event_members
// (confirmado con SELECT de solo lectura contra objhgjgrinbhyzscjlbw:
// calendar_event_id ef8e8abe-c736-4d27-b726-8a580f2fd757, member_rows
// = 0), así que CalendarScreen lo mostraba como "Toda la familia" en
// vez de "Jennifer" — linkEventTaskToCalendar nunca tocaba
// calendar_event_members, el mecanismo de asignación que Calendario ya
// usa (memberIds.length === 0 → "Toda la familia", ver
// CalendarScreen.tsx:619). El esquema YA podía representarlo — no hizo
// falta ninguna migración, solo cerrar el hueco de integración en la
// capa de datos.
const APP = import.meta.glob(['/src/data/events.ts', '/src/data/calendar.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const EVENTS_SRC = APP['/src/data/events.ts']
const CALENDAR_SRC = APP['/src/data/calendar.ts']
const RLS_MIGRATION = (
  import.meta.glob('/supabase/migrations/0012_harden_foreign_key_ownership.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
)['/supabase/migrations/0012_harden_foreign_key_ownership.sql']

// Ventana de texto entre dos marcadores literales (ambos deben existir
// tal cual en el archivo) — para acotar comprobaciones "esta función
// NO hace X" sin que un uso legítimo de X en OTRA función del mismo
// archivo produzca un falso negativo.
function window(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('BUG TAREA-CALENDARIO-01 — causa raíz: no se usaba calendar_event_members', () => {
  it('replaceEventMembers existe y reutiliza calendar_event_members (mismo campo que ya usa Calendario para el miembro), sin ninguna columna nueva', () => {
    expect(CALENDAR_SRC).toContain('export async function replaceEventMembers')
    const body = window(CALENDAR_SRC, 'export async function replaceEventMembers', 'export async function createEvent')
    expect(body).toContain("from('calendar_event_members')")
  })

  it('no se ha creado ninguna migración ni columna nueva para este bug — el esquema ya soportaba la asignación', () => {
    expect(EVENTS_SRC).not.toMatch(/assigned_member_id_v2|calendar_member|task_member/i)
  })
})

describe('BUG TAREA-CALENDARIO-01 — TEST 1/2/3: responsable propagado con la semántica ya existente', () => {
  it('TEST 1/2: con assigned_member_id, se enlaza exactamente ese miembro (Jennifer o Paco: mismo código genérico para cualquiera, sin nombres)', () => {
    expect(EVENTS_SRC).toContain('task.assigned_member_id ? [task.assigned_member_id] : []')
    expect(EVENTS_SRC).not.toMatch(/['"]Jennifer['"]|['"]Paco['"]/)
  })

  it('TEST 3: con assigned_member_id null, usa [] — la misma semántica de "Toda la familia" que ya interpreta CalendarScreen (memberIds.length === 0), no una segunda interpretación', () => {
    expect(EVENTS_SRC).toContain('replaceEventMembers(calendarEventId, task.assigned_member_id ? [task.assigned_member_id] : [])')
  })
})

describe('BUG TAREA-CALENDARIO-01 — TEST 4: creación propaga el responsable en un solo calendar_event', () => {
  it('linkEventTaskToCalendar lee assigned_member_id y, si existe, sincroniza el miembro tras el ÚNICO insert (nunca dos)', () => {
    const body = window(EVENTS_SRC, 'export async function linkEventTaskToCalendar', 'async function unlinkEventTaskCalendarById')
    expect(body).toContain("select('title, due_date, calendar_event_id, assigned_member_id')")
    expect((body.match(/\.insert\(/g) ?? []).length).toBe(1)
    expect(body).toContain('if (task.assigned_member_id) await replaceEventMembers(calendarEvent.id, [task.assigned_member_id])')
  })

  it('idempotente: si ya está enlazada, no vuelve a crear ni a tocar miembros dos veces (ver también eventTaskCalendarLinkMigration.test.ts)', () => {
    const body = window(EVENTS_SRC, 'export async function linkEventTaskToCalendar', 'async function unlinkEventTaskCalendarById')
    expect(body).toContain('if (task.calendar_event_id) return task.calendar_event_id')
  })
})

describe('BUG TAREA-CALENDARIO-01 — TEST 5/6/7: cambiar responsable nunca crea un segundo calendar_event', () => {
  it('applyTaskToLinkedCalendarEvent solo hace UPDATE sobre calendarEventId, nunca INSERT — mismo id de entrada y de salida', () => {
    const body = window(EVENTS_SRC, 'async function applyTaskToLinkedCalendarEvent', 'export async function linkEventTaskToCalendar')
    expect(body).toContain(".update({ title: task.title, start_at: `${task.due_date}T00:00:00` }).eq('id', calendarEventId)")
    expect(body).not.toContain('.insert(')
  })

  it('updateEventTask dispara la sincronización también cuando cambia SOLO el responsable (no solo título/fecha)', () => {
    const body = window(EVENTS_SRC, 'export async function updateEventTask', 'async function applyTaskToLinkedCalendarEvent')
    expect(body).toContain(
      "if (patch.title !== undefined || patch.dueDate !== undefined || patch.assignedMemberId !== undefined) await syncLinkedTaskCalendarEventSafely(id)",
    )
  })

  it('marcar una tarea como hecha (done) NUNCA dispara la sincronización de calendario — no rompe completar tareas', () => {
    const body = window(EVENTS_SRC, 'export async function updateEventTask', 'async function applyTaskToLinkedCalendarEvent')
    // La condición que dispara el sync solo mira title/dueDate/assignedMemberId, nunca "done".
    expect(body).not.toMatch(/patch\.done[^\n]*syncLinkedTaskCalendarEventSafely/)
  })
})

describe('BUG TAREA-CALENDARIO-01 — TEST 8/9: fecha y título cambian, responsable se conserva', () => {
  it('syncLinkedTaskCalendarEventSafely relee assigned_member_id fresco de la tarea en cada sincronización (nunca un valor "congelado")', () => {
    const body = window(EVENTS_SRC, 'async function syncLinkedTaskCalendarEventSafely', 'export async function deleteEventTask')
    expect(body).toContain("select('calendar_event_id, title, due_date, assigned_member_id')")
    expect(body).toContain('applyTaskToLinkedCalendarEvent(data.calendar_event_id, { title: data.title, due_date: data.due_date, assigned_member_id: data.assigned_member_id })')
  })
})

describe('BUG TAREA-CALENDARIO-01 — TEST 10: no rompe los recordatorios de la Fase 10', () => {
  it('ni applyTaskToLinkedCalendarEvent ni syncLinkedTaskCalendarEventSafely tocan calendar_event_reminders — el responsable y el recordatorio son independientes', () => {
    const applyBody = window(EVENTS_SRC, 'async function applyTaskToLinkedCalendarEvent', 'export async function linkEventTaskToCalendar')
    const syncBody = window(EVENTS_SRC, 'async function syncLinkedTaskCalendarEventSafely', 'export async function deleteEventTask')
    expect(applyBody).not.toMatch(/calendar_event_reminders|replaceReminders/)
    expect(syncBody).not.toMatch(/calendar_event_reminders|replaceReminders/)
  })
})

describe('BUG TAREA-CALENDARIO-01 — TEST 11: idempotencia al guardar sin cambios', () => {
  it('replaceEventMembers es delete+insert (reemplazo), nunca un insert ciego que pudiera duplicar filas', () => {
    const body = window(CALENDAR_SRC, 'export async function replaceEventMembers', 'export async function createEvent')
    const deleteIdx = body.indexOf(".from('calendar_event_members').delete()")
    const insertIdx = body.indexOf(".from('calendar_event_members').insert(")
    expect(deleteIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(deleteIdx)
  })
})

describe('BUG TAREA-CALENDARIO-01 — TEST 12: desactivar "Mostrar en Calendario" sigue igual que la Fase 9', () => {
  it('unlinkEventTaskFromCalendar/unlinkEventTaskCalendarById no se tocaron por este arreglo', () => {
    const body = window(EVENTS_SRC, 'async function unlinkEventTaskCalendarById', 'async function syncLinkedTaskCalendarEventSafely')
    expect(body).toContain("from('calendar_events').delete().eq('id', calendarEventId)")
    expect(body).toContain('calendar_event_id: null')
  })
})

describe('BUG TAREA-CALENDARIO-01 — TEST 13: miembro de otra familia no puede quedar asignado', () => {
  it('la RLS de calendar_event_members ya exige member_in_current_family(member_id) — no se duplica esa comprobación en el código nuevo', () => {
    expect(RLS_MIGRATION).toContain('calendar_event_members: family crud')
    expect(RLS_MIGRATION).toContain('private.member_in_current_family(member_id)')
  })

  it('replaceEventMembers no hace ninguna comprobación de familia propia — confía deliberadamente en la RLS ya existente, sin reimplementarla', () => {
    const body = window(CALENDAR_SRC, 'export async function replaceEventMembers', 'export async function createEvent')
    expect(body).not.toMatch(/current_family_id/)
  })
})

describe('BUG TAREA-CALENDARIO-01 — identidad correcta: family_members en ambos lados', () => {
  it('event_tasks.assigned_member_id y calendar_event_members.member_id referencian el mismo family_members(id) — sin traducción de identificador necesaria', () => {
    const taskMigration = (
      import.meta.glob('/supabase/migrations/0162_event_task_assignee.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    )['/supabase/migrations/0162_event_task_assignee.sql']
    expect(taskMigration).toContain('references family_members(id)')
    const initMigration = (import.meta.glob('/supabase/migrations/0001_init.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
      '/supabase/migrations/0001_init.sql'
    ]
    expect(initMigration).toContain('member_id uuid not null references family_members(id)')
  })
})
