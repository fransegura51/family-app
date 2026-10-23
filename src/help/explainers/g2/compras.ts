import type { HelpExplainer } from '@/help/explainers/types'

// «Cómo funciona PEPA» de Compras (grupo g2). Cada afirmación se ha contrastado con el código el 2026-10-23; si cambian los archivos de `basedOn`, hay que revisar el texto.
const V = '2026-10-23'

export const expComprasLeerTicket: HelpExplainer = {
  id: 'exp-compras-leer-ticket',
  module: 'compras',
  title: 'Cómo lee PEPA un ticket de Compras',
  summary: 'Al pulsar «📷 Leer ticket», una IA mira la foto y te propone tienda, fecha, total y productos. Tú lo revisas todo antes de guardar.',
  sections: [
    {
      heading: 'Qué se envía y a quién',
      paragraphs: [
        'Cuando tú pulsas «📷 Leer ticket», PEPA manda la foto (o el PDF) de ese ticket a su servidor, y este se la pasa a una IA que lee imágenes (Gemini, de Google) con unas instrucciones fijas para tickets españoles.',
        'No se envía nada más: ni tus cuentas, ni el resto de tus compras. El registro de uso de la IA solo cuenta cuántas lecturas se hacen al día; no guarda ni la imagen ni la respuesta.',
        'Lo que haga el proveedor con la imagen depende de sus propias condiciones; eso no lo he podido comprobar desde el código de PEPA.',
      ],
    },
    {
      heading: 'Qué devuelve la IA',
      paragraphs: [
        'Una lista con la tienda, la fecha, el total y, por cada línea, el nombre, la cantidad, si va por unidades o por kg, el precio por unidad (o por kg) y el importe de la línea.',
        'Se le pide que copie los números tal como salen impresos y que nunca calcule: ante la duda, una unidad. Si su respuesta no se entiende, no se rellena nada y puedes escribirlo a mano.',
      ],
    },
    {
      heading: 'Qué hace PEPA antes de enseñártelo',
      paragraphs: [
        'Si la tienda leída coincide con una tienda que ya tienes dada de alta (por ejemplo «MERCADONA, S.A.» con «Mercadona»), usa tu nombre para no crear carpetas repetidas.',
        'Deja fuera las líneas que no son productos (por ejemplo PARKING en Mercadona) y avisa de que las ha omitido.',
        'Las líneas con importe negativo (descuentos, cupones) no entran en el historial de precios, pero su suma se guarda con el ticket como «Descuentos del ticket».',
      ],
    },
    {
      heading: 'Qué revisas tú y qué se guarda',
      paragraphs: [
        'En «Productos leídos — revisa y corrige antes de guardar» puedes cambiar nombre, cantidad, unidad y precio de cada línea, quitar las que sobren con ✕ y tocar el símbolo de la izquierda para cambiar la clase. «Nuevo» marca los productos que PEPA no conocía. También revisas Establecimiento, Fecha, Importe total y Categoría.',
        'Nada se guarda hasta que pulsas «Guardar ticket». Entonces se guardan la foto (en un almacén privado de tu familia), el ticket, el precio de cada línea en el historial y, si hay importe, el gasto en Economía (o se une al gasto del banco que ya estuviera: mismo importe y hasta 7 días de diferencia).',
      ],
      example:
        'Ejemplo inventado: subes la foto de un ticket de «SUPER EJEMPLO S.A.». PEPA propone tienda «Super Ejemplo», fecha 4 de marzo, total 23,40 € y líneas como «LECHE ENTERA» (2 ud a 0,95 €). Ves que una línea ha leído 9,50 € en vez de 0,95 €: la corriges y pulsas «Guardar ticket».',
    },
  ],
  limits: [
    'Puede equivocarse, sobre todo con tickets arrugados, borrosos o de letra pequeña: leer mal un precio, saltarse una línea o confundir cantidad con precio. Por eso siempre te lo enseña para revisar.',
    'Solo la usan personas adultas, y puede estar apagada o haber llegado al tope diario. En ese caso el botón da un aviso genérico («No se pudo leer el ticket») y tienes que rellenar los datos a mano; el ticket se puede guardar igual.',
    'La lectura no propone la categoría financiera del ticket: la categoría es la que eliges tú (viene puesta la de supermercado).',
    'La foto se borra a los 3 meses de la fecha del ticket; la tienda, la fecha y el importe se quedan.',
    'Si tu familia recibe el ticket digital de Mercadona por correo, esa vía automática lo lee igual pero lo guarda sin pasar por tu revisión: puedes corregirlo después con ✏️ (Editar ticket).',
  ],
  ifWrong: [
    'Una línea mal leída: corrígela antes de «Guardar ticket». Con «+ Añadir línea» añades una que falte.',
    'Ya lo guardaste: abre la carpeta de su tienda en Tickets guardados y toca ✏️ (Editar ticket); es el mismo formulario.',
    'Que a veces lea mal es una limitación normal. Si «Leer ticket» da error siempre, con cualquier foto, ya no es normal: cuéntalo en Sugerencias (Ayuda) para que lo revise el equipo de PEPA.',
  ],
  verified: V,
  basedOn: [
    'src/ui/FinanceScreen.tsx',
    'src/services/receiptPhoto.ts',
    'src/data/receipts.ts',
    'src/domain/ticketLines.ts',
    'src/domain/ticketCreditLines.ts',
    'src/domain/ticketExpenseMatch.ts',
    'supabase/functions/analyze-receipt-photo/index.ts',
    'supabase/functions/_shared/ai/purposes/receiptPhoto.ts',
    'supabase/functions/_shared/ai/gateway.ts',
    'supabase/functions/mercadona-ticket-webhook/index.ts',
    'supabase/migrations/0056_purge_old_receipt_photos.sql',
  ],
  tour: 'tut-compras-subir-ticket',
  go: { path: '/compras', dest: 'compras.tickets', label: 'Llévame a Tickets' },
  labels: ['📷 Leer ticket', 'Guardar ticket', 'Productos leídos — revisa y corrige antes de guardar', '+ Añadir línea'],
  cardIds: ['com-ticket'],
  synonyms: ['leer ticket', 'ocr', 'foto del ticket', 'ia ticket', 'como lee el ticket', 'productos leidos', 'por que se equivoca el ticket', 'que envia a la ia', 'privacidad ticket'],
}

export const expComprasClasificarProductos: HelpExplainer = {
  id: 'exp-compras-clasificar-productos',
  module: 'compras',
  title: 'Cómo clasifica PEPA los productos (y qué recuerda)',
  summary: 'PEPA da a cada producto una clase (Lácteos, Limpieza…) por un orden fijo. Lo que tú corriges se recuerda para ese producto de tu familia, pero no se extiende a otros.',
  sections: [
    {
      heading: 'El orden en que decide',
      paragraphs: [
        '1. Lo que elegiste tú. Si una vez fijaste la clase de un producto, esa gana siempre.',
        '2. La lista compartida de PEPA: unos 170 textos de ticket de tres cadenas (Mercadona, Hiperber y Charter) que la administración de PEPA ha revisado a mano. Solo se mira si la tienda se reconoce como una de esas cadenas.',
        '3. Una clase antigua guardada sin confirmar.',
        '4. Reglas por palabras del nombre, solo para comida («cerveza», «helado»…). Lo que no es comida (limpieza, ropa…) no se adivina.',
        '5. Si nada encaja, queda «Sin clasificar» (o «Otros alimentos» cuando ya se sabe que es comida): PEPA prefiere no adivinar a equivocarse.',
      ],
    },
    {
      heading: 'Dónde se guarda lo que corriges',
      paragraphs: [
        'En la ficha del producto de tu familia, en la base de datos de PEPA: la clase y una marca de «elegida por la familia». El producto se reconoce por su nombre sin contar mayúsculas ni espacios de más.',
        'Se corrige de dos formas: en Historial de precios (tocas el producto y cambias el desplegable, se guarda al elegir) o en el símbolo de clase al revisar un ticket (se guarda con «Guardar ticket»). «Automático» borra tu elección y PEPA vuelve a decidir sola.',
      ],
    },
    {
      heading: '¿Aprende PEPA de tus correcciones?',
      paragraphs: [
        'Sí, pero solo para ese producto: la próxima vez que llegue con el mismo nombre, saldrá con la clase que elegiste en la Lista, el Historial y los Tickets.',
        'No aprende patrones: «LECHE ENT.» y «LECHE ENTERA» son dos productos distintos. Tampoco enseña a otras familias ni cambia la lista compartida: esa solo la actualiza la administración de PEPA, a mano.',
      ],
      example:
        'Ejemplo inventado: en el Historial cambias «Gel de ducha» de Limpieza del hogar a Cuidado personal. La siguiente vez que un ticket traiga «gel de ducha», saldrá en Cuidado personal. Pero «GEL DUCHA 750» sería otro producto y habría que clasificarlo también.',
    },
    {
      heading: 'Alimentos y Otros',
      paragraphs: [
        'La clase también decide si el producto es de Alimentos o de Otros. La tienda no decide: un champú comprado en el súper sigue siendo de Otros. Si eliges una clase del otro lado, el producto se mueve de pestaña.',
      ],
    },
  ],
  limits: [
    'Una corrección vale para ese producto exacto. Si el mismo artículo llega escrito de otra forma (abreviatura, otra tilde), se trata como un producto nuevo.',
    'Las reglas por palabras solo conocen comida. En Otros, la clase se elige a mano o sale de la lista compartida.',
    'La lista compartida es pequeña y fija: tres cadenas. En Historial, un producto comprado en varias tiendas (o con alguna compra sin tienda) no la usa.',
    'Si falta la clase que necesitas, puedes crearla en «⚙️ Gestionar clases de productos» o en «Clasificaciones de productos».',
  ],
  ifWrong: [
    'Cambia la clase en el Historial de precios (tocar el producto → desplegable) o en el símbolo del producto al revisar un ticket. Con «Automático» vuelve a decidir PEPA.',
    'Que un producto nuevo salga «Sin clasificar» o mal puesto es normal: aún no sabe nada de él. Si una clase que elegiste tú cambia sola después, eso no es normal: cuéntalo en Sugerencias (Ayuda).',
  ],
  verified: V,
  basedOn: [
    'src/domain/productClass.ts',
    'src/domain/foodTypes.ts',
    'src/domain/productText.ts',
    'src/data/foodTypes.ts',
    'src/data/products.ts',
    'src/ui/ShoppingScreen.tsx',
    'src/ui/FinanceScreen.tsx',
    'supabase/migrations/0143_shared_product_learning.sql',
    'supabase/migrations/0144_product_class_confirmed.sql',
    'supabase/migrations/0142_store_chains.sql',
  ],
  tour: 'tut-compras-clase-historial',
  go: { path: '/compras', dest: 'compras.historial', label: 'Llévame al Historial de precios' },
  labels: ['Clasificaciones de productos', '⚙️ Gestionar clases de productos', 'Sin clasificar', 'Automático'],
  cardIds: ['com-historial-precios', 'com-ticket'],
  synonyms: ['clase de producto', 'clasificacion de productos', 'aprende pepa', 'recuerda la clase', 'por que clasifica mal', 'alimentos u otros', 'sin clasificar', 'corregir clase', 'aprendizaje compartido'],
}

export const EXPLAINERS_COMPRAS: HelpExplainer[] = [expComprasLeerTicket, expComprasClasificarProductos]
