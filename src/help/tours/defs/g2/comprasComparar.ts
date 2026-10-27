import type { TourDef } from '@/help/tours/types'

// Compras → Comparar precios: serie «Comparar precios entre tiendas» (ser-compras-comparar). Sigue ComparePricesTab (CompareScreen.tsx). Ningún capítulo agrupa, crea ni borra nada por
// la persona: los pasos señalan, explican y esperan. Los precios son los que pagó la propia familia (nunca ofertas actuales); el formato del envase se recoge al registrar una compra.

// Resultados: productos comunes con todas sus presentaciones.
export const tutComprasCompararResultados: TourDef = {
  id: 'tut-compras-comparar-resultados',
  module: 'compras',
  group: 'Comparar precios',
  title: 'Ver dónde sale más barato',
  summary: 'Leer los resultados por producto común: precio por litro, kilo o unidad de cada presentación.',
  version: 2,
  cardId: 'com-comparar-precios',
  durationSec: 80,
  startPath: '/compras',
  startDest: 'compras.comparar',
  readyOn: ['compare.tabs'],
  steps: [
    {
      id: 'partes',
      text: 'Comparar precios tiene dos partes: «Resultados», donde se comparan los productos ya agrupados, y «Emparejar», donde agrupas los artículos que se pueden comparar entre sí.',
      target: 'compare.tabs',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'vacio',
      text: 'Si todavía no has agrupado nada, aquí verás cómo empezar. Un producto común es, por ejemplo, «Leche semidesnatada», que junta la de cada tienda aunque cambien la marca y el envase.',
      target: 'compare.empty',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'lista',
      text: 'Cada producto común sale plegado, con cuántas presentaciones y tiendas tiene y cuál sale más barata. Al tocarlo se despliegan todas, de menor a mayor precio por litro, kilo o unidad.',
      target: 'compare.results',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'detalle',
      text: 'En cada presentación ves la tienda, el formato (por ejemplo 6 × 1 l), el precio del paquete, la fecha y la diferencia con la más económica. El precio del paquete se enseña aparte: lo barato por litro puede exigir pagar más de golpe.',
      target: 'compare.offer',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'provisional',
      text: 'Si PEPA agrupó artículos por su cuenta, el grupo sale como «pendiente de revisar» y la comparación es provisional hasta que lo confirmes. Los grupos que ya confirmasteis tú no los cambia.',
      target: 'compare.pending-banner',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'formatos',
      text: 'Dentro de cada grupo ves cuántos artículos tienen formato conocido. Los que faltan se completan ahora (confirmar lo que PEPA lee en el nombre, escribirlo o fotografiar el envase) o más adelante: PEPA te lo ofrece al volver a comprarlo, sin bloquear el ticket.',
      target: 'compare.formats',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'historicos',
      text: 'Son precios que pagasteis vosotros, con su fecha: no son ofertas de hoy. Si las compras están muy separadas en el tiempo, PEPA lo avisa. Lo que no tiene formato conocido no se compara por litro o kilo hasta completarlo.',
      target: 'compare.tabs',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. No he agrupado ni cambiado nada. Para agrupar artículos, mira el siguiente capítulo: «Agrupar artículos».',
  next: ['com-historial-precios', 'com-ticket'],
}

// Emparejar: agrupar artículos bajo un producto común.
export const tutComprasCompararEmparejar: TourDef = {
  id: 'tut-compras-comparar-emparejar',
  module: 'compras',
  group: 'Comparar precios',
  title: 'Agrupar artículos',
  summary: 'Agrupar los artículos que se pueden comparar bajo un producto común, sin revisar cientos de fichas.',
  version: 2,
  cardId: 'com-comparar-precios',
  durationSec: 90,
  startPath: '/compras',
  startDest: 'compras.comparar.emparejar',
  readyOn: ['compare.tabs'],
  steps: [
    {
      id: 'partes',
      text: 'Estás en «Emparejar». Aquí agrupas los artículos que se pueden comparar bajo un producto común; en «Resultados» ves después lo que sale más barato. Cambiar entre las dos es solo tocar su botón.',
      target: 'compare.tabs',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'cola',
      text: 'En «Emparejar» salen los artículos que todavía no están en ningún producto común, los más útiles primero (los que más compras, los que más gastas y los que podrían compararse entre tiendas). No hace falta terminar: puedes dejarlo y seguir otro día.',
      target: 'compare.pairing',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'revisar',
      text: 'Cuando PEPA encuentra artículos que parecen el mismo producto, los agrupa y te los deja en «Revisar PEPA». Ahí confirmas el grupo, le cambias el nombre, separas un artículo o lo descartas. Nada cuenta como confirmado hasta que tú lo aceptes, y PEPA no vuelve a proponer lo que separas o descartas.',
      target: 'compare.review-tab',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'tarjeta',
      text: 'Cada tarjeta muestra el artículo, su tienda y su último precio. Si PEPA sugiere un producto común, lo agrupas con un toque. Un artículo solo va a un producto común; no hay que emparejarlo con todos los demás.',
      target: 'compare.pairing-card',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'buscar',
      text: '«🔎 Buscar otro» te deja encontrar cualquier producto común o cualquier artículo de tu historial, aunque PEPA no lo haya sugerido. «＋ Crear producto común» lo crea con el nombre que quieras. «No emparejar» lo aparta.',
      target: 'compare.pairing-card',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'deshacer',
      text: 'Todo se puede deshacer: tras agrupar sale «Deshacer», y en «Confirmados» puedes separar cualquier artículo. Nunca se cambian los nombres, los precios ni los formatos originales de tus compras.',
      target: 'compare.pairing',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'formatos',
      text: 'Para comparar bien hace falta saber cuánto contiene cada envase. Se indica al registrar la compra («📏 Formato del envase» en cada producto, o con una foto del envase) y PEPA lo recuerda para la próxima vez.',
      target: 'compare.tabs',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. No he agrupado nada: lo haces tú cuando quieras. Los resultados aparecen en la otra parte, «Resultados».',
  next: ['com-ticket'],
}

export const TOURS_COMPRAS_COMPARAR: TourDef[] = [tutComprasCompararResultados, tutComprasCompararEmparejar]
