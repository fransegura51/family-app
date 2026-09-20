// Petición real: categorías, etiquetas y clases de alimentos se gestionan
// desde Configuración, pero "es imprescindible que en cada lugar donde
// se utilicen haya un acceso directo a la gestión en sí". Las tres
// ventanas de gestión se abren desde cualquier pantalla con
// openManager() — NavShell (montado en toda la app) escucha este aviso
// y las carga bajo demanda, y cuando algo cambia avisa con
// notifyManagersChanged() para que la pantalla que esté debajo
// recargue sus listas.
export type ManagerKind = 'categorias' | 'etiquetas' | 'clases'

const OPEN_EVENT = 'family-app:open-manager'
const CHANGED_EVENT = 'family-app:managers-changed'

export function openManager(kind: ManagerKind): void {
  window.dispatchEvent(new CustomEvent<ManagerKind>(OPEN_EVENT, { detail: kind }))
}

export function onOpenManager(handler: (kind: ManagerKind) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ManagerKind>).detail)
  window.addEventListener(OPEN_EVENT, listener)
  return () => window.removeEventListener(OPEN_EVENT, listener)
}

export function notifyManagersChanged(): void {
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

export function onManagersChanged(handler: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, handler)
  return () => window.removeEventListener(CHANGED_EVENT, handler)
}
