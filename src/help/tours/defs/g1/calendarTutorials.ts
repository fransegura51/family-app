import type { TourDef } from '@/help/tours/types'

// Calendario → capítulos de los tres tutoriales principales («series», ver src/help/tours/series/a.ts):
//  · «Moverte por tu calendario»      : vistas, filtro por persona, personal y notas (+ «Días y meses» en g8/calendario.ts).
//  · «Crear eventos y tareas»          : repeticiones, recordatorios, puntos, ubicación/adjuntos/nota, guardar (+ capítulo 1 en calCrearEvento.ts y capítulo 2 en g8/calendario.ts).
//  · «Gestionar eventos y tareas»      : consultar, marcar como hecho, editar, cambiar una serie, borrar (+ compartir y calendarios externos en g8/calendario.ts).
// Reglas que cumplen todos: señalan controles REALES (marcas `data-help-id` de CalendarScreen.tsx); lo que compromete datos (guardar, marcar hecho, editar, añadir una nota) es un paso
// `sensitive` que solo avanza cuando la pantalla confirma que el servidor lo guardó (`emitHelpEvent`), nunca con un clic; nada se borra ni se envía; los pasos cuyo control puede no existir
// (vista, tamaño de pantalla, datos vacíos) son `optional`. Los capítulos de «Crear» arrancan con el formulario ya abierto (`startDest`) y los intermedios terminan cerrándolo SIN guardar.

const VIEW_CLICKS = ['inicio', 'mes', 'semana', '3-dias', 'dia', 'familiar', 'agenda', 'personal'].map((v) => ({ type: 'click' as const, target: `calendar.view-${v}` }))

// ═══════════════════════ SERIE «Moverte por tu calendario» ═══════════════════════

// Capítulo 1 · Vistas
export const tutCalendarioCambiarVista: TourDef = {
  id: 'tut-calendario-cambiar-vista',
  module: 'calendario',
  group: 'Moverte por tu calendario',
  summary: 'Pasar de Inicio a Mes, Semana, Día, Familiar, Agenda o Personal, y sacar tus vistas favoritas como botones.',
  version: 2,
  title: 'Vistas del calendario',
  cardId: 'cal-vistas',
  durationSec: 60,
  startPath: '/calendario',
  readyOn: ['calendar.menu'], // el calendario carga sus datos antes de pintar la cabecera: así el primer paso ya ve los apuntes
  steps: [
    {
      id: 'menu',
      text: 'Pulsa «☰ Menú», arriba a la izquierda, para ver las vistas del calendario.',
      target: 'calendar.menu',
      completeOn: [
        { type: 'click', target: 'calendar.menu' },
        { type: 'appear', target: 'calendar.menu-panel' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.menu-panel' }],
    },
    {
      id: 'sacar',
      text: 'Al lado de cada vista, «📌 Sacar» la pone como botón suelto en la pantalla del calendario, sin abrir el menú. «📍 Quitar» la retira. Al final, «⚙️ Gestionar calendarios» te lleva a Configuración, donde se enlazan Google y otros calendarios.',
      target: 'calendar.menu-pin',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'elegir',
      text: 'Elige la vista que quieras: Inicio, Mes, Semana, 3 días, Día, Familiar, Agenda o Personal. Cambiar de vista no modifica nada: solo cambia cómo lo ves.',
      target: 'calendar.menu-panel',
      completeOn: VIEW_CLICKS,
      manualNext: true,
      optional: true,
      detailsLabel: 'Qué enseña cada vista',
      details: [
        { title: 'Inicio y Mes', text: 'el mes entero con sus días (Inicio con puntitos, Mes con franjas de color) y, debajo, los apuntes del día que toques.' },
        { title: 'Semana', text: 'los siete días en una lista; cada día se despliega para ver sus apuntes.' },
        { title: '3 días y Día', text: 'una cuadrícula por horas, con una fila de «Tareas».' },
        { title: 'Familiar', text: 'una columna por persona.' },
        { title: 'Agenda', text: 'una lista seguida de los próximos 30 días.' },
        { title: 'Personal', text: 'solo lo tuyo (lo asignado a ti y lo privado) y tus notas privadas.' },
      ],
    },
    {
      id: 'resultado',
      text: 'Ya estás en esa vista; su nombre aparece arriba, bajo la imagen. Cuando quieras otra, vuelve a abrir «☰ Menú».',
      target: 'calendar.menu',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Puedes cambiar de vista las veces que quieras; tus eventos y tareas no se tocan. Sigue con «Días y meses» para moverte por las fechas.',
  next: ['cal-saltar-fecha', 'cal-crear-evento'],
}

// Capítulo 3 · Filtrar por persona
export const tutCalendarioFiltrarPersona: TourDef = {
  id: 'tut-calendario-filtrar-persona',
  module: 'calendario',
  group: 'Moverte por tu calendario',
  summary: 'Ver solo lo de una o varias personas de la familia, y volver a verlo todo.',
  version: 2,
  title: 'Filtrar el calendario por persona',
  cardId: 'cal-vistas',
  durationSec: 70,
  startPath: '/calendario',
  readyOn: ['calendar.menu'], // el calendario carga sus datos antes de pintar la cabecera: así el primer paso ya ve los apuntes
  steps: [
    {
      id: 'abrir',
      text: 'Pulsa «Filtrar por», debajo del título.',
      target: 'calendar.filter',
      completeOn: [
        { type: 'click', target: 'calendar.filter' },
        { type: 'appear', target: 'calendar.filter-panel' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.filter-panel' }],
      missingText: '«Filtrar por» no sale en la vista Personal (ahí solo ves lo tuyo). Cambia de vista con «☰ Menú» (por ejemplo, a Inicio, Mes o Familiar) y empieza de nuevo este capítulo.',
    },
    {
      id: 'elegir',
      text: 'Toca a una persona para ver solo lo suyo. Puedes marcar varias a la vez. «Todos» quita el filtro.',
      target: 'calendar.filter-panel',
      completeOn: [{ type: 'click', target: 'calendar.filter-person' }],
      manualNext: true,
    },
    {
      id: 'cerrar',
      text: 'Cierra la ventana con la ✕. Arriba, «Filtrar por» enseña los nombres elegidos y el calendario solo muestra lo de esas personas.',
      target: 'calendar.filter-close',
      completeOn: [{ type: 'click', target: 'calendar.filter-close' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'quitar',
      text: 'Para volver a verlo todo, abre «Filtrar por» y toca «Todos». Con un filtro puesto no salen los apuntes de «Toda la familia» ni se filtran los cumpleaños 🎂. Pepa usa el mismo filtro al responderte. Se borra al salir de Calendario.',
      target: 'calendar.filter',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Listo. El filtro solo cambia lo que ves; no cambia ni borra ningún evento ni tarea.',
  next: ['cal-vistas', 'cal-para-quien'],
}

// Capítulo 4 · Personal y notas
export const tutCalendarioNotaPersonal: TourDef = {
  id: 'tut-calendario-nota-personal',
  module: 'calendario',
  group: 'Moverte por tu calendario',
  summary: 'La vista Personal (lo tuyo y lo privado) y cómo apuntar una nota privada para un día.',
  version: 2,
  title: 'Personal y notas',
  cardId: 'cal-privado',
  durationSec: 80,
  startPath: '/calendario',
  readyOn: ['calendar.menu'], // el calendario carga sus datos antes de pintar la cabecera: así el primer paso ya ve los apuntes
  steps: [
    {
      id: 'menu',
      text: 'Tus notas y lo privado están en la vista Personal. Pulsa «☰ Menú».',
      target: 'calendar.menu',
      completeOn: [
        { type: 'click', target: 'calendar.menu' },
        { type: 'appear', target: 'calendar.menu-panel' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.menu-panel' }, { type: 'appear', target: 'calendar.note-input' }],
    },
    {
      id: 'personal',
      text: 'Toca «Personal».',
      target: 'calendar.view-personal',
      completeOn: [
        { type: 'click', target: 'calendar.view-personal' },
        { type: 'appear', target: 'calendar.note-input' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.note-input' }],
    },
    {
      id: 'privado',
      text: 'Personal enseña lo tuyo: tus eventos y tareas y tus privados. Lo que creas aquí sale ya como privado. Debajo van tus notas, que no ve nadie más. Elige el día con las flechas ‹ ›.',
      target: 'calendar.note-privacy',
      keepVisible: ['calendar.day-nav'],
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'escribir',
      text: 'Escribe tu nota. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'calendar.note-input',
      completeOn: [{ type: 'entered', target: 'calendar.note-input', min: 1 }],
      manualNext: true,
    },
    {
      id: 'anadir',
      text: 'Pulsa «+ Añadir» para guardarla. Se guarda de verdad en ese día. Yo no lo hago por ti: lo pulsas tú.',
      target: 'calendar.note-add',
      completeOn: [{ type: 'event', name: 'calendar.note-added' }],
      sensitive: true,
    },
    {
      id: 'notas-mas',
      text: 'Cada nota tiene su 📤 para mandarla fuera de PEPA y un botón para borrarla. Una nota es solo texto ligado a un día: no es lo mismo que un evento «Privado», que tiene fecha, personas y más opciones.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Nota guardada en ese día. Solo tú la ves. En Personal también aparecen tus eventos y tareas.',
  next: ['cal-privado', 'cal-saltar-fecha'],
}

// ═══════════════════════ SERIE «Crear eventos y tareas» (capítulos 3 a 7) ═══════════════════════

// Capítulo 3 · Repeticiones (sirve para eventos y tareas: se cuenta una sola vez y se anotan las diferencias de la tarea)
export const tutCalendarioEventoRepetitivo: TourDef = {
  id: 'tut-calendario-evento-repetitivo',
  module: 'calendario',
  group: 'Crear eventos y tareas',
  summary: 'Hacer que un evento (o una tarea) se repita cada día, semana, mes o año, con fecha final y sin festivos.',
  version: 2,
  title: 'Repeticiones',
  cardId: 'cal-repeticion',
  durationSec: 80,
  startPath: '/calendario',
  startDest: 'calendario.nuevo-evento',
  steps: [
    {
      id: 'abrir-repeticion',
      text: 'Toca «Repetición» (ahora pone «No se repite»). La repetición es igual para eventos y tareas.',
      target: 'calendar.event-repeat',
      completeOn: [
        { type: 'click', target: 'calendar.event-repeat' },
        { type: 'appear', target: 'calendar.repeat-presets' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.repeat-presets' }],
    },
    {
      id: 'opciones',
      text: 'Elige cada cuánto se repite: «Ninguno» (no se repite), «Todos los días», «Todos los días laborables» (de lunes a viernes), «Todas las semanas», «Cada 2 semanas», «Todos los meses» o «Todos los años».',
      target: 'calendar.repeat-presets',
      completeOn: [{ type: 'click', target: 'calendar.repeat-presets' }],
      manualNext: true,
      detailsLabel: 'Más sobre «Personalizado…» y las tareas',
      details: [
        { title: 'Personalizado…', text: 'deja elegir la frecuencia y, si es semanal, los días de la semana (por ejemplo, martes y jueves).' },
        { title: 'Si es una tarea', text: 'funciona igual. Solo cambia que en un «Personalizado» semanal hay que marcar al menos un día (si no, «Crear tarea» no se activa). Cada día repetido tiene su propio círculo.' },
      ],
    },
    {
      id: 'hasta',
      text: '«Repetir hasta (opcional)» pone el último día. Si lo dejas vacío, se sigue repitiendo. Solo sale cuando has elegido una repetición.',
      target: 'calendar.repeat-until',
      completeOn: [],
      manualNext: true,
      optional: true,
      group: 'repeticion-extra',
      skipGroupLabel: 'Saltar a cerrar',
    },
    {
      id: 'festivos',
      text: '«Excluir festivos» salta los días festivos del calendario de festivos que tengas enlazado en Configuración → Calendario. Si no tienes ninguno enlazado, no cambia nada.',
      target: 'calendar.repeat-holidays',
      completeOn: [],
      manualNext: true,
      optional: true,
      group: 'repeticion-extra',
      skipGroupLabel: 'Saltar a cerrar',
    },
    {
      id: 'cerrar',
      text: 'Cierra esta ventana con la ✕ para volver al formulario. La repetición se guarda con el apunte, no antes.',
      target: 'calendar.repeat-close',
      completeOn: [{ type: 'click', target: 'calendar.repeat-close' }],
      manualNext: true,
      optional: true,
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
  finishText: 'Un evento que se repite se ve en todos los días que le toquen. Para cambiar solo un día, o de una fecha en adelante, mira «Cambiar una serie».',
  next: ['cal-recordatorio', 'cal-para-quien'],
}

// Capítulo 4 · Recordatorios (solo eventos)
export const tutCalendarioEventoRecordatorio: TourDef = {
  id: 'tut-calendario-evento-recordatorio',
  module: 'calendario',
  group: 'Crear eventos y tareas',
  summary: 'Poner uno o varios avisos antes de que empiece (o termine) un evento.',
  version: 2,
  title: 'Recordatorios',
  cardId: 'cal-recordatorio',
  durationSec: 80,
  startPath: '/calendario',
  startDest: 'calendario.nuevo-evento',
  needs: [{ target: 'calendar.event-time', message: 'Para este capítulo necesitas la hora del evento: si tienes marcado «Todo el día» en el formulario, desmárcalo y empieza de nuevo.' }],
  steps: [
    {
      id: 'hora',
      text: 'Pon la hora de inicio: el recordatorio cuenta hacia atrás desde ella. Si pones también «Termina», podrás avisar antes de terminar. Solo los eventos llevan recordatorio: una tarea no.',
      target: 'calendar.event-time',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'abrir-recordatorio',
      text: 'Toca «Recordatorio» para elegir cuánto antes quieres el aviso.',
      target: 'calendar.event-reminder',
      completeOn: [
        { type: 'click', target: 'calendar.event-reminder' },
        { type: 'appear', target: 'calendar.reminder-presets' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.reminder-presets' }],
    },
    {
      id: 'ancla',
      text: 'Como el evento tiene hora de fin, puedes elegir si el aviso cuenta «Antes de empezar» o «Antes de terminar». Elígelo antes de tocar el aviso.',
      target: 'calendar.reminder-anchor',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'opciones',
      text: 'Toca los avisos que quieras (puedes marcar varios): de 10 minutos a 1 año antes. «Sin recordatorio» los quita todos. Con «Personalizado…» pones cantidad y unidad y pulsas «+ Añadir recordatorio».',
      target: 'calendar.reminder-presets',
      completeOn: [{ type: 'click', target: 'calendar.reminder-presets' }],
      manualNext: true,
    },
    {
      id: 'cerrar',
      text: 'Cierra esta ventana con la ✕ para volver al formulario. Los avisos se guardan con el evento.',
      target: 'calendar.reminder-close',
      completeOn: [{ type: 'click', target: 'calendar.reminder-close' }],
      manualNext: true,
      optional: true,
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
  finishText: 'El aviso llegará a quien corresponda cuando llegue el momento. Una tarea no lleva recordatorio; para ellas hay un resumen diario en Configuración → Avisos.',
  next: ['cal-crear-evento', 'cal-para-quien'],
}

// Capítulo 5 · Puntos y recompensas (solo con una persona)
export const tutCalendarioPuntos: TourDef = {
  id: 'tut-calendario-puntos',
  module: 'calendario',
  group: 'Crear eventos y tareas',
  summary: 'Dar puntos a una persona cuando marque un evento o una tarea como hecho.',
  version: 2,
  title: 'Puntos y recompensas',
  cardId: 'cal-puntos',
  durationSec: 60,
  startPath: '/calendario',
  startDest: 'calendario.nuevo-evento',
  steps: [
    {
      id: 'quien',
      text: 'Los puntos son para UNA persona. Si tu cuenta tiene ficha en la familia, ya viene elegida; si no, o si eliges a varias, el campo no sale. Toca «¿Para quién?».',
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
      text: 'Deja marcada solo a la persona que ganará los puntos. Con «Toda la familia» (nadie marcado) o con dos o más personas, el campo de puntos desaparece.',
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
      id: 'puntos',
      text: 'Escribe cuántos puntos gana al marcar el evento como «Hecho» (en una tarea pone «Hecha»). Es opcional; con 0 no hay puntos. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'calendar.event-points',
      completeOn: [{ type: 'entered', target: 'calendar.event-points', min: 1 }],
      manualNext: true,
      missingText: 'No veo el campo de puntos: solo sale cuando en «¿Para quién?» hay UNA sola persona marcada. Márcala, o sal del capítulo si no quieres puntos.',
    },
    {
      id: 'donde',
      text: 'Los puntos se dan cuando alguien marca el apunte como hecho con su círculo, y se suman al saldo de esa persona en Pequeños Grandes → Puntos y recompensas.',
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
  finishText: 'En una tarea es igual, solo cambia la etiqueta («Hecha»). Para ver cómo se reparten y se canjean los puntos, mira «Cómo funcionan los puntos».',
  next: ['cal-hecho', 'cal-para-quien'],
}

// Capítulo 6 · Ubicación, adjuntos y notas (los tres iconos del formulario)
export const tutCalendarioUbicacionAdjuntos: TourDef = {
  id: 'tut-calendario-ubicacion-adjuntos',
  module: 'calendario',
  group: 'Crear eventos y tareas',
  summary: 'Añadir a un evento el lugar (con mapa o GPS), una foto o un archivo y una nota.',
  version: 1,
  title: 'Ubicación, adjuntos y notas',
  cardId: 'cal-crear-evento',
  durationSec: 65,
  startPath: '/calendario',
  startDest: 'calendario.nuevo-evento',
  steps: [
    {
      id: 'ubicacion',
      text: '«📍 Ubicación»: tócalo para escribir el nombre del sitio o la dirección. También puedes usar «🔍 Buscar en el mapa» o «📍 Usar mi ubicación actual». En la fila del evento saldrá «📍» y el lugar.',
      target: 'calendar.event-location',
      completeOn: [{ type: 'click', target: 'calendar.event-location' }],
      manualNext: true,
    },
    {
      id: 'adjunto',
      text: '«📷📎 Adjunto»: tócalo y elige una foto o un archivo (solo uno). Una foto sale en la fila como miniatura que se abre al tocarla; otro archivo sale con 📎.',
      target: 'calendar.event-attachment',
      completeOn: [{ type: 'click', target: 'calendar.event-attachment' }],
      manualNext: true,
    },
    {
      id: 'nota',
      text: '«📝 Nota»: texto libre. En la fila del evento verás 📝; el texto se lee al abrir el evento para editarlo, o en la vista Familiar.',
      target: 'calendar.event-note',
      completeOn: [{ type: 'click', target: 'calendar.event-note' }],
      manualNext: true,
    },
    {
      id: 'cerrar-formulario',
      text: 'No se ha guardado nada. Cierra el formulario con la ✕ para descartarlo, o sigue con el último capítulo, donde sí se guarda.',
      target: 'calendar.event-close',
      completeOn: [{ type: 'click', target: 'calendar.event-close' }],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Los tres son opcionales y funcionan igual en las tareas. Si el apunte ya tiene alguno, al editarlo esa parte aparece abierta.',
  next: ['cal-crear-evento', 'cal-crear-tarea'],
}

// Capítulo 7 · Guardar y consultar el resultado (ÚNICO capítulo de la serie que guarda de verdad)
export const tutCalendarioGuardarEvento: TourDef = {
  id: 'tut-calendario-guardar-evento',
  module: 'calendario',
  group: 'Crear eventos y tareas',
  summary: 'Crear un evento de verdad con título y fecha y ver dónde queda en el calendario.',
  version: 1,
  title: 'Guardar y ver el resultado',
  cardId: 'cal-crear-evento',
  durationSec: 50,
  startPath: '/calendario',
  startDest: 'calendario.nuevo-evento',
  steps: [
    {
      id: 'titulo',
      text: 'Este capítulo guarda de verdad: el evento quedará en tu calendario cuando pulses «Crear evento». Si solo practicas, cierra con la ✕ y no se guarda nada. Escribe el título y pulsa ✓ o «Siguiente».',
      target: 'calendar.event-title',
      completeOn: [{ type: 'entered', target: 'calendar.event-title', min: 2 }],
      manualNext: true,
    },
    {
      id: 'fecha',
      text: 'Elige el día. Cuando hayas elegido seguiré yo; si ya es el correcto, pulsa «Siguiente».',
      target: 'calendar.event-date',
      completeOn: [{ type: 'confirmed', target: 'calendar.event-date' }],
      manualNext: true,
    },
    {
      id: 'repaso',
      text: 'Con título y fecha ya se puede guardar. Lo demás (hora, personas, repetición, recordatorio, puntos…) lo has visto en los capítulos anteriores. Sin hora y sin «Todo el día», se guarda a las 00:00.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Cuando quieras, pulsa «Crear evento». Se guarda de verdad; yo no lo hago por ti. Si no quieres guardarlo, cierra el formulario con la ✕ y sal del tutorial.',
      target: 'calendar.event-save',
      completeOn: [{ type: 'event', name: 'calendar.event-created' }],
      sensitive: true,
      missingText: 'Has cerrado el formulario sin guardar: no se ha creado nada. Puedes salir del tutorial.',
    },
    {
      id: 'resultado',
      text: 'Aquí abajo ves los apuntes del día elegido: tu evento sale en el día que pusiste. Si pusiste otro día, tócalo en el mes o usa las flechas ‹ › de este panel. Toca el evento para abrirlo y cambiarlo.',
      target: 'calendar.day-panel',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Ya sabes crear un evento. Una tarea se crea igual con «+ Nueva tarea», sin hora, sin «Todo el día» y sin recordatorio. Para marcarlo, cambiarlo o borrarlo, mira «Gestionar eventos y tareas».',
  next: ['cal-hecho', 'cal-crear-tarea'],
}

// ═══════════════════════ SERIE «Gestionar eventos y tareas» ═══════════════════════

// Capítulo 1 · Consultar un apunte (anatomía de la fila)
export const tutCalendarioConsultarApunte: TourDef = {
  id: 'tut-calendario-consultar-apunte',
  module: 'calendario',
  group: 'Gestionar eventos y tareas',
  summary: 'Entender una fila del calendario: el círculo, los iconos 🔒 📷 📎 📝, el lugar y «Tarea» o «No realizada».',
  version: 1,
  title: 'Consultar un apunte',
  cardId: 'cal-hecho',
  durationSec: 70,
  startPath: '/calendario',
  readyOn: ['calendar.menu'], // el calendario carga sus datos antes de pintar la cabecera: así el primer paso ya ve los apuntes
  needs: [{ target: 'calendar.entry-edit', message: 'Para este capítulo necesitas ver al menos un evento o una tarea. Elige un día que tenga alguno, o crea uno con «+ Nuevo evento», y empieza de nuevo.' }],
  steps: [
    {
      id: 'fila',
      text: 'Cada evento o tarea es una fila. Tócala para abrirla y cambiarla. Salen en bloques separados, «Eventos» y «Tareas»; el orden se elige en Configuración → Calendario.',
      target: 'calendar.entry-edit',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'circulo',
      text: 'El círculo de la izquierda marca el apunte como hecho. Este está vacío: pendiente. Cómo se marca lo vemos en el siguiente capítulo.',
      target: 'calendar.entry-complete',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'iconos',
      text: 'Junto al título pueden salir: 🔒 si es privado, el emoji de su categoría, 📷 si tiene foto (una miniatura que se abre al tocarla), 📎 si tiene un archivo y 📝 si tiene una nota.',
      target: 'calendar.entry-edit',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'segunda-linea',
      text: 'Debajo del título: «📍» y el lugar si lo hay. Si no, las personas y los ⭐ puntos (solo con una persona), o cada cuánto se repite, o «Toda la familia».',
      target: 'calendar.entry-edit',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'derecha',
      text: 'A la derecha: la hora, «Todo el día», «Tarea» (las tareas no llevan hora) o «No realizada» si es una tarea de un día pasado sin hacer. La nota y el detalle del lugar se leen al abrir el apunte, o en la vista Familiar.',
      target: 'calendar.entry-edit',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo lo que cuenta una fila. Sigue con «Marcar como hecho» para usar el círculo.',
  next: ['cal-hecho', 'cal-vistas'],
}

// Capítulo 2 · Marcar como hecho
export const tutCalendarioMarcarHecho: TourDef = {
  id: 'tut-calendario-marcar-hecho',
  module: 'calendario',
  group: 'Gestionar eventos y tareas',
  summary: 'Marcar un evento o una tarea como hecho con su círculo, y deshacerlo si te equivocas.',
  version: 2,
  title: 'Marcar como hecho',
  cardId: 'cal-hecho',
  durationSec: 65,
  startPath: '/calendario',
  readyOn: ['calendar.menu'], // el calendario carga sus datos antes de pintar la cabecera: así el primer paso ya ve los apuntes
  steps: [
    {
      id: 'dia',
      text: 'Aquí están los apuntes del día elegido. Si no hay nada pendiente, cambia de día con las flechas ‹ › DE ESTE PANEL (las de arriba cambian de mes, no de día) o toca otro día del mes. Con un círculo vacío a la vista, pulsa «Siguiente».',
      target: 'calendar.day-panel',
      keepVisible: ['calendar.day-prev', 'calendar.day-next', 'calendar.month-grid'],
      completeOn: [],
      manualNext: true,
      skipIf: [{ type: 'appear', target: 'calendar.entry-complete' }],
      missingText: 'Este paso se ve mejor en las vistas Inicio o Mes (en «☰ Menú»). Cámbiala y empieza de nuevo, o busca en tu vista un apunte con el círculo vacío.',
    },
    {
      id: 'marcar',
      text: 'Este es el círculo de un apunte pendiente. Tócalo tú: yo no lo toco por ti. Queda hecho SOLO ese día y, si es de una sola persona y lleva ⭐ puntos, ella los gana. Es real: elige uno que de verdad esté hecho.',
      target: 'calendar.entry-complete',
      keepVisible: ['calendar.day-prev', 'calendar.day-next', 'calendar.month-grid'],
      completeOn: [{ type: 'event', name: 'calendar.event-completed' }],
      sensitive: true,
      missingText: 'Ahora no veo ningún apunte pendiente tuyo en esta pantalla. Cambia de día con las flechas ‹ › del panel del día, o crea un evento con «+ Nuevo evento», y vuelve a empezar.',
    },
    {
      id: 'deshacer',
      text: 'Si te equivocas, vuelve a tocar el círculo («Marcar como pendiente»): el apunte vuelve a quedar pendiente y los puntos de ese día se quitan. En algo que se repite, cada día tiene su propio círculo.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Hecho. Las tareas hechas se pueden tachar, cambiar de color o mandar al final en Configuración → Calendario.',
  next: ['cal-puntos', 'cal-crear-tarea'],
}

// Capítulo 3 · Editar un apunte
export const tutCalendarioEditarEvento: TourDef = {
  id: 'tut-calendario-editar-evento',
  module: 'calendario',
  group: 'Gestionar eventos y tareas',
  summary: 'Abrir un evento o una tarea, cambiar lo que haga falta y guardar.',
  version: 2,
  title: 'Editar un apunte',
  // No existe una ficha de Ayuda propia de «Editar»; cuelga de la de repeticiones (que también explica «Solo esta repetición» y «Esta y las siguientes»).
  cardId: 'cal-repeticion',
  durationSec: 110,
  startPath: '/calendario',
  readyOn: ['calendar.menu'], // el calendario carga sus datos antes de pintar la cabecera: así el primer paso ya ve los apuntes
  steps: [
    {
      id: 'abrir',
      text: 'Toca el evento (o la tarea) que quieras cambiar. En Familiar usa el lápiz ✏️ de su tarjeta. En la vista Día, los eventos con hora se abren tocando su bloque.',
      target: 'calendar.entry-edit',
      completeOn: [
        { type: 'click', target: 'calendar.entry-edit' },
        { type: 'appear', target: 'calendar.edit-title' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.edit-title' }],
      missingText: 'No veo ningún apunte para abrir. Elige un día que tenga alguno o crea uno con «+ Nuevo evento». En la vista Día, los eventos con hora se abren tocando su bloque.',
    },
    {
      id: 'titulo',
      text: 'Aquí cambias el título. Lo que ya tenía viene rellenado: toca solo lo que quieras cambiar. No se guarda nada hasta que pulses «Guardar».',
      target: 'calendar.edit-title',
      completeOn: [],
      manualNext: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'fecha',
      text: 'La fecha. En algo que se repite, esta es la fecha de toda la serie; en «Cambiar una serie» verás cómo cambiar solo un día.',
      target: 'calendar.edit-date',
      completeOn: [],
      manualNext: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'hora',
      text: 'Solo en eventos: «Todo el día» quita las horas, y sin él salen las horas de inicio y fin. «Recordatorio» está más abajo. Una tarea no lleva hora ni recordatorio.',
      target: 'calendar.edit-allday',
      completeOn: [],
      manualNext: true,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'privado',
      text: '«Privado»: si lo marcas, solo tú lo ves; si lo quitas, lo ve toda la familia con acceso a Calendario. «Aviso a toda la familia» sale solo si tu familia avisa «Solo a los miembros asignados».',
      target: 'calendar.edit-private',
      completeOn: [],
      manualNext: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'repeticion',
      text: '«Repetición»: aquí cambias cada cuánto se repite, o lo dejas en «Ninguno» para que no se repita.',
      target: 'calendar.edit-repeat',
      completeOn: [],
      manualNext: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'para-quien',
      text: '«¿Para quién?» cambia las personas asignadas. Con una sola persona sale el campo de puntos; con varias, o con «Toda la familia», no. Si cambias los puntos, vale para las próximas veces que se marque.',
      target: 'calendar.edit-who',
      completeOn: [],
      manualNext: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'categoria',
      text: '«Categoría (opcional)» le pone al apunte su emoji y, según tus ajustes de colores, su color. El ⚙️ sirve para crear o cambiar categorías sin salir.',
      target: 'calendar.edit-category',
      completeOn: [],
      manualNext: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'extras',
      text: 'Ubicación, adjunto y nota: si el apunte ya tenía alguno, esa parte sale abierta. Para cambiar un archivo adjunto, primero pulsa «Quitar».',
      target: 'calendar.edit-extras',
      completeOn: [],
      manualNext: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'guardar',
      text: 'Cuando lo tengas, pulsa «Guardar». Yo no lo hago por ti. Si no quieres cambiar nada, pulsa «Cancelar» o sal del tutorial.',
      target: 'calendar.edit-save',
      completeOn: [{ type: 'event', name: 'calendar.event-updated' }],
      sensitive: true,
      missingText: 'Has cerrado la edición sin guardar: no se ha cambiado nada. Puedes salir del tutorial.',
    },
  ],
  finishText: '¡Listo! Los cambios ya están guardados. Si te equivocas, vuelve a tocar el apunte y corrígelo.',
  next: ['cal-repeticion', 'cal-recordatorio'],
}

// Capítulo 4 · Cambiar una serie (solo se enseña; no guarda)
export const tutCalendarioCambiarSerie: TourDef = {
  id: 'tut-calendario-cambiar-serie',
  module: 'calendario',
  group: 'Gestionar eventos y tareas',
  summary: 'Cambiar un evento o una tarea que se repite: toda la serie, solo un día o desde un día en adelante.',
  version: 1,
  title: 'Cambiar una serie',
  cardId: 'cal-repeticion',
  durationSec: 60,
  startPath: '/calendario',
  readyOn: ['calendar.menu'], // el calendario carga sus datos antes de pintar la cabecera: así el primer paso ya ve los apuntes
  needs: [{ target: 'calendar.entry-recurring', message: 'Para este capítulo necesitas un evento o una tarea que se repita (en su fila verás la repetición). Elige un día que tenga uno, o crea uno en «Crear eventos y tareas → Repeticiones».' }],
  steps: [
    {
      id: 'abrir',
      text: 'Toca un evento o una tarea que se repita para abrirlo. No cambiaremos nada: solo vamos a mirar las opciones.',
      target: 'calendar.entry-recurring',
      completeOn: [{ type: 'appear', target: 'calendar.edit-scope' }],
      skipIf: [{ type: 'appear', target: 'calendar.edit-scope' }],
      manualNext: true,
    },
    {
      id: 'serie',
      text: 'Como se repite, eliges a qué se aplican los cambios: «Toda la serie» (todos los días), «Solo esta repetición» (solo el día que tocaste) o «Esta y las siguientes» (desde ese día en adelante).',
      target: 'calendar.edit-scope',
      completeOn: [],
      manualNext: true,
      missingText: 'Este apunte no se repite, por eso no sale «Guardar cambios en». Ciérralo con «Cancelar» y abre uno que se repita.',
    },
    {
      id: 'fecha-serie',
      text: 'Ojo con la fecha: con «Toda la serie» es la del inicio de la serie; con las otras dos pasa a ser la del día que tocaste. Esas dos crean un evento nuevo: después se editan por separado.',
      target: 'calendar.edit-date',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'cancelar',
      text: 'Para no cambiar nada, pulsa «Cancelar». Si algún día cambias algo, mira bien el alcance antes de guardar.',
      target: 'calendar.edit-cancel',
      completeOn: [{ type: 'click', target: 'calendar.edit-cancel' }],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Esto es todo. En «Cómo funcionan las repeticiones» tienes un ejemplo con cada alcance.',
  next: ['cal-repeticion', 'cal-hecho'],
}

// Capítulo 6 · Borrar un apunte (SOLO se cuenta: no señala ni pulsa el botón de borrar)
export const tutCalendarioBorrarApunte: TourDef = {
  id: 'tut-calendario-borrar-apunte',
  module: 'calendario',
  group: 'Gestionar eventos y tareas',
  summary: 'Cómo se borra un evento o una tarea (deslizando la fila) y qué pasa con los que se repiten.',
  version: 1,
  title: 'Borrar un apunte',
  cardId: 'cal-hecho',
  durationSec: 45,
  startPath: '/calendario',
  readyOn: ['calendar.menu'], // el calendario carga sus datos antes de pintar la cabecera: así el primer paso ya ve los apuntes
  steps: [
    {
      id: 'deslizar',
      text: 'Para borrar, desliza la fila de un evento o tarea hacia la izquierda: aparece «🗑 Eliminar». En la vista Familiar se usa la ✕ de la tarjeta. Este capítulo solo lo cuenta: no borra nada ni te hace borrar.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'alcance',
      text: 'Si el apunte se repite, al pulsar «Eliminar» PEPA pregunta: «Solo este día», «Toda la serie» o «Cancelar». Si no se repite, «Eliminar» lo borra directamente, sin otra pregunta.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'sin-vuelta',
      text: 'No hay papelera ni deshacer: lo borrado no se recupera. Si dudas, mejor ábrelo y cámbialo, o márcalo como hecho. Las citas de calendarios enlazados 🔗 solo se ocultan en PEPA; en su calendario siguen.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. PEPA nunca borra nada por su cuenta: lo decides tú, con tu dedo.',
  next: ['cal-hecho', 'cal-repeticion'],
}
