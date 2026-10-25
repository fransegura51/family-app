import type { PlannedSeries } from '@/help/tours/planned/types'

// Recorridos planificados (Familia, Cocina y Pequeños Grandes): funciones todavía en desarrollo o sin validar. Ver planned/types.ts.
export const PLANNED_C: PlannedSeries[] = [
  {
    id: 'ser-pequenos-educacion',
    module: 'pequenos',
    title: 'Educación financiera',
    summary: 'Apunta un ingreso o un gasto del monedero de un niño o niña, aprueba sus movimientos y crea un objetivo de ahorro.',
    blockedBy:
      'Los formularios de «Educación financiera» (KidsFinanceTab y WalletTransactionModal, en src/ui/FinanceScreen.tsx) solo tienen marcas de Ayuda para el objetivo, el dinero, las tarjetas y el reparto (finance.kids-*): ' +
      'faltan las de «+ Nuevo ingreso/gasto», los campos de importe y descripción, «✓ Aprobar / ✕ Rechazar» y el formulario del objetivo de ahorro, y los avisos de guardado (emitHelpEvent). ' +
      'FinanceScreen.tsx lo edita otra persona: cuando las tenga, se escribe como serie (apuntar ingreso/gasto, aprobación por adultos, crear objetivo).',
  },
]
