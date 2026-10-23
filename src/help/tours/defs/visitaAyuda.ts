import type { TourDef } from '@/help/tours/types'

// Visita guiada de la propia Ayuda («Conoce esta sección»): el buscador, las áreas de «Pepa te acompaña», los temas y los vídeos. Solo informativa: no cambia ni guarda nada.
export const visitaAyuda: TourDef = {
  id: 'visita-ayuda',
  kind: 'visit',
  module: 'ayuda',
  version: 1,
  title: 'Conoce la Ayuda',
  summary: 'Cómo preguntarme, las cuatro áreas de la Ayuda y dónde están los temas y los vídeos.',
  cardId: 'ayu-usar',
  durationSec: 75,
  startPath: '/ayuda',
  paths: ['/ayuda'],
  steps: [
    {
      id: 'pregunta',
      text: 'Aquí me preguntas lo que quieras hacer o saber en PEPA, con tus palabras. Mientras escribes te sugiero respuestas, y te llevo al sitio si lo necesitas.',
      target: 'ayuda.pregunta',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'areas',
      text: 'Estas pestañas son las áreas de la Ayuda: «Preguntar», «Conoce esta sección» (una visita corta de cada pantalla), «Enséñame» (tutoriales paso a paso) y «Cómo funciona PEPA».',
      target: 'ayuda.areas',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'bienvenida',
      text: 'Si quieres un repaso general de PEPA, este recorrido de bienvenida dura un par de minutos y puedes repetirlo cuando quieras.',
      target: 'ayuda.bienvenida',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'temas',
      text: 'Aquí tienes todos los temas de PEPA. Toca uno para ver sus preguntas más habituales, llevarte a esa pantalla o leer su explicación completa.',
      target: 'ayuda.temas',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'videos',
      text: 'Y al final están los vídeos explicativos de cada sección, por si prefieres verlo en movimiento.',
      target: 'ayuda.videos',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es la Ayuda. Cuando algo no te cuadre, vuelve aquí y pregúntame.',
  next: ['ayu-usar'],
}
