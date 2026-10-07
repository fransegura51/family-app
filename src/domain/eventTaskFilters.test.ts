import { describe, expect, it } from 'vitest'
import { NO_RESPONSIBLE_KEY, taskMatchesResponsibleFilter, toggleResponsibleFilterKey } from '@/domain/eventTaskFilters'

const src = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const UI = src('src/ui/EventosScreen.tsx')
const EVENTS = src('src/data/events.ts')
const MENU_ORIG = src('src/ui/EventMenuOriginals.tsx')
const MENU = src('src/ui/EventMenu.tsx')

const paco = { assignedMemberId: 'paco', responsibleMemberIds: ['paco', 'jennifer'], helpers: [] as { helperId: string | null }[] }
const mixta = { assignedMemberId: 'paco', responsibleMemberIds: ['paco'], helpers: [{ helperId: 'maria' }] }
const sinNadie = { assignedMemberId: null, responsibleMemberIds: [], helpers: [] as { helperId: string | null }[] }
const historica = { assignedMemberId: null, responsibleMemberIds: [], helpers: [{ helperId: null }] }

// Bloque 4 de la tanda: el filtro múltiple es INTERSECCIÓN (AND), no unión — "Jennifer + Paco" solo
// muestra tareas con LOS DOS, nunca con cualquiera de los dos. Ejemplo literal de la petición:
// Tarea A → Jennifer; Tarea B → Paco; Tarea C → Jennifer+Paco; Tarea D → Jennifer+Paco+David(externo).
const taskA = { assignedMemberId: 'jennifer', responsibleMemberIds: ['jennifer'], helpers: [] as { helperId: string | null }[] }
const taskB = { assignedMemberId: 'paco', responsibleMemberIds: ['paco'], helpers: [] as { helperId: string | null }[] }
const taskC = { assignedMemberId: 'jennifer', responsibleMemberIds: ['jennifer', 'paco'], helpers: [] as { helperId: string | null }[] }
const taskD = { assignedMemberId: 'jennifer', responsibleMemberIds: ['jennifer', 'paco'], helpers: [{ helperId: 'david' }] }

describe('filtro por responsable — la lista, nunca los datos', () => {
  it('sin selección no filtra nada', () => {
    expect(taskMatchesResponsibleFilter(paco, [])).toBe(true)
  })
  it('un solo responsable: coincide si lo tiene asignado', () => {
    expect(taskMatchesResponsibleFilter(paco, ['m:jennifer'])).toBe(true)
    expect(taskMatchesResponsibleFilter(paco, ['m:otro'])).toBe(false)
  })
  it('una tarea con Paco y María (externa): coincide con cada uno por separado', () => {
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

describe('filtro múltiple = intersección (AND), nunca unión (OR)', () => {
  it('Jennifer + Paco: solo las tareas con los DOS (C, D) — nunca las que solo tienen uno (A, B)', () => {
    const selected = ['m:jennifer', 'm:paco']
    expect(taskMatchesResponsibleFilter(taskA, selected)).toBe(false)
    expect(taskMatchesResponsibleFilter(taskB, selected)).toBe(false)
    expect(taskMatchesResponsibleFilter(taskC, selected)).toBe(true)
    expect(taskMatchesResponsibleFilter(taskD, selected)).toBe(true)
  })
  it('Jennifer sola: A, C y D coinciden (todas la tienen); B no', () => {
    expect(taskMatchesResponsibleFilter(taskA, ['m:jennifer'])).toBe(true)
    expect(taskMatchesResponsibleFilter(taskB, ['m:jennifer'])).toBe(false)
    expect(taskMatchesResponsibleFilter(taskC, ['m:jennifer'])).toBe(true)
    expect(taskMatchesResponsibleFilter(taskD, ['m:jennifer'])).toBe(true)
  })
  it('Paco solo: B, C y D coinciden; A no', () => {
    expect(taskMatchesResponsibleFilter(taskA, ['m:paco'])).toBe(false)
    expect(taskMatchesResponsibleFilter(taskB, ['m:paco'])).toBe(true)
    expect(taskMatchesResponsibleFilter(taskC, ['m:paco'])).toBe(true)
    expect(taskMatchesResponsibleFilter(taskD, ['m:paco'])).toBe(true)
  })
  it('Jennifer + David (externo): solo D tiene a los dos — C no, porque no tiene a David', () => {
    const selected = ['m:jennifer', 'h:david']
    expect(taskMatchesResponsibleFilter(taskC, selected)).toBe(false)
    expect(taskMatchesResponsibleFilter(taskD, selected)).toBe(true)
  })
  it('Paco + David (externo): mismo criterio, mezclando familiar y externo', () => {
    const selected = ['m:paco', 'h:david']
    expect(taskMatchesResponsibleFilter(taskB, selected)).toBe(false)
    expect(taskMatchesResponsibleFilter(taskC, selected)).toBe(false)
    expect(taskMatchesResponsibleFilter(taskD, selected)).toBe(true)
  })
  it('Jennifer + Paco + David: solo D (tiene a los tres) — C no, le falta David', () => {
    const selected = ['m:jennifer', 'm:paco', 'h:david']
    expect(taskMatchesResponsibleFilter(taskC, selected)).toBe(false)
    expect(taskMatchesResponsibleFilter(taskD, selected)).toBe(true)
  })
  it('una tarea que solo tiene PARTE de los responsables seleccionados nunca aparece', () => {
    expect(taskMatchesResponsibleFilter(taskC, ['m:jennifer', 'm:paco', 'h:david'])).toBe(false)
  })
})

describe('«Sin asignar» y una persona son mutuamente excluyentes en la UI del filtro', () => {
  it('elegir «Sin asignar» limpia cualquier persona ya elegida', () => {
    expect(toggleResponsibleFilterKey(['m:jennifer', 'm:paco'], NO_RESPONSIBLE_KEY)).toEqual([NO_RESPONSIBLE_KEY])
  })
  it('elegir una persona quita «Sin asignar» si estaba activo', () => {
    expect(toggleResponsibleFilterKey([NO_RESPONSIBLE_KEY], 'm:jennifer')).toEqual(['m:jennifer'])
  })
  it('seguir añadiendo personas con «Sin asignar» ya quitado funciona de forma acumulativa (AND)', () => {
    expect(toggleResponsibleFilterKey(['m:jennifer'], 'm:paco')).toEqual(['m:jennifer', 'm:paco'])
  })
  it('quitar una clave ya seleccionada la desmarca sin tocar las demás', () => {
    expect(toggleResponsibleFilterKey(['m:jennifer', 'm:paco'], 'm:jennifer')).toEqual(['m:paco'])
  })
  it('«Todos» (vaciar la selección) es el estado limpio — sin filtro de responsables', () => {
    expect(taskMatchesResponsibleFilter(taskA, [])).toBe(true)
    expect(taskMatchesResponsibleFilter(sinNadie, [])).toBe(true)
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
