import type { TourDef } from '@/help/tours/types'

// Recorrido de bienvenida (1-2 minutos, opcional): Inicio, navegación, Calendario, Compras y Ayuda. Señala controles reales de la barra y del menú; solo pasos informativos,
// ningún dato se crea ni se guarda. Los pasos de secciones a las que la cuenta no tiene acceso se omiten solos (`optional`).
export const bienvenida: TourDef = {
  id: 'bienvenida',
  version: 1,
  title: 'Recorrido de bienvenida',
  cardId: 'ayu-usar',
  durationSec: 90,
  startPath: '/',
  paths: ['/'],
  steps: [
    {
      id: 'inicio',
      text: 'Hola, soy Pepa. Esto es Inicio: el resumen del día, con la compra pendiente, lo que hay hoy en el calendario y las fotos de la familia.',
      target: 'inicio.carrusel',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'menu',
      text: 'Abajo tienes la barra de navegación. Pulsa «Menú» para ver todas las secciones de PEPA.',
      target: 'nav.menu',
      completeOn: [
        { type: 'click', target: 'nav.menu' },
        { type: 'appear', target: 'nav.flyout' },
      ],
      skipIf: [{ type: 'appear', target: 'nav.flyout' }],
    },
    {
      id: 'calendario',
      text: 'Calendario: los eventos y las tareas de toda la familia, con avisos para que no se olvide nada.',
      target: 'nav.tab.calendario',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'compras',
      text: 'Compras: la lista de la compra por tiendas, compartible, con historial de precios.',
      target: 'nav.tab.compras',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'ayuda',
      text: 'Y aquí está la Ayuda, donde siempre puedes preguntarme lo que quieras hacer o saber en PEPA.',
      target: 'nav.help',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: '¡Eso es todo por ahora! ¿Qué otra cosa quieres conocer? Te lo enseño sobre la propia app.',
  next: ['cal-crear-evento', 'com-anadir-producto', 'fam-anadir-miembro', 'ayu-usar'],
}
