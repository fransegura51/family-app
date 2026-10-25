import type { PlannedSeries } from '@/help/tours/planned/types'

// Recorridos planificados (Comunidad, Ubicación, Inicio, Pepa y Ayuda): funciones todavía en desarrollo o sin validar. Ver planned/types.ts.
export const PLANNED_E: PlannedSeries[] = [
  {
    id: 'ser-ubicacion-iphone',
    module: 'ubicacion',
    title: 'Ubicación con la app cerrada en iPhone',
    summary: 'Cómo conseguir que los avisos de llegada y salida funcionen con la app de iPhone cerrada.',
    blockedBy: 'La app de iPhone está preparada pero SIN PROBAR en un iPhone real (docs/APP_IOS.md): no se sabe si manda la posición con la app cerrada. No se escribe hasta probarlo.',
  },
  {
    id: 'ser-comunidad-ajustes',
    module: 'comunidad',
    title: 'Mis ajustes de Comunidad',
    summary: 'Cambiar alias o icono, personas que sigo y bloqueadas, temas favoritos, avisos de Comunidad y «Mis datos y su eliminación».',
    blockedBy: 'Comunidad se abrió a personas adultas el 17/10/2026 y falta validar estas pantallas con cuentas reales; además hay que decidir qué se guía, porque eliminar mis datos no debe guiarse.',
  },
  {
    id: 'ser-comunidad-comentar',
    module: 'comunidad',
    title: 'Comentar, responder y valorar en Comunidad',
    summary: 'Comentar una publicación, responder con foto, dar Me gusta y valorar una receta.',
    blockedBy: 'Comentar, responder y valorar publican al instante y Comunidad no tiene un modo de práctica: falta decidir cómo enseñarlo sin publicar nada por la persona.',
  },
  {
    id: 'ser-pepa-otras-cosas',
    module: 'pepa',
    title: 'Otras cosas que Pepa sabe hacer',
    summary: 'Apuntar el menú, pasar los ingredientes a la compra, guardar una receta o un lugar, fijar un presupuesto o preguntar dónde está alguien.',
    blockedBy: 'Falta comprobar en un dispositivo cada frase con la tarjeta y sin ella (el presupuesto siempre lleva tarjeta) y decidir si se enseña como capítulo o solo como explicación «Entiende cómo funciona».',
  },
]
