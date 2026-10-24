import type { TourDef, TourStep } from '@/help/tours/types'

// Calendario → tutoriales «Enséñame» que NO duplican a los pilotos `cal-crear-evento` y `cal-crear-tarea`: cada uno se centra en una opción concreta (vistas, filtro, marcar hecho, editar,
// repetición, recordatorio, puntos, nota personal) y, cuando hace falta un formulario, arranca con el formulario ya abierto (`startDest`, el mismo destino que usa «Llévame»).
// Reglas que cumplen todos: señalan controles REALES (marcas `data-help-id` de CalendarScreen.tsx); lo que compromete datos (guardar, marcar hecho, editar, añadir una nota) es un paso
// `sensitive` que solo avanza cuando la pantalla confirma que el servidor lo guardó (`emitHelpEvent`), nunca con un clic; nada se borra ni se envía; los pasos cuyo control puede no existir
// (vista, tamaño de pantalla, datos vacíos) son `optional`.

const VIEW_CLICKS = ['inicio', 'mes', 'semana', '3-dias', 'dia', 'familiar', 'agenda', 'personal'].map((v) => ({ type: 'click' as const, target: `calendar.view-${v}` }))

// ─────────────────────────── Vistas y filtro ───────────────────────────

export const tutCalendarioCambiarVista: TourDef = {
  id: 'tut-calendario-cambiar-vista',
  module: 'calendario',
  group: 'Vistas y filtros',
  summary: 'Pasar de Inicio a Mes, Semana, Día, Familiar, Agenda o Personal.',
  version: 1,
  title: 'Cambiar de vista en el calendario',
  cardId: 'cal-vistas',
  durationSec: 60,
  startPath: '/calendario',
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
      id: 'elegir',
      text: 'Elige la vista que quieras: Inicio, Mes, Semana, 3 días, Día, Familiar, Agenda o Personal. Cambiar de vista no modifica nada: solo cambia cómo lo ves.',
      target: 'calendar.menu-panel',
      completeOn: VIEW_CLICKS,
      manualNext: true,
      optional: true,
      detailsLabel: 'Otras cosas del menú',
      details: [
        { title: '✏️ Editar', text: 'deja reordenar las vistas. La primera de la lista es la que se abre al entrar en Calendario (la ves marcada con «⭐ Al abrir»).' },
        { title: '📌 Sacar', text: 'pone una vista como botón suelto en la pantalla del calendario, sin abrir el menú. «📍 Quitar» la retira.' },
        { title: '⚙️ Gestionar calendarios', text: 'te lleva a Configuración, donde se enlazan calendarios externos como el de Google.' },
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
  finishText: 'Eso es todo. Puedes cambiar de vista las veces que quieras; tus eventos y tareas no se tocan.',
  next: ['cal-saltar-fecha', 'cal-crear-evento'],
}

export const tutCalendarioFiltrarPersona: TourDef = {
  id: 'tut-calendario-filtrar-persona',
  module: 'calendario',
  group: 'Vistas y filtros',
  summary: 'Ver solo lo de una o varias personas de la familia.',
  version: 1,
  title: 'Filtrar el calendario por persona',
  cardId: 'cal-vistas',
  durationSec: 70,
  startPath: '/calendario',
  steps: [
    {
      id: 'abrir',
      text: 'Pulsa «Filtrar por». Si estás en la vista Personal no sale: cambia antes de vista con «☰ Menú».',
      target: 'calendar.filter',
      completeOn: [
        { type: 'click', target: 'calendar.filter' },
        { type: 'appear', target: 'calendar.filter-panel' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.filter-panel' }],
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
      target: 'calendar.filter',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'quitar',
      text: 'Para volver a verlo todo, abre «Filtrar por» y toca «Todos». Ojo: con un filtro puesto no salen los apuntes de «Toda la familia», porque no son de nadie en concreto. El filtro se borra al salir de Calendario.',
      target: 'calendar.filter',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Listo. El filtro solo cambia lo que ves; no cambia ni borra ningún evento ni tarea.',
  next: ['cal-vistas', 'cal-para-quien'],
}

// ─────────────────────────── Marcar como hecho ───────────────────────────

export const tutCalendarioMarcarHecho: TourDef = {
  id: 'tut-calendario-marcar-hecho',
  module: 'calendario',
  group: 'Eventos y tareas',
  summary: 'Marcar un evento o una tarea como hecho con su círculo.',
  version: 1,
  title: 'Marcar un evento o una tarea como hecho',
  cardId: 'cal-hecho',
  durationSec: 70,
  startPath: '/calendario',
  steps: [
    {
      id: 'dia',
      text: 'Aquí están los apuntes del día elegido. Si hoy no hay nada pendiente, cambia de día con ‹ y › o toca otro día del mes.',
      target: 'calendar.day-panel',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'circulo',
      text: 'Cada evento o tarea pendiente tiene un círculo. Al marcarlo queda hecho solo ese día (en algo que se repite, cada día tiene su círculo). Si es de una sola persona y lleva ⭐ puntos, esa persona los gana. Todavía no lo toques: en el siguiente paso lo haces tú.',
      target: 'calendar.entry-complete',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'marcar',
      text: 'Cuando quieras, toca tú el círculo. Yo no lo toco por ti. Si te equivocas, vuelve a tocarlo y el apunte queda pendiente.',
      target: 'calendar.entry-complete',
      completeOn: [{ type: 'event', name: 'calendar.event-completed' }],
      sensitive: true,
    },
  ],
  finishText: 'Hecho. Si te has equivocado, toca el círculo otra vez («Marcar como pendiente»): el apunte vuelve a estar pendiente y los puntos que diera se quitan.',
  next: ['cal-puntos', 'cal-crear-tarea'],
}

// ─────────────────────────── Editar un evento ───────────────────────────

export const tutCalendarioEditarEvento: TourDef = {
  id: 'tut-calendario-editar-evento',
  module: 'calendario',
  group: 'Eventos y tareas',
  summary: 'Abrir un evento o una tarea, cambiar lo que haga falta y guardar.',
  version: 1,
  title: 'Editar un evento o una tarea',
  // No existe una ficha de Ayuda propia de «Editar»; cuelga de la de repeticiones (que también explica «Solo esta repetición» y «Esta y las siguientes») para no sumar un segundo «Enséñame» a «Crear un evento».
  cardId: 'cal-repeticion',
  durationSec: 115,
  startPath: '/calendario',
  steps: [
    {
      id: 'abrir',
      text: 'Toca el evento (o la tarea) que quieras cambiar. En la vista Familiar usa el lápiz ✏️ de su tarjeta. Si aún no tienes ninguno, crea uno antes.',
      target: 'calendar.entry-edit',
      completeOn: [
        { type: 'click', target: 'calendar.entry-edit' },
        { type: 'appear', target: 'calendar.edit-title' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.edit-title' }],
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
      text: 'La fecha. En algo que se repite, esta es la fecha de toda la serie; con «Solo esta repetición» o «Esta y las siguientes» (más abajo) pasa a ser la del día que tocaste.',
      target: 'calendar.edit-date',
      completeOn: [],
      manualNext: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'hora',
      text: 'La hora de inicio y de fin, solo en eventos. Si marcas «Todo el día», las horas desaparecen.',
      target: 'calendar.edit-time',
      completeOn: [],
      manualNext: true,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'repeticion',
      text: '«Repetición»: aquí cambias cada cuánto se repite, o lo dejas en «No se repite».',
      target: 'calendar.edit-repeat',
      completeOn: [],
      manualNext: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'recordatorio',
      text: '«Recordatorio» (solo en eventos): cuánto antes te avisa. Puedes tener varios o ninguno.',
      target: 'calendar.edit-reminder',
      completeOn: [],
      manualNext: true,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar los datos',
    },
    {
      id: 'para-quien',
      text: '«¿Para quién?» cambia las personas asignadas. Con una sola persona puedes poner los puntos que gana al marcarlo hecho; con varias, o con «Toda la familia», no hay puntos.',
      target: 'calendar.edit-who',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'serie',
      text: 'Como esto se repite, eliges a qué se aplican los cambios: «Toda la serie», «Solo esta repetición» o «Esta y las siguientes». Mira bien cuál marcas antes de guardar.',
      target: 'calendar.edit-scope',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Cuando lo tengas, pulsa «Guardar». Yo no lo hago por ti. Si no quieres cambiar nada, pulsa «Cancelar» o sal del tutorial.',
      target: 'calendar.edit-save',
      completeOn: [{ type: 'event', name: 'calendar.event-updated' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! Los cambios ya están guardados. Si te equivocas, vuelve a tocar el apunte y corrígelo.',
  next: ['cal-repeticion', 'cal-recordatorio'],
}

// ─────────────────────────── Repetición: evento y tarea ───────────────────────────

function repeatSteps(kind: 'event' | 'task'): TourStep[] {
  const isEvent = kind === 'event'
  const t = isEvent ? 'calendar.event' : 'calendar.task'
  return [
    {
      id: 'titulo',
      text: isEvent
        ? 'Escribe cómo se llama el evento que se repite, por ejemplo «Fútbol de Eric». Cuando termines, pulsa ✓ en el teclado o «Siguiente».'
        : 'Escribe qué hay que hacer cada vez, por ejemplo «Sacar la basura». Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: `${t}-title`,
      completeOn: [{ type: 'entered', target: `${t}-title`, min: 2 }],
      manualNext: true,
    },
    {
      id: 'fecha',
      text: 'Elige el día en que empieza. Si se repite cada semana, será siempre ese mismo día de la semana. Cuando hayas elegido seguiré yo; si ya es el correcto, pulsa «Siguiente».',
      target: `${t}-date`,
      completeOn: [{ type: 'confirmed', target: `${t}-date` }],
      manualNext: true,
    },
    {
      id: 'abrir-repeticion',
      text: 'Toca «Repetición» para ver las opciones.',
      target: `${t}-repeat`,
      completeOn: [
        { type: 'click', target: `${t}-repeat` },
        { type: 'appear', target: 'calendar.repeat-presets' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.repeat-presets' }],
    },
    {
      id: 'opciones',
      text: 'Elige cada cuánto se repite: «Todos los días», «Todos los días laborables» (de lunes a viernes), «Todas las semanas», «Cada 2 semanas», «Todos los meses» o «Todos los años».',
      target: 'calendar.repeat-presets',
      completeOn: [{ type: 'click', target: 'calendar.repeat-presets' }],
      manualNext: true,
      detailsLabel: 'Más sobre «Personalizado…»',
      details: [
        {
          title: 'Personalizado…',
          text: isEvent
            ? 'deja elegir la frecuencia y, si es semanal, los días de la semana (por ejemplo, martes y jueves).'
            : 'deja elegir la frecuencia y, si es semanal, los días de la semana. En una tarea semanal personalizada hay que marcar al menos un día.',
        },
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
      text: 'Cierra esta ventana con la ✕ para volver al formulario. La repetición se guarda con el apunte.',
      target: 'calendar.repeat-close',
      completeOn: [{ type: 'click', target: 'calendar.repeat-close' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'guardar',
      text: isEvent ? 'Cuando quieras, pulsa «Crear evento». Yo no lo hago por ti: lo pulsas tú.' : 'Cuando quieras, pulsa «Crear tarea». Yo no lo hago por ti: lo pulsas tú.',
      target: `${t}-save`,
      completeOn: [{ type: 'event', name: isEvent ? 'calendar.event-created' : 'calendar.task-created' }],
      sensitive: true,
    },
  ]
}

export const tutCalendarioEventoRepetitivo: TourDef = {
  id: 'tut-calendario-evento-repetitivo',
  module: 'calendario',
  group: 'Eventos y tareas',
  summary: 'Crear un evento que se repite cada día, semana, mes o año.',
  version: 1,
  title: 'Crear un evento que se repite',
  cardId: 'cal-repeticion',
  durationSec: 110,
  startPath: '/calendario',
  startDest: 'calendario.nuevo-evento',
  steps: repeatSteps('event'),
  finishText: '¡Listo! El evento se verá en todos los días que le toquen. Para cambiar solo un día o de una fecha en adelante, edítalo y elige a qué se aplica el cambio.',
  next: ['cal-recordatorio', 'cal-para-quien'],
}

export const tutCalendarioTareaRepetitiva: TourDef = {
  id: 'tut-calendario-tarea-repetitiva',
  module: 'calendario',
  group: 'Eventos y tareas',
  summary: 'Crear una tarea que se repite (por ejemplo, todos los lunes).',
  version: 1,
  title: 'Crear una tarea que se repite',
  cardId: 'cal-repeticion',
  durationSec: 110,
  startPath: '/calendario',
  startDest: 'calendario.nueva-tarea',
  steps: repeatSteps('task'),
  finishText: '¡Listo! La tarea saldrá en todos los días que le toquen y cada día tiene su propio círculo para marcarla como hecha.',
  next: ['cal-hecho', 'cal-puntos'],
}

// ─────────────────────────── Recordatorio ───────────────────────────

export const tutCalendarioEventoRecordatorio: TourDef = {
  id: 'tut-calendario-evento-recordatorio',
  module: 'calendario',
  group: 'Eventos y tareas',
  summary: 'Crear un evento con uno o varios avisos antes de que empiece.',
  version: 1,
  title: 'Crear un evento con recordatorio',
  cardId: 'cal-recordatorio',
  durationSec: 110,
  startPath: '/calendario',
  startDest: 'calendario.nuevo-evento',
  steps: [
    {
      id: 'titulo',
      text: 'Escribe cómo se llama el evento, por ejemplo «Dentista de Eric». Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
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
      id: 'hora',
      text: 'Pon la hora de inicio: el recordatorio cuenta hacia atrás desde ella. Si también pones hora de fin, podrás contar desde que termina.',
      target: 'calendar.event-time',
      completeOn: [],
      manualNext: true,
      optional: true,
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
      text: 'Toca los avisos que quieras; puedes marcar varios: 10 o 30 minutos, 1 hora, 1 día, 1 semana, 1 mes o 1 año antes. «Sin recordatorio» los quita todos y «Personalizado…» deja poner otra cantidad.',
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
      id: 'guardar',
      text: 'Cuando quieras, pulsa «Crear evento». Yo no lo hago por ti: lo pulsas tú.',
      target: 'calendar.event-save',
      completeOn: [{ type: 'event', name: 'calendar.event-created' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! El aviso llegará a las personas que corresponda (según los ajustes de avisos de tu familia) cuando llegue el momento. Una tarea no lleva recordatorio.',
  next: ['cal-crear-evento', 'cal-para-quien'],
}

// ─────────────────────────── Puntos ───────────────────────────

export const tutCalendarioPuntos: TourDef = {
  id: 'tut-calendario-puntos',
  module: 'calendario',
  group: 'Eventos y tareas',
  summary: 'Crear una tarea que da puntos a una persona al marcarla como hecha.',
  version: 1,
  title: 'Crear una tarea que da puntos',
  cardId: 'cal-puntos',
  durationSec: 110,
  startPath: '/calendario',
  startDest: 'calendario.nueva-tarea',
  steps: [
    {
      id: 'titulo',
      text: 'Escribe qué hay que hacer, por ejemplo «Recoger la habitación». Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'calendar.task-title',
      completeOn: [{ type: 'entered', target: 'calendar.task-title', min: 2 }],
      manualNext: true,
    },
    {
      id: 'fecha',
      text: 'Elige el día. Cuando hayas elegido seguiré yo; si ya es el correcto, pulsa «Siguiente».',
      target: 'calendar.task-date',
      completeOn: [{ type: 'confirmed', target: 'calendar.task-date' }],
      manualNext: true,
    },
    {
      id: 'para-quien',
      text: 'Los puntos son para UNA persona. Si tu cuenta tiene ficha en la familia, ya viene elegida; para cambiarla toca «¿Para quién?», o sigue con «Siguiente». Con «Toda la familia» o con varias personas no hay puntos.',
      target: 'calendar.task-who',
      completeOn: [{ type: 'click', target: 'calendar.task-who' }],
      manualNext: true,
    },
    {
      id: 'lista',
      text: 'Marca a la persona que ganará los puntos. Si quitas la marca queda «Toda la familia»; con dos o más personas el campo de puntos desaparece.',
      target: 'calendar.who-list',
      completeOn: [{ type: 'click', target: 'calendar.who-list' }],
      manualNext: true,
      optional: true,
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
      text: 'Escribe cuántos puntos gana esa persona cada vez que se marque la tarea como «Hecha». Es opcional; con 0 no hay puntos. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'calendar.task-points',
      completeOn: [{ type: 'entered', target: 'calendar.task-points', min: 1 }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Cuando quieras, pulsa «Crear tarea». Yo no lo hago por ti: lo pulsas tú.',
      target: 'calendar.task-save',
      completeOn: [{ type: 'event', name: 'calendar.task-created' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! Los puntos se dan al marcar la tarea como hecha y se suman en Pequeños Grandes → Puntos y recompensas. En un evento es igual: el campo de puntos sale con una sola persona.',
  next: ['cal-hecho', 'cal-para-quien'],
}

// ─────────────────────────── Nota personal ───────────────────────────

export const tutCalendarioNotaPersonal: TourDef = {
  id: 'tut-calendario-nota-personal',
  module: 'calendario',
  group: 'Notas',
  summary: 'Apuntar una nota privada para un día, en la vista Personal.',
  version: 1,
  title: 'Añadir una nota personal',
  cardId: 'cal-privado',
  durationSec: 80,
  startPath: '/calendario',
  steps: [
    {
      id: 'menu',
      text: 'Las notas personales están en la vista Personal. Pulsa «☰ Menú».',
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
      text: 'Aquí apuntas notas solo para ti, para el día que tienes elegido arriba. Nadie más de la familia las ve. Cambia de día con ‹ y ›.',
      target: 'calendar.note-privacy',
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
      text: 'Pulsa «+ Añadir» para guardarla. Yo no lo hago por ti: lo pulsas tú.',
      target: 'calendar.note-add',
      completeOn: [{ type: 'event', name: 'calendar.note-added' }],
      sensitive: true,
    },
  ],
  finishText: 'Nota guardada en ese día. Solo tú la ves. En Personal también aparecen tus eventos y tareas.',
  next: ['cal-privado', 'cal-saltar-fecha'],
}
