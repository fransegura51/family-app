// "Siguiente preparativo" (Tanda Encargos v2) — motor GENERAL, decoupled de Encargos: sirve tanto para
// resolver un encargo entero como para completar una sola tarea cualquiera, aunque hoy solo exista una
// relación real verificada (ver abajo). PEPA PROPONE, nunca impone: esta función solo calcula QUÉ
// proponer — la UI decide cuándo mostrarlo y nada se crea hasta que la familia elige "Crear preparativo"
// o "+ Crear otro" en el formulario normal de "Nueva tarea".
//
// Deliberadamente NO se fabrican las relaciones ilustrativas que se dieron solo como ejemplo (tarta →
// recogerla, regalo → envolverlo, invitación → enviarla, restaurante → confirmar comensales...): ninguna
// de ellas existe hoy como hecho estructural en el motor de decisiones (ver auditoría — "Recoger
// anillos/detalles" en events.ts es una tarea fija del checklist inicial por tipo de evento, sin relación
// con ninguna decisión). La única relación real y pedida explícitamente es Flores → Recoger las flores,
// así que es la única que se registra aquí. Añadir una futura relación real es solo una entrada más en
// GROUP_KIND_NEXT_STEPS, nunca un detector de palabras sobre el título.
import type { EventTask, EventTaskGroup } from '@/domain/types'

export interface NextStepSuggestion {
  key: string
  title: string
}

// Clave = EventTaskGroup.kind (identificador interno estable, nunca el name editable).
const GROUP_KIND_NEXT_STEPS: Record<string, NextStepSuggestion[]> = {
  flores: [{ key: 'recoger_flores', title: 'Recoger las flores' }],
}

export function suggestNextStepsForGroup(group: Pick<EventTaskGroup, 'kind'>): NextStepSuggestion[] {
  if (!group.kind) return []
  return GROUP_KIND_NEXT_STEPS[group.kind] ?? []
}

// Hoy siempre devuelve [] — no hay ninguna relación real verificada a nivel de UNA tarea individual
// (distinto de un encargo resuelto). Existe para que completar cualquier tarea pase por el MISMO
// mecanismo, de forma que el día que haya una relación real de este tipo baste con declararla aquí, sin
// tener que diseñar un segundo camino en la UI.
export function suggestNextStepsForTask(_task: Pick<EventTask, 'id'>): NextStepSuggestion[] {
  return []
}
