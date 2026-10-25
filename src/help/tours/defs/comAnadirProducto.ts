import type { TourDef } from '@/help/tours/types'

// Compras → Añadir un producto a la lista. Primer capítulo de la serie «Preparar y usar tu lista» (ser-compras-lista). Controles reales: «+ Añadir producto», nombre, tienda (opcional),
// cantidad, unidad, prioridad, foto (opcional) y «Añadir». Guardar es de la persona: el último paso solo espera el aviso de «producto guardado».
export const comAnadirProducto: TourDef = {
  id: 'com-anadir-producto',
  module: 'compras',
  summary: 'Apuntar un producto en la lista: nombre, tienda, cantidad, prioridad y foto.',
  group: 'Preparar tu lista',
  version: 3,
  title: 'Añadir un producto a la lista de la compra',
  cardId: 'com-anadir-producto',
  durationSec: 80,
  startPath: '/compras',
  startDest: 'compras.lista', // el botón «+ Añadir producto» vive en la pestaña «Lista», no en la portada de Compras
  steps: [
    {
      id: 'abrir',
      text: 'Pulsa «+ Añadir producto». Lo que escribas se guarda de verdad cuando pulses «Añadir» al final; si solo practicas, cierra la ventana con la ✕.',
      target: 'shopping.add-product',
      completeOn: [
        { type: 'click', target: 'shopping.add-product' },
        { type: 'appear', target: 'shopping.product-name' },
      ],
      skipIf: [{ type: 'appear', target: 'shopping.product-name' }],
      missingText: 'El botón «+ Añadir producto» no sale en Modo compra. Pulsa «Salir de modo compra» y vuelvo a señalártelo.',
    },
    {
      id: 'nombre',
      text: 'Escribe el producto, por ejemplo «Leche». Mientras escribes, PEPA te propone productos que ya conoce; si eliges uno, rellena cantidad y unidad. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'shopping.product-name',
      completeOn: [{ type: 'entered', target: 'shopping.product-name', min: 2 }],
      manualNext: true,
    },
    {
      id: 'tienda',
      text: 'Si quieres, pon la tienda («Mercadona»): así la lista se agrupa por tiendas. Es opcional. Escríbela tal cual; el desplegable solo propone tiendas que ya tienen productos en tu lista. Pulsa «Siguiente».',
      target: 'shopping.product-store',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'mas',
      text: 'También puedes poner Cantidad y Unidad (por ejemplo 2 kg), la Prioridad (Alta, Normal o Baja) y una «📷 Foto del producto» para reconocerlo en la tienda. Todo es opcional.',
      target: 'shopping.product-amount',
      keepVisible: ['shopping.product-priority', 'shopping.product-photo'],
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Pulsa «Añadir» para apuntarlo. Lo pulsas tú: yo solo te lo señalo. Si solo practicabas, cierra con la ✕ o pulsa «Salir».',
      target: 'shopping.product-save',
      completeOn: [{ type: 'event', name: 'shopping.product-added' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! El producto ya está en tu lista. Apuntar algo aquí no compra ni gasta nada. Puedes seguir añadiendo más, o cerrar la ventana con la ✕.',
  next: ['com-tiendas', 'com-compartir', 'coc-menu-a-compras'],
}
