import type { TourDef } from '@/help/tours/types'

// Comunidad: capítulos que pasan por /comunidad/p/:id y /comunidad/nueva. Llevan `paths: ['/comunidad/*']`: el motor acepta el comodín (src/help/tours/paths.ts), así que cambiar de pantalla
// dentro de Comunidad no los deja «fuera de ruta». Verificados contra el código (marcas «comunidad.*» y avisos ya puestos en las pantallas).
// Todos terminan ANTES de publicar: ninguno pulsa ni empuja a pulsar «Publicar», comentar, valorar, proponer un tema, borrar, denunciar o compartir.

const SIN_PUBLICACIONES = 'Para practicar este capítulo necesitas ver alguna publicación en la portada de Comunidad, y ahora no hay ninguna. Puedes verlo solo leyendo o salir y volver cuando haya alguna.'

export const comunidadGuardarPublicacion: TourDef = {
  id: 'tut-comunidad-guardar-publicacion',
  module: 'comunidad',
  summary: 'Abrir una publicación, guardarla para volver más tarde y seguir su conversación.',
  access: { community: true },
  version: 2,
  title: 'Leer, guardar y seguir una publicación',
  cardId: 'com2-publicar',
  durationSec: 90,
  startPath: '/comunidad',
  paths: ['/comunidad/*'],
  readyOn: ['comunidad.post-card'],
  needs: [{ target: 'comunidad.post-card', message: SIN_PUBLICACIONES }],
  steps: [
    {
      id: 'abrir',
      text: 'Abre una publicación tocando su tarjeta; vale cualquiera. Ojo: «Guardar» la guarda de verdad en tus «Guardados» (se quita volviendo a pulsarlo). Si solo estás mirando, pulsa «Salir» antes.',
      target: 'comunidad.post-card',
      completeOn: [{ type: 'click', target: 'comunidad.post-card' }],
      skipIf: [{ type: 'appear', target: 'comunidad.post-save' }],
    },
    {
      id: 'acciones',
      text: 'Debajo de la publicación están las acciones: Me gusta, Guardar, Seguir la conversación, Compartir y «Más». Aquí usamos dos: «Guardar» y «Seguir la conversación».',
      target: 'comunidad.post-save',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Pulsa «Guardar». Se queda en tus «Guardados» (en la barra de Comunidad). Si ya pone «Guardada», púlsala dos veces: quita y vuelve a guardar. Yo no la pulso por ti.',
      target: 'comunidad.post-save',
      completeOn: [{ type: 'event', name: 'comunidad.post-saved' }],
      sensitive: true,
    },
    {
      id: 'seguir',
      text: 'Y «Seguir la conversación» te avisa de los comentarios nuevos, agrupados, sin tener que volver a mirar. Es opcional: púlsalo si quieres (se quita volviendo a pulsarlo) o pulsa «Siguiente».',
      target: 'comunidad.post-follow-conversation',
      completeOn: [{ type: 'event', name: 'comunidad.conversation-followed' }],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Listo. Lo guardado está en «Guardados», en la barra de Comunidad. Los horarios de los avisos de Comunidad se cambian en Configuración → «Avisos», o en Mi perfil → Mis ajustes → «Avisos de Comunidad».',
  next: ['com2-publicar', 'com2-recetas'],
}

export const comunidadCrearBorrador: TourDef = {
  id: 'tut-comunidad-crear-borrador',
  module: 'comunidad',
  summary: 'Empezar una publicación y guardarla como borrador. Publicarla lo decides tú.',
  access: { community: true },
  version: 2,
  title: 'Publicar: hasta el borrador',
  cardId: 'com2-publicar',
  durationSec: 110,
  startPath: '/comunidad',
  paths: ['/comunidad/*'],
  readyOn: ['comunidad.create-post'],
  steps: [
    {
      id: 'crear',
      text: 'Pulsa «✍️ Crear publicación». Si aún no tienes alias, te lo pedirá antes de abrir el editor. Al final se guarda un borrador solo para ti; nunca pulso «Publicar».',
      target: 'comunidad.create-post',
      completeOn: [{ type: 'appear', target: 'comunidad.editor-title' }],
      skipIf: [{ type: 'appear', target: 'comunidad.editor-title' }],
    },
    {
      id: 'tipo',
      text: 'Primero elige qué quieres publicar: Receta, Pregunta, Consejo o Anécdota. La Anécdota admite una etiqueta opcional.',
      target: 'comunidad.editor-kind',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'seccion',
      text: 'Después, la sección donde va. Las recetas solo van en «Recetas y cocina», y la sección ya viene puesta.',
      target: 'comunidad.editor-section',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'tema',
      text: 'Y el tema, que depende de la sección. Hace falta para publicar; para guardar un borrador puedes dejarlo vacío.',
      target: 'comunidad.editor-topic',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'titulo',
      text: 'Escribe un título (hasta 140 letras). Si ya se habló de lo mismo, verás «Publicaciones parecidas». Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'comunidad.editor-title',
      completeOn: [{ type: 'entered', target: 'comunidad.editor-title', min: 2 }],
      manualNext: true,
    },
    {
      id: 'texto',
      text: 'Y aquí el texto de la publicación. En una receta es opcional, porque la receta lleva sus propios campos más abajo.',
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
      text: 'Pulsa «Guardar borrador». Se guarda solo para ti, no se publica, y se conserva 30 días desde el último guardado (hasta 20 borradores). «Publicar» está justo debajo: ese lo decides tú, yo no lo pulso.',
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
  access: { community: true },
  version: 2,
  title: 'Guardar una receta en mi Cocina',
  cardId: 'com2-recetas',
  durationSec: 70,
  startPath: '/comunidad',
  paths: ['/comunidad/*'],
  readyOn: ['comunidad.sections'],
  steps: [
    {
      id: 'receta',
      text: 'Abre una receta de Comunidad (las que llevan 🍲): entra en «Recetas y cocina» y toca una tarjeta de receta. Al final, «Guardar en mi Cocina» crea una copia de verdad en tu Cocina; si solo miras, sal antes.',
      target: 'comunidad.sections',
      completeOn: [{ type: 'appear', target: 'comunidad.recipe-import' }],
      skipIf: [{ type: 'appear', target: 'comunidad.recipe-import' }],
      skipLabel: 'Mi familia ya la tiene',
    },
    {
      id: 'copia',
      text: 'Al guardar una receta en tu Cocina se crea una copia tuya, que puedes editar. La de Comunidad no cambia y no se comparte nada de tu familia con quien la publicó.',
      target: 'comunidad.recipe-import',
      completeOn: [],
      manualNext: true,
      missingText: 'No sale el botón «Guardar en mi Cocina». Puede que esta publicación no sea una receta, o que tu familia ya la haya guardado (entonces pone «Guardar otra copia»). Prueba con otra receta.',
    },
    {
      id: 'importar',
      text: 'Pulsa «📥 Guardar en mi Cocina». Se crea la copia en tu Cocina. Yo no lo pulso por ti.',
      target: 'comunidad.recipe-import',
      completeOn: [{ type: 'event', name: 'comunidad.recipe-imported' }],
      sensitive: true,
    },
  ],
  finishText: 'Listo: la receta ya está en tu Cocina, como una copia tuya. Tu familia cuenta una sola vez en Comunidad aunque la guardes más veces.',
  next: ['com2-recetas'],
}

export const TOURS_COMUNIDAD_PENDIENTES: TourDef[] = [comunidadGuardarPublicacion, comunidadCrearBorrador, comunidadImportarReceta]
