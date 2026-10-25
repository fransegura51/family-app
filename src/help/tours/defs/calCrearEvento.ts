import type { TourDef } from '@/help/tours/types'

// Calendario → «Crear eventos y tareas», capítulo 1: crear un evento (nombre, fecha, hora y «Todo el día»). Es el primer capítulo de la serie `ser-calendario-crear` y conserva el
// identificador del antiguo piloto `cal-crear-evento`. Arranca con el formulario de «+ Nuevo evento» ya abierto (`startDest`), señala los controles REALES y NO guarda nada: termina
// cerrando el formulario sin guardar. El único capítulo que guarda es el último (`tut-calendario-guardar-evento`). La tarea se crea casi igual con «+ Nueva tarea» (sin hora, sin
// «Todo el día» y sin recordatorio): se dice aquí una sola vez y cada capítulo anota lo que cambia en una tarea. Una tarea tampoco rellena sola los datos al repetir un título.
export const calCrearEvento: TourDef = {
  id: 'cal-crear-evento',
  module: 'calendario',
  summary: 'Crear un evento: el título, la fecha, la hora y «Todo el día». Aquí se explica también en qué se diferencia una tarea.',
  group: 'Crear eventos y tareas',
  version: 4,
  title: 'Crear un evento: nombre, fecha y hora',
  cardId: 'cal-crear-evento',
  durationSec: 80,
  startPath: '/calendario',
  startDest: 'calendario.nuevo-evento',
  steps: [
    {
      id: 'intro',
      text: 'Vamos a crear un evento: ya tienes abierto el formulario de «+ Nuevo evento». Una tarea se crea casi igual con «+ Nueva tarea», pero sin hora, sin «Todo el día» y sin recordatorio. Si algo cambia en una tarea, te lo aviso.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'titulo',
      text: 'Escribe cómo se llama el evento, por ejemplo «Dentista de Eric». Si repites un título que ya usaste, PEPA copia la hora, la repetición, los avisos y para quién era; puedes cambiarlo. Al terminar, pulsa ✓ en el teclado o «Siguiente».',
      target: 'calendar.event-title',
      completeOn: [{ type: 'entered', target: 'calendar.event-title', min: 2 }],
      manualNext: true,
    },
    {
      id: 'fecha',
      text: 'Aquí eliges el día. Cuando hayas elegido la fecha seguiré yo; si ya es la correcta, pulsa «Siguiente».',
      target: 'calendar.event-date',
      completeOn: [{ type: 'confirmed', target: 'calendar.event-date' }],
      manualNext: true,
    },
    {
      id: 'hora',
      text: '«Empieza» es la hora de inicio y «Termina (opcional)» la de fin. Ponerla es opcional, pero ojo: sin hora y sin «Todo el día», el evento se guarda a las 00:00 y así se verá.',
      target: 'calendar.event-time',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'todo-el-dia',
      text: '«Todo el día» sirve para eventos sin hora, como un cumpleaños o un viaje. Al marcarlo desaparecen las horas. Una tarea nunca lleva hora ni «Todo el día».',
      target: 'calendar.event-allday',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'cerrar-formulario',
      text: 'No se ha guardado nada. Cierra el formulario con la ✕ para descartarlo, o sigue con el siguiente capítulo: más opciones del mismo formulario.',
      target: 'calendar.event-close',
      completeOn: [{ type: 'click', target: 'calendar.event-close' }],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Ya sabes lo básico de un evento. Sigue con las personas y las categorías, las repeticiones, los recordatorios… o ve al último capítulo para guardar uno de verdad.',
  next: ['cal-crear-tarea', 'cal-recordatorio', 'cal-repeticion'],
}
