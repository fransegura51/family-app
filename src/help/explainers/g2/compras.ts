import type { HelpExplainer } from '@/help/explainers/types'

// «Cómo funciona PEPA» de Compras (grupo g2). Cada afirmación se ha contrastado con el código el 2026-10-25; si cambian los archivos de `basedOn`, hay que revisar el texto.
const V = '2026-10-25'

export const expComprasLeerTicket: HelpExplainer = {
  id: 'exp-compras-leer-ticket',
  module: 'compras',
  title: 'Cómo lee PEPA un ticket de Compras (y qué pasa sin IA o sin ticket)',
  summary: 'Al pulsar «📷 Leer ticket», una IA mira la foto y te propone tienda, fecha, total y productos. Tú lo revisas todo antes de guardar. Sin IA, o sin ticket, se rellena a mano.',
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
      heading: 'Sin IA, o sin ticket: todo a mano',
      paragraphs: [
        'La IA es opcional. Con un ticket subido puedes tocar «+ Añadir productos a mano (opcional)» y escribir las líneas tú; si la lectura no reconoce nada o se deja alguna, también. El editor es el mismo que el de la lectura y PEPA avisa si la suma de las líneas cuadra con el total.',
        'Con «✍️ Sin ticket» apuntas una compra que no tiene papel: solo hacen falta el importe total (mayor que 0) y la fecha; el establecimiento, la forma de pago y los productos son opcionales. Se guarda con «Guardar compra» y, si luego aparece el ticket, se añade con el 📎 de su fila sin crear otra compra.',
      ],
    },
    {
      heading: 'Qué revisas tú y qué se guarda',
      paragraphs: [
        'En «Productos leídos — revisa y corrige antes de guardar» puedes cambiar nombre, cantidad, unidad y precio de cada línea, quitar las que sobren con ✕ y tocar el símbolo de la izquierda para cambiar la clase. «Nuevo» marca los productos que PEPA no conocía. Debajo de cada nombre, PEPA enseña lo que ha entendido (producto, categoría y formato, y qué falta para compararlo): con «Es correcto» confirmas una propuesta dudosa, con «Elegir variante» precisas el tipo (por ejemplo, leche semidesnatada) y con «Cambiar producto» buscas otro en el catálogo, por nombre, sinónimo o categoría. En un ticket largo cada línea se ve en dos renglones y se despliega para editar; las que piden revisión salen marcadas. Lo que confirmas o cambias se guarda con la compra y se usa igual en Compras, Economía y el comparador; si falta el formato queda pendiente, nunca se inventa. También revisas Establecimiento, Fecha, Importe total y Categoría.',
        'Nada se guarda hasta que pulsas «Guardar ticket». Entonces se guardan la foto (en un almacén privado de tu familia), el ticket, el precio de cada línea en el historial y, si hay importe, el gasto en Economía (o se une al gasto del banco que ya estuviera). Cómo se une, en otra explicación.',
      ],
      example:
        'Ejemplo inventado: subes la foto de un ticket de «SUPER EJEMPLO S.A.». PEPA propone tienda «Super Ejemplo», fecha 4 de marzo, total 23,40 € y líneas como «LECHE ENTERA» (2 ud a 0,95 €). Ves que una línea ha leído 9,50 € en vez de 0,95 €: la corriges y pulsas «Guardar ticket».',
    },
  ],
  limits: [
    'Puede equivocarse, sobre todo con tickets arrugados, borrosos o de letra pequeña: leer mal un precio, saltarse una línea o confundir cantidad con precio. Por eso siempre te lo enseña para revisar.',
    'Solo la usan personas adultas, y puede estar apagada o haber llegado al tope diario. En ese caso el botón da un aviso genérico («No se pudo leer el ticket») y tienes que rellenar los datos a mano; el ticket se puede guardar igual.',
    'La lectura no propone la categoría financiera del ticket: la categoría es la que eliges tú (viene puesta la de supermercado).',
    'Bajo el selector de la foto, la pantalla avisa de que se borra a los 3 meses de la fecha del ticket (tienda, fecha e importe se quedan). Ese borrado lo hace un proceso programado del servidor que no he podido comprobar desde el código de la app.',
    'Si tu familia recibe el ticket digital de Mercadona por correo, esa vía automática lo lee igual pero lo guarda sin pasar por tu revisión: puedes corregirlo después con ✏️ (Editar ticket).',
  ],
  ifWrong: [
    'Una línea mal leída: corrígela antes de «Guardar ticket». Con «+ Añadir línea» añades una que falte.',
    'Ya lo guardaste: abre la carpeta de su tienda en Historial de compras y toca ✏️ (Editar ticket); es el mismo formulario y sustituye todas las líneas por las que dejes.',
    'Que a veces lea mal es una limitación normal. Si «Leer ticket» da error siempre, con cualquier foto, ya no es normal: cuéntalo en Sugerencias (Ayuda) para que lo revise el equipo de PEPA.',
  ],
  verified: V,
  basedOn: [
    'src/ui/FinanceScreen.tsx',
    'src/services/receiptPhoto.ts',
    'src/data/receipts.ts',
    'src/domain/manualPurchase.ts',
    'src/domain/ticketLines.ts',
    'src/domain/ticketCreditLines.ts',
    'src/domain/ticketExpenseMatch.ts',
    'supabase/functions/analyze-receipt-photo/index.ts',
    'supabase/functions/_shared/ai/purposes/receiptPhoto.ts',
    'supabase/functions/_shared/ai/gateway.ts',
    'supabase/functions/mercadona-ticket-webhook/index.ts',
    'supabase/migrations/0056_purge_old_receipt_photos.sql',
    'src/ui/ReceiptLineReading.tsx',
    'src/domain/catalog/lineReading.ts',
  ],
  tour: 'tut-compras-subir-ticket',
  go: { path: '/compras', dest: 'compras.tickets', label: 'Llévame a Compras registradas' },
  labels: ['📷 Leer ticket', 'Guardar ticket', 'Guardar compra', '✍️ Sin ticket', 'Productos leídos — revisa y corrige antes de guardar', '+ Añadir línea', 'Es correcto', 'Elegir variante', 'Cambiar producto'],
  cardIds: ['com-ticket'],
  synonyms: ['leer ticket', 'ocr', 'foto del ticket', 'ia ticket', 'como lee el ticket', 'productos leidos', 'por que se equivoca el ticket', 'que envia a la ia', 'privacidad ticket', 'sin ticket', 'sin ia', 'compra sin ticket'],
}

export const expComprasClasificarProductos: HelpExplainer = {
  id: 'exp-compras-clasificar-productos',
  module: 'compras',
  title: 'Cómo clasifica PEPA los productos (y qué se comparte)',
  summary: 'PEPA da a cada producto una clase (Lácteos, Limpieza…) por un orden fijo. Lo que tú eliges manda en tu familia y, de forma anónima, ayuda a sugerir esa clase a otras familias.',
  sections: [
    {
      heading: 'El orden en que decide',
      paragraphs: [
        '1. Lo que elegiste tú. Si fijaste la clase de un producto, esa gana siempre en tu familia, diga lo que diga el resto.',
        '2. El conocimiento compartido de PEPA, que se mira por el texto del producto. Dentro de él manda, por este orden: la lista que la administración de PEPA ha revisado a mano para tres cadenas (Mercadona, Hiperber y Charter; solo si la tienda se reconoce como una de ellas), una revisión de la administración, una clase «validada» (dos o más familias distintas coinciden y ninguna discrepa) y una «provisional» (solo una familia la ha confirmado). Si las familias discrepan, no se sugiere nada. Se consulta aunque no se sepa la tienda.',
        '3. Una clase antigua guardada sin confirmar.',
        '4. El catálogo maestro de PEPA: interpreta el nombre del ticket (abreviaturas, formato pegado al nombre, el producto principal) y da la clase del producto que ES. Por ejemplo, «PAÑALES T4» es un pañal de talla 4 y «QUESADILLA POLLO» es una quesadilla, no pollo. Solo clasifica cuando identifica el producto con seguridad o como probable; si dos productos de clases distintas encajan por igual, no decide. No se guarda en el producto: se calcula al leer.',
        '5. Reglas por palabras del nombre, solo para comida («cerveza», «helado»…), cuando el catálogo no reconoce el producto.',
        '6. Si nada encaja, queda «Sin clasificar» (o «Otros alimentos» cuando ya se sabe que es comida): PEPA prefiere no adivinar a equivocarse.',
      ],
    },
    {
      heading: 'Qué reconoce el catálogo maestro',
      paragraphs: [
        'Es una lista propia de PEPA de productos habituales en España (alimentación, bebidas, bebé, limpieza, higiene, mascotas, papelería…). Para cada uno sabe su clase, sus formas de escribirlo en un ticket y los datos que lo distinguen de otro: el tipo de leche, la talla de un pañal, la etapa de una leche infantil, «sin lactosa», «zero»…',
        'Un producto distinto nunca se confunde con otro por compartir una palabra: la leche entera no es la semidesnatada, el pañal de talla 3 no es el de talla 4, y las patatas frescas no son las fritas.',
        'Las clases «Alimentación infantil», «Platos preparados» y «Higiene y cuidado del bebé» solo se usan cuando tu familia las tiene; hasta entonces esos productos siguen como antes.',
      ],
    },
    {
      heading: 'Qué se comparte y qué no',
      paragraphs: [
        'Cuando tu familia confirma la clase de un producto (en el Historial, o al elegirla a mano al revisar un ticket) y esa clase es una de las estándar de PEPA, cuenta como un voto anónimo para ese texto de producto. Solo viajan el texto del producto ya limpio (por ejemplo «leche entera»), la clase y un código de familia que no la identifica. Nunca precios, tiendas, fechas, cantidades ni tickets.',
        'Si tu familia ha puesto dos clases distintas a productos con el mismo texto, no vota. Una clase que creaste tú y que no es de las estándar tampoco.',
        'Con «Automático» borras tu elección: tu voto desaparece y PEPA vuelve a decidir sola para tu familia.',
      ],
    },
    {
      heading: 'Qué recibe cada familia',
      paragraphs: [
        'Lo que ven las demás familias es una sugerencia, no una orden: con un solo voto es «provisional» y con dos o más coincidentes pasa a «validada». Cada familia puede cambiarla: su elección manda en su casa y no cambia la de nadie más.',
        'No se aprenden patrones ni abreviaturas: «LECHE ENT.» y «LECHE ENTERA» son dos textos distintos y cada uno tiene sus propios votos.',
      ],
      example:
        'Ejemplo inventado: en el Historial cambias «Gel de ducha» de Limpieza del hogar a Cuidado personal. En tu familia saldrá siempre en Cuidado personal. Además cuenta como un voto anónimo: si otra familia confirma lo mismo, esa clase pasa a «validada» y se sugiere a las demás familias para ese texto de producto. Pero «GEL DUCHA 750» sería otro texto y habría que clasificarlo también.',
    },
    {
      heading: 'Alimentos y Otros',
      paragraphs: [
        'La clase también decide si el producto es de Alimentos o de Otros. La tienda no decide: un champú comprado en el súper sigue siendo de Otros. Si eliges una clase del otro lado, el producto se mueve de pestaña.',
      ],
    },
  ],
  limits: [
    'Una corrección vale para ese texto de producto exacto. Si el mismo artículo llega escrito de otra forma (abreviatura, otra tilde), se trata como un producto nuevo.',
    'Las reglas por palabras solo conocen comida. En Otros, la clase la da el catálogo maestro si reconoce el producto; si no, se elige a mano o sale del conocimiento compartido.',
    'El catálogo maestro es una lista curada, no infinita: un artículo que no reconoce se queda sin clasificar o con la regla por palabras, y se puede corregir a mano.',
    'Lo compartido es una sugerencia: puede ser provisional (un solo voto) y no se aplica si las familias no coinciden. No es un catálogo cerrado ni lo corrige nadie a mano en cada caso.',
    'Solo cuentan como voto las clases estándar de PEPA. Si falta la clase que necesitas, puedes crearla en «⚙️ Gestionar clases de productos» o en «Clasificaciones de productos», pero esa no se comparte.',
  ],
  ifWrong: [
    'Cambia la clase en el Historial de precios (tocar el producto → desplegable) o en el símbolo del producto al revisar un ticket. Tu elección manda en tu familia aunque la sugerencia compartida diga otra cosa. Con «Automático» vuelve a decidir PEPA.',
    'Que un producto nuevo salga «Sin clasificar» o mal puesto es normal: aún no sabe nada de él o la sugerencia es provisional. Si una clase que elegiste tú cambia sola después, eso no es normal: cuéntalo en Sugerencias (Ayuda).',
  ],
  verified: V,
  basedOn: [
    'src/domain/productClass.ts',
    'src/domain/catalog/identify.ts',
    'src/domain/catalog/catalogData.ts',
    'src/domain/foodTypes.ts',
    'src/domain/productText.ts',
    'src/domain/sharedClassLoader.ts',
    'src/data/sharedClasses.ts',
    'src/data/foodTypes.ts',
    'src/data/products.ts',
    'src/ui/ShoppingScreen.tsx',
    'src/ui/FinanceScreen.tsx',
    'supabase/migrations/0143_shared_product_learning.sql',
    'supabase/migrations/0144_product_class_confirmed.sql',
    'supabase/migrations/0308_shared_learning_all_stores.sql',
    'supabase/migrations/0142_store_chains.sql',
  ],
  tour: 'tut-compras-clase-historial',
  go: { path: '/compras', dest: 'compras.historial', label: 'Llévame al Historial de precios' },
  labels: ['Clasificaciones de productos', '⚙️ Gestionar clases de productos', 'Sin clasificar', 'Automático'],
  cardIds: ['com-historial-precios', 'com-ticket'],
  synonyms: ['clase de producto', 'clasificacion de productos', 'aprende pepa', 'recuerda la clase', 'por que clasifica mal', 'alimentos u otros', 'sin clasificar', 'corregir clase', 'aprendizaje compartido', 'votos de otras familias'],
}

export const expComprasCompradoFinalizar: HelpExplainer = {
  id: 'exp-compras-comprado-finalizar',
  module: 'compras',
  title: 'Qué hace y qué NO hace «Comprado» y «Finalizar compra»',
  summary: 'Marcar «comprado» solo tacha el producto en la lista, y «Finalizar compra» solo quita de la lista lo tachado. Ninguno registra la compra, el gasto ni el precio.',
  sections: [
    {
      heading: 'Marcar «comprado»',
      paragraphs: [
        'El círculo ✓ de cada producto solo cambia su estado en la lista, de pendiente a comprado y al revés. El producto baja a «✓ Completados» al final de su tienda y conserva todas sus acciones. No toca ninguna otra cosa: ni compras, ni productos del historial, ni precios, ni gastos de Economía. Hay una prueba automática que lo vigila.',
        'En «🛒 Modo compra» ves una suma «🧾 … €» de lo marcado. Es una estimación en pantalla (el precio guardado en la línea o el último que PEPA conoce) y no es un gasto.',
      ],
    },
    {
      heading: 'Finalizar compra',
      paragraphs: [
        'Debajo de cada tienda, «✅ Finalizar compra» (con confirmación en dos toques: «Sí, finalizar») borra de la lista los productos tachados de esa tienda. Los pendientes se quedan. Tampoco registra nada: es solo limpiar la lista.',
      ],
    },
    {
      heading: 'Entonces, ¿cómo se registra una compra?',
      paragraphs: [
        'Guardando un ticket («📷 Con ticket») o una compra «✍️ Sin ticket» en la pestaña Compras registradas. Eso sí crea el gasto en Economía (si hay importe) y, si hay productos con precio, llena el Historial de precios.',
      ],
      example:
        'Ejemplo inventado: tachas leche y pan en «Modo compra» y pulsas «Finalizar compra». La lista queda limpia, pero en Economía no hay ningún gasto nuevo y el Historial no tiene precios nuevos. Esa tarde subes la foto del ticket de 23,40 €: ahora sí se crea el gasto y se guardan los precios.',
    },
  ],
  limits: [
    'Lo que «Finalizar compra» quita de la lista no se recupera desde la propia lista.',
    'La suma 🧾 del Modo compra puede no coincidir con el ticket: usa precios que pueden ser antiguos y no incluye lo que no tenga precio conocido (lo dice entre paréntesis).',
  ],
  ifWrong: [
    'Si marcaste algo por error, toca otra vez su círculo y vuelve a pendiente (mientras no hayas finalizado la compra).',
    'Si esperabas ver un gasto o un precio nuevo y no está, falta registrar la compra en Compras registradas. Que no aparezca solo es lo normal, no un fallo.',
  ],
  verified: V,
  basedOn: ['src/data/shopping.ts', 'src/data/shoppingBoughtDoesNotFeedHistory.test.ts', 'src/ui/ShoppingScreen.tsx', 'src/data/receipts.ts'],
  tour: 'tut-compras-finalizar-compra',
  go: { path: '/compras', dest: 'compras.lista', label: 'Llévame a la Lista' },
  labels: ['✅ Finalizar compra', 'Sí, finalizar', '✓ Completados', '🛒 Modo compra'],
  cardIds: ['com-anadir-producto', 'com-historial-precios'],
  synonyms: ['comprado', 'finalizar compra', 'tachar', 'modo compra', 'no registra la compra', 'por que no sale el gasto', 'el historial no se llena', 'completados'],
}

export const expComprasHistorialPrecios: HelpExplainer = {
  id: 'exp-compras-historial-precios',
  module: 'compras',
  title: 'De dónde sale el Historial y cómo se comparan los precios',
  summary: 'El Historial se construye con lo que registras (tickets y compras con productos), nunca con marcar «comprado». Los precios se comparan en su unidad real y son los que habéis pagado vosotros.',
  sections: [
    {
      heading: 'De dónde salen los precios',
      paragraphs: [
        'Cada precio del Historial viene de una línea de un ticket guardado, de una compra «Sin ticket» a la que añadiste productos, o de un pedido que llegó solo (el ticket digital de Mercadona por correo, los pedidos de Amazon). Marcar «comprado» en la lista no guarda ningún precio.',
        'Si una compra no tiene productos con precio, cuenta como gasto en Economía pero no aparece en el Historial.',
      ],
    },
    {
      heading: 'En qué unidad se comparan',
      paragraphs: [
        'Cada precio se guarda y se enseña con su unidad real: €/kg si se vendió por peso, €/ud si fue por unidades. Nunca se compara un precio por kg con uno por unidad. Las compras antiguas sin unidad se dejan fuera de las comparaciones y se avisa.',
        'En la vista «Otros» el total del mes es el de Otros; en «Alimentos», el de la cesta de alimentación.',
      ],
    },
    {
      heading: 'Qué comparaciones hay',
      paragraphs: [
        'Mes actual con el anterior, por producto y en el total (🔺 rojo si sube, 🔻 verde si baja, solo si hubo compra en los dos meses). Por tienda, en la ficha del producto («Precio por tienda»: el último precio en cada tienda y la más barata). Y tu lista pendiente entre tiendas: «Comparar la lista entre tiendas» calcula cuánto costaría en cada una con los precios que ya pagasteis.',
        '«Solo el mismo» compara únicamente ese producto; «+ Equivalentes» incluye marcas parecidas. PEPA puede sugerir que dos productos son lo mismo; tu decisión («Sí, equivalente» o «No») manda sobre lo que PEPA deduzca. Entre familias solo se comparten nombres de productos, nunca precios.',
      ],
      example:
        'Ejemplo inventado: la leche entera costó 0,95 €/ud en «Super A» y 0,89 €/ud en «Super B». En su ficha, «Super B» sale como «🏷️ más barato» y «Super A» como «+7 % que el más barato». Una cesta con menos productos conocidos en una tienda no gana solo por sumar menos.',
    },
  ],
  limits: [
    'Son precios que habéis pagado vosotros, no ofertas de hoy. Un aviso ⚠️ marca los que tienen más de 2 meses.',
    'Sin un tamaño fiable no hay comparación exacta, y un producto sin compras en dos tiendas no se puede comparar entre ellas.',
    'Cuantos menos tickets registres, menos fiable es todo: el Historial solo sabe lo que le cuentas.',
  ],
  ifWrong: [
    'Si falta un precio, registra esa compra en Compras registradas con sus productos. Si dos productos son lo mismo y no los compara, usa «Sí, equivalente» en la ficha.',
    'Si un precio está mal, edita el ticket con ✏️: sustituye todas sus líneas.',
  ],
  verified: V,
  basedOn: ['src/domain/priceComparison.ts', 'src/domain/priceTrends.ts', 'src/domain/productSize.ts', 'src/domain/shoppingInsights.ts', 'src/ui/PriceComparisonPanels.tsx', 'src/ui/ShoppingScreen.tsx', 'src/data/receipts.ts'],
  tour: 'tut-compras-ficha-producto',
  go: { path: '/compras', dest: 'compras.historial', label: 'Llévame al Historial de precios' },
  labels: ['Precio por tienda', 'Solo el mismo', '+ Equivalentes', 'Comparar la lista entre tiendas', 'Sugerencias para la próxima compra'],
  cardIds: ['com-historial-precios'],
  synonyms: ['historial de precios', 'precio por kg', 'mas barato', 'comparar precios', 'equivalentes', 'precios antiguos', 'por que sube', 'comparar la lista'],
}

export const expComprasUnionEconomia: HelpExplainer = {
  id: 'exp-compras-union-economia',
  module: 'compras',
  title: 'Cómo se une una compra con Economía',
  summary: 'Al guardar una compra con importe, PEPA crea el gasto en Economía o lo une al cargo del banco que ya estaba (mismo importe, ±7 días). Nunca une nada sin que lo decidas cuando hay duda.',
  sections: [
    {
      heading: 'Qué crea guardar',
      paragraphs: [
        'Al pulsar «Guardar ticket» o «Guardar compra» con un importe, PEPA primero busca en Economía un gasto sin ticket con el mismo importe (al céntimo) en un margen de 7 días antes o después. Si lo encuentra, lo une a la compra y le pone la categoría y la tienda del formulario: no se cuenta dos veces. Si no, crea un gasto nuevo con la categoría que elegiste.',
        'Sin importe no se crea ningún gasto. El ticket se guarda igualmente, con sus productos.',
      ],
    },
    {
      heading: 'Qué se une y qué no',
      paragraphs: [
        'Un ticket nuevo puede unirse a un gasto que vino del banco, a uno apuntado a mano o a uno ya unido al banco, siempre que no tenga todavía otro ticket. Una compra «Sin ticket» solo se une a un gasto del banco.',
        'Una compra pagada en efectivo no se une nunca a un cargo del banco, ni tampoco una pagada con varios medios (esta parte la estoy revisando). Si hay varios candidatos del mismo importe, se elige el de fecha más cercana.',
      ],
    },
    {
      heading: 'Cuándo decides tú',
      paragraphs: [
        'Antes de guardar, PEPA puede preguntar «¿Es una compra que ya apuntaste?» (un ticket nuevo que coincide con una compra sin ticket) o, en una compra sin ticket, «Ya tienes este gasto apuntado en Economía». Solo se ofrece: nunca se une sola.',
        'Al revés pasa igual en la sincronización del banco: un cargo nuevo se une a un gasto tuyo del mismo importe y fecha parecida, y si ese gasto ya estaba unido a otro cargo, crea uno nuevo.',
      ],
      example:
        'Ejemplo inventado: el banco trajo un cargo de 23,40 € del 4 de marzo. El 6 de marzo subes el ticket de 23,40 €. PEPA lo une al cargo y el ticket pasa a decorar ese mismo gasto, que no se duplica. Si hubieras pagado en efectivo, no se uniría: serían dos apuntes distintos.',
    },
    {
      heading: 'Borrar y deshacer',
      paragraphs: [
        'Al borrar una compra con ✕ (dos toques), PEPA cuenta qué pasará si hay pagos o está unida al banco. Los movimientos originales del banco se conservan. Después sale «Deshacer»: devuelve la compra, pero la foto del ticket no se recupera.',
      ],
    },
  ],
  limits: [
    'Un redondeo, una propina o un importe distinto impiden la unión automática: queda un gasto del banco y otro de la compra, que puedes revisar.',
    'Con dos compras del mismo importe en 7 días, puede unir la que no era. Revisa en Economía → Movimientos (iconos ✏️ 🧾 🏦).',
    'No hay un botón general para separar dos cosas ya unidas; si ocurre, cuéntalo en Sugerencias (Ayuda) con la tienda, la fecha y el importe.',
  ],
  ifWrong: [
    'Si el gasto salió duplicado, mira «Ya tienes este gasto apuntado en Economía» antes de guardar; si ya lo guardaste, abre la compra con ✏️ o revisa el movimiento en Economía.',
    'Si la categoría del gasto no es la que querías, cámbiala tocando el movimiento en Economía → Movimientos.',
  ],
  verified: V,
  basedOn: ['src/data/receipts.ts', 'src/domain/ticketExpenseMatch.ts', 'src/domain/manualPurchase.ts', 'src/ui/FinanceScreen.tsx', 'supabase/functions/enable-banking-sync-transactions/index.ts'],
  tour: 'tut-compras-pago-economia',
  go: { path: '/compras', dest: 'compras.tickets', label: 'Llévame a Compras registradas' },
  labels: ['¿Es una compra que ya apuntaste?', 'Ya tienes este gasto apuntado en Economía', 'Guardar compra', 'Guardar ticket', 'Deshacer'],
  cardIds: ['com-ticket', 'eco-banco'],
  synonyms: ['ticket y banco', 'se duplica el gasto', 'unir ticket con el banco', 'por que sale dos veces', 'compra sin ticket y banco', 'gasto en economia', 'efectivo no se une'],
}

export const EXPLAINERS_COMPRAS: HelpExplainer[] = [
  expComprasLeerTicket,
  expComprasClasificarProductos,
  expComprasCompradoFinalizar,
  expComprasHistorialPrecios,
  expComprasUnionEconomia,
]
