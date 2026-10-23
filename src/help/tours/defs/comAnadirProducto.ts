import type { TourDef } from '@/help/tours/types'

// Compras → Añadir un producto a la lista. Controles reales: el botón «+ Añadir producto», el nombre, la tienda (opcional) y «Añadir».
export const comAnadirProducto: TourDef = {
  id: 'com-anadir-producto',
  version: 1,
  title: 'Añadir un producto a la lista de la compra',
  cardId: 'com-anadir-producto',
  durationSec: 45,
  startPath: '/compras',
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a apuntar un producto en la lista de la compra. Pulsa «+ Añadir producto».',
      target: 'shopping.add-product',
      completeOn: [
        { type: 'click', target: 'shopping.add-product' },
        { type: 'appear', target: 'shopping.product-name' },
      ],
      skipIf: [{ type: 'appear', target: 'shopping.product-name' }],
    },
    {
      id: 'nombre',
      text: 'Escribe el producto, por ejemplo «Leche». Mientras escribes, PEPA te propone productos que ya has comprado.',
      target: 'shopping.product-name',
      completeOn: [{ type: 'filled', target: 'shopping.product-name', min: 2 }],
    },
    {
      id: 'tienda',
      text: 'Si quieres, pon la tienda («Mercadona»): así la lista se agrupa por tiendas. Es opcional; pulsa «Siguiente».',
      target: 'shopping.product-store',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Pulsa «Añadir» para apuntarlo. Lo pulsas tú: yo solo te lo señalo.',
      target: 'shopping.product-save',
      completeOn: [{ type: 'event', name: 'shopping.product-added' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! El producto ya está en tu lista. Puedes seguir añadiendo más, o cerrar la ventana con la ✕.',
  next: ['com-tiendas', 'com-compartir', 'coc-menu-a-compras'],
}
