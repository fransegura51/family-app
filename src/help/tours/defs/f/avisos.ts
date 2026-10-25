import type { TourDef } from '@/help/tours/types'

// Avisos (serie `ser-avisos-configurar`, «Tus avisos»): activar los avisos en este móvil, el resumen de tareas (hoy y atrasadas) y la campana de Inicio. Comprobado contra
// src/ui/NotificationsCard.tsx, NotificationPrefsCard.tsx, TaskSummaryPrefs.tsx, NotificationBell.tsx y NotificationPanel.tsx.
// Ningún capítulo activa nada por la persona, abre un aviso, marca avisos como leídos ni elimina: señalan y esperan. El capítulo de Android («Que lleguen con la app cerrada») es el de
// Ubicación `tut-ubicacion-permiso-android`: un capítulo solo puede estar en una serie de su propio módulo (ver el informe).

const info = { completeOn: [] as never[], manualNext: true }

export const visitaNotificaciones: TourDef = {
  id: 'visita-notificaciones',
  kind: 'visit',
  module: 'notificaciones',
  title: 'Conoce los avisos',
  summary: 'La campana de Inicio y dónde se ajustan los avisos del móvil y los resúmenes de tareas.',
  version: 2,
  cardId: 'not-campana',
  durationSec: 90,
  startPath: '/menu-organizar',
  startDest: 'config.avisos',
  steps: [
    {
      id: 'dos-cosas',
      text: 'Los avisos de PEPA son dos cosas: la campana 🔔 de Inicio, que guarda tus avisos, y los avisos del móvil, que te llegan aunque la app esté cerrada. Aquí se ajusta lo segundo. Esta visita no cambia nada.',
      ...info,
    },
    {
      id: 'movil',
      text: '«Avisos en este móvil»: activas o desactivas los avisos de este aparato y puedes mandarte uno de prueba. Cada móvil se activa por separado.',
      target: 'notifications.device-card',
      ...info,
      optional: true,
    },
    {
      id: 'horarios',
      text: '«Horarios de tus avisos»: tu zona horaria, la hora de los resúmenes de tareas de hoy y de las atrasadas y, si participas en Comunidad, sus avisos. Son solo tuyos y valen en todos tus dispositivos.',
      target: 'notifications.prefs-card',
      ...info,
      optional: true,
    },
    {
      id: 'quien',
      text: '«¿A quién avisamos de tareas y eventos?»: a todos los miembros activos o solo a los asignados. Solo la administración de la familia puede cambiarlo.',
      target: 'notifications.task-mode',
      ...info,
      optional: true,
    },
    {
      id: 'android',
      text: 'Solo en la app de Android: más abajo, una guía para dejar el móvil bien ajustado (batería, según tu marca) y que los avisos lleguen con la app cerrada.',
      target: 'notifications.battery-guide',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Ya sabes dónde están los avisos. Para abrir la campana, mírala arriba a la derecha en Inicio. Si quieres practicar, abre «Tus avisos».',
  next: ['not-activar', 'not-resumen-tareas', 'not-campana'],
}

export const tutNotificacionesActivar: TourDef = {
  id: 'tut-notificaciones-activar',
  module: 'notificaciones',
  group: 'Avisos',
  summary: 'Activar los avisos en este móvil, mandarte uno de prueba y qué hacer si salen bloqueados.',
  version: 2,
  title: 'Activar los avisos en este móvil',
  cardId: 'not-activar',
  durationSec: 90,
  startPath: '/menu-organizar',
  startDest: 'config.avisos',
  readyOn: ['notifications.device-card'],
  steps: [
    {
      id: 'tarjeta',
      text: 'Los avisos se activan en cada móvil por separado. Esta tarjeta, «Avisos en este móvil», es la de este aparato y te dice si están activados o no. Abajo, en letra pequeña, el «Detalle: permiso…» sirve para saber qué ve PEPA si algo falla.',
      target: 'notifications.device-card',
      ...info,
    },
    {
      id: 'no-soportado',
      text: 'Si en vez de un botón ves «Este navegador no permite avisos»: en iPhone hay que añadir PEPA a la pantalla de inicio (Compartir, Añadir a pantalla de inicio) y abrirla desde ahí.',
      target: 'notifications.unsupported',
      ...info,
      optional: true,
    },
    {
      id: 'bloqueado',
      text: 'Si dice que los avisos están bloqueados, PEPA no puede cambiarlo sola: sigue los pasos que salen debajo, en los ajustes del navegador o del móvil, y vuelve aquí.',
      target: 'notifications.blocked',
      ...info,
      optional: true,
    },
    {
      id: 'activar',
      text: 'Pulsa «Activar avisos». El móvil te preguntará si permites los avisos: elige «Permitir». Yo no pulso nada por ti. Si prefieres no activarlos ahora, pulsa «Salir».',
      target: 'notifications.enable',
      completeOn: [{ type: 'event', name: 'notifications.push-enabled' }],
      skipIf: [{ type: 'appear', target: 'notifications.disable' }],
      sensitive: true,
      optional: true,
    },
    {
      id: 'prueba',
      text: 'Para comprobarlo, pulsa «Mandarme un aviso de prueba»: debería llegarte en unos segundos. Es opcional; si no quieres, pulsa «Siguiente».',
      target: 'notifications.test',
      completeOn: [{ type: 'event', name: 'notifications.test-sent' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'desactivar',
      text: 'Cuando los tienes activados, este botón, «Desactivar avisos», los apaga solo en este móvil. Yo no lo pulso: queda aquí para cuando lo necesites.',
      target: 'notifications.disable',
      ...info,
      optional: true,
    },
    {
      id: 'limites',
      text: 'Dos avisos: en iPhone hay que añadir PEPA a la pantalla de inicio para recibirlos, y en Android el ahorro de batería puede impedirlos con la app cerrada. Con la app de Android, más abajo hay una guía.',
      target: 'notifications.device-card',
      ...info,
    },
  ],
  finishText: 'Listo. Para elegir la hora de tus resúmenes de tareas, sigue con el capítulo «Elegir cuándo recibo el resumen de tareas».',
  next: ['not-resumen-tareas', 'not-campana', 'ubi-permiso-android'],
}

export const tutNotificacionesHorarioAvisos: TourDef = {
  id: 'tut-notificaciones-horario-avisos',
  module: 'notificaciones',
  group: 'Avisos',
  summary: 'Elegir cuándo recibes el resumen de tus tareas de hoy y de las atrasadas.',
  version: 2,
  title: 'Elegir cuándo recibo el resumen de tareas',
  cardId: 'not-resumen-tareas',
  durationSec: 90,
  startPath: '/menu-organizar',
  startDest: 'config.avisos',
  readyOn: ['notifications.task-today'],
  steps: [
    {
      id: 'tarjeta',
      text: 'Aquí están los horarios de tus avisos. Son solo tuyos y valen en todos tus dispositivos. Lo que marques o cambies se guarda de verdad al momento; si solo estás mirando, no toques nada y pulsa «Siguiente».',
      target: 'notifications.prefs-card',
      ...info,
    },
    {
      id: 'zona',
      text: 'Las horas se cuentan en tu zona horaria. Si tu móvil está en otra, PEPA te lo propone, pero nunca la cambia sola.',
      target: 'notifications.timezone',
      ...info,
      optional: true,
    },
    {
      id: 'hoy',
      text: 'Este es el resumen de tus tareas de hoy: viene marcado de fábrica, a las 08:00. Si lo desmarcas, dejas de recibirlo. Solo se envía si tienes tareas de hoy sin hacer: nunca llega vacío.',
      target: 'notifications.task-today',
      ...info,
    },
    {
      id: 'hora-hoy',
      text: 'Con el aviso marcado, elige la hora (formato 24 h). Llega desde esa hora y como mucho una hora después. Cada cambio de hora se guarda al momento.',
      target: 'notifications.task-today-time',
      ...info,
      optional: true,
    },
    {
      id: 'atrasadas',
      text: 'Marca «Avisarme de las tareas atrasadas» para recibir un resumen de las vencidas que siguen pendientes. Se guarda de verdad en cuanto la marcas; si prefieres no hacerlo, pulsa «Salir».',
      target: 'notifications.task-overdue',
      completeOn: [{ type: 'event', name: 'notifications.task-overdue-enabled' }],
      skipIf: [{ type: 'appear', target: 'notifications.task-overdue-time' }],
      sensitive: true,
    },
    {
      id: 'hora-atrasadas',
      text: 'Elige la hora de las atrasadas (formato 24 h). El aviso llega desde esa hora y como mucho una hora después, y solo si hay tareas atrasadas. Cada cambio de hora se guarda al momento.',
      target: 'notifications.task-overdue-time',
      ...info,
      optional: true,
    },
    {
      id: 'movil',
      text: 'Para que el resumen también te llegue al móvil, las notificaciones de este móvil tienen que estar activadas. Si no lo están, lo verás en la campana 🔔 de Inicio. Yo no pido ese permiso: lo decides tú.',
      target: 'notifications.device-card',
      ...info,
    },
  ],
  finishText: 'Listo. Recibirás cada resumen a su hora en cuanto haya tareas. Puedes cambiar las horas o apagarlos cuando quieras.',
  next: ['not-activar', 'not-campana'],
}

export const tutNotificacionesCampana: TourDef = {
  id: 'tut-notificaciones-campana',
  module: 'notificaciones',
  group: 'Avisos',
  summary: 'Abrir la campana de Inicio y leer, marcar y ordenar tus avisos.',
  version: 2,
  title: 'La campana de avisos',
  cardId: 'not-campana',
  durationSec: 75,
  startPath: '/',
  readyOn: ['notificaciones.campana'],
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a ver tus avisos. Pulsa la campana 🔔 de arriba a la derecha.',
      target: 'notificaciones.campana',
      completeOn: [
        { type: 'click', target: 'notificaciones.campana' },
        { type: 'appear', target: 'notificaciones.panel' },
      ],
      skipIf: [{ type: 'appear', target: 'notificaciones.panel' }],
    },
    {
      id: 'panel',
      text: 'Este es tu panel de avisos: guarda los de los últimos 30 días y abrirlo no marca nada como leído. Se cierra con ✕, con Escape o tocando fuera; si lo cierras, el resto del recorrido se salta solo.',
      target: 'notificaciones.panel',
      ...info,
      optional: true,
    },
    {
      id: 'vacio',
      text: 'Ahora mismo no tienes avisos. Aquí aparecerán los de los últimos 30 días; los más antiguos se borran solos.',
      target: 'notificaciones.vacio',
      ...info,
      optional: true,
    },
    {
      id: 'contador',
      text: 'Arriba se cuentan por separado: por ejemplo «3 nuevas · 12 leídas». Los nuevos van en negrita con un punto azul. Un aviso pasa a leído cuando lo abres o cuando lleva unos 3 segundos a la vista.',
      target: 'notificaciones.contador',
      ...info,
      optional: true,
    },
    {
      id: 'marcar-leida',
      text: 'Junto a cada aviso sin leer tienes «Marcar leída» (y, si ya está leído, «Marcar como no leída» para recordarlo). Aquí solo te lo enseño: yo no lo pulso por ti.',
      target: 'notificaciones.marcar-leida',
      ...info,
      optional: true,
    },
    {
      id: 'acciones',
      text: 'Arriba: «Marcar todas como leídas» o «como no leídas», de golpe, y «Seleccionar» para elegir avisos y eliminarlos, siempre con confirmación (eliminar un aviso no borra la tarea o el evento). Yo no los pulso.',
      target: 'notificaciones.acciones',
      ...info,
      optional: true,
    },
    {
      id: 'cerrar',
      text: 'Para volver a Inicio, pulsa ✕. Si tocas un aviso, se marca como leído y te lleva a la pantalla a la que se refiere.',
      target: 'notificaciones.cerrar',
      completeOn: [{ type: 'click', target: 'notificaciones.cerrar' }],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: '¡Listo! Ya sabes leer tus avisos. Si quieres que te lleguen también al móvil, se activan en Configuración → «🔔 Avisos».',
  next: ['not-activar', 'not-resumen-tareas', 'ini-que-veo'],
}

export const TOURS_F_AVISOS: TourDef[] = [visitaNotificaciones, tutNotificacionesActivar, tutNotificacionesHorarioAvisos, tutNotificacionesCampana]
