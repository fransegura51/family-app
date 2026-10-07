import { describe, expect, it } from 'vitest'

// Cola nocturna, Bloque 9 — Preparativos: una tarea marcada hecha desaparecía para siempre de la vista
// (auditoría: solo quedaba el recuento agregado "X de Y completadas", sin ningún borrado real — el dato ya
// se conservaba en la base de datos). Se añade una sección "✔️ Completadas (N)", colapsada por defecto,
// que reutiliza TaskCard tal cual (misma ficha, mismo nombre/responsable/fecha/estado) — nunca un
// componente ni un modelo nuevos. Una tarea completada nunca se puede borrar desde ahí.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const TAREAS_CASE = slice(SRC, "case 'tareas': {", "\n      case 'invitados'")

describe('Completadas/Historial — una tarea hecha se conserva, nunca se pierde', () => {
  it('completedTasks es el mismo array `tasks` de siempre, solo el lado done:true — no una consulta ni un estado aparte', () => {
    expect(SRC).toContain('const completedTasks = tasks.filter((t) => t.done)')
  })

  it('la sección está colapsada por defecto (showCompletedTasks arranca en false) — no cambia la vista de siempre de Preparativos', () => {
    expect(SRC).toContain('const [showCompletedTasks, setShowCompletedTasks] = useState(false)')
  })

  it('reutiliza TaskCard tal cual para las completadas — mismo componente que las pendientes, no uno nuevo', () => {
    expect(TAREAS_CASE).toContain('{completedTasks.map((t) => (')
    const completedBlock = slice(TAREAS_CASE, '{completedTasks.map((t) => (', '))}')
    expect(completedBlock).toContain('<TaskCard')
    expect(completedBlock).toContain('responsible={familyMembers.find((m) => m.id === t.assignedMemberId) ?? null}')
  })

  it('el checkbox de una completada la devuelve a pendiente (done:false) — no es un no-op como si repitiera done:true', () => {
    const completedBlock = slice(TAREAS_CASE, '{completedTasks.map((t) => (', '))}')
    expect(completedBlock).toContain('onToggleDone={() => updateEventTask(t.id, { done: false }).then(reloadTasks)}')
  })

  it('una tarea completada nunca se puede borrar desde el historial: no se le pasa onDelete a TaskCard', () => {
    const completedBlock = slice(TAREAS_CASE, '{completedTasks.map((t) => (', '))}')
    expect(completedBlock).not.toContain('onDelete')
  })

  it('sigue siendo editable (✏️ Editar) tal cual estaba — un dato mal puesto se puede corregir sin desmarcarla', () => {
    const completedBlock = slice(TAREAS_CASE, '{completedTasks.map((t) => (', '))}')
    expect(completedBlock).toContain('onEdit={() => setEditingTaskId(t.id)}')
  })
})

describe('TaskCard.onDelete es opcional — el menú "⋯" solo pinta "🗑️ Borrar" cuando lo recibe', () => {
  const fn = slice(SRC, 'function TaskCard(', '\nfunction TaskEditModal')

  it('el tipo de la prop es opcional (onDelete?: () => void)', () => {
    expect(fn).toContain('onDelete?: () => void')
  })

  it('el botón de borrar se pinta condicionalmente', () => {
    expect(fn).toContain('{onDelete && (')
    expect(fn).toContain('<ConfirmButton')
  })

  it('la lista de pendientes (arriba) sigue pasando onDelete tal cual — solo las completadas se quedan sin él', () => {
    const pendingBlock = slice(TAREAS_CASE, '{visibleTasks.map((t) => (', '))}')
    expect(pendingBlock).toContain('onDelete={() => deleteEventTask(t.id).then(reloadTasks)}')
  })
})
