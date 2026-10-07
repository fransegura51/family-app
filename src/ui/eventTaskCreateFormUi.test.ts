import { describe, expect, it } from 'vitest'

// Bloques 1-3 de la tanda: "+ Nueva tarea" sustituye por completo el alta rápida inferior y reutiliza el
// MISMO formulario que "Editar tarea" (TaskEditModal con `task` ausente = modo creación) — nunca un
// segundo sistema de alta simplificado.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const TAREAS_MODULE = window_(UI, "case 'tareas': {", "case 'invitados':")
const MODAL = window_(UI, 'function TaskEditModal({', '\nfunction EventHelpersModal(')

describe('bloque 1: el alta rápida inferior desaparece por completo', () => {
  it('no queda ningún input/botón "+ Añadir tarea" ni su formulario', () => {
    expect(UI).not.toContain('placeholder="+ Añadir tarea"')
    expect(UI).not.toContain('handleAddTask')
    expect(UI).not.toContain('newTaskTitle')
  })
  it('tampoco queda con filtros activos: la sección de alta rápida no está condicionada a responsibleFilter', () => {
    // Si ya no existe el texto en absoluto (comprobado arriba), no puede reaparecer bajo ninguna condición.
    expect(UI).not.toMatch(/responsibleFilter[^]*?\+ Añadir tarea/)
  })
})

describe('bloque 2: "+ Nueva tarea" vive debajo de los filtros y antes de la lista', () => {
  it('existe el botón "+ Nueva tarea"', () => {
    expect(TAREAS_MODULE).toContain('+ Nueva tarea')
  })
  it('aparece DESPUÉS de la fila de filtros por responsable y ANTES de la lista de tareas (event-list)', () => {
    const filterRowIdx = TAREAS_MODULE.indexOf("aria-label=\"Filtrar por responsable\"")
    const newTaskIdx = TAREAS_MODULE.indexOf('+ Nueva tarea')
    const listIdx = TAREAS_MODULE.indexOf('className="event-list"')
    expect(filterRowIdx).toBeGreaterThan(-1)
    expect(newTaskIdx).toBeGreaterThan(filterRowIdx)
    expect(listIdx).toBeGreaterThan(newTaskIdx)
  })
  it('el botón abre el modal de creación (creatingTask), no está dentro del bloque condicionado a pendingTasks.length > 0 (debe verse también sin tareas)', () => {
    const pendingZeroIdx = TAREAS_MODULE.indexOf('pendingTasks.length === 0')
    const newTaskIdx = TAREAS_MODULE.indexOf('setCreatingTaskInGroup(null)')
    expect(newTaskIdx).toBeGreaterThan(-1)
    // El botón está fuera (después) del bloque "pendingTasks.length > 0 && (...)" de los chips, pero no
    // depende de él: comprobamos que no hay ningún `pendingTasks.length > 0 &&` envolviendo directamente
    // el propio botón (distinto del de los chips, que es anterior).
    expect(pendingZeroIdx).toBeGreaterThan(-1)
  })
})

describe('bloque 3: "+ Nueva tarea" abre el MISMO formulario completo que "Editar tarea"', () => {
  it('un único componente TaskEditModal para los dos casos — `task` es opcional (ausente = creación)', () => {
    expect(UI).toContain('task?: EventTask')
    expect(UI).toContain('const isCreating = task === undefined')
  })
  it('EventosScreen renderiza TaskEditModal dos veces: una para editar (con task) y otra para crear (sin task)', () => {
    expect((UI.match(/<TaskEditModal/g) ?? []).length).toBe(2)
    expect(UI).toContain('{creatingTask && (')
    expect(UI).toContain('{editingTask && (')
  })
  it('el título del modal cambia según el modo, sin duplicar el formulario', () => {
    expect(MODAL).toContain("{isCreating ? 'Nueva tarea' : 'Editar tarea'}")
  })
  it('el formulario de creación ofrece título, fecha, hora, prioridad, responsables, externos, nota, Mostrar en Calendario y recordatorios — todo en el mismo sitio', () => {
    expect(MODAL).toContain('Título')
    expect(MODAL).toContain('Fecha')
    expect(MODAL).toContain('Hora (opcional)')
    expect(MODAL).toContain('Prioridad')
    expect(MODAL).toContain('Responsables')
    expect(MODAL).toContain('+ Añadir persona externa')
    expect(MODAL).toContain('Nota')
    expect(MODAL).toContain('📅 Mostrar en Calendario')
    expect(MODAL).toContain('Recordatorio (puede ser más de uno)')
  })
})

describe('bloque 3: guardar una tarea nueva — una sola tarea, sin duplicados, sin tocar otras', () => {
  it('en modo creación llama a addEventTask (nunca updateEventTask) exactamente una vez', () => {
    const submitFn = window_(MODAL, 'async function handleSubmit(', '\n  return (')
    const createBranch = window_(submitFn, 'if (isCreating) {', '} else {')
    expect(createBranch).toContain('const newId = await addEventTask(eventId, title, dueDate || null, null, {')
    expect((createBranch.match(/await addEventTask\(/g) ?? []).length).toBe(1)
    expect(createBranch).not.toContain('updateEventTask(')
  })
  it('responsables y personas externas de la tarea nueva se asignan sobre el id recién creado, solo si hay alguno (nunca una llamada vacía)', () => {
    const submitFn = window_(MODAL, 'async function handleSubmit(', '\n  return (')
    const createBranch = window_(submitFn, 'if (isCreating) {', '} else {')
    expect(createBranch).toContain('if (responsibleIds.length > 0) await setEventTaskResponsibles(newId, responsibleIds)')
    expect(createBranch).toContain('if (helperIds.length > 0) await setEventTaskHelpers(newId, helperIds)')
  })
  it('Mostrar en Calendario + recordatorios en la tarea nueva se enlazan sobre el id recién creado, nunca antes de crearla', () => {
    const submitFn = window_(MODAL, 'async function handleSubmit(', '\n  return (')
    const createBranch = window_(submitFn, 'if (isCreating) {', '} else {')
    const newIdIdx = createBranch.indexOf('const newId = await addEventTask(')
    const linkIdx = createBranch.indexOf('linkEventTaskToCalendar(newId)')
    expect(newIdIdx).toBeGreaterThan(-1)
    expect(linkIdx).toBeGreaterThan(newIdIdx)
  })
  it('al terminar de guardar (modo creación o edición) se cierra el modal y se refresca la lista', () => {
    expect(UI).toContain('setCreatingTask(false)\n                  reloadTasks()')
    expect(UI).toContain('setEditingTaskId(null)\n                  reloadTasks()')
  })
})

describe('bloque 5: reglas de fecha/hora/calendario sin inventar nada, también en modo creación', () => {
  it('sin fecha no se activa "Mostrar en Calendario" (mismo guard que en edición)', () => {
    expect(MODAL).toContain('disabled={!dueDate}')
  })
  it('la hora nunca se guarda sin fecha (ni en alta ni en edición)', () => {
    const submitFn = window_(MODAL, 'async function handleSubmit(', '\n  return (')
    expect((submitFn.match(/dueTime: dueDate && dueTime \? dueTime : null/g) ?? []).length).toBe(2)
  })
  it('sin tocar el selector de prioridad en modo creación, se deja que PEPA proponga (igual que el alta rápida de siempre) — tocarlo es una elección real', () => {
    expect(MODAL).toContain('const [priorityTouched, setPriorityTouched] = useState(false)')
    expect(MODAL).toContain('setPriorityTouched(true)')
    const submitFn = window_(MODAL, 'async function handleSubmit(', '\n  return (')
    const createBranch = window_(submitFn, 'if (isCreating) {', '} else {')
    expect(createBranch).toContain('...(priorityTouched ? { priority: (priority || null) as')
  })
})
