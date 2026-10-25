import type { PlannedSeries } from '@/help/tours/planned/types'

// Recorridos planificados (Configuración, Cuentas y Avisos): funciones todavía en desarrollo o sin validar. Ver planned/types.ts.
export const PLANNED_F: PlannedSeries[] = [
  {
    id: 'ser-cuentas-sesiones',
    module: 'cuentas',
    title: 'Ver y cerrar mis sesiones abiertas',
    summary: 'Ver en qué dispositivos tienes la sesión abierta y cerrarla en los que no uses.',
    blockedBy: 'La pantalla de sesiones no existe todavía (la ficha cue-sesiones está desactivada): hoy «Cerrar sesión» solo cierra la de este móvil. Falta construir la función.',
  },
  {
    id: 'ser-cuentas-invitar-amigos',
    module: 'cuentas',
    title: 'Invitar a mis amigos a PEPA',
    summary: 'Mandar una invitación a un amigo para que cree su propia familia en PEPA.',
    blockedBy: 'Invitar amigos no está activado (ficha cue-invitar-amigos desactivada): PEPA es privada y las invitaciones de familia las gestiona la administración de PEPA. Falta decidir y abrir la función.',
  },
]
