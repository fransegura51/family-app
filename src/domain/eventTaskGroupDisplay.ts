// "🗂️ Encargos" como contenedor visual (Tanda Encargos v2): convierte una lista plana de tareas en los
// bloques que la pantalla pinta — un encabezado compartido POR ENCARGO (nunca repetido en cada tarjeta)
// seguido de sus tareas, en el orden de la PRIMERA aparición de cada encargo en la lista original; una
// tarea sin encargo (o cuyo encargo ya no existe en `groups`) se queda como ítem suelto, en su sitio.
import type { EventTask, EventTaskGroup } from '@/domain/types'

export type TaskGroupRenderItem = { type: 'task'; task: EventTask } | { type: 'group'; groupId: string; groupName: string; group: EventTaskGroup; tasks: EventTask[] }

export function buildTaskGroupRenderItems(tasks: EventTask[], groups: EventTaskGroup[]): TaskGroupRenderItem[] {
  const groupById = new Map(groups.map((g) => [g.id, g]))
  const seenGroupIds = new Set<string>()
  const items: TaskGroupRenderItem[] = []
  for (const task of tasks) {
    const group = task.groupId ? groupById.get(task.groupId) : undefined
    if (!group) {
      items.push({ type: 'task', task })
      continue
    }
    if (seenGroupIds.has(group.id)) continue
    seenGroupIds.add(group.id)
    items.push({ type: 'group', groupId: group.id, groupName: group.name, group, tasks: tasks.filter((t) => t.groupId === group.id) })
  }
  return items
}
