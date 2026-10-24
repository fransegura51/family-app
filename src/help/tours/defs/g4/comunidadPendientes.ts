import type { TourDef } from '@/help/tours/types'

// Comunidad: tutoriales que pasan por /comunidad/p/:id y /comunidad/nueva. Llevan `paths: ['/comunidad/*']`: el motor acepta el comodín (src/help/tours/paths.ts), así que cambiar de pantalla
// dentro de Comunidad no los deja «fuera de ruta». Verificados contra el código (marcas «comunidad.*» y avisos ya puestos en las pantallas).
// Todos terminan ANTES de publicar: ninguno pulsa ni empuja a pulsar «Publicar», comentar, valorar, proponer un tema, borrar, denunciar o compartir.

const abrirPublicacion = {
  id: 'abrir',
  text: 'Abre una publicación tocando su tarjeta. Vale cualquiera.',
  target: 'comunidad.post-card',
  completeOn: [{ type: 'click' as const, target: 'comunidad.post-card' }],
  skipIf: [{ type: 'appear' as const, target: 'comunidad.post-save' }],
}

export const comunidadGuardarPublicacion: TourDef = {
  id: 'tut-comunidad-guardar-publicacion',
  module: 'comunidad',
  summary: 'Guardar una publicación para volver a ella más tarde (se puede quitar cuando quieras).',
  group: 'Leer y guardar',
  access: { community: true },
  version: 1,
  title: 'Guardar una publicación',
  cardId: 'com2-publicar',
  durationSec: 60,
  startPath: '/comunidad',
  paths: ['/comunidad/*'],
  steps: [
    abrirPublicacion,
    {
      id: 'acciones',
      text: 'Debajo de la publicación están las acciones: Me gusta, Guardar, Seguir la conversación, Compartir… Hoy solo usamos una: «Guardar».',
      target: 'comunidad.post-save',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Pulsa «Guardar». Se queda en tus «Guardados». Si te arrepientes, vuelve a pulsarlo (ahora dirá «Guardada») y se quita. Yo no lo pulso por ti.',
      target: 'comunidad.post-save',
      completeOn: [{ type: 'event', name: 'comunidad.post-saved' }],
      sensitive: true,
    },
  ],
  finishText: 'Listo. La publicación está en «Guardados» (en la barra de Comunidad).',
  next: ['com2-publicar', 'com2-recetas'],
}

export const comunidadSeguirConversacion: TourDef = {
  id: 'tut-comunidad-seguir-conversacion',
  module: 'comunidad',
  summary: 'Seguir la conversación de una publicación para recibir avisos de sus comentarios nuevos.',
  group: 'Leer y guardar',
  access: { community: true },
  version: 1,
  title: 'Seguir una conversación',
  cardId: 'com2-publicar',
  durationSec: 60,
  startPath: '/comunidad',
  paths: ['/comunidad/*'],
  steps: [
    abrirPublicacion,
    {
      id: 'acciones',
      text: 'Seguir una conversación sirve para enterarte de los comentarios nuevos sin tener que volver a mirar. Es opcional y se puede quitar cuando quieras.',
      target: 'comunidad.post-follow-conversation',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'seguir',
      text: 'Pulsa «Seguir la conversación». Te avisarán de los comentarios nuevos, agrupados, y se puede quitar volviendo a pulsarlo. Yo no lo pulso por ti.',
      target: 'comunidad.post-follow-conversation',
      completeOn: [{ type: 'event', name: 'comunidad.conversation-followed' }],
      sensitive: true,
    },
  ],
  finishText: 'Listo, ya sigues esa conversación. Los horarios de estos avisos se cambian en Mi perfil → Mis ajustes → «Avisos de Comunidad».',
  next: ['com2-publicar'],
}

export const comunidadCrearBorrador: TourDef = {
  id: 'tut-comunidad-crear-borrador',
  module: 'comunidad',
  summary: 'Empezar una publicación y guardarla como borrador. Publicarla lo decides tú.',
  group: 'Publicar',
  access: { community: true },
  version: 1,
  title: 'Crear una publicación (hasta el borrador)',
  cardId: 'com2-publicar',
  durationSec: 100,
  startPath: '/comunidad',
  paths: ['/comunidad/*'],
  steps: [
    {
      id: 'crear',
      text: 'Pulsa «✍️ Crear publicación». Si aún no tienes alias, te lo pedirá antes de abrir el editor.',
      target: 'comunidad.create-post',
      completeOn: [{ type: 'appear', target: 'comunidad.editor-title' }],
      skipIf: [{ type: 'appear', target: 'comunidad.editor-title' }],
    },
    {
      id: 'tipo',
      text: 'Elige qué quieres publicar (Receta, Pregunta, Consejo o Anécdota), la sección y el tema. Son necesarios para publicar.',
      target: 'comunidad.editor-kind',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'titulo',
      text: 'Escribe un título. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'comunidad.editor-title',
      completeOn: [{ type: 'entered', target: 'comunidad.editor-title', min: 2 }],
      manualNext: true,
    },
    {
      id: 'texto',
      text: 'Y aquí el texto de la publicación. En una receta es opcional.',
      target: 'comunidad.editor-body',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'fotos',
      text: 'Las fotos son opcionales (hasta 5). Se preparan en tu móvil y se suben en cuanto las eliges; si descartas la publicación, se borran.',
      target: 'comunidad.editor-photos',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'borrador',
      text: 'Pulsa «Guardar borrador». Se guarda solo para ti, no se publica, y se conserva 30 días desde el último guardado. «Publicar» está justo debajo: ese lo decides tú, yo no lo pulso.',
      target: 'comunidad.editor-save-draft',
      completeOn: [{ type: 'event', name: 'comunidad.draft-saved' }],
      sensitive: true,
    },
  ],
  finishText: 'Borrador guardado: no se ha publicado nada. Lo encuentras en «Borradores». Cuando quieras publicarlo, abre el borrador y pulsa «Publicar»: esa decisión es tuya.',
  next: ['com2-publicar', 'com2-alias'],
}

export const comunidadImportarReceta: TourDef = {
  id: 'tut-comunidad-importar-receta',
  module: 'comunidad',
  summary: 'Copiar una receta de Comunidad a la Cocina de tu familia.',
  group: 'Recetas',
  access: { community: true },
  version: 1,
  title: 'Guardar una receta en mi Cocina',
  cardId: 'com2-recetas',
  durationSec: 70,
  startPath: '/comunidad',
  paths: ['/comunidad/*'],
  steps: [
    {
      id: 'receta',
      text: 'Abre una receta de Comunidad (las que llevan 🍲): entra en «Recetas y cocina» y toca una tarjeta de receta.',
      target: 'comunidad.sections',
      completeOn: [{ type: 'appear', target: 'comunidad.recipe-import' }],
      skipIf: [{ type: 'appear', target: 'comunidad.recipe-import' }],
    },
    {
      id: 'copia',
      text: 'Al guardar una receta en tu Cocina se crea una copia tuya, que puedes editar. No se comparte nada de tu familia con quien la publicó.',
      target: 'comunidad.recipe-import',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'importar',
      text: 'Pulsa «📥 Guardar en mi Cocina». Se crea una copia tuya que puedes editar; la de Comunidad no cambia y no se comparte nada de tu familia. Yo no lo pulso por ti.',
      target: 'comunidad.recipe-import',
      completeOn: [{ type: 'event', name: 'comunidad.recipe-imported' }],
      sensitive: true,
    },
  ],
  finishText: 'Listo: la receta ya está en tu Cocina, como una copia tuya.',
  next: ['com2-recetas'],
}

export const TOURS_COMUNIDAD_PENDIENTES: TourDef[] = [comunidadGuardarPublicacion, comunidadSeguirConversacion, comunidadCrearBorrador, comunidadImportarReceta]
