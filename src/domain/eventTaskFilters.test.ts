import { describe, expect, it } from 'vitest'
import { NO_RESPONSIBLE_KEY, taskMatchesResponsibleFilter } from '@/domain/eventTaskFilters'

const src = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const UI = src('src/ui/EventosScreen.tsx')
const EVENTS = src('src/data/events.ts')
const MENU_ORIG = src('src/ui/EventMenuOriginals.tsx')
const MENU = src('src/ui/EventMenu.tsx')

const paco = { assignedMemberId: 'paco', responsibleMemberIds: ['paco', 'jennifer'], helpers: [] as { helperId: string | null }[] }
const mixta = { assignedMemberId: 'paco', responsibleMemberIds: ['paco'], helpers: [{ helperId: 'maria' }] }
const sinNadie = { assignedMemberId: null, responsibleMemberIds: [], helpers: [] as { helperId: string | null }[] }
const historica = { assignedMemberId: null, responsibleMemberIds: [], helpers: [{ helperId: null }] }

describe('filtro por responsable — la lista, nunca los datos', () => {
  it('sin selección no filtra nada', () => {
    expect(taskMatchesResponsibleFilter(paco, [])).toBe(true)
  })
  it('una tarea aparece si coincide con cualquiera de los responsables elegidos', () => {
    expect(taskMatchesResponsibleFilter(paco, ['m:jennifer'])).toBe(true)
    expect(taskMatchesResponsibleFilter(paco, ['m:paco', 'm:otro'])).toBe(true)
  })
  it('selección múltiple: Paco + Jennifer muestra tareas de cualquiera de los dos', () => {
    expect(taskMatchesResponsibleFilter({ assignedMemberId: 'jennifer', responsibleMemberIds: ['jennifer'], helpers: [] }, ['m:paco', 'm:jennifer'])).toBe(true)
  })
  it('una tarea con Paco y María aparece al filtrar Paco y también al filtrar María (externa)', () => {
    expect(taskMatchesResponsibleFilter(mixta, ['m:paco'])).toBe(true)
    expect(taskMatchesResponsibleFilter(mixta, ['h:maria'])).toBe(true)
  })
  it('«Sin asignar» muestra solo las tareas sin ningún responsable activo', () => {
    expect(taskMatchesResponsibleFilter(sinNadie, [NO_RESPONSIBLE_KEY])).toBe(true)
    expect(taskMatchesResponsibleFilter(paco, [NO_RESPONSIBLE_KEY])).toBe(false)
  })
  it('una referencia histórica de persona borrada NO cuenta como responsable activo', () => {
    expect(taskMatchesResponsibleFilter(historica, [NO_RESPONSIBLE_KEY])).toBe(true)
    expect(taskMatchesResponsibleFilter(historica, ['h:maria'])).toBe(false)
  })
  it('una tarea sin el filtro coincidente no aparece', () => {
    expect(taskMatchesResponsibleFilter(paco, ['h:maria'])).toBe(false)
  })
})

// La campana y sus varios avisos simultáneos tienen su propio fichero: ver eventTaskReminders.test.ts
// (domain/eventTaskFilters.ts: taskReminderSelectionFrom/remindersFromSelection/toggledPresetReminders).

describe('estructura de la interfaz y de datos', () => {
  it('la campana sigue separada de «Mostrar en Calendario» y no aparece sin fecha como aviso temporal', () => {
    expect(UI).toContain("if (!t.dueDate) return 'Pon una fecha para activar un aviso'")
    expect(UI).toContain("'Activa primero «Mostrar en Calendario» en el editor'")
    expect(UI).toContain('<ReminderBell')
  })
  it('el filtro solo cambia la lista visible: no escribe datos', () => {
    const toggle = UI.slice(UI.indexOf('function toggleResponsibleFilter('), UI.indexOf('function reminderHintFor('))
    expect(toggle).toContain('setResponsibleFilter(')
    expect(toggle).not.toMatch(/updateEventTask|addEventTask|replaceReminders|supabase/)
    expect(UI).toContain('const filteredTasks = pendingTasks.filter((t) => taskMatchesResponsibleFilter(t, responsibleFilter))')
  })
  it('los controles del filtro incluyen Todos, Sin asignar, familiares, externas y Limpiar filtros', () => {
    expect(UI).toContain('Sin asignar')
    expect(UI).toContain('Limpiar filtros')
    expect(UI).toContain("'m:' + m.id")
    expect(UI).toContain("'h:' + h.id")
  })
  it('la prioridad efectiva usa el motor también para tareas antiguas sin guardar, y se recalcula en vivo con las decisiones del evento', () => {
    expect(UI).toContain('const shownPriority = effectivePriority(task, decisions).priority')
  })
})

describe('calendario: una sola entrada, todos los familiares, externas sin color, tarea del calendario', () => {
  it('la entrada se crea como tarea del calendario (kind task), una sola por tarea', () => {
    expect(EVENTS).toContain("visibility: 'shared', kind: 'task' })")
  })
  it('los responsables del calendario son los familiares de la tarea (principal incluido), nunca externas', () => {
    const helper = EVENTS.slice(EVENTS.indexOf('async function calendarMemberIdsForTask('), EVENTS.indexOf('async function applyTaskToLinkedCalendarEvent('))
    expect(helper).toContain("from('event_task_members')")
    expect(helper).not.toMatch(/event_task_helpers|event_helpers/)
  })
  it('la sincronización reemplaza la lista de miembros de la misma entrada (no crea otra)', () => {
    const apply = EVENTS.slice(EVENTS.indexOf('async function applyTaskToLinkedCalendarEvent('), EVENTS.indexOf('// Fase 9 — Tarea → Calendario'))
    expect(apply).toContain('replaceEventMembers(calendarEventId, await calendarMemberIdsForTask(task.id, task.assigned_member_id))')
    expect(apply).not.toContain("from('calendar_events').insert")
  })
})

describe('documentos originales — plegados por defecto, en una línea, en su sitio', () => {
  it('se muestran dentro de un desplegable cerrado (details sin open)', () => {
    expect(MENU_ORIG).toContain('<details style={{ width: \'100%\', margin: \'6px 0\' }}>')
    expect(MENU_ORIG).not.toMatch(/<details[^>]*\sopen/)
    expect(MENU_ORIG).toContain('<summary')
  })
  it('la línea plegada muestra el número de documentos; los alias siguen siendo por orden', () => {
    expect(MENU_ORIG).toContain('📎 Documentos originales ({docs.length})')
    expect(MENU_ORIG).toContain('{documentAlias(index)}')
  })
  it('está después de Importar menú y antes de Gestionar secciones', () => {
    const imp = MENU.indexOf('📷 Importar menú')
    const orig = MENU.indexOf('<EventMenuOriginals eventId={event.id} />')
    const gest = MENU.indexOf('⚙️ Gestionar secciones')
    expect(imp).toBeGreaterThan(-1)
    expect(orig).toBeGreaterThan(imp)
    expect(gest).toBeGreaterThan(orig)
  })
})
