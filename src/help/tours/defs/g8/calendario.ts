import type { TourDef } from '@/help/tours/types'

// Tutoriales «Enséñame» del grupo g8 · Calendario. Cada secuencia sigue el código real de CalendarScreen.tsx y MenuSettingsScreen.tsx. Ninguno pulsa nada por la persona, ni guarda, ni
// comparte, ni conecta: señalan y esperan. Compartir un evento y conectar Google son decisiones de la persona; el recorrido solo llega hasta el botón y lo explica.
//  · «Días y meses» (saltar-fecha)      → capítulo 2 de «Moverte por tu calendario».
//  · «Personas y categorías» (para-quien) → capítulo 2 de «Crear eventos y tareas» (formulario abierto, termina cerrándolo SIN guardar).
//  · «Compartir» y «Calendarios externos» → capítulos 5 y 7 de «Gestionar eventos y tareas».

// ───────────────────────────── Calendarios externos (Google / enlace)
export const tutCalendarioGoogle: TourDef = {
  id: 'tut-calendario-google',
  module: 'calendario',
  group: 'Gestionar eventos y tareas',
  summary: 'Capítulo opcional: encuentra dónde conectar Google Calendar, enlazar otro calendario o exportar el tuyo.',
  version: 2,
  title: 'Calendarios externos (opcional)',
  cardId: 'cal-google',
  durationSec: 100,
  startPath: '/calendario',
  readyOn: ['calendar.menu'], // el calendario carga sus datos antes de pintar la cabecera: así el primer paso ya ve los apuntes
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
      text: 'Aquí se conecta Google Calendar con «Conectar con Google»: Google te pedirá permiso y PEPA mantiene un calendario «Family App» dentro del tuyo, que se actualiza cada hora. La decisión es tuya: yo no conecto nada.',
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
      detailsLabel: 'Más sobre los calendarios enlazados',
      details: [
        { title: 'Al enlazar', text: '«¿De quién es? (opcional)» le pone dueño al calendario. «Es un calendario de festivos» sirve para «Excluir festivos» en las repeticiones.' },
        { title: 'Ya enlazado', text: '«Sincronizar ahora» lo actualiza al momento y «Quitar» lo desvincula de PEPA.' },
      ],
    },
  ],
  finishText: 'Eso es todo: no he conectado ni enlazado nada. Recuerda que la sincronización con Google no es instantánea y que las citas enlazadas solo se leen. En esta misma pantalla están los colores, las categorías y «Tareas completadas». Para volver, usa «← Volver al calendario».',
  next: ['cal-vistas', 'cal-crear-evento'],
}

// ───────────────────────────── Personas y categorías (capítulo 2 de «Crear eventos y tareas»)
export const tutCalendarioParaQuien: TourDef = {
  id: 'tut-calendario-para-quien',
  module: 'calendario',
  group: 'Crear eventos y tareas',
  summary: 'Elegir para quién es un evento (una persona, varias o toda la familia), hacerlo privado y ponerle categoría.',
  version: 2,
  title: 'Personas y categorías',
  cardId: 'cal-para-quien',
  durationSec: 85,
  startPath: '/calendario',
  startDest: 'calendario.nuevo-evento',
  steps: [
    {
      id: 'privado',
      text: '«🔒 Privado — Solo yo puedo verlo»: si lo marcas, solo tú ves el evento y solo a ti te avisa. Si lo creas desde la vista Personal, ya viene marcado. En una tarea es igual.',
      target: 'calendar.event-private',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'aviso-familia',
      text: '«🔔 Aviso a toda la familia» solo sale si tu familia avisa «Solo los miembros asignados» y el evento no es privado. Si lo marcas, este evento avisa a todas las cuentas con acceso a Calendario.',
      target: 'calendar.notify-family',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'quien',
      text: 'Aquí decides para quién es. Si tu cuenta tiene ficha en la familia, ya viene elegida tu persona. Toca «¿Para quién?» para ver la lista.',
      target: 'calendar.event-who',
      completeOn: [
        { type: 'click', target: 'calendar.event-who' },
        { type: 'appear', target: 'calendar.who-list' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.who-list' }],
      manualNext: true,
    },
    {
      id: 'lista',
      text: 'Marca a una o varias personas. Si no marcas a nadie es para «Toda la familia»; pero si el título lleva el nombre de un miembro, PEPA se lo asigna a esa persona al guardar. El evento no se guarda todavía.',
      target: 'calendar.who-list',
      completeOn: [{ type: 'click', target: 'calendar.who-list' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'cerrar-lista',
      text: 'Cierra esta ventana con la ✕ para volver al formulario.',
      target: 'calendar.who-close',
      completeOn: [{ type: 'click', target: 'calendar.who-close' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'categoria',
      text: '«Categoría (opcional)» le pone al evento su emoji y, según tus ajustes de colores, su color. El ⚙️ sirve para crear o cambiar categorías sin salir. Mientras no haya ninguna, solo ves la etiqueta y el ⚙️.',
      target: 'calendar.event-category',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'cerrar-formulario',
      text: 'No se ha guardado nada. Cierra el formulario con la ✕ para descartarlo, o sigue con el siguiente capítulo.',
      target: 'calendar.event-close',
      completeOn: [{ type: 'click', target: 'calendar.event-close' }],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'En una tarea es igual: «¿Para quién?» dice quién la hace. Los puntos, que dependen de elegir a una sola persona, están en el capítulo «Puntos y recompensas».',
  next: ['cal-puntos', 'cal-crear-evento'],
}

// ───────────────────────────── Compartir un evento o una tarea
// El 📤 existe en eventos y tareas propios (no en externos ni cumpleaños). Pulsarlo abre el menú de compartir del móvil o copia el texto: lo hace la persona, nunca el tutorial.
// El texto compartido es el título y la fecha/hora (más `description`, que ninguna pantalla rellena): la NOTA del apunte no se comparte.
export const tutCalendarioCompartir: TourDef = {
  id: 'tut-calendario-compartir',
  module: 'calendario',
  group: 'Gestionar eventos y tareas',
  summary: 'Mandar un evento o una tarea por WhatsApp, correo u otra app desde su icono 📤.',
  version: 2,
  title: 'Compartir un apunte',
  cardId: 'cal-compartir',
  durationSec: 60,
  startPath: '/calendario',
  readyOn: ['calendar.menu'], // el calendario carga sus datos antes de pintar la cabecera: así el primer paso ya ve los apuntes
  needs: [{ target: 'calendar.entry-share', message: 'Para este capítulo necesitas ver al menos un evento o una tarea tuyos (los cumpleaños y las citas enlazadas no se comparten). Elige un día que tenga alguno, o crea uno, y empieza de nuevo.' }],
  steps: [
    {
      id: 'icono',
      text: 'Cada evento o tarea tuyo tiene un icono 📤 a la derecha. Manda como texto su título y su fecha (y hora). La nota que hayas escrito en el apunte no va en ese texto.',
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
  finishText: 'Eso es todo. Un evento privado también se puede compartir: lo decides tú. Los cumpleaños y los eventos de calendarios enlazados no llevan el icono 📤.',
  next: ['cal-crear-evento', 'cal-google'],
}

// ───────────────────────────── Días y meses (capítulo 2 de «Moverte por tu calendario»)
export const tutCalendarioSaltarFecha: TourDef = {
  id: 'tut-calendario-saltar-fecha',
  module: 'calendario',
  group: 'Moverte por tu calendario',
  summary: 'Moverte por los meses y los días: las flechas, el mes entero, «Hoy» y saltar a cualquier fecha.',
  version: 2,
  title: 'Días y meses',
  cardId: 'cal-saltar-fecha',
  durationSec: 90,
  startPath: '/calendario',
  readyOn: ['calendar.menu'], // el calendario carga sus datos antes de pintar la cabecera: así el primer paso ya ve los apuntes
  steps: [
    {
      id: 'menu',
      text: 'Para esto usamos la vista Mes. Pulsa «☰ Menú».',
      target: 'calendar.menu',
      completeOn: [
        { type: 'click', target: 'calendar.menu' },
        { type: 'appear', target: 'calendar.menu-panel' },
        { type: 'appear', target: 'calendar.month-nav' },
      ],
      skipIf: [
        { type: 'appear', target: 'calendar.menu-panel' },
        { type: 'appear', target: 'calendar.month-nav' },
      ],
    },
    {
      id: 'vista',
      text: 'Elige «Mes» (o «Inicio»). Cambiar de vista no modifica nada.',
      target: 'calendar.menu-panel',
      completeOn: [
        { type: 'click', target: 'calendar.view-mes' },
        { type: 'click', target: 'calendar.view-inicio' },
        { type: 'appear', target: 'calendar.month-nav' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.month-nav' }],
    },
    {
      id: 'mes',
      text: 'Las flechas ‹ › de ARRIBA cambian de mes, no de día. «Hoy» te lleva al día de hoy. También puedes arrastrar el dedo a izquierda o derecha sobre el mes.',
      target: 'calendar.month-nav',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'cuadricula',
      text: 'Toca un día del mes para elegirlo: sus eventos y tareas salen debajo.',
      target: 'calendar.month-grid',
      completeOn: [{ type: 'click', target: 'calendar.month-grid' }],
      manualNext: true,
    },
    {
      id: 'dia-flechas',
      text: 'Las flechas ‹ › de DEBAJO cambian de día, de uno en uno. También puedes deslizar el dedo sobre la lista del día.',
      target: 'calendar.day-nav',
      completeOn: [
        { type: 'click', target: 'calendar.day-prev' },
        { type: 'click', target: 'calendar.day-next' },
      ],
      manualNext: true,
    },
    {
      id: 'fecha',
      text: 'Para ir lejos sin pulsar muchas flechas, toca la fecha del encabezado, entre las flechas ‹ y ›.',
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
      native: true,
      completeOn: [{ type: 'change', target: 'calendar.date-jump-input' }],
      manualNext: true,
    },
  ],
  finishText: 'Listo. La fecha pulsable también está en Personal, Familiar, 3 días y Día; no está en Semana ni en Agenda.',
  next: ['cal-vistas', 'cal-crear-evento'],
}
