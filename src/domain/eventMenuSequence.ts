// «Menú del evento» — la SECUENCIA del menú (orden de presentación) es independiente de la sección (clasificación).
//
//   · ORDEN DE PRESENTACIÓN = event_menu_items.sort_order: posición explícita y persistente. Solo cambia cuando la
//     persona lo pide (arrastrar, ▲▼) o al colocar elementos NUEVOS; NUNCA por cambiar de sección, editar el nombre,
//     añadir una nota o vincular una receta.
//   · SECCIÓN = metadato de clasificación (category). Sirve para organizar, importar, receta/compras e infantil.
//
// Importar o añadir NUNCA reordena lo que ya existe: solo se inserta lo nuevo en un sitio EXPLÍCITO.
import type { EventMenuItem } from '@/domain/types'
import { moveId } from '@/domain/eventDayPlan'

export { moveId }

export type MenuPlacement = { type: 'end' } | { type: 'start' } | { type: 'after'; itemId: string }

function byPosition(a: EventMenuItem, b: EventMenuItem): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// El menú en su orden real (posición explícita; created_at e id solo desempatan valores iguales).
export function menuSequence(items: EventMenuItem[]): EventMenuItem[] {
  return [...items].sort(byPosition)
}

// Ids finales tras insertar elementos NUEVOS en un sitio explícito. Los existentes conservan su orden relativo.
export function placeNewIds(existingOrdered: string[], newIds: string[], placement: MenuPlacement): string[] {
  if (placement.type === 'end') return [...existingOrdered, ...newIds]
  if (placement.type === 'start') return [...newIds, ...existingOrdered]
  const at = existingOrdered.indexOf(placement.itemId)
  if (at === -1) return [...existingOrdered, ...newIds] // el elemento de referencia ya no existe: al final, nunca se pierde
  return [...existingOrdered.slice(0, at + 1), ...newIds, ...existingOrdered.slice(at + 1)]
}

// Un plato creado a mano nace junto a los de SU sección si ya hay (después del último); si no, donde le toca por el
// orden de secciones configurado (después de la sección anterior que tenga platos, o al principio). Sin sección → al final.
// Solo decide dónde NACE: una vez en la secuencia, mover de sección no lo mueve.
export function placementForNewDish(
  sequence: EventMenuItem[],
  sectionKeyOfItem: (item: EventMenuItem) => string | null,
  targetKey: string | null,
  configKeysInOrder: string[],
): MenuPlacement {
  const ordered = menuSequence(sequence)
  if (ordered.length === 0 || targetKey === null) return { type: 'end' }
  const lastOf = (key: string): EventMenuItem | undefined => [...ordered].reverse().find((i) => i.kind === 'dish' && sectionKeyOfItem(i) === key)
  const same = lastOf(targetKey)
  if (same) return { type: 'after', itemId: same.id }
  const index = configKeysInOrder.indexOf(targetKey)
  if (index === -1) return { type: 'end' }
  for (let i = index - 1; i >= 0; i--) {
    const previous = lastOf(configKeysInOrder[i])
    if (previous) return { type: 'after', itemId: previous.id }
  }
  return { type: 'start' }
}

export const KIND_LABELS: Record<EventMenuItem['kind'], string> = {
  dish: 'Plato',
  heading: 'Encabezado / separador',
  note: 'Nota',
}

// Un texto no-plato (encabezado o nota) se conserva en su posición; no tiene sección, receta, origen ni compras.
export function isDish(item: Pick<EventMenuItem, 'kind'>): boolean {
  return item.kind === 'dish'
}

export function dishCount(items: Pick<EventMenuItem, 'kind'>[]): number {
  return items.filter(isDish).length
}
