// Orden de las pestañas, elegido por quien mira su propio móvil —
// petición real: "quiero que todas las pestañas... se puedan mover de
// sitio... toda la aplicación quiero que sea móvil". Mismo patrón que
// homeCardOrder.ts (por dispositivo, en localStorage, no en Supabase:
// cada persona de la familia puede querer las suyas en un orden
// distinto), generalizado con una clave por cada fila de pestañas de
// la app en vez de repetir el mismo código en cada pantalla.
function storageKey(key: string): string {
  return `familyapp:tab-order:${key}`
}

export function loadTabOrder(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : null
  } catch {
    return null
  }
}

export function saveTabOrder(key: string, order: string[]): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(order))
  } catch {
    // localStorage no disponible (privado/bloqueado): se pierde
    // recordar el orden entre visitas, no es crítico.
  }
  // NavShell vive montado en TODA la app (es la propia estructura, no
  // una pantalla más) y su orden solo se lee una vez al montar — sin
  // este aviso, reordenar el menú rápido desde la pantalla de
  // "Organizar menú" no se reflejaba en la barra de abajo hasta
  // recargar la app entera.
  window.dispatchEvent(new CustomEvent('family-app:tab-order-changed', { detail: { key } }))
}

// Junta el orden guardado con las pestañas que existan de verdad hoy —
// si se guardó un orden antes de añadir/quitar alguna pestaña, las
// nuevas se añaden al final y las que ya no existen se ignoran, en vez
// de romperse (mismo criterio que resolveOrder en HomeScreen).
export function resolveTabOrder<T extends string>(allTabs: readonly T[], saved: string[] | null): T[] {
  if (!saved) return [...allTabs]
  const known = saved.filter((t): t is T => (allTabs as readonly string[]).includes(t))
  const missing = allTabs.filter((t) => !known.includes(t))
  return [...known, ...missing]
}
