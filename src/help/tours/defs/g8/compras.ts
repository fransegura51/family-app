import type { TourDef } from '@/help/tours/types'

// Tutoriales «Enséñame» del grupo g8 · Compras: tiendas y compartir la lista. Siguen ShoppingScreen.tsx. Crear una tienda guarda datos: ese paso es `sensitive` y solo avanza con el
// aviso `shopping.store-added`, que la pantalla lanza DESPUÉS de guardar. Compartir lo decide la persona: el recorrido solo señala los botones y los explica.

export const tutComprasTiendas: TourDef = {
  id: 'tut-compras-tiendas',
  module: 'compras',
  group: 'Lista de la compra',
  summary: 'Crea tus tiendas o elige una cadena conocida para agrupar la lista por tienda.',
  version: 1,
  title: 'Crear tiendas y agrupar la lista por tienda',
  cardId: 'com-tiendas',
  durationSec: 90,
  startPath: '/compras',
  startDest: 'compras.lista',
  steps: [
    {
      id: 'agrupada',
      text: 'La lista se agrupa por tienda: cada una tiene su cabecera con los productos debajo. Si todavía no hay productos, no verás ninguna cabecera.',
      target: 'shopping.store-heading',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'abrir',
      text: 'Las tiendas se gestionan en este desplegable. Toca «🏬 Tiendas» para abrirlo.',
      target: 'shopping.stores',
      completeOn: [
        { type: 'click', target: 'shopping.stores' },
        { type: 'appear', target: 'shopping.store-new' },
      ],
      skipIf: [{ type: 'appear', target: 'shopping.store-new' }],
    },
    {
      id: 'cadenas',
      text: 'En «Cadenas conocidas de PEPA» están Mercadona, Aldi, Lidl… Tocar una la añade como tienda sin escribirla. Si ya tienes todas, no verás este bloque.',
      target: 'shopping.store-chains',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'nueva',
      text: 'Para añadir una tienda: toca una cadena conocida, o escribe aquí el nombre (por ejemplo «Carnicería Manolo») y pulsa «Añadir». Lo haces tú; yo espero. Si solo querías mirar, pulsa «Salir».',
      target: 'shopping.store-new',
      completeOn: [{ type: 'event', name: 'shopping.store-added' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! La tienda ya está creada. Al apuntar un producto podrás elegirla, y también decirlo a PEPA: «Mercadona, patatas».',
  next: ['com-anadir-producto', 'com-compartir'],
}

export const tutComprasCompartir: TourDef = {
  id: 'tut-compras-compartir',
  module: 'compras',
  group: 'Lista de la compra',
  summary: 'Mandar la lista entera o solo la de una tienda por WhatsApp u otra app.',
  version: 1,
  title: 'Compartir la lista de la compra',
  cardId: 'com-compartir',
  durationSec: 60,
  startPath: '/compras',
  startDest: 'compras.lista',
  steps: [
    {
      id: 'todo',
      text: '«📤 Compartir todo» manda la lista entera, agrupada por tienda. Solo aparece si hay algo pendiente. Pulsa tú el botón cuando quieras; yo no mando nada. Después, pulsa «Siguiente».',
      target: 'shopping.share-all',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'tienda',
      text: 'En la cabecera de cada tienda hay un 📤: manda solo lo pendiente de esa tienda. Púlsalo tú si quieres probarlo y luego pulsa «Siguiente».',
      target: 'shopping.store-share',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'resultado',
      text: 'Se abre el menú de compartir del móvil para elegir app y persona; si no hay, PEPA copia el texto al portapapeles. Lo ya comprado no se manda.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Si la lista está vacía, apunta antes algún producto para ver los botones de compartir.',
  next: ['com-anadir-producto', 'com-tiendas'],
}
