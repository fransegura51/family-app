// Orden de las tarjetas de Inicio, elegido por quien mira su propio
// móvil — petición real: "quiero que se puedan organizar como yo
// quiera, que se puedan mover de sitio". Por dispositivo (localStorage,
// no en Supabase): cada persona de la familia puede querer las suyas
// en un orden distinto, no tiene que ser el mismo para todos.
const STORAGE_KEY = 'familyapp:home-card-order'

export function loadHomeCardOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : null
  } catch {
    return null
  }
}

export function saveHomeCardOrder(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // localStorage no disponible (privado/bloqueado): se pierde
    // recordar el orden entre visitas, no es crítico.
  }
}
