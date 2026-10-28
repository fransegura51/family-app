import type { SpendRangePreset } from '@/domain/dateRanges'

// COR-04 — al abrir la ficha de un producto desde Estadística compras se sale de esa pestaña (Compras → Historial) y, al volver, la pestaña se monta de nuevo.
// Para que la persona vuelva EXACTAMENTE donde estaba, se guarda aquí lo que el usuario había elegido (periodo, Alimentos/Otros, clasificación desplegada, posición
// del scroll) y se consume una sola vez al montar la pestaña (mismo patrón que pendingMovementsFilter). Los datos NO se guardan: se vuelven a leer, así lo que se
// haya editado en la ficha se refleja sin recargar la página.
export interface StatsReturnContext {
  preset: SpendRangePreset
  customFrom: string
  customTo: string
  scope: 'alimentacion' | 'no_alimentos'
  expandedClassType: string | null
  scrollY: number
}

let saved: StatsReturnContext | null = null
let savedAt = 0
/** Un «volver» guardado caduca: si pasa mucho tiempo sin volver, ya no es lo que la persona espera encontrar. */
const MAX_AGE_MS = 30 * 60 * 1000

export function saveStatsReturnContext(ctx: StatsReturnContext): void {
  saved = ctx
  savedAt = Date.now()
}

export function takeStatsReturnContext(): StatsReturnContext | null {
  const value = saved && Date.now() - savedAt <= MAX_AGE_MS ? saved : null
  saved = null
  return value
}

/** Se descarta cuando la persona se va de Estadística / Historial / Tickets (o sale de Compras): ya no hay "volver" que ofrecer. */
export function clearStatsReturnContext(): void {
  saved = null
}
