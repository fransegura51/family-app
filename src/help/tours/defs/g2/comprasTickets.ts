import type { TourDef } from '@/help/tours/types'

// Compras → Compras registradas: serie «Registrar compras y tickets» (ser-compras-tickets). Sigue ReceiptsTab/ReceiptForm de FinanceScreen.tsx (el mismo formulario se usa para subir un ticket, para
// apuntar una compra «Sin ticket» y para editar). Ningún capítulo guarda por la persona ni lee con IA por ella: los pasos señalan, explican y esperan. Estos capítulos terminan SIN
// guardar (la persona decide si pulsa «Guardar ticket» / «Guardar compra»); el primer paso de cada uno avisa de que guardar es de verdad.
//
// Lo que NO se enseña aquí (implementado pero pendiente de validación en iPhone y Android por la usuaria): pagar con varios medios, cartera de efectivo, devoluciones y duplicados. Ver planned/b.ts.
//
// Qué crea guardar (data/receipts.ts, uploadReceipt): con importe, busca un gasto del banco sin ticket del mismo importe a ±7 días y lo une (no crea otro); si no, crea el gasto en Economía.
// El efectivo y los pagos mixtos nunca se unen a un cargo del banco; una compra «Sin ticket» solo se une a un gasto del banco. Sin importe no se crea gasto.

// Elegir cómo registrar: con ticket o sin ticket.
export const tutComprasRegistrarCompra: TourDef = {
  id: 'tut-compras-registrar-compra',
  module: 'compras',
  group: 'Compras registradas',
  title: 'Con ticket o sin ticket',
  summary: 'Elegir si registras la compra con la foto del ticket o la apuntas a mano, sin ticket.',
  version: 1,
  cardId: 'com-ticket',
  durationSec: 80,
  startPath: '/compras',
  startDest: 'compras.tickets',
  readyOn: ['shopping.receipt-mode'],
  steps: [
    {
      id: 'modo',
      text: 'Arriba eliges cómo registrar una compra: «📷 Con ticket» (subes la foto o el PDF) o «✍️ Sin ticket» (la apuntas a mano). No se guarda nada hasta «Guardar»; si solo practicas, sal sin guardar.',
      target: 'shopping.receipt-mode',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'sin',
      text: 'Pulsa «✍️ Sin ticket» para ver cómo es. Sirve para compras sin papel: pan, el mercadillo, una compra que ya se te perdió.',
      target: 'shopping.receipt-manual',
      completeOn: [{ type: 'click', target: 'shopping.receipt-manual' }],
      manualNext: true,
    },
    {
      id: 'campos',
      text: 'Sin ticket solo hacen falta el Importe total (mayor que 0) y la Fecha. Establecimiento, categoría, ¿Quién? y forma de pago son opcionales.',
      target: 'shopping.receipt-total',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'productos',
      text: 'Con «+ Añadir productos (opcional)» apuntas qué compraste: así la compra también llena el Historial de precios. Sin productos, solo cuenta como gasto.',
      target: 'shopping.receipt-add-lines',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Se guarda con «Guardar compra». Lo pulsas tú, cuando quieras; yo no. Después podrás añadirle el ticket con el 📎 de su fila: no se crea otra compra ni otro gasto.',
      target: 'shopping.receipt-save',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'volver',
      text: 'Para volver a subir una foto, pulsa «📷 Con ticket».',
      target: 'shopping.receipt-with',
      completeOn: [{ type: 'click', target: 'shopping.receipt-with' }],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Una compra sin ticket cuenta igual en Economía; el ticket, si lo tienes, se puede añadir después.',
  next: ['com-ticket', 'com-historial-precios'],
}

// Registrar una compra con ticket (foto o PDF) y, si se quiere, leerlo con IA. La hoja «Añadir ticket» y el selector del sistema son del móvil: la tarjeta se aparta.
export const tutComprasSubirTicket: TourDef = {
  id: 'tut-compras-subir-ticket',
  module: 'compras',
  group: 'Compras registradas',
  title: 'Subir y leer un ticket',
  summary: 'Añadir la foto o el PDF de un ticket y, si quieres, dejar que PEPA lo lea.',
  version: 2,
  cardId: 'com-ticket',
  durationSec: 100,
  startPath: '/compras',
  startDest: 'compras.tickets',
  readyOn: ['shopping.receipt-mode'],
  steps: [
    {
      id: 'modo',
      text: 'Aquí subes un ticket: asegúrate de tener elegido «📷 Con ticket». No se guarda nada hasta «Guardar ticket»; si solo practicas, sal sin guardar. Bajo la foto pone que se borra a los 3 meses (tienda, fecha e importe se quedan).',
      target: 'shopping.receipt-mode',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'foto',
      text: 'Toca «+ Añadir foto o PDF». Se abre una hoja para elegir de dónde viene el ticket.',
      target: 'shopping.receipt-file',
      completeOn: [{ type: 'appear', target: 'shopping.receipt-source-sheet' }],
      missingText: '«+ Añadir foto o PDF» solo sale con «📷 Con ticket» elegido. Pulsa ese botón, arriba, y sigo.',
    },
    {
      id: 'hoja',
      text: 'Elige «📷 Hacer foto», «🖼️ Elegir de la galería» o «📄 Elegir PDF»: se abre el selector de tu móvil. Cuando elijas el archivo, seguimos. Si no tienes un ticket a mano, continúa sin foto.',
      target: 'shopping.receipt-source-sheet',
      native: true,
      skipLabel: 'Continuar sin foto',
      missingText: 'La hoja se ha cerrado. Pulsa «+ Añadir foto o PDF» otra vez, o elige «Continuar sin foto».',
      completeOn: [{ type: 'appear', target: 'shopping.receipt-read' }],
    },
    {
      id: 'leer',
      text: '«📷 Leer ticket» envía la foto a una IA para que lea tienda, fecha, importe y productos. Solo lo usan personas adultas y puede estar apagado. Yo no lo pulso: lo decides tú. Sin él, rellenas los datos a mano.',
      target: 'shopping.receipt-read',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'siguiente',
      text: 'Con la foto elegida (y la lectura hecha, si quisiste), toca revisar todo antes de guardar: es el siguiente capítulo. La lectura puede equivocarse; por eso siempre te lo enseña.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Cómo lee PEPA un ticket y qué límites tiene, en «Cómo funciona PEPA».',
  next: ['com-ticket', 'com-historial-precios'],
}

// Revisar los datos y los productos antes de guardar. Se practica sin foto con «✍️ Sin ticket» (el editor de líneas es el mismo).
export const tutComprasRevisarTicket: TourDef = {
  id: 'tut-compras-revisar-ticket',
  module: 'compras',
  group: 'Compras registradas',
  title: 'Revisar datos y productos',
  summary: 'Revisar tienda, fecha, importe, categoría y quién, y añadir o corregir los productos a mano.',
  version: 1,
  cardId: 'com-ticket',
  durationSec: 115,
  startPath: '/compras',
  startDest: 'compras.tickets',
  readyOn: ['shopping.receipt-mode'],
  steps: [
    {
      id: 'datos',
      text: 'Revisa Establecimiento, Fecha e Importe total (justo debajo). Si la IA leyó el ticket ya vienen rellenos, pero pueden fallar: corrige lo que no cuadre con el papel. No se guarda nada todavía.',
      target: 'shopping.receipt-store',
      keepVisible: ['shopping.receipt-total'],
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
      id: 'quien',
      text: '¿Quién? (opcional): la persona que hizo la compra. Viene puesta la que la está registrando.',
      target: 'shopping.receipt-who',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'sin',
      text: 'Para ver los productos sin tener una foto a mano, pulsa «✍️ Sin ticket»: el editor de productos es el mismo.',
      target: 'shopping.receipt-manual',
      completeOn: [{ type: 'click', target: 'shopping.receipt-manual' }],
      skipIf: [{ type: 'appear', target: 'shopping.receipt-add-lines' }, { type: 'appear', target: 'shopping.receipt-lines' }],
      manualNext: true,
    },
    {
      id: 'anadir',
      text: 'Pulsa «+ Añadir productos (opcional)». Con un ticket subido el botón dice «+ Añadir productos a mano (opcional)»: sirve igual si la lectura no reconoce nada o se deja alguno.',
      target: 'shopping.receipt-add-lines',
      completeOn: [{ type: 'appear', target: 'shopping.receipt-lines' }],
      skipIf: [{ type: 'appear', target: 'shopping.receipt-lines' }],
      manualNext: true,
    },
    {
      id: 'lineas',
      text: 'Cada línea tiene nombre, cantidad (o peso en kg), unidad ud/kg y precio por unidad o por kg; a su derecha ves el importe «= …». Con ✕ quitas una línea y con «+ Añadir línea» añades otra.',
      target: 'shopping.receipt-line-name',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'clase',
      text: 'El símbolo de la izquierda es la clase del producto: tócalo para cambiarla. «Nuevo» marca los que PEPA no conocía. Solo si eliges tú la clase, queda guardada para ese producto.',
      target: 'shopping.receipt-line-class',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'entendido',
      text: 'Debajo de cada nombre, PEPA enseña lo que ha entendido: el producto, su categoría y el formato, y si está listo para compararse. Con «Es correcto» confirmas una propuesta dudosa y con «Cambiar producto» eliges otro; se guarda con la compra. Si falta el formato, sale como pendiente: nunca se inventa.',
      target: 'shopping.receipt-reading',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'cuadre',
      text: 'PEPA compara la suma de las líneas con el importe total y avisa si cuadra, falta o sobra. Puedes guardar igualmente. Las líneas sin precio válido no se guardan; las de importe negativo (descuentos) tampoco: van aparte.',
      target: 'shopping.receipt-lines-summary',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. Si no vas a guardar nada, usa «Cancelar» o cambia a «📷 Con ticket». Cómo se clasifican los productos, en «Cómo funciona PEPA».',
  next: ['com-ticket', 'com-historial-precios'],
}

// Cómo se paga y qué pasa en Economía al guardar. Solo lo implementado y validado: la forma de pago (un medio). Lo demás está en planned/b.ts.
export const tutComprasPagoEconomia: TourDef = {
  id: 'tut-compras-pago-economia',
  module: 'compras',
  group: 'Compras registradas',
  title: 'Cómo se paga y qué pasa en Economía',
  summary: 'La forma de pago y lo que hace guardar una compra con tu Economía.',
  version: 1,
  cardId: 'com-ticket',
  durationSec: 90,
  startPath: '/compras',
  startDest: 'compras.tickets',
  readyOn: ['shopping.receipt-mode'],
  steps: [
    {
      id: 'pago',
      text: 'Forma de pago (opcional): Efectivo, Tarjeta, Bizum, Transferencia u Otro. Sirve para saber cómo se pagó y para que una compra en efectivo no se una por error a un cargo del banco. Otras opciones de pago aún las estoy revisando.',
      target: 'shopping.receipt-payment',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'importe',
      text: 'El Importe total es lo que crea el gasto en Economía. Si lo dejas vacío, el ticket se guarda con sus productos pero no se crea ningún gasto.',
      target: 'shopping.receipt-total',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'categoria',
      text: 'La Categoría es la que llevará ese gasto en Economía (Movimientos, Estadísticas y Presupuestos).',
      target: 'shopping.receipt-category',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'economia',
      text: 'Al guardar con importe, PEPA busca en Economía un cargo del banco del mismo importe, a ±7 días. Si lo encuentra, lo une (no se cuenta dos veces); si no, crea el gasto. El efectivo nunca se une a un cargo del banco.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'avisos',
      text: 'Antes de guardar pueden salir dos avisos: «¿Es una compra que ya apuntaste?» (un ticket nuevo que coincide con una compra sin ticket) y «Ya tienes este gasto apuntado en Economía». Nunca se une nada solo: decides tú.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'ver',
      text: 'Después, el gasto lo ves en Economía → Movimientos, con el icono de dónde viene: ✏️ a mano, 🧾 de un ticket o 🏦 del banco. Cómo se une todo, en «Cómo funciona PEPA».',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Guardar es siempre cosa tuya: este recorrido no ha guardado nada.',
  next: ['com-ticket', 'eco-nuevo-movimiento'],
}

// Guardar y gestionar lo guardado: carpetas, editar, añadir el ticket después, borrar con aviso y «Deshacer».
export const tutComprasGuardarTicket: TourDef = {
  id: 'tut-compras-guardar-ticket',
  module: 'compras',
  group: 'Compras registradas',
  title: 'Guardar y gestionar lo guardado',
  summary: 'Guardar la compra y, después, abrir su carpeta, editarla, añadirle el ticket o borrarla.',
  version: 1,
  cardId: 'com-ticket',
  durationSec: 90,
  startPath: '/compras',
  startDest: 'compras.tickets',
  readyOn: ['shopping.receipt-mode'],
  steps: [
    {
      id: 'guardar',
      text: 'Cuando todo esté bien, pulsa tú «Guardar ticket» (o «Guardar compra»). Se guarda de verdad; yo no lo pulso. Si solo practicas, no lo pulses. Guarda el ticket, sus productos y, si hay importe, el gasto en Economía.',
      target: 'shopping.receipt-save',
      completeOn: [{ type: 'event', name: 'shopping.receipt-saved' }],
      manualNext: true,
    },
    {
      id: 'donde',
      text: 'La compra queda en «Historial de compras», en la carpeta de su tienda. Solo ves las del periodo del filtro 📅 Fecha; si hay otras fuera de él, un aviso lo dice.',
      target: 'shopping.receipts-saved',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'carpeta',
      text: 'Toca la carpeta de una tienda para abrir sus compras. Cada compra se toca para ver sus productos.',
      target: 'shopping.receipt-folder',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'acciones',
      text: 'A la derecha de cada compra: 👁 ver el ticket, 📤 compartirlo, 📎 añadir el ticket a una compra «Sin ticket», ✏️ editar (el mismo formulario) y ✕ borrar. ↩️ es para devoluciones, que aún estoy revisando.',
      target: 'shopping.receipt-actions',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'borrar',
      text: 'Borrar pide dos toques y, si la compra tiene pagos o está unida al banco, te cuenta qué pasará. Después sale «Deshacer»: devuelve la compra, pero la foto del ticket no se recupera.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Editar una compra sustituye todas sus líneas por las que dejes en el formulario.',
  next: ['com-ticket', 'com-historial-precios'],
}

export const TOURS_COMPRAS_TICKETS: TourDef[] = [tutComprasRegistrarCompra, tutComprasSubirTicket, tutComprasRevisarTicket, tutComprasPagoEconomia, tutComprasGuardarTicket]
