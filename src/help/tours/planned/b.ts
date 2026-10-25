import type { PlannedSeries } from '@/help/tours/planned/types'

// Recorridos planificados (Compras y Economía): funciones ya implementadas pero que la usuaria aún no ha validado en iPhone y Android (docs/VALIDACION_MOVIL_COMPRAS_ECONOMIA.md). No se ofrecen a las familias
// hasta que se aprueben; entonces se convierten en una serie normal (src/help/tours/series/b.ts).
export const PLANNED_B: PlannedSeries[] = [
  {
    id: 'ser-economia-efectivo',
    module: 'economia',
    title: 'Efectivo y carteras',
    summary: 'Crear carteras de efectivo (personales o familiares), apuntar entradas, salidas y ajustes, hacer traspasos y retirar efectivo del banco.',
    blockedBy: 'Validación en iPhone y Android por la usuaria (carteras de efectivo implementadas el 24/10/2026, pendientes de aprobar).',
  },
  {
    id: 'ser-compras-pagos-devoluciones',
    module: 'compras',
    title: 'Pagos con varios medios, devoluciones y duplicados',
    summary: 'Pagar una compra con varios medios y con efectivo de una cartera, registrar una devolución, vincular o quitar duplicados y deshacer un borrado.',
    blockedBy: 'Validación en iPhone y Android por la usuaria (pagos mixtos, devoluciones y duplicados implementados el 24/10/2026, sin ejercitar aún con datos reales).',
  },
]
