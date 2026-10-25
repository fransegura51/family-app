import type { TourDef } from '@/help/tours/types'

// Capítulos de Compras (grupo g8): «Crear y ordenar tus tiendas» (serie ser-compras-tiendas) y «Compartir la lista» (serie ser-compras-lista). Siguen ShoppingScreen.tsx.
// Crear una tienda guarda datos: ese paso es `sensitive` y solo avanza con el aviso `shopping.store-added`, que la pantalla lanza DESPUÉS de guardar. Compartir lo decide la persona:
// el recorrido solo señala los botones y los explica. «🏬 Tiendas» es un <details> cerrado: el primer paso lo señala (su <summary>) y no depende de ver lo que hay dentro.

export const tutComprasTiendas: TourDef = {
  id: 'tut-compras-tiendas',
  module: 'compras',
  group: 'Tiendas',
  summary: 'Crea tus tiendas, vincula cadenas conocidas y cambia el orden de la lista por tiendas.',
  version: 2,
  title: 'Crear y ordenar tus tiendas',
  cardId: 'com-tiendas',
  durationSec: 90,
  startPath: '/compras',
  startDest: 'compras.lista',
  readyOn: ['shopping.counter'],
  steps: [
    {
      id: 'abrir',
      text: 'Las tiendas se gestionan en el desplegable «🏬 Tiendas». Tócalo para abrirlo. Si ya está abierto, pulsa «Siguiente».',
      target: 'shopping.stores',
      completeOn: [
        { type: 'click', target: 'shopping.stores' },
        { type: 'appear', target: 'shopping.store-new' },
      ],
      manualNext: true,
    },
    {
      id: 'filas',
      text: 'Cada tienda es una fila. Toca su nombre para cambiarlo (✓ guarda), arrastra ⠿ para cambiar su orden (la lista de la compra sigue ese orden) y ✕, con dos toques, la quita. «Sin tienda» siempre va la última.',
      target: 'shopping.store-row',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'cadenas',
      text: 'En «Cadenas conocidas de PEPA» están Mercadona, Aldi, Lidl… Tocar una la añade sin escribirla. Si ya tienes una parecida, PEPA pregunta «¿X es Mercadona?» y eliges «Sí, vincular» o «No, es otra tienda».',
      target: 'shopping.store-chains',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'nueva',
      text: 'Para añadir una tienda: toca una cadena conocida o escribe aquí el nombre (por ejemplo «Carnicería Manolo») y pulsa «Añadir». Se guarda de verdad. Lo haces tú; yo espero. Si solo mirabas, pulsa «Salir».',
      target: 'shopping.store-new',
      completeOn: [{ type: 'event', name: 'shopping.store-added' }],
      sensitive: true,
      missingText: 'No veo el campo para escribir la tienda: está dentro de «🏬 Tiendas». Tócalo para abrirlo y sigo.',
    },
  ],
  finishText: '¡Listo! La tienda ya está creada. Para apuntar un producto en ella, escribe su nombre en el campo Tienda del producto, o díselo a PEPA: «Mercadona, patatas».',
  next: ['com-anadir-producto', 'com-compartir'],
}

export const tutComprasCompartir: TourDef = {
  id: 'tut-compras-compartir',
  module: 'compras',
  group: 'Preparar tu lista',
  summary: 'Mandar la lista entera o solo la de una tienda por WhatsApp u otra app.',
  version: 2,
  title: 'Compartir la lista de la compra',
  cardId: 'com-compartir',
  durationSec: 60,
  startPath: '/compras',
  startDest: 'compras.lista',
  readyOn: ['shopping.counter'],
  needs: [{ target: 'shopping.share-all', message: '«📤 Compartir todo» solo sale cuando hay algo pendiente en la lista. Apunta un producto y vuelve, o míralo ahora solo leyendo.' }],
  steps: [
    {
      id: 'todo',
      text: '«📤 Compartir todo» manda la lista entera, agrupada por tienda, pero solo lo pendiente. Pulsa tú el botón cuando quieras; yo no mando nada.',
      target: 'shopping.share-all',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'tienda',
      text: 'En la cabecera de cada tienda hay un 📤: manda solo lo pendiente de esa tienda. Si no queda nada pendiente, avisa de que no hay nada que compartir.',
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
  finishText: 'Eso es todo. Compartir la lista no cambia nada en ella: solo manda un texto.',
  next: ['com-anadir-producto', 'com-tiendas'],
}
