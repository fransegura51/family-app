import { describe, expect, it } from 'vitest'

// Bloque D/F/G — "🗂️ Encargos" integrado en Preparativos sin sobrecargarlo: cero cambio visual cuando
// no hay ningún encargo (groups.length === 0), un botón secundario junto a "+ Nueva tarea"/"👥
// Colaboradores" cuando sí se usa.
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
const GROUPS_MODAL = window_(UI, 'function EventTaskGroupsModal(', '\nfunction EventShoppingSection(')

describe('bloque G: integración ligera, sin sobrecargar Preparativos', () => {
  it('"🗂️ Encargos" es un botón secundario (link-button) junto a "+ Nueva tarea" y "👥 Colaboradores"', () => {
    expect(TAREAS_MODULE).toContain('🗂️ Encargos')
    const row = window_(TAREAS_MODULE, '+ Nueva tarea', '</div>')
    expect(row).toContain('👥 Colaboradores')
    expect(row).toContain('🗂️ Encargos')
  })
  it('el selector de encargo en el formulario de tarea solo aparece si hay algún encargo creado (groups.length > 0) — cero cambio para quien no agrupa nada', () => {
    expect(MODAL).toContain('{groups.length > 0 && (')
  })
})

describe('bloque F: crear, asociar, desasociar — sin obligar a agrupar', () => {
  it('"+ Nuevo encargo" crea un encargo (addEventTaskGroup) desde "🗂️ Encargos"', () => {
    const addFn = window_(GROUPS_MODAL, 'async function add(', '\n  }')
    expect(addFn).toContain('await addEventTaskGroup(eventId, newName)')
  })
  it('renombrar un encargo (saveEditing) actualiza el nombre', () => {
    const editFn = window_(GROUPS_MODAL, 'async function saveEditing(', '\n  }')
    expect(editFn).toContain('await renameEventTaskGroup(editing.id, editing.name)')
  })
  it('el selector "Encargo (opcional)" del formulario de tarea permite "Ninguno" (desasociar sin borrar la tarea)', () => {
    expect(MODAL).toContain('<option value="">Ninguno</option>')
  })
  it('crear la tarea nueva asocia el encargo elegido solo si se eligió uno (nunca una llamada vacía)', () => {
    const submitFn = window_(MODAL, 'async function handleSubmit(', '\n  return (')
    const createBranch = window_(submitFn, 'if (isCreating) {', '} else {')
    expect(createBranch).toContain('if (groupId) await setEventTaskGroup(newId, groupId)')
  })
  it('editar una tarea solo llama a setEventTaskGroup si el encargo elegido cambió de verdad', () => {
    const submitFn = window_(MODAL, 'async function handleSubmit(', '\n  return (')
    const editBranch = submitFn.slice(submitFn.indexOf('} else {'))
    expect(editBranch).toContain("if (groupId !== (task.groupId ?? '')) await setEventTaskGroup(task.id, groupId || null)")
  })
})

describe('bloque F: borrar un encargo nunca borra sus tareas', () => {
  it('el aviso de borrado dice explícitamente que las tareas no se borran, con el número real', () => {
    const askFn = window_(GROUPS_MODAL, 'async function askDelete(', '\n  }')
    expect(askFn).toContain('const count = await countTasksInGroup(g.id)')
    expect(askFn).toContain('no se borran: quedan sin encargo')
  })
  it('deleteEventTaskGroup se llama tras confirmar, nunca borra tareas por su cuenta (ver eventTaskGroups.test.ts)', () => {
    const askFn = window_(GROUPS_MODAL, 'async function askDelete(', '\n  }')
    expect(askFn).toContain('await deleteEventTaskGroup(g.id)')
  })
})

describe('bloque F: crear una tarea directamente dentro de un encargo', () => {
  it('"+ Tarea en este encargo" lleva el id del grupo hasta la creación de la tarea', () => {
    expect(GROUPS_MODAL).toContain('onClick={() => onCreateTaskInGroup(g.id)}')
    expect(UI).toContain('onCreateTaskInGroup={(groupId) => {')
    expect(UI).toContain('setCreatingTaskInGroup(groupId)')
  })
  it('el formulario de creación preselecciona ese encargo (initialGroupId)', () => {
    expect(MODAL).toContain("const [groupId, setGroupId] = useState<string>(task?.groupId ?? initialGroupId ?? '')")
  })
})

describe('bloque F: ver las tareas de un encargo juntas, y la tarjeta las marca ligeramente', () => {
  it('"🗂️ Encargos" lista los títulos de las tareas de cada grupo', () => {
    expect(GROUPS_MODAL).toContain('const groupTasks = tasks.filter((t) => t.groupId === g.id)')
    expect(GROUPS_MODAL).toContain('{t.title}')
  })
  it('la tarjeta muestra el nombre del encargo como una etiqueta ligera más, sin rediseñar la tarjeta', () => {
    expect(UI).toContain('{groupName && <span>🗂️ {groupName}</span>}')
  })
})

describe('bloque G: no romper filtros ni completadas al agrupar', () => {
  it('filteredTasks/visibleTasks/completedTasks no se tocan por la agrupación (misma lógica de siempre)', () => {
    expect(UI).toContain('const filteredTasks = pendingTasks.filter((t) => taskMatchesResponsibleFilter(t, responsibleFilter))')
    expect(UI).toContain('const completedTasks = tasks.filter((t) => t.done)')
  })
  it('no existe ninguna acción de "completar encargo" que marque sus tareas como hechas de golpe', () => {
    expect(UI).not.toMatch(/completar.{0,20}encargo/i)
    const groupsModalDoneCalls = GROUPS_MODAL.match(/updateEventTask/g) ?? []
    expect(groupsModalDoneCalls).toHaveLength(0)
  })
})
