import type { TourDef } from '@/help/tours/types'

// Compras (grupo g2). Una visita informativa y cinco tutoriales «Enséñame» sobre las pantallas REALES de Compras (ShoppingScreen.tsx y, para Tickets, ReceiptsTab/ReceiptForm de
// FinanceScreen.tsx). Ningún tutorial pulsa nada por la persona. Lo que NO se automatiza a propósito:
//  - «📷 Leer ticket» (envía la foto a una IA): el tutorial lo explica y lo deja a su decisión.
//  - «✅ Finalizar compra» (borra de la lista lo ya tachado): solo se explica, nunca se señala como paso a pulsar.
//  - Borrar productos (deslizar) y cualquier otro borrado.
// El tutorial piloto «com-anadir-producto» vive en defs/comAnadirProducto.ts y no se repite aquí.

export const visitaCompras: TourDef = {
  id: 'visita-compras',
  kind: 'visit',
  module: 'compras',
  title: 'Conoce Compras',
  summary: 'Un paseo rápido por Compras: lista, historial de precios, tickets y estadística.',
  version: 1,
  cardId: 'com-anadir-producto',
  durationSec: 90,
  startPath: '/compras',
  startDest: 'compras.inicio',
  steps: [
    {
      id: 'menu',
      text: 'Esto es Compras. Con el botón ☰ Menú cambias de parte: Inicio, Lista de la compra, Historial de precios, Compras registradas y Estadística compras. Ahora solo miramos: no se guarda nada.',
      target: 'shopping.menu',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'lista',
      text: '🛒 Lista de la compra: lo que os falta, agrupado por tienda y por clase de producto. Aquí se apunta lo que hace falta y se marca lo que ya habéis cogido.',
      target: 'shopping.card-lista',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'historial',
      text: '📈 Historial de precios: lo que soléis comprar con su último precio. Compara con el mes anterior y, si lo habéis comprado en varias tiendas, dice dónde sale más barato.',
      target: 'shopping.card-historial',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'tickets',
      text: '🧾 Compras registradas: aquí registras una compra, con ticket (foto o PDF) o sin él. PEPA puede leer sus productos con IA (solo personas adultas, si la IA está activa) y tú los revisas antes de guardar.',
      target: 'shopping.card-tickets',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'estadistica',
      text: '🍎 Estadística compras: cuánto lleváis registrado en Alimentación y en Otros, y en qué tiendas y clases de producto.',
      target: 'shopping.card-estadistica',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'analisis',
      text: '🛒 PEPA analiza tus compras: frases sueltas sobre vuestros hábitos (tienda más barata, productos frecuentes…), sacadas de los tickets. Con pocos datos dirá que necesita más tickets.',
      target: 'shopping.insights',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'cambio',
      text: '¿Por qué ha cambiado mi compra? Compara los tickets de este mes con los del anterior y reparte la diferencia entre precio, cantidad y productos nuevos. Necesita tickets de los dos meses.',
      target: 'shopping.why-changed',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es Compras. Si quieres practicar, en «Enséñame» tienes cómo añadir un producto, marcar lo comprado o subir un ticket.',
  next: ['com-anadir-producto', 'com-ticket', 'com-historial-precios'],
}

// Lista de la compra → tocar el nombre de un producto → «Editar producto» → «Guardar».
export const tutComprasEditarProducto: TourDef = {
  id: 'tut-compras-editar-producto',
  module: 'compras',
  group: 'Lista de la compra',
  title: 'Editar un producto de la lista',
  summary: 'Cambiar el nombre, la cantidad o la tienda de un producto ya apuntado.',
  version: 1,
  cardId: 'com-anadir-producto',
  durationSec: 60,
  startPath: '/compras',
  startDest: 'compras.lista',
  steps: [
    {
      id: 'tocar',
      text: 'Toca el nombre de un producto de tu lista para editarlo. Si todavía no tienes ninguno, pulsa «Salir» y apunta uno primero. No toques deslizando: eso sirve para borrar.',
      target: 'shopping.item-name',
      completeOn: [{ type: 'appear', target: 'shopping.edit-name' }],
    },
    {
      id: 'nombre',
      text: 'Aquí puedes corregir el nombre, la cantidad y la unidad. Cambia lo que quieras: no se guarda nada hasta que pulses «Guardar».',
      target: 'shopping.edit-name',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'tienda',
      text: 'Si lo vas a comprar en otra tienda, cámbiala aquí: la lista se agrupa por tiendas. Es opcional.',
      target: 'shopping.edit-store',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Cuando esté como quieres, pulsa «Guardar». Lo pulsas tú; yo solo te lo señalo. Si no quieres cambiar nada, cierra la ventana con la ✕.',
      target: 'shopping.edit-save',
      completeOn: [{ type: 'event', name: 'shopping.product-updated' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! El producto ya está actualizado en tu lista.',
  next: ['com-anadir-producto', 'com-tiendas', 'com-compartir'],
}

// Lista de la compra → «🛒 Modo compra» → marcar comprado. «✅ Finalizar compra» (que borra lo tachado) solo se explica.
export const tutComprasMarcarComprado: TourDef = {
  id: 'tut-compras-marcar-comprado',
  module: 'compras',
  group: 'Lista de la compra',
  title: 'Usar el Modo compra y marcar lo comprado',
  summary: 'Ir tachando la lista mientras compras, sin borrar nada.',
  version: 1,
  cardId: 'com-anadir-producto',
  durationSec: 75,
  startPath: '/compras',
  startDest: 'compras.lista',
  steps: [
    {
      id: 'modo',
      text: 'Pulsa «🛒 Modo compra» cuando estés en la tienda. La pantalla se simplifica y, si PEPA conoce los precios, te va sumando lo que llevas. Si ya estás en ese modo, pulsa «Siguiente».',
      target: 'shopping.shopping-mode',
      completeOn: [{ type: 'click', target: 'shopping.shopping-mode' }],
      manualNext: true,
    },
    {
      id: 'marcar',
      text: 'Cuando cojas un producto, toca el círculo ✓ de su derecha: queda tachado en su sitio y no desaparece de la lista. Lo tocas tú; yo solo te lo señalo. Si no tienes productos, pulsa «Salir».',
      target: 'shopping.item-check',
      completeOn: [{ type: 'event', name: 'shopping.item-status-changed' }],
      sensitive: true,
    },
    {
      id: 'contador',
      text: 'Aquí ves cuántos llevas comprados del total. Si te equivocas, toca otra vez el círculo del producto y vuelve a pendiente.',
      target: 'shopping.counter',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'finalizar',
      text: 'Al acabar en una tienda aparece debajo de su lista «✅ Finalizar compra»: borra de la lista lo que ya tachaste y deja lo pendiente. Yo no lo pulso por ti: lo decides tú, y te pide confirmar con «Sí, finalizar».',
      target: 'shopping.store-heading',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Listo. Para volver a la vista normal, pulsa «Salir de modo compra». Lo tachado se queda en la lista hasta que finalices la compra.',
  next: ['com-anadir-producto', 'com-compartir', 'com-historial-precios'],
}

// Historial de precios → ficha de un producto → desplegable de clase (se guarda al elegir).
export const tutComprasClaseHistorial: TourDef = {
  id: 'tut-compras-clase-historial',
  module: 'compras',
  group: 'Historial de precios',
  title: 'Cambiar la clase de un producto',
  summary: 'Corregir en qué clase está un producto (Lácteos, Limpieza…).',
  version: 1,
  cardId: 'com-historial-precios',
  durationSec: 80,
  startPath: '/compras',
  startDest: 'compras.historial',
  steps: [
    {
      id: 'lado',
      text: 'Aquí eliges ver Alimentos u Otros (limpieza, ropa…). Elige el lado donde está el producto que quieres revisar. Si lo mueves de clase a una del otro lado, cambiará de pestaña.',
      target: 'shopping.history-mode',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'producto',
      text: 'Toca el nombre de un producto para abrir su ficha. Si el historial está vacío, aún no hay compras con precio: se llena con los tickets, así que prueba antes «Registrar compra».',
      target: 'shopping.history-product',
      completeOn: [{ type: 'appear', target: 'shopping.product-class' }],
    },
    {
      id: 'clase',
      text: 'Este desplegable es la clase del producto. Al elegir una, se guarda al instante como decisión tuya y manda sobre lo que PEPA adivine. No hay botón de guardar. Elígela tú; yo no cambio nada.',
      target: 'shopping.product-class',
      completeOn: [{ type: 'event', name: 'shopping.product-class-changed' }],
      sensitive: true,
      details: [
        {
          title: '¿Qué hace «Automático»?',
          text: 'Borra tu elección y PEPA vuelve a decidir sola: primero con lo que sabe de esa tienda y, si no, por palabras del nombre. Entre paréntesis ves lo que elegiría.',
        },
      ],
      detailsLabel: 'Más sobre las clases',
    },
  ],
  finishText: 'Hecho. Ese producto queda con la clase que has elegido en toda la app. Otro producto con nombre distinto se clasifica por su cuenta.',
  next: ['com-historial-precios', 'com-ticket'],
}

// Compras registradas → «Registrar compra»: foto, «📷 Leer ticket» (solo se explica), datos, productos leídos y «Guardar ticket».
export const tutComprasSubirTicket: TourDef = {
  id: 'tut-compras-subir-ticket',
  module: 'compras',
  group: 'Compras registradas',
  title: 'Registrar una compra con ticket y revisar los productos',
  summary: 'Subir la foto de un ticket, revisar lo que se lee y guardarlo.',
  version: 1,
  cardId: 'com-ticket',
  durationSec: 120,
  startPath: '/compras',
  startDest: 'compras.tickets',
  steps: [
    {
      id: 'form',
      text: 'Aquí subes un ticket. No se guarda nada hasta que pulses «Guardar ticket». La foto se borra a los 3 meses; la tienda, la fecha y el importe se quedan.',
      target: 'shopping.receipt-form',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'foto',
      text: 'Toca «+ Añadir foto o PDF» y elige la foto del ticket (cámara, galería o PDF). Cuando la elijas, seguimos.',
      target: 'shopping.receipt-file',
      completeOn: [{ type: 'appear', target: 'shopping.receipt-read' }],
    },
    {
      id: 'leer',
      text: '«📷 Leer ticket» envía la foto a una IA para que lea tienda, fecha, importe y productos. Solo lo usan personas adultas y puede estar apagado. Yo no lo pulso: lo decides tú. Sin él, rellenas los datos a mano.',
      target: 'shopping.receipt-read',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'datos',
      text: 'Revisa Establecimiento, Fecha e Importe total. Si la IA ha leído el ticket ya vienen rellenos, pero pueden fallar: corrige lo que no cuadre con el papel.',
      target: 'shopping.receipt-store',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'categoria',
      text: 'La Categoría decide en qué parte de Economía cuenta este gasto. Viene puesta la de supermercado; cámbiala si no es esa compra.',
      target: 'shopping.receipt-category',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'productos',
      text: 'Productos leídos: revisa y corrige antes de guardar. Cada línea tiene nombre, cantidad, unidad y precio por unidad o por kg. Con ✕ quitas una línea que no sea un producto. Solo aparece si ya hay líneas.',
      target: 'shopping.receipt-lines',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'clase',
      text: 'El símbolo de la izquierda es la clase del producto: tócalo para cambiarla. «Nuevo» marca los que PEPA no conocía de antes. Solo la clase que elijas tú se guarda para ese producto.',
      target: 'shopping.receipt-line-class',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Cuando esté bien, pulsa «Guardar ticket». Lo pulsas tú. Si pusiste el importe, también se apunta como gasto en Economía (o se une al del banco si ya estaba).',
      target: 'shopping.receipt-save',
      completeOn: [{ type: 'event', name: 'shopping.receipt-saved' }],
      sensitive: true,
    },
  ],
  finishText: '¡Ticket guardado! Lo encontrarás en la carpeta de su tienda, más abajo en Historial de compras.',
  next: ['com-historial-precios', 'com-anadir-producto'],
}

// Historial de precios → total, sugerencias, buscador y ficha de un producto. Solo mira: no cambia nada.
export const tutComprasHistorialPrecios: TourDef = {
  id: 'tut-compras-historial-precios',
  module: 'compras',
  group: 'Historial de precios',
  title: 'Ver el historial de precios',
  summary: 'Consultar cuánto cuesta un producto y dónde sale más barato.',
  version: 1,
  cardId: 'com-historial-precios',
  durationSec: 80,
  startPath: '/compras',
  startDest: 'compras.historial',
  steps: [
    {
      id: 'total',
      text: 'Total de la compra: lo registrado este mes en la cesta de alimentación, con la subida o bajada frente al mes anterior. Se construye con los tickets y los pedidos, no con marcar comprado.',
      target: 'shopping.history-total',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'sugerencias',
      text: 'Sugerencias para la próxima compra: hasta 10 productos que soléis comprar y que ya tocan según vuestro ritmo habitual. El 🛒 de cada uno lo manda a la lista, preguntando la tienda.',
      target: 'shopping.history-suggestions',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'buscar',
      text: 'Escribe para buscar un producto, o una clase (por ejemplo «postres»), sin repasar toda la lista.',
      target: 'shopping.history-search',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'ficha',
      text: 'Toca el nombre de un producto: se abre su ficha con cada cuánto lo compráis, el precio medio, mínimo y máximo y, si lo comprasteis en varias tiendas, cuál sale más barata.',
      target: 'shopping.history-product',
      completeOn: [{ type: 'appear', target: 'shopping.product-detail' }],
    },
    {
      id: 'detalle',
      text: 'Esta es la ficha. Los precios se comparan siempre en su unidad real (€/kg o €/ud), nunca mezclando las dos. Ciérrala con la ✕ cuando termines.',
      target: 'shopping.product-detail',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. El historial se llena solo cada vez que guardas un ticket con precios.',
  next: ['com-ticket', 'com-anadir-producto'],
}

export const TOURS_COMPRAS: TourDef[] = [
  visitaCompras,
  tutComprasEditarProducto,
  tutComprasMarcarComprado,
  tutComprasClaseHistorial,
  tutComprasSubirTicket,
  tutComprasHistorialPrecios,
]
