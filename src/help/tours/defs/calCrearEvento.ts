import type { TourDef } from '@/help/tours/types'

// Calendario → Crear un evento. Recorre los controles REALES de «+ Nuevo evento»: el botón flotante, el título, la fecha y «Crear evento». Nunca guarda por la persona:
// el último paso solo señala el botón y espera a que la aplicación confirme que el evento se ha creado.
export const calCrearEvento: TourDef = {
  id: 'cal-crear-evento',
  version: 1,
  title: 'Crear un evento en el calendario',
  cardId: 'cal-crear-evento',
  durationSec: 60,
  startPath: '/calendario',
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a crear un evento. Pulsa el botón «+ Nuevo evento».',
      target: 'calendar.new-event',
      completeOn: [
        { type: 'click', target: 'calendar.new-event' },
        { type: 'appear', target: 'calendar.event-title' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.event-title' }],
    },
    {
      id: 'titulo',
      text: 'Escribe cómo se llama el evento, por ejemplo «Dentista de Eric».',
      target: 'calendar.event-title',
      completeOn: [{ type: 'filled', target: 'calendar.event-title', min: 2 }],
    },
    {
      id: 'fecha',
      text: 'Comprueba el día: aquí eliges la fecha del evento. Si ya es la correcta, pulsa «Siguiente».',
      target: 'calendar.event-date',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'opciones',
      text: 'Si quieres, más abajo puedes poner hora, repetición, recordatorio, ubicación, foto o nota, y para quién es. Ninguna de esas cosas es obligatoria.',
      target: 'calendar.event-title',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Cuando lo tengas, pulsa «Crear evento». Yo no lo hago por ti: lo pulsas tú.',
      target: 'calendar.event-save',
      completeOn: [{ type: 'event', name: 'calendar.event-created' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! Tu evento ya está en el calendario. Si quieres cambiarlo más tarde, toca el evento.',
  next: ['cal-crear-tarea', 'cal-recordatorio', 'cal-repeticion'],
}
