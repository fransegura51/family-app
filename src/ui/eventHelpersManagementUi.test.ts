import { describe, expect, it } from 'vitest'

// Bloques 6-10 de la tanda: "👥 Colaboradores" gestiona las personas externas DEL EVENTO fuera de
// cualquier tarea. Reutiliza exactamente el mismo modelo de datos que ya existía (event_helpers,
// event_task_helpers con snapshot) — ningún esquema nuevo.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const RESP = (import.meta.glob('/src/data/eventTaskResponsibles.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/eventTaskResponsibles.ts']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const HELPERS_MODAL = window_(UI, 'function EventHelpersModal(', '\nfunction EventShoppingSection(')
const MODAL = window_(UI, 'function TaskEditModal({', '\nfunction EventHelpersModal(')

describe('bloque 6: "👥 Colaboradores" es accesible desde Preparativos, fuera de una tarea', () => {
  it('existe el botón "👥 Colaboradores" junto a "+ Nueva tarea"', () => {
    expect(UI).toContain('👥 Colaboradores')
    expect(UI).toContain('onClick={() => setManagingHelpers(true)}')
  })
  it('un colaborador solo necesita nombre (obligatorio) y relación/etiqueta (opcional) — nunca email, teléfono, usuario ni invitación a PEPA', () => {
    expect(HELPERS_MODAL).toContain('Nombre')
    expect(HELPERS_MODAL).toContain('Relación (opcional)')
    expect(HELPERS_MODAL).not.toMatch(/email|teléfono|contraseña|invitar/i)
  })
})

describe('bloque 7: gestión completa desde "👥 Colaboradores" — alta, edición y borrado seguro', () => {
  it('alta: llama a addEventHelper y refresca la lista compartida (onHelpersChanged)', () => {
    const addFn = window_(HELPERS_MODAL, 'async function add(', '\n  }')
    expect(addFn).toContain('await addEventHelper(eventId, newName, newLabel || null)')
    expect(addFn).toContain('await onHelpersChanged()')
  })
  it('edición: llama a updateEventHelper (que ya actualiza los snapshots activos) y refresca', () => {
    const editFn = window_(HELPERS_MODAL, 'async function saveEditing(', '\n  }')
    expect(editFn).toContain('await updateEventHelper(editing.id, { name: editing.name, label: editing.label || null })')
    expect(editFn).toContain('await onHelpersChanged()')
  })
  it('borrado seguro: antes de borrar, comprueba cuántas tareas lo tienen asignado — nunca un DELETE a ciegas', () => {
    const askFn = window_(HELPERS_MODAL, 'async function askDelete(', '\n  }')
    expect(askFn).toContain('const assignments = await countHelperAssignments(h.id)')
    expect(askFn).toContain('if (assignments === 0)')
  })
  it('sin asignaciones: confirmación sencilla antes de borrar', () => {
    const askFn = window_(HELPERS_MODAL, 'async function askDelete(', '\n  }')
    expect(askFn).toContain('window.confirm(')
  })
  it('con asignaciones: nunca en silencio — ofrece conservar (referencia histórica) o quitar de las tareas', () => {
    expect(HELPERS_MODAL).toContain('Conservar las asignaciones (quedan como referencia)')
    expect(HELPERS_MODAL).toContain('Quitarla también de las tareas')
    const confirmFn = window_(HELPERS_MODAL, 'async function confirmDelete(', '\n  }')
    expect(confirmFn).toContain('await deleteEventHelper(deleteFor.helper.id, mode)')
  })
  it('"keep" nunca hace un DELETE destructivo sobre las asignaciones — deja la referencia histórica (ON DELETE SET NULL + snapshot, modelo ya existente)', () => {
    const delFn = window_(RESP, 'export async function deleteEventHelper(', '\n}')
    expect(delFn).toContain("if (mode === 'remove')")
    // 'keep' (el otro camino) solo borra event_helpers; el FK on delete set null conserva la fila de
    // event_task_helpers con su snapshot (helper_name/helper_label) — ver migración 0206.
    expect(delFn.indexOf("if (mode === 'remove')")).toBeLessThan(delFn.indexOf(".from('event_helpers').delete()"))
  })
})

describe('bloque 8: dentro de Nueva/Editar tarea solo se SELECCIONA, nunca se administra', () => {
  it('no hay menú ⋯ de colaborador, ni Editar, ni Borrar dentro del formulario de tarea', () => {
    expect(MODAL).not.toContain('Más opciones de')
    expect(MODAL).not.toMatch(/>\s*Editar\s*</)
    expect(MODAL).not.toMatch(/>\s*Borrar\s*</)
  })
  it('sí existe "+ Añadir persona externa" como alta rápida dentro de la tarea', () => {
    expect(MODAL).toContain('+ Añadir persona externa')
  })
})

describe('bloque 9: alta rápida de colaborador desde una tarea queda disponible y seleccionada al instante', () => {
  it('addHelper crea el colaborador, lo selecciona en la tarea y refresca la lista del padre — sin salir del formulario', () => {
    const addFn = window_(MODAL, 'async function addHelper(', '\n  }')
    expect(addFn).toContain('const id = await addEventHelper(eventId, newHelperName, newHelperLabel || null)')
    expect(addFn).toContain('setHelperIds((prev) => [...prev, id])')
    expect(addFn).toContain('await onHelpersChanged()')
  })
  it('onHelpersChanged viene del padre (EventosScreen), que recarga la MISMA lista que alimenta el filtro y "👥 Colaboradores" — nunca una copia propia', () => {
    expect(UI).toContain('function reloadEventHelpers()')
    expect(UI).toContain('onHelpersChanged={reloadEventHelpers}')
  })
})

describe('bloque 10: tres conceptos separados, nunca mezclados', () => {
  it('seleccionar/deseleccionar responsables es solo estado del borrador (useState), se persiste al Guardar', () => {
    expect(MODAL).toContain('const [responsibleIds, setResponsibleIds] = useState<string[]>(originalResponsibleIds)')
    expect(MODAL).toContain('const [helperIds, setHelperIds] = useState<string[]>(originalHelperIds)')
  })
  it('crear un colaborador nuevo (+ Añadir persona externa) escribe de verdad en el evento, no solo en el borrador', () => {
    const addFn = window_(MODAL, 'async function addHelper(', '\n  }')
    expect(addFn).toContain('await addEventHelper(')
  })
  it('editar/borrar/desactivar un colaborador existe SOLO en "👥 Colaboradores"', () => {
    expect(HELPERS_MODAL).toContain('async function saveEditing(')
    expect(HELPERS_MODAL).toContain('async function askDelete(')
    expect(MODAL).not.toContain('async function saveEditing(')
    expect(MODAL).not.toContain('async function askDelete(')
  })
})

describe('bloque 11: los colaboradores externos participan en el mismo filtro que los familiares', () => {
  it('cada colaborador con tareas aparece como chip de filtro ("🤝 Nombre"), igual que los familiares ("👤 Nombre")', () => {
    expect(UI).toContain("👤 {m.name}")
    expect(UI).toContain("🤝 {h.name}")
  })
  it('el texto de la etiqueta/relación no se muestra en el chip del filtro (solo el nombre, para no alargarlo)', () => {
    const filterRow = window_(UI, 'aria-label="Filtrar por responsable"', '</div>\n            )}')
    expect(filterRow).not.toContain('h.label')
  })
})
