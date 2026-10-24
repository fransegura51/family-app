import type { TourDef } from '@/help/tours/types'

// Configuración (src/ui/MenuSettingsScreen.tsx y las tarjetas de «Avisos»). Visita guiada y tres tutoriales: orden del menú, colores y horario de avisos.
// No hay tutorial del «Modo de cuentas»: un solo toque lo guarda y cambia lo que ve toda la familia en Economía, así que no es seguro enseñarlo paso a paso.
// Nada de lo de «Mi cuenta» (cerrar sesión, borrar cuenta) ni de Seguridad (contraseña, PIN) se recorre en un tutorial.

export const visitaConfiguracion: TourDef = {
  id: 'visita-configuracion',
  kind: 'visit',
  module: 'configuracion',
  version: 1,
  title: 'Conoce Configuración',
  summary: 'Dónde está cada ajuste de PEPA: menú, colores, avisos, cuenta y más.',
  cardId: 'cfg-que-hay',
  durationSec: 100,
  startPath: '/menu-organizar',
  steps: [
    {
      id: 'temas',
      text: 'Configuración es una lista de temas. Toca uno y se despliega; solo se abre uno a la vez. Esta visita solo te enseña dónde está cada cosa: no cambia nada.',
      target: 'config.group-menu',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'nombre',
      text: 'Arriba está el nombre de la familia. Solo la administración de la familia puede cambiarlo.',
      target: 'config.family-name',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'centro-admin',
      text: '«Centro de Administración PEPA» solo sale en las cuentas que administran la aplicación PEPA. No es lo mismo que administrar tu familia.',
      target: 'config.admin-center',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'menu',
      text: '«Organizar menú»: eliges qué cuatro secciones quedan fijas abajo y en qué orden; las demás salen en «☰ Menú». Cada persona ordena el suyo.',
      target: 'config.group-menu',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'colores',
      text: '«Colores»: el estilo de las pantallas (Pastel, Vivo o Neutro) y, aparte, el de los gráficos. Al cambiarlo, la app se recarga para repintarse.',
      target: 'config.group-colores',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'avisos',
      text: '«Avisos»: activar los avisos de este móvil, elegir la hora de tus resúmenes de tareas y, para la administración, a quién llegan los avisos de tareas y eventos.',
      target: 'config.group-avisos',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'cuenta',
      text: '«Mi cuenta»: cerrar sesión en este móvil y la opción de borrar tu cuenta, que no se puede deshacer y pide escribir una palabra de confirmación. Aquí no toco nada.',
      target: 'config.group-cuenta',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Ya sabes dónde está cada ajuste. Si quieres practicar, pídeme un tutorial: el orden del menú, los colores o el horario de avisos.',
  next: ['cfg-que-hay', 'cfg-colores', 'not-resumen-tareas'],
}

export const tutConfiguracionOrdenMenu: TourDef = {
  id: 'tut-configuracion-orden-menu',
  module: 'configuracion',
  group: 'Configuración',
  summary: 'Cambiar qué secciones quedan fijas abajo y en qué orden.',
  version: 1,
  title: 'Cambiar el orden del menú',
  cardId: 'cfg-que-hay',
  durationSec: 60,
  startPath: '/menu-organizar',
  startDest: 'config.menu',
  steps: [
    {
      id: 'lista',
      text: 'Esta es la lista de secciones. Las cuatro primeras (📌) se quedan fijas en la barra de abajo; el resto aparece al tocar «☰ Menú».',
      target: 'config.menu-order',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'mover',
      text: 'Pulsa ↑ o ↓ junto a una sección para moverla. Te señalo un ↑ como ejemplo. Se guarda al momento y siempre puedes volver a ponerlo como estaba.',
      target: 'config.menu-move',
      completeOn: [{ type: 'event', name: 'config.menu-order-changed' }],
      sensitive: true,
    },
    {
      id: 'resultado',
      text: 'Ya está movida: la barra de abajo se actualiza sola. Mueve más si quieres; cuando termines, pulsa «Siguiente». Este orden es solo tuyo.',
      target: 'config.menu-order',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Listo. Tu menú queda como lo has dejado, en tu cuenta. Cuando quieras cambiarlo, vuelve a Configuración → «Organizar menú».',
  next: ['cfg-que-hay', 'cfg-sincronizacion'],
}

export const tutConfiguracionColores: TourDef = {
  id: 'tut-configuracion-colores',
  module: 'configuracion',
  group: 'Configuración',
  summary: 'Ver los estilos de color y saber cómo cambiarlos (la app se recarga al elegir uno).',
  version: 1,
  title: 'Cambiar los colores de la app',
  cardId: 'cfg-colores',
  durationSec: 60,
  startPath: '/menu-organizar',
  startDest: 'config.colores',
  steps: [
    {
      id: 'pantallas',
      text: 'Aquí eliges el estilo de Inicio, los menús, las tarjetas, el calendario, las compras y la cocina: Pastel, Vivo o Neutro. Cada opción trae una muestra de colores.',
      target: 'config.colors-ui',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'graficos',
      text: 'Aquí, aparte, el estilo de los gráficos de Economía y de la estadística de compras: Pastel o Vivo.',
      target: 'config.colors-charts',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'decidir',
      text: 'Cuando pulses un estilo, PEPA lo guarda en tu cuenta y la app se recarga para repintarse; este recorrido terminará ahí. Yo no lo pulso: lo eliges tú.',
      target: 'config.colors-ui',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Cuando quieras, pulsa el estilo que prefieras. Se guarda en tu cuenta y vale en todos tus dispositivos.',
  next: ['cfg-sincronizacion', 'cfg-que-hay'],
}

export const tutNotificacionesHorarioAvisos: TourDef = {
  id: 'tut-notificaciones-horario-avisos',
  module: 'notificaciones',
  group: 'Avisos',
  summary: 'Activar el resumen diario de tareas atrasadas y elegir su hora.',
  version: 1,
  title: 'Activar un horario de avisos de tareas',
  cardId: 'not-resumen-tareas',
  durationSec: 90,
  startPath: '/menu-organizar',
  startDest: 'config.avisos',
  steps: [
    {
      id: 'tarjeta',
      text: 'Aquí están los horarios de tus avisos. Son solo tuyos y valen en todos tus dispositivos. Por defecto recibes el resumen de las tareas de hoy a las 08:00; el de las atrasadas viene desactivado.',
      target: 'notifications.prefs-card',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'zona',
      text: 'Las horas se cuentan en tu zona horaria. Si tu móvil está en otra, PEPA te lo propone, pero nunca la cambia sola.',
      target: 'notifications.timezone',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'activar',
      text: 'Marca «Avisarme de las tareas atrasadas» para recibir un resumen de las vencidas que siguen pendientes. Se guarda en cuanto lo marcas.',
      target: 'notifications.task-overdue',
      completeOn: [{ type: 'event', name: 'notifications.task-overdue-enabled' }],
      skipIf: [{ type: 'appear', target: 'notifications.task-overdue-time' }],
      sensitive: true,
    },
    {
      id: 'hora',
      text: 'Elige la hora (formato 24 h). El aviso llega desde esa hora y como mucho una hora después, y solo si hay tareas atrasadas: nunca se manda uno vacío. Cada cambio de hora se guarda al momento.',
      target: 'notifications.task-overdue-time',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'movil',
      text: 'Para que el resumen también te llegue al móvil, las notificaciones de este móvil tienen que estar activadas aquí. Si no lo están, lo verás en la campana 🔔 de Inicio. Yo no pido ese permiso: lo decides tú.',
      target: 'notifications.device-card',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Listo. Recibirás ese resumen a la hora elegida en cuanto haya tareas atrasadas. Puedes cambiar la hora o apagarlo cuando quieras.',
  next: ['not-activar', 'not-campana'],
}

export const TOURS_CONFIGURACION: TourDef[] = [visitaConfiguracion, tutConfiguracionOrdenMenu, tutConfiguracionColores, tutNotificacionesHorarioAvisos]
