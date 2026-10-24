import type { TourDef } from '@/help/tours/types'

// Tutoriales «Enséñame» del grupo g8 · Calendario: calendarios externos (Google / enlace), «¿Para quién?», compartir un evento e ir a una fecha. Cada secuencia sigue el código real de
// CalendarScreen.tsx y MenuSettingsScreen.tsx. Ninguno pulsa nada por la persona, ni guarda, ni comparte, ni conecta: señalan y esperan. Compartir un evento y conectar Google son
// decisiones de la persona; el recorrido solo llega hasta el botón y lo explica (sin pasos sensibles porque no hay nada que guardar dentro de PEPA).

// ───────────────────────────── Google Calendar y calendarios por enlace
export const tutCalendarioGoogle: TourDef = {
  id: 'tut-calendario-google',
  module: 'calendario',
  group: 'Calendarios externos',
  summary: 'Encuentra dónde conectar Google Calendar, enlazar otro calendario o exportar el tuyo.',
  version: 1,
  title: 'Conectar Google Calendar o un calendario por enlace',
  cardId: 'cal-google',
  durationSec: 100,
  startPath: '/calendario',
  paths: ['/calendario', '/menu-organizar'],
  steps: [
    {
      id: 'menu',
      text: 'Los calendarios externos se gestionan desde el menú del calendario. Pulsa «☰ Menú».',
      target: 'calendar.menu',
      completeOn: [
        { type: 'click', target: 'calendar.menu' },
        { type: 'appear', target: 'calendar.manage-calendars' },
      ],
      skipIf: [
        { type: 'appear', target: 'calendar.manage-calendars' },
        { type: 'appear', target: 'config.google-card' },
      ],
    },
    {
      id: 'gestionar',
      text: 'Abajo del todo está «⚙️ Gestionar calendarios». Púlsalo: te lleva a Configuración, ya en el apartado de Calendario.',
      target: 'calendar.manage-calendars',
      completeOn: [
        { type: 'click', target: 'calendar.manage-calendars' },
        { type: 'route', path: '/menu-organizar' },
      ],
      skipIf: [{ type: 'appear', target: 'config.google-card' }],
    },
    {
      id: 'google',
      text: 'Aquí se conecta Google Calendar con «Conectar con Google»: Google te pedirá permiso y PEPA mantiene un calendario «Family App» dentro del tuyo. La decisión es tuya: yo no conecto nada.',
      target: 'config.google-card',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'exportar',
      text: 'Esta otra tarjeta genera tu enlace secreto para ver tus eventos de PEPA en el calendario del móvil (Google o Apple). No lo compartas con quien no deba verlos.',
      target: 'config.export-card',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'enlazar',
      text: 'Con «+ Enlazar calendario» pegas la dirección .ics de otro calendario (Google, Outlook, Apple…). Sus citas se ven en PEPA pero no se editan desde aquí.',
      target: 'config.link-add',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo: no he conectado ni enlazado nada. Recuerda que la sincronización con Google no es instantánea y que las citas enlazadas solo se leen. Para volver, usa «← Volver al calendario».',
  next: ['cal-vistas', 'cal-crear-evento'],
}

// ───────────────────────────── ¿Para quién?
export const tutCalendarioParaQuien: TourDef = {
  id: 'tut-calendario-para-quien',
  module: 'calendario',
  group: 'Eventos y tareas',
  summary: 'Elegir para quién es un evento: una persona, varias o toda la familia.',
  version: 1,
  title: 'Elegir para quién es un evento',
  cardId: 'cal-para-quien',
  durationSec: 80,
  startPath: '/calendario',
  startDest: 'calendario.nuevo-evento',
  steps: [
    {
      id: 'quien',
      text: 'Aquí decides para quién es. Si tu cuenta tiene ficha en la familia, ya viene elegida tu persona. Toca «¿Para quién?» para verlo.',
      target: 'calendar.event-who',
      completeOn: [
        { type: 'click', target: 'calendar.event-who' },
        { type: 'appear', target: 'calendar.who-list' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.who-list' }],
    },
    {
      id: 'lista',
      text: 'Marca a la persona, o a varias. Si no marcas a nadie, el evento es para «Toda la familia». Prueba a marcar o desmarcar; el evento no se guarda todavía.',
      target: 'calendar.who-list',
      completeOn: [{ type: 'click', target: 'calendar.who-list' }],
      manualNext: true,
    },
    {
      id: 'cerrar',
      text: 'Cierra esta ventana con la ✕ para volver al formulario.',
      target: 'calendar.who-close',
      completeOn: [{ type: 'click', target: 'calendar.who-close' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'puntos',
      text: 'Con UNA sola persona aparece este campo de puntos (opcional). Con varias o con «Toda la familia» desaparece: PEPA no reparte puntos entre varias personas.',
      target: 'calendar.event-points',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. En una tarea funciona igual: «¿Para quién?» dice quién la hace. No he guardado nada; cierra el formulario o termina de crear el evento cuando quieras.',
  next: ['cal-puntos', 'cal-crear-evento'],
}

// ───────────────────────────── Compartir un evento
// El 📤 solo existe en eventos propios (no en externos ni cumpleaños). Pulsarlo abre el menú de compartir del móvil o copia el texto: lo hace la persona, nunca el tutorial.
export const tutCalendarioCompartir: TourDef = {
  id: 'tut-calendario-compartir',
  module: 'calendario',
  group: 'Eventos y tareas',
  summary: 'Mandar un evento por WhatsApp, correo u otra app desde su icono 📤.',
  version: 1,
  title: 'Compartir un evento con alguien',
  cardId: 'cal-compartir',
  durationSec: 60,
  startPath: '/calendario',
  steps: [
    {
      id: 'icono',
      text: 'Cada evento propio tiene un icono 📤 a la derecha. Manda su título, fecha y nota como texto. Si aún no ves ninguno, abre un día con eventos o crea uno antes.',
      target: 'calendar.entry-share',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'compartir',
      text: 'Cuando quieras, pulsa tú el 📤: se abrirá el menú de compartir del móvil para elegir app y persona. Yo no lo pulso ni envío nada por ti. Después, pulsa «Siguiente».',
      target: 'calendar.entry-share',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'resultado',
      text: 'Si tu dispositivo no tiene menú de compartir, PEPA copia el texto al portapapeles o te ofrece una ventana para copiarlo o mandarlo por WhatsApp o correo.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Los eventos de calendarios enlazados y los cumpleaños no llevan el icono 📤.',
  next: ['cal-crear-evento', 'cal-google'],
}

// ───────────────────────────── Ir a una fecha
export const tutCalendarioSaltarFecha: TourDef = {
  id: 'tut-calendario-saltar-fecha',
  module: 'calendario',
  group: 'Vistas y filtros',
  summary: 'Saltar a cualquier día tocando la fecha del encabezado.',
  version: 1,
  title: 'Ir directamente a una fecha',
  cardId: 'cal-saltar-fecha',
  durationSec: 70,
  startPath: '/calendario',
  steps: [
    {
      id: 'menu',
      text: 'La fecha pulsable está en Personal, Familiar y en el detalle de un día. Vamos a Personal: pulsa «☰ Menú».',
      target: 'calendar.menu',
      completeOn: [
        { type: 'click', target: 'calendar.menu' },
        { type: 'appear', target: 'calendar.menu-panel' },
        { type: 'appear', target: 'calendar.date-jump' },
      ],
      skipIf: [
        { type: 'appear', target: 'calendar.menu-panel' },
        { type: 'appear', target: 'calendar.date-jump' },
      ],
    },
    {
      id: 'vista',
      text: 'Elige «Personal» (o «Familiar»). Cambiar de vista no modifica nada.',
      target: 'calendar.menu-panel',
      completeOn: [
        { type: 'click', target: 'calendar.view-personal' },
        { type: 'click', target: 'calendar.view-familiar' },
        { type: 'appear', target: 'calendar.date-jump' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.date-jump' }],
    },
    {
      id: 'fecha',
      text: 'Toca la fecha del encabezado, entre las flechas ‹ y ›.',
      target: 'calendar.date-jump',
      completeOn: [
        { type: 'click', target: 'calendar.date-jump' },
        { type: 'appear', target: 'calendar.date-jump-input' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.date-jump-input' }],
    },
    {
      id: 'elegir',
      text: 'Elige el día en el selector: el calendario salta a él al momento. Con «Cancelar» lo cierras sin moverte.',
      target: 'calendar.date-jump-input',
      completeOn: [{ type: 'change', target: 'calendar.date-jump-input' }],
      manualNext: true,
    },
  ],
  finishText: 'Listo. Es útil para ir a una fecha lejana sin pulsar las flechas muchas veces. No está en las vistas Semana ni Agenda.',
  next: ['cal-vistas', 'cal-crear-evento'],
}
