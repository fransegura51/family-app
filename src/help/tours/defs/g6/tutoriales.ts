import type { TourDef } from '@/help/tours/types'

// Tutoriales «Enséñame» del grupo g6: Inicio. Cada secuencia está comprobada contra el código de la pantalla real
// (nombres de botones y orden). Los pasos que guardan datos son `sensitive` y solo avanzan con el aviso `emitHelpEvent(...)` que la pantalla lanza DESPUÉS de que el servidor
// confirma. Ninguno borra, comparte, quita ni pulsa nada por la persona; todos se pueden abandonar con «Salir» sin guardar.
// Documentos está en documentos.ts, Cumpleaños en cumpleanos.ts, y Contactos y Galería en ../g9/contactosGaleria.ts.

// ───────────────────────────── Inicio
export const tutInicioOrganizar: TourDef = {
  id: 'tut-inicio-organizar',
  module: 'inicio',
  summary: 'Cambia el orden de las tarjetas de Inicio.',
  version: 2,
  title: 'Ordenar las tarjetas de Inicio',
  cardId: 'ini-organizar',
  durationSec: 60,
  startPath: '/',
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a ordenar las tarjetas de Inicio. Pulsa «↕️ Organizar». El orden que dejes se guarda de verdad, en tu cuenta, y puedes volver a cambiarlo cuando quieras.',
      target: 'inicio.organizar',
      completeOn: [
        { type: 'click', target: 'inicio.organizar' },
        { type: 'appear', target: 'inicio.mover' },
      ],
      skipIf: [{ type: 'appear', target: 'inicio.mover' }],
    },
    {
      id: 'mover',
      text: 'Cada tarjeta tiene dos flechas: ◀ la pasa antes y ▶ la pasa después. Mueve una: el orden se guarda al momento. Yo no la muevo por ti; si prefieres no cambiar nada, pulsa «Salir».',
      target: 'inicio.mover',
      completeOn: [{ type: 'event', name: 'inicio.card-moved' }],
      sensitive: true,
    },
    {
      id: 'listo',
      text: 'Cuando termines, pulsa «✓ Listo». Mientras organizas, tocar una tarjeta no abre su sección; al terminar, vuelve a funcionar con normalidad.',
      target: 'inicio.organizar',
      completeOn: [{ type: 'click', target: 'inicio.organizar' }],
    },
  ],
  finishText: '¡Listo! Tus tarjetas quedan en el orden que has elegido. Es solo tuyo: cada persona tiene el suyo. Puedes volver a cambiarlo cuando quieras.',
  next: ['ini-que-veo', 'ini-menu-y-barra'],
}
