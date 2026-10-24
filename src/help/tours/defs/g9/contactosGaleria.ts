import type { TourDef } from '@/help/tours/types'

// Contactos y Galería (grupo g9): importar contactos y compartir contactos o fotos. Marcas `data-help-id` en src/ui/ContactsScreen.tsx y src/ui/GalleryScreen.tsx.
// NINGUNO elige archivos, importa ni comparte por la persona: se señalan las tarjetas de importación y los botones de compartir y se explica; el botón que de verdad manda
// («📤 Compartir N…») solo se señala. «Compartir varios» sí se puede pulsar (solo activa las casillas, no manda nada) y el tutorial recuerda cómo cancelar la selección.

export const tutContactosImportar: TourDef = {
  id: 'tut-contactos-importar',
  module: 'contactos',
  group: 'Contactos',
  summary: 'Trae contactos de la agenda del móvil, de un archivo .vcf o los cumpleaños de Google.',
  version: 1,
  title: 'Importar contactos',
  cardId: 'con-importar',
  durationSec: 100,
  startPath: '/contactos',
  steps: [
    {
      id: 'telefono',
      text: '«Importar del teléfono» abre la agenda de tu móvil para que marques los que quieras traer. Solo sale en navegadores que lo permiten, normalmente Chrome o Edge en Android. Aquí solo lo miramos.',
      target: 'contactos.importar-telefono',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'vcf',
      text: 'Con un archivo .vcf (por ejemplo, exportado de Contactos del iPhone) eliges el archivo aquí y marcas cuáles añadir. Los que ya tienes salen sin marcar; si los marcas, solo se completan los datos que les falten.',
      target: 'contactos.importar-vcf',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'ics',
      text: 'Para los cumpleaños, exporta el calendario «Cumpleaños» de Google Calendar a un archivo .ics, súbelo aquí y marca los que quieras añadir.',
      target: 'contactos.importar-ics',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'En los tres casos primero salen los contactos encontrados con casillas, y el botón «Importar N» los guarda. Ese botón lo pulsas tú; yo no importo nada.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. No he importado nada: cuando quieras traer contactos, elige el archivo tú y revisa las casillas antes de importar.',
  next: ['con-agenda', 'con-compartir', 'cum-ver'],
}

export const tutContactosCompartir: TourDef = {
  id: 'tut-contactos-compartir',
  module: 'contactos',
  group: 'Contactos',
  summary: 'Comparte un contacto o varios a la vez (sin mandar nada por ti).',
  version: 1,
  title: 'Compartir contactos',
  cardId: 'con-compartir',
  durationSec: 90,
  startPath: '/contactos',
  steps: [
    {
      id: 'uno',
      text: 'El icono 📤 de cada ficha manda ese contacto (nombre, teléfono y email) con el menú de compartir del móvil. Aquí solo te lo señalo: yo no lo pulso.',
      target: 'contactos.compartir-uno',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'varios',
      text: 'Para mandar varios juntos, pulsa «📤 Compartir varios». Aparecen casillas en cada contacto; todavía no se manda nada. Si no tienes contactos, pulsa «Siguiente».',
      target: 'contactos.compartir-varios',
      completeOn: [{ type: 'appear', target: 'contactos.casilla' }],
      manualNext: true,
    },
    {
      id: 'marcar',
      text: 'Marca las casillas de los contactos que quieras mandar. Al marcar el primero aparece el botón de enviar y sigo yo; si no quieres marcar ninguno, pulsa «Siguiente».',
      target: 'contactos.lista',
      completeOn: [{ type: 'appear', target: 'contactos.mandar-seleccion' }],
      manualNext: true,
    },
    {
      id: 'enviar',
      text: 'Este botón («📤 Compartir N contactos») es el que manda. Lo pulsas tú y eliges por dónde enviarlos. Yo no lo pulso. Para dejarlo, pulsa «Cancelar selección».',
      target: 'contactos.mandar-seleccion',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. No he compartido nada. Si te quedas con las casillas puestas, pulsa «Cancelar selección» para volver a la lista normal.',
  next: ['con-agenda', 'con-importar'],
}

export const tutGaleriaCompartir: TourDef = {
  id: 'tut-galeria-compartir',
  module: 'galeria',
  group: 'Fotos',
  summary: 'Comparte una foto o varias a la vez (sin mandar nada por ti).',
  version: 1,
  title: 'Compartir fotos de la Galería',
  cardId: 'gal-compartir',
  durationSec: 90,
  startPath: '/galeria',
  steps: [
    {
      id: 'uno',
      text: 'El icono 📤 de cada foto la manda al menú de compartir del móvil. Aquí solo te lo señalo: yo no lo pulso. Si todavía no hay fotos, no sale.',
      target: 'gallery.share-one',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'varios',
      text: 'Para mandar varias juntas, pulsa «📤 Compartir varias». Aparecen casillas en cada foto; todavía no se manda nada. Si no hay fotos, pulsa «Siguiente».',
      target: 'gallery.share-many',
      completeOn: [{ type: 'appear', target: 'gallery.casilla' }],
      manualNext: true,
    },
    {
      id: 'marcar',
      text: 'Marca las casillas de las fotos que quieras mandar. Al marcar la primera aparece el botón de enviar y sigo yo; si no quieres marcar ninguna, pulsa «Siguiente».',
      target: 'gallery.grid',
      completeOn: [{ type: 'appear', target: 'gallery.mandar-seleccion' }],
      manualNext: true,
    },
    {
      id: 'enviar',
      text: 'Este botón («📤 Compartir N fotos») es el que manda. Lo pulsas tú y eliges por dónde enviarlas. Yo no lo pulso. Para dejarlo, pulsa «Cancelar selección».',
      target: 'gallery.mandar-seleccion',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. No he compartido nada. Si te quedas con las casillas puestas, pulsa «Cancelar selección» para volver a la galería normal.',
  next: ['gal-subir', 'ini-que-veo'],
}

export const TOURS_G9_CONTACTOS_GALERIA: TourDef[] = [tutContactosImportar, tutContactosCompartir, tutGaleriaCompartir]
