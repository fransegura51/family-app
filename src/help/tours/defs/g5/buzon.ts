import type { TourDef } from '@/help/tours/types'

// Buzón de sugerencias (src/ui/SuggestionsScreen.tsx). Visita guiada y un capítulo («Escribir una sugerencia», serie «Dar tu opinión»). El capítulo nunca envía por la persona: «Enviar sugerencia» es una
// acción que decide ella sola; si la pulsa, la pantalla anuncia 'suggestions.sent' y el capítulo pasa al paso siguiente. Reseñas y opiniones (estrellas que se guardan al tocar) es el otro capítulo
// de la serie (defs/g10/cuentas.ts).

export const visitaBuzon: TourDef = {
  id: 'visita-buzon',
  kind: 'visit',
  module: 'ayuda',
  version: 2,
  title: 'Conoce el Buzón de sugerencias',
  summary: 'Dónde dejar una idea para mejorar PEPA y cómo ver su estado.',
  cardId: 'ini-sugerencias',
  durationSec: 80,
  startPath: '/sugerencias',
  steps: [
    {
      id: 'intro',
      text: 'Este es el Buzón de sugerencias: si se te ocurre algo que mejorar en PEPA, lo dejas aquí. Esta visita no envía nada.',
      target: 'suggestions.intro',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'formulario',
      text: 'En «Nueva sugerencia» escribes tu idea con tus palabras: qué añadirías o qué cambiarías.',
      target: 'suggestions.form',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'enviar',
      text: '«📮 Enviar sugerencia» la manda al buzón. Se activa cuando has escrito algo. Esta visita no la pulsa.',
      target: 'suggestions.send',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'lista',
      text: 'Debajo salen las sugerencias de tu familia. Las ve toda la familia que entra aquí, así que no escribas datos privados.',
      target: 'suggestions.list',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'estado',
      text: 'Cada una lleva un estado: «Pendiente», «Aplicada» o «Descartada», y a veces una respuesta. Mientras está pendiente puedes retirarla con «Retirar».',
      target: 'suggestions.status',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Ya conoces el Buzón. Si quieres valorar PEPA con estrellas, eso está en «Reseñas y opiniones», en el menú ☰.',
  next: ['ini-sugerencias', 'ini-resenas'],
}

export const tutBuzonEscribirSugerencia: TourDef = {
  id: 'tut-buzon-escribir-sugerencia',
  module: 'ayuda',
  summary: 'Escribir una sugerencia. Enviarla es decisión tuya: el capítulo nunca la envía por ti.',
  version: 2,
  title: 'Escribir una sugerencia',
  cardId: 'ini-sugerencias',
  durationSec: 60,
  startPath: '/sugerencias',
  steps: [
    {
      id: 'escribir',
      text: 'Escribe tu idea con tus palabras, por ejemplo qué botón añadirías. No pongas contraseñas ni datos privados: la ve toda tu familia. Se envía de verdad solo cuando pulses «Enviar sugerencia». Al terminar, pulsa ✓ o «Siguiente».',
      target: 'suggestions.message',
      completeOn: [{ type: 'entered', target: 'suggestions.message', min: 5 }],
      manualNext: true,
    },
    {
      id: 'enviar',
      text: 'El botón «📮 Enviar sugerencia» la deja en el buzón. Yo no lo pulso por ti. Si la envías, seguiré yo; si no quieres enviarla, pulsa «Siguiente» y borra el texto.',
      target: 'suggestions.send',
      completeOn: [{ type: 'event', name: 'suggestions.sent' }],
      manualNext: true,
    },
    {
      id: 'estados',
      text: 'Las sugerencias salen en esta lista, la ve toda tu familia. Al enviarla queda «Pendiente»; después puede pasar a «Aplicada» o «Descartada». Mientras está pendiente puedes retirarla con «Retirar».',
      target: 'suggestions.list',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Si no la enviaste, tu texto sigue en el cuadro: cuando quieras, pulsa «📮 Enviar sugerencia» tú misma, o bórralo.',
  next: ['ini-sugerencias', 'ini-resenas'],
}

export const TOURS_BUZON: TourDef[] = [visitaBuzon, tutBuzonEscribirSugerencia]
