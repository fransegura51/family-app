import { TOURS_COMPRAS_TICKETS } from '@/help/tours/defs/g2/comprasTickets'
import type { TourDef } from '@/help/tours/types'

// Compras (grupo g2). Una visita informativa y los capítulos de cuatro series «Enséñame» sobre las pantallas REALES de Compras (ShoppingScreen.tsx y, para Tickets, ReceiptsTab/ReceiptForm
// de FinanceScreen.tsx):
//  · ser-compras-lista      → com-anadir-producto, tut-compras-editar-producto, tut-compras-marcar-comprado, tut-compras-finalizar-compra, tut-compras-compartir
//  · ser-compras-tiendas    → tut-compras-tiendas, tut-compras-asignar-tienda, tut-compras-clase-historial
//  · ser-compras-tickets    → defs/g2/comprasTickets.ts
//  · ser-compras-historial  → tut-compras-consultar-compras, tut-compras-historial-precios, tut-compras-ficha-producto, tut-compras-comparar-lista, tut-compras-estadistica
// REGLA (verificada en data/shopping.ts y shoppingBoughtDoesNotFeedHistory.test.ts): marcar «Comprado» solo cambia el estado en la lista; «Finalizar compra» solo borra de la lista lo tachado
// de esa tienda. Ninguno crea compra, gasto ni precio. Lo que sí registra es guardar un ticket o una compra «Sin ticket» (pestaña Tickets).
// Ningún capítulo pulsa nada por la persona. Lo que NO se automatiza a propósito: «📷 Leer ticket» (envía la foto a una IA), «✅ Finalizar compra» (borra lo tachado), compartir y cualquier borrado.

export const visitaCompras: TourDef = {
  id: 'visita-compras',
  kind: 'visit',
  module: 'compras',
  title: 'Conoce Compras',
  summary: 'Un paseo rápido por Compras: lista, historial de precios, tickets y estadística, y cómo se relacionan.',
  version: 2,
  cardId: 'com-anadir-producto',
  durationSec: 100,
  startPath: '/compras',
  startDest: 'compras.inicio',
  steps: [
    {
      id: 'menu',
      text: 'Esto es Compras. Con el botón ☰ Menú cambias de parte: Inicio, Lista de la compra, Historial de precios, Tickets y Estadística compras. Con «📌 Sacar» pones un acceso como botón en pantalla. Ahora solo miramos.',
      target: 'shopping.menu',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'lista',
      text: '🛒 Lista de la compra: lo que os falta, agrupado por tienda y por clase de producto. Aquí se apunta lo que hace falta y se tacha lo que ya habéis cogido.',
      target: 'shopping.card-lista',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'relacion',
      text: 'Cómo encaja todo: la Lista es lo que falta. Marcar «comprado» solo tacha, no guarda nada. Lo que de verdad se registra es un ticket o una compra «Sin ticket», en Tickets: crea el gasto en Economía y llena el Historial.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'historial',
      text: '📈 Historial de precios: lo que soléis comprar con su último precio, comparado con el mes anterior. En la ficha de cada producto verás dónde sale más barato; en la Lista, «Comparar la lista entre tiendas».',
      target: 'shopping.card-historial',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'tickets',
      text: '🧾 Tickets: aquí se registra una compra, con foto o PDF («📷 Con ticket») o apuntada a mano («✍️ Sin ticket»). PEPA puede leer los productos con IA (solo adultas, si la IA está activa) y tú los revisas antes de guardar.',
      target: 'shopping.card-tickets',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'estadistica',
      text: '🍎 Estadística compras: cuánto lleváis registrado en Alimentación y en Otros, por tienda y por clase de producto. Cuenta también compras sin ticket que hayan llegado del banco.',
      target: 'shopping.card-estadistica',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'analisis',
      text: '🛒 PEPA analiza tus compras: frases sueltas sobre vuestros hábitos (tienda más barata, productos frecuentes…), sacadas de lo registrado. Con pocos datos dirá que necesita más tickets.',
      target: 'shopping.insights',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'cambio',
      text: '¿Por qué ha cambiado mi compra? Compara lo registrado este mes con el anterior y reparte la diferencia entre precio, cantidad y productos nuevos. Necesita compras de los dos meses.',
      target: 'shopping.why-changed',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es Compras. En «Enséñame» tienes cuatro recorridos: preparar tu lista, tus tiendas y clases, registrar compras y tickets, e historial y comparación de precios.',
  next: ['com-anadir-producto', 'com-ticket', 'com-historial-precios'],
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Serie «Preparar y usar tu lista»
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// Lista → tocar el nombre de un producto → «Editar producto» → «Guardar». También se explica (sin hacerlo) borrar deslizando, reordenar y plegar tiendas.
export const tutComprasEditarProducto: TourDef = {
  id: 'tut-compras-editar-producto',
  module: 'compras',
  group: 'Preparar tu lista',
  title: 'Editar y ordenar tu lista',
  summary: 'Cambiar nombre, cantidad, tienda, prioridad o foto de un producto, y cómo ordenar y borrar.',
  version: 2,
  cardId: 'com-anadir-producto',
  durationSec: 80,
  startPath: '/compras',
  startDest: 'compras.lista',
  readyOn: ['shopping.counter'],
  needs: [{ target: 'shopping.item-name', message: 'Para practicar necesitas al menos un producto en tu lista. Apunta uno y vuelve, o míralo ahora solo leyendo.' }],
  steps: [
    {
      id: 'tocar',
      text: 'Toca el nombre de un producto para editarlo. En la lista también puedes deslizar a la izquierda (🗑 Eliminar), arrastrar ⠿ para ordenar y tocar la cabecera de una tienda para plegarla. Yo no borro ni muevo nada.',
      target: 'shopping.item-name',
      completeOn: [{ type: 'appear', target: 'shopping.edit-name' }],
    },
    {
      id: 'nombre',
      text: 'Aquí corriges el nombre. Debajo están la Cantidad y la Unidad. No se guarda nada hasta que pulses «Guardar»; entonces se guarda de verdad.',
      target: 'shopping.edit-name',
      keepVisible: ['shopping.edit-amount'],
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'tienda',
      text: 'Tienda: si lo compras en otra, cámbiala; la lista se reagrupa. Prioridad: Alta, Normal o Baja. Los dos son opcionales.',
      target: 'shopping.edit-store',
      keepVisible: ['shopping.edit-priority'],
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'foto',
      text: '📷 Foto del producto (opcional): para reconocerlo en la tienda. Puedes verla, cambiarla o quitarla. Ojo: la foto se guarda al momento, sin esperar a «Guardar».',
      target: 'shopping.edit-photo',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Cuando esté como quieres, pulsa «Guardar». Lo pulsas tú. Si no quieres cambiar nada, cierra la ventana con la ✕ o pulsa «Salir».',
      target: 'shopping.edit-save',
      completeOn: [{ type: 'event', name: 'shopping.product-updated' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! El producto ya está actualizado en tu lista.',
  next: ['com-anadir-producto', 'com-tiendas', 'com-compartir'],
}

// Lista → «🛒 Modo compra» → marcar comprado. Solo cambia el estado en la lista (regla verificada).
export const tutComprasMarcarComprado: TourDef = {
  id: 'tut-compras-marcar-comprado',
  module: 'compras',
  group: 'Preparar tu lista',
  title: 'Ir de compras: Modo compra y tachar',
  summary: 'Usar el Modo compra y tachar lo que vas cogiendo, sin registrar nada.',
  version: 2,
  cardId: 'com-anadir-producto',
  durationSec: 80,
  startPath: '/compras',
  startDest: 'compras.lista',
  readyOn: ['shopping.counter'],
  needs: [{ target: 'shopping.item-check', message: 'Para practicar necesitas al menos un producto en tu lista. Apunta uno y vuelve, o míralo ahora solo leyendo.' }],
  steps: [
    {
      id: 'modo',
      text: 'Cuando estés en la tienda, pulsa «🛒 Modo compra»: la pantalla se simplifica (sin asas ni borrar deslizando). Si ya estás en ese modo, pulsa «Siguiente».',
      target: 'shopping.shopping-mode',
      completeOn: [{ type: 'click', target: 'shopping.shopping-mode' }],
      manualNext: true,
    },
    {
      id: 'marcar',
      text: 'Cuando cojas un producto, toca el círculo ✓ de su derecha: baja a «✓ Completados» y se guarda al momento. Solo cambia su estado en la lista; no registra compra, gasto ni precio. Lo tocas tú.',
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
      id: 'total',
      text: '🧾 es una estimación en pantalla: suma el precio de lo marcado o, si no lo tiene, el último que PEPA conoce. No es un gasto ni tiene por qué coincidir con el ticket.',
      target: 'shopping.running-total',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'regla',
      text: 'Recuerda: «Comprado» no registra nada. Para que la compra cuente en Economía y en el Historial, regístrala en Tickets (con ticket o «Sin ticket»). Para limpiar lo tachado, mira el siguiente capítulo.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Listo. Para volver a la vista normal, pulsa «Salir de modo compra». Lo tachado se queda en la lista hasta que finalices la compra.',
  next: ['com-anadir-producto', 'com-compartir', 'com-historial-precios'],
}

// Lista → «✅ Finalizar compra». Solo se explica: nunca se señala como un paso a pulsar (borra de la lista lo tachado de esa tienda).
export const tutComprasFinalizar: TourDef = {
  id: 'tut-compras-finalizar-compra',
  module: 'compras',
  group: 'Preparar tu lista',
  title: 'Finalizar la compra',
  summary: 'Qué quita «Finalizar compra» de la lista y qué NO registra.',
  version: 1,
  cardId: 'com-anadir-producto',
  durationSec: 60,
  startPath: '/compras',
  startDest: 'compras.lista',
  readyOn: ['shopping.counter'],
  needs: [{ target: 'shopping.finish-purchase', message: '«✅ Finalizar compra» sale debajo de cada tienda de tu lista (y no si la tienda está plegada). Apunta un producto y vuelve, o míralo ahora solo leyendo.' }],
  steps: [
    {
      id: 'boton',
      text: 'Debajo de cada tienda está «✅ Finalizar compra»: quita de la lista los productos tachados de esa tienda y deja los pendientes. Si no lo ves, despliega la tienda tocando su cabecera. Yo no lo pulso por ti.',
      target: 'shopping.finish-purchase',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'confirmar',
      text: 'Pide confirmar en dos toques: primero «¿Seguro?» y luego «Sí, finalizar» (o «Cancelar»). Lo que se quita no se puede recuperar desde aquí.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'regla',
      text: 'Importante: finalizar solo limpia la lista. No guarda la compra: no crea gasto en Economía ni precios en el Historial. Eso lo hace guardar un ticket, o una compra «Sin ticket», en la pestaña Tickets.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Para registrar lo que has comprado, ve a Tickets: allí se guarda el gasto y los precios.',
  next: ['com-ticket', 'com-historial-precios'],
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Serie «Tiendas y clases»
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// Lista agrupada por tienda y por clase; cómo darle tienda a un producto. Informativo: no guarda nada.
export const tutComprasAsignarTienda: TourDef = {
  id: 'tut-compras-asignar-tienda',
  module: 'compras',
  group: 'Tiendas',
  title: 'Asignar tienda y leer la lista agrupada',
  summary: 'Cómo se agrupa la lista por tienda y por clase, y cómo darle tienda a un producto.',
  version: 1,
  cardId: 'com-tiendas',
  durationSec: 70,
  startPath: '/compras',
  startDest: 'compras.lista',
  readyOn: ['shopping.counter'],
  needs: [{ target: 'shopping.store-heading', message: 'Para este capítulo necesitas algún producto en tu lista: así aparecen las cabeceras de tienda. Apunta uno y vuelve, o míralo ahora solo leyendo.' }],
  steps: [
    {
      id: 'cabecera',
      text: 'Cada tienda tiene su cabecera, con su logo y cuántos productos lleva. Tócala para plegarla o desplegarla. El 📤 de su derecha manda solo lo pendiente de esa tienda.',
      target: 'shopping.store-heading',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'clases',
      text: 'Dentro de cada tienda, lo pendiente se agrupa por clase de producto (Verdura, Carne, Limpieza…): así lo encuentras junto, como en el pasillo. Lo tachado va aparte, en «✓ Completados».',
      target: 'shopping.class-heading',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'sintienda',
      text: 'Los productos sin tienda van al grupo «Sin tienda», siempre el último. Para darles tienda: toca su nombre, cambia el campo Tienda y pulsa «Guardar».',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'apuntar',
      text: 'Al añadir un producto escribe la tienda en su campo (opcional). El desplegable propone solo tiendas que ya tienen productos. También puedes decirlo por voz («Mercadona, patatas») o usar el 🛒 del Historial, que pregunta «¿En qué tienda?».',
      target: 'shopping.add-product',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. Para crear, renombrar u ordenar tus tiendas, mira «Crear y ordenar tus tiendas».',
  next: ['com-tiendas', 'com-anadir-producto'],
}

// Historial → producto → desplegable de clase (se guarda al elegir). También se explica el ⚙️ de «Clasificaciones de productos».
export const tutComprasClaseHistorial: TourDef = {
  id: 'tut-compras-clase-historial',
  module: 'compras',
  group: 'Tiendas',
  title: 'Clases de productos y cambio de clase',
  summary: 'Crear y editar clases, y corregir en qué clase está un producto (Lácteos, Limpieza…).',
  version: 2,
  cardId: 'com-historial-precios',
  durationSec: 90,
  startPath: '/compras',
  startDest: 'compras.historial',
  readyOn: ['shopping.history-mode'],
  needs: [{ target: 'shopping.history-product', message: 'Para practicar necesitas algún producto con precio en el Historial; se llena al guardar un ticket. Registra uno y vuelve, o míralo ahora solo leyendo.' }],
  steps: [
    {
      id: 'lado',
      text: 'Aquí eliges ver Alimentos u Otros (limpieza, ropa…). Lo que decide en cuál está un producto es su clase, no la tienda.',
      target: 'shopping.history-mode',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'gestionar',
      text: 'El ⚙️ abre «Clasificaciones de productos»: ahí creas clases (nombre y emoji), cambias nombre o emoji con ✏️ y las borras con ✕. Alimentos y Otros tienen cada uno las suyas. En la Lista está igual: «⚙️ Gestionar clases de productos».',
      target: 'shopping.history-classes',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'producto',
      text: 'Toca el nombre de un producto para abrir su ficha. Si el historial está vacío, se llena al guardar un ticket o una compra «Sin ticket» con productos.',
      target: 'shopping.history-product',
      completeOn: [{ type: 'appear', target: 'shopping.product-class' }],
    },
    {
      id: 'clase',
      text: 'Este desplegable es la clase del producto. Al elegir una, se guarda al momento como decisión tuya para ese producto; no hay botón de guardar. Si eliges una del otro lado (Alimentos/Otros), el producto cambia de pestaña. Elígela tú.',
      target: 'shopping.product-class-box',
      completeOn: [{ type: 'event', name: 'shopping.product-class-changed' }],
      sensitive: true,
      details: [
        {
          title: '¿Qué hace «Automático»?',
          text: 'Borra tu elección y PEPA vuelve a decidir sola: con lo que sabe de ese texto de ticket por otras familias y, si no, por palabras del nombre. Entre paréntesis ves lo que elegiría.',
        },
      ],
      detailsLabel: 'Más sobre las clases',
    },
  ],
  finishText: 'Hecho. Ese producto queda con la clase que elegiste, en la Lista, el Historial y los Tickets de tu familia. Otro producto con nombre distinto se clasifica por su cuenta. Cómo decide PEPA, en «Cómo funciona PEPA».',
  next: ['com-historial-precios', 'com-ticket'],
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Serie «Historial y comparación de precios»
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// Tickets → «Cuánto he gastado», filtros y carpetas. Solo mira.
export const tutComprasConsultarCompras: TourDef = {
  id: 'tut-compras-consultar-compras',
  module: 'compras',
  group: 'Historial y precios',
  title: 'Consultar tus compras registradas',
  summary: 'Ver cuánto has gastado, filtrar por fecha y tienda y abrir las carpetas de tickets.',
  version: 1,
  cardId: 'com-historial-precios',
  durationSec: 75,
  startPath: '/compras',
  startDest: 'compras.tickets',
  readyOn: ['shopping.receipt-mode'],
  steps: [
    {
      id: 'resumen',
      text: 'En Tickets, «Cuánto he gastado» suma las compras registradas del periodo elegido (con ticket, sin ticket y gastos de comida que llegaron del banco). Aquí solo miramos: no se guarda nada.',
      target: 'shopping.receipts-summary',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'fecha',
      text: 'El filtro 📅 Fecha cambia el periodo (arranca en el mes contable, o en tu favorito). El total y las carpetas de abajo se recalculan con él.',
      target: 'finance.date-filter',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'tienda',
      text: '«🏬 Tienda» deja ver el total de una sola tienda o de todas.',
      target: 'shopping.receipts-store-filter',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'fuera',
      text: 'Si hay tickets guardados en otras fechas, un aviso lo dice y «Ver todos mis tickets» abre un rango que los incluye.',
      target: 'shopping.receipts-outside',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'carpetas',
      text: 'Más abajo, «Tickets guardados» tiene una carpeta por tienda, con cuántas compras y cuánto suman. Tócala para abrirla y ver sus compras; la fila «📎 falta ticket» es un gasto del banco sin ticket subido.',
      target: 'shopping.receipt-folder',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. Para tocar una compra guardada (editar, añadir el ticket, borrar) mira «Guardar y gestionar lo guardado».',
  next: ['com-ticket', 'com-historial-precios'],
}

// Historial → modo, sugerencias, buscador, total y flechas de cambio. Solo mira.
export const tutComprasHistorialPrecios: TourDef = {
  id: 'tut-compras-historial-precios',
  module: 'compras',
  group: 'Historial y precios',
  title: 'Leer el Historial de precios',
  summary: 'Entender el total del mes, las sugerencias, el buscador y las flechas ▲▼ de cada producto.',
  version: 2,
  cardId: 'com-historial-precios',
  durationSec: 85,
  startPath: '/compras',
  startDest: 'compras.historial',
  readyOn: ['shopping.history-mode'],
  steps: [
    {
      id: 'origen',
      text: 'El Historial se construye con los tickets que guardas y con las compras «Sin ticket» que llevan productos. Marcar «comprado» en la lista no guarda precios. Aquí solo miramos.',
      target: 'shopping.history-note',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'modo',
      text: 'Alimentos y Otros (ropa, limpieza…) son dos vistas que no se mezclan. Lo que cambia entre ellas es la clase del producto, no la tienda.',
      target: 'shopping.history-mode',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'total',
      text: 'Total de la compra: lo registrado este mes en la vista elegida (en «Otros», la cesta de Otros), con la subida o bajada frente al mes anterior.',
      target: 'shopping.history-total',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'sugerencias',
      text: 'Sugerencias para la próxima compra: hasta 10 productos que soléis comprar y que ya tocan según vuestro ritmo. El 🛒 de cada uno lo manda a la lista y pregunta la tienda.',
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
      id: 'flechas',
      text: 'Debajo, los productos se agrupan por clase. Cada precio lleva 🔺 rojo si ha subido o 🔻 verde si ha bajado respecto al mes anterior, cuando hubo compra en los dos meses.',
      target: 'shopping.history-help',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Toca el nombre de un producto para abrir su ficha: lo vemos en el siguiente capítulo.',
  next: ['com-ticket', 'com-anadir-producto'],
}

// Historial → ficha de un producto → «Precio por tienda». Solo mira (cerrar la ficha es de la persona).
export const tutComprasFichaProducto: TourDef = {
  id: 'tut-compras-ficha-producto',
  module: 'compras',
  group: 'Historial y precios',
  title: 'Ficha del producto y precio por tienda',
  summary: 'Qué cuenta la ficha de un producto y cómo ver dónde sale más barato.',
  version: 1,
  cardId: 'com-historial-precios',
  durationSec: 90,
  startPath: '/compras',
  startDest: 'compras.historial',
  readyOn: ['shopping.history-mode'],
  needs: [{ target: 'shopping.history-product', message: 'Para ver una ficha necesitas algún producto con precio en el Historial; se llena al guardar un ticket. Registra uno y vuelve, o míralo ahora solo leyendo.' }],
  steps: [
    {
      id: 'ficha',
      text: 'Toca el nombre de un producto: se abre su ficha con cada cuánto lo compráis, el precio medio, mínimo y máximo, y la subida o bajada del mes.',
      target: 'shopping.history-product',
      completeOn: [{ type: 'appear', target: 'shopping.product-detail' }],
    },
    {
      id: 'unidad',
      text: 'Los precios se comparan siempre en su unidad real (€/kg o €/ud), nunca mezclando las dos. Las compras antiguas sin unidad se dejan fuera y se avisa.',
      target: 'shopping.product-detail',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'tienda',
      text: '«Precio por tienda» enseña el último precio en cada tienda, la fecha, cuál es la más barata (🏷️) y cuánto más cuestan las demás. Toca una tienda para ver su histórico.',
      target: 'shopping.price-compare',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'equivalentes',
      text: '«Solo el mismo» o «+ Equivalentes» decide si se comparan también marcas parecidas. PEPA puede preguntar «¿Es lo mismo?»: tú decides con «Sí, equivalente» o «No». Son precios que habéis pagado vosotros, no ofertas de hoy.',
      target: 'shopping.price-scope',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'cerrar',
      text: 'Cuando termines, cierra la ficha con la ✕. Si ves el desplegable de clase, es la clase del producto (otro capítulo).',
      target: 'shopping.product-detail',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. La comparación sale de lo que habéis pagado vosotros: cuantas más compras registréis, más útil es.',
  next: ['com-historial-precios', 'com-ticket'],
}

// Lista → «💶 Comparar la lista entre tiendas». Solo mira.
export const tutComprasCompararLista: TourDef = {
  id: 'tut-compras-comparar-lista',
  module: 'compras',
  group: 'Historial y precios',
  title: 'Comparar tu lista entre tiendas',
  summary: 'Ver cuánto costaría tu lista pendiente en cada tienda con los precios que ya pagasteis.',
  version: 1,
  cardId: 'com-historial-precios',
  durationSec: 60,
  startPath: '/compras',
  startDest: 'compras.lista',
  readyOn: ['shopping.counter'],
  needs: [{ target: 'shopping.compare-list', message: '«Comparar la lista entre tiendas» sale cuando tienes al menos 2 productos pendientes en la lista. Apunta más y vuelve, o míralo ahora solo leyendo.' }],
  steps: [
    {
      id: 'boton',
      text: 'Con 2 o más productos pendientes aparece «💶 Comparar la lista entre tiendas». Púlsalo para ver el total de tu lista en cada tienda. No cambia nada en tu lista.',
      target: 'shopping.compare-list',
      completeOn: [{ type: 'appear', target: 'shopping.compare-panel' }],
      manualNext: true,
    },
    {
      id: 'resultado',
      text: 'Cada tienda con precios suficientes sale con su total y cuántos artículos tienen precio; la más barata lleva 🏷️. Las tiendas que no conocen casi nada de tu lista quedan fuera.',
      target: 'shopping.compare-panel',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'avisos',
      text: 'Un ⚠️ avisa de precios de hace más de 2 meses, y «Artículos sin precio comparable» lista los que no se pueden contar. Es un cálculo orientativo con lo que habéis pagado, no con ofertas de hoy.',
      target: 'shopping.compare-panel',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. Cuantos más tickets registréis, más fiable es la comparación.',
  next: ['com-historial-precios', 'com-ticket'],
}

// Estadística compras. Solo mira.
export const tutComprasEstadistica: TourDef = {
  id: 'tut-compras-estadistica',
  module: 'compras',
  group: 'Historial y precios',
  title: 'Estadística compras',
  summary: 'Leer el total de compras, el reparto por tienda y por clase, y qué cuenta «solo con ticket».',
  version: 1,
  cardId: 'com-historial-precios',
  durationSec: 90,
  startPath: '/compras',
  startDest: 'compras.estadistica',
  readyOn: ['shopping.stats-total'],
  steps: [
    {
      id: 'fecha',
      text: 'El filtro 📅 Fecha manda en toda la página: Total, comparativa y repartos se recalculan con el periodo que elijas (Mes contable, Mes real, Año…).',
      target: 'finance.date-filter',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'total',
      text: '«Total Registrado en Compras» suma Alimentación y Otros, con su % del gasto total. Cuenta también compras pagadas con banco o tarjeta sin ticket subido. «Ver movimientos →» te lleva a Economía con esos gastos.',
      target: 'shopping.stats-total',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'comparativa',
      text: '«Comparado con el periodo anterior» enseña, por tienda, dónde se ha gastado más o menos que en el periodo anterior equivalente.',
      target: 'finance.stats-compare',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'reparto',
      text: 'Alimentación / Otros decide qué ves en los dos repartos: por tienda y por tipo de alimento (o por clasificación, en Otros). Toca una porción para ver su importe.',
      target: 'shopping.stats-scope',
      keepVisible: ['shopping.stats-donuts'],
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'ticket',
      text: '«Solo con ticket subido» cuenta únicamente lo que tiene foto de ticket. Parecido, pero no igual, que el total de arriba: es normal que salga más bajo.',
      target: 'shopping.stats-ticket-only',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. La clasificación de cada producto es una sugerencia: si no encaja, corrígela desde el Historial.',
  next: ['com-historial-precios', 'com-ticket'],
}

export const TOURS_COMPRAS: TourDef[] = [
  visitaCompras,
  tutComprasEditarProducto,
  tutComprasMarcarComprado,
  tutComprasFinalizar,
  tutComprasAsignarTienda,
  tutComprasClaseHistorial,
  tutComprasConsultarCompras,
  tutComprasHistorialPrecios,
  tutComprasFichaProducto,
  tutComprasCompararLista,
  tutComprasEstadistica,
  ...TOURS_COMPRAS_TICKETS,
]
