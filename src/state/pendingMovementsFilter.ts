import type { MovementsFilter } from '@/ui/FinanceScreen'

// Petición real: "ponle a las estadísticas de compras los enlaces para
// filtrar los movimientos igual que en economía" — Compras y Economía
// son rutas distintas de la SPA, así que un enlace desde Estadística
// compras no puede llamar directamente al `setMovementsFilter` local
// de FinanceScreen. Mismo patrón que calendarSelection.ts: variable de
// módulo simple, leída y consumida una sola vez al montar Economía.
let pendingFilter: MovementsFilter | null = null

export function setPendingMovementsFilter(filter: MovementsFilter): void {
  pendingFilter = filter
}

export function takePendingMovementsFilter(): MovementsFilter | null {
  const filter = pendingFilter
  pendingFilter = null
  return filter
}
