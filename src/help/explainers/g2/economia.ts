import type { HelpExplainer } from '@/help/explainers/types'

// «Cómo funciona PEPA» de Economía (grupo g2). Cada afirmación se ha contrastado con el código el 2026-10-25; si cambian los archivos de `basedOn`, hay que revisar el texto.
// Lo que PEPA recuerda de tus correcciones se explica SOLO en `exp-economia-correccion-aprende`; el resto de explicaciones y los tutoriales enlazan a ella.
// Efectivo/carteras, pagos con varios medios, devoluciones y duplicados están implementados pero pendientes de validación en iPhone y Android: aquí solo se citan como «en revisión».
const V = '2026-10-25'
const V2 = '2026-10-28' // explicaciones revisadas con CAT-2 / ECO-CLASIF

export const expEconomiaCategorizarMovimientos: HelpExplainer = {
  id: 'exp-economia-categorizar-movimientos',
  module: 'economia',
  title: 'Cómo categoriza Economía los movimientos',
  summary: 'Cada movimiento recibe su categoría de una forma distinta según de dónde venga: la eliges tú, PEPA la deduce del comercio (y de lo que tu familia ya decidió), o la lleva el ticket.',
  sections: [
    {
      heading: 'Mira el iconito de cada movimiento',
      paragraphs: [
        'En la lista, a la derecha de cada movimiento, un icono dice de dónde viene: ✏️ «Apuntado a mano», 🧾 «Importado de un ticket» o 🏦 «Importado del banco». La forma de poner la categoría depende de eso.',
      ],
    },
    {
      heading: 'Apuntados a mano',
      paragraphs: [
        'La eliges tú. Al abrir «+ Nuevo movimiento», el formulario ya trae puesta una categoría de tu lista (no queda «pendiente»), así que conviene mirarla antes de guardar. Los ingresos eligen entre las categorías de ingresos. La forma de pago no se elige aquí, sino al registrar una compra en Compras.',
      ],
    },
    {
      heading: 'Del banco: PEPA la deduce, sin IA',
      paragraphs: [
        'Al sincronizar, PEPA limpia el nombre del comercio (quita partes como «COMPRA TARJ.», «ADEUDO» o «RECIBO») y decide por este orden: (1) lo que tu familia ya decidió a mano para ese mismo comercio; (2) una lista de comercios y conceptos conocidos (luz, agua, combustible, seguros, suscripciones, supermercados, farmacias, nóminas, intereses…), que apunta a la categoría del catálogo general aunque tu familia le haya cambiado el nombre; (3) lo que se repitió siempre en los movimientos anteriores de ese comercio. No usa IA y no mira el importe.',
        'Según lo segura que esté, PEPA lo marca: si está segura, pone la categoría sin más; si es una suposición razonable, la pone con la marca «sugerida» (junto a la categoría; la corriges con un toque o la das por buena); si no puede decidir sin inventar (Amazon, un Bizum, un pago a plazos), el gasto queda «Pendiente de clasificar» y, si tiene un indicio, con una sugerencia; sin ninguna pista va a «Otros».',
        'Los ingresos entran como «Ingreso», salvo las nóminas («Sueldo»), las pensiones y prestaciones, los intereses, las anulaciones y reversiones de comisión («Cobro anulado») y los abonos que empiezan por «DEVOLUCION» («Devoluciones»). Una transferencia recibida entra como «Ingreso»; si el nombre es de alguien de tu familia, PEPA lo sugiere como traspaso entre vuestras cuentas.',
      ],
      example:
        'Ejemplo inventado: «COMPRA TARJ. 1234 MERCADONA CENTRO» queda como «MERCADONA CENTRO» y va a Supermercado, carnicería y tiendas de alimentación. «ENDESA ENERGIA S.A.» va a Electricidad (o a la categoría que tu familia siempre haya usado para Endesa). «COMPRA TARJ. 1234 EJEMPLO FOTOS S.L.» no lo conoce nadie y va a «Otros».',
    },
    {
      heading: 'De un ticket',
      paragraphs: [
        'El ticket lleva la categoría que eliges en su formulario (viene la de supermercado) y su gasto lleva la misma. Si el ticket se une a un gasto que el banco ya había traído, la categoría del ticket sustituye a la que el banco había adivinado.',
        'La lectura de la foto con IA no propone categoría financiera. Los pedidos de Amazon que llegan por correo entran sin categoría («Pendiente de clasificar»).',
      ],
    },
  ],
  limits: [
    'Lo que PEPA deduce es una suposición, no una certeza: por eso las dudosas llevan «sugerida» y la pantalla dice que la categoría de los movimientos importados «se asigna por sugerencia».',
    'Solo reconoce los comercios y conceptos que conoce. El resto queda en «Otros» o pendiente.',
    'Cuando varias reglas podrían valer, gana la más específica: «UBER EATS» va a restaurantes y «UBER» a transporte.',
    'Los reintegros de cajero y los traspasos que el propio concepto del banco llama así se reconocen (Retirada de efectivo y Transferencias entre cuentas propias); los que no lo dicen en el concepto hay que marcarlos a mano.',
    'Qué pasa cuando corriges una categoría tiene su propia explicación.',
  ],
  ifWrong: [
    'Toca la categoría del movimiento (su nombre con el icono) y elige otra: hay buscador, la sugerida y las más usadas. Si ponía «sugerida» y es correcta, puedes dejarla tal cual. Si el gasto viene de un ticket, se cambian a la vez el gasto y el ticket.',
    'Que una categoría sugerida no encaje es una limitación normal. Si el cambio da un error al guardar y se repite, ya es un fallo técnico: cuéntalo en Sugerencias (Ayuda).',
  ],
  verified: V2,
  basedOn: [
    'supabase/functions/enable-banking-sync-transactions/index.ts',
    'supabase/functions/_shared/bank/classifyMovement.ts',
    'supabase/functions/amazon-order-webhook/index.ts',
    'src/domain/movementForm.ts',
    'src/data/receipts.ts',
    'src/ui/FinanceScreen.tsx',
    'src/ui/QuickCategoryChange.tsx',
  ],
  tour: 'tut-economia-cambiar-categoria',
  go: { path: '/dinero', dest: 'economia.movimientos', label: 'Llévame a Movimientos' },
  labels: ['+ Nuevo movimiento', 'Apuntado a mano', 'Importado de un ticket', 'Importado del banco', 'La categoría de los movimientos importados del banco se asigna por sugerencia', 'sugerida'],
  cardIds: ['eco-nuevo-movimiento', 'eco-categorias', 'eco-banco', 'eco-clasificacion-banco'],
  synonyms: ['categoria automatica', 'por que categoriza asi', 'categoria del banco', 'sugerencia de categoria', 'otros', 'como categoriza', 'movimientos del banco categoria', 'categorizar gastos', 'categoria sugerida', 'clasificar solo'],
}

export const expEconomiaPendienteClasificar: HelpExplainer = {
  id: 'exp-economia-pendiente-clasificar',
  module: 'economia',
  title: 'Por qué un movimiento queda «Pendiente de clasificar»',
  summary: 'Es un gasto real al que todavía no se le ha puesto categoría. PEPA lo deja así a propósito cuando no tiene una pista fiable, en vez de inventarse una.',
  sections: [
    {
      heading: 'Qué significa',
      paragraphs: [
        'El gasto no tiene categoría (vacía a propósito; «Pendiente de clasificar» es solo el texto con el que se enseña). Sigue siendo un gasto real: cuenta en los totales, el ahorro y el presupuesto General. Lo que no hace es entrar en ninguna categoría ni gastar un presupuesto de categoría.',
      ],
    },
    {
      heading: 'Por qué ocurre',
      paragraphs: [
        'PEPA prefiere dejar un gasto sin categoría antes que fingir una certeza que no tiene. Pasa con los pedidos de Amazon que llegan por correo (pueden mezclar comida, ropa, electrónica…) y con los movimientos del banco que PEPA no puede situar sin inventar: Amazon, un Bizum, un cobro de datáfono genérico o un pago a plazos. También puede ocurrir con un ticket guardado sin categoría.',
        'Si el movimiento del banco tiene un indicio razonable (un pago a plazos que parece un préstamo, o un nombre de tu familia que parece un traspaso), junto a «Pendiente de clasificar» verás una sugerencia («¿Préstamos e intereses?»). No se aplica sola: tocas la categoría y eliges. Si no hay ninguna pista, el movimiento del banco va a «Otros».',
      ],
      example: 'Llega por correo un pedido de Amazon de 45,00 € (ejemplo inventado) con un libro y una sudadera. PEPA no sabe a qué categoría pertenece y lo deja «Pendiente de clasificar»: suma 45,00 € al gasto del mes, pero no a «Ocio» ni a «Ropa» hasta que lo clasifiques tú.',
    },
    {
      heading: 'Dónde lo ves',
      paragraphs: [
        'En Inicio de Economía aparece una señal discreta tipo «3 pendientes de clasificar · 245,30 €»: al tocarla vas a Movimientos con el filtro «Pendientes». En la lista, cada uno lleva ⏳ Pendiente de clasificar, y en Estadísticas se ve como una porción gris aparte.',
      ],
    },
    {
      heading: 'Cómo se resuelve',
      paragraphs: [
        'Toca la categoría del movimiento y elige la correcta (arriba salen la sugerida por PEPA y las que más usas, y hay buscador). Si tiene ticket, se cambian a la vez el gasto y el ticket en una sola operación. Si el gasto y su ticket tuvieran categorías distintas, PEPA te avisa y no cambia nada.',
      ],
    },
  ],
  limits: [
    'Mientras esté pendiente, ese gasto no aparece en el reparto por categorías ni consume presupuestos de categoría, aunque sí suma en el total.',
    'La sugerencia es solo un indicio: PEPA nunca la aplica por su cuenta.',
    'PEPA no te lo recuerda con avisos ni te bloquea nada: solo está la señal discreta.',
    'No es lo mismo que un «producto sin clasificar» de Compras: aquello es la clase de un producto; esto es la categoría de un gasto.',
  ],
  ifWrong: [
    'Ponle la categoría desde el movimiento. Si no ves la señal pero crees que hay pendientes, usa el filtro «Pendientes» de Movimientos.',
    'Si al guardar sale «No se ha podido clasificar ahora mismo» es un fallo temporal y no se ha cambiado nada: inténtalo de nuevo. Si se repite siempre, cuéntalo en Sugerencias (Ayuda).',
  ],
  verified: V2,
  basedOn: [
    'src/domain/pending.ts',
    'src/domain/classifyPurchase.ts',
    'src/data/classifyPurchase.ts',
    'supabase/migrations/0149_category_nullable_pending.sql',
    'supabase/functions/amazon-order-webhook/index.ts',
    'supabase/functions/_shared/bank/classifyMovement.ts',
    'src/ui/FinanceScreen.tsx',
  ],
  tour: 'tut-economia-cambiar-categoria',
  go: { path: '/dinero', dest: 'economia.movimientos', label: 'Llévame a Movimientos' },
  labels: ['Pendiente de clasificar', 'Pendientes'],
  cardIds: ['eco-pendientes'],
  synonyms: ['pendiente de clasificar', 'sin categoria', 'gasto sin categoria', 'amazon sin categoria', 'por que no tiene categoria', 'pendientes', 'clasificar gasto'],
}

export const expEconomiaConciliacion: HelpExplainer = {
  id: 'exp-economia-conciliacion',
  module: 'economia',
  title: 'Cómo concilia PEPA el banco con tickets, apuntes y pagos previstos',
  summary: 'Hay dos conciliaciones distintas: una automática (banco con tickets y apuntes a mano) y otra que PEPA solo propone y tú confirmas (banco con pagos previstos).',
  sections: [
    {
      heading: 'A) Banco con ticket o apunte: automática',
      paragraphs: [
        'Al sincronizar, para cada cargo nuevo PEPA busca un gasto tuyo (apuntado a mano o de un ticket) con el mismo importe (menos de 1 céntimo de diferencia), a ±7 días, que no sea de efectivo y que no esté ya unido a otro movimiento. Si hay varios, elige el de fecha más cercana. Si lo encuentra, no crea otro gasto: une el cargo a ese.',
        'Al guardar un ticket pasa al revés: busca el gasto que el banco ya trajo, con el mismo criterio. Los ingresos no se concilian así; la devolución de una compra y los pagos con varios medios tienen su propio trato, que aún estoy revisando.',
      ],
    },
    {
      heading: 'B) Banco con pago previsto: PEPA propone, tú confirmas',
      paragraphs: [
        'En Previsión de pagos, «🔎 N pagos por revisar» abre las propuestas. Solo se comparan cargos (no ingresos) ya convertidos en gasto, en la misma divisa, dentro de ±3 días de la fecha prevista, y de la misma cuenta si el pago tiene una asignada.',
        'Para proponer un cargo tienen que cumplirse TRES cosas a la vez: que sea el mismo comercio o beneficiario (el nombre del banco coincide con el del pago, con su número de contrato o con una variante conocida), que el importe encaje con el tipo de pago, y que la fecha y la cuenta sean compatibles. Compartir solo la cuenta o la fecha nunca basta, y una marca con muchos productos (Google, Amazon…) tampoco: tiene que coincidir también el servicio.',
        'Importe: si el pago tiene importe conocido, el cargo debe ser igual o casi igual (hasta un 5 % y 10 €). Si es estimado (facturas variables), se admite más diferencia (hasta un 50 %) porque ya coincide el comercio. Si el importe está pendiente, solo se propone con un nombre muy claro y en la cuenta prevista. Después, entre los que cumplen, se ordenan por cuenta, importe y cercanía de fecha. Es una cuenta determinista: no hay IA.',
        'La tarjeta enseña lo Previsto y lo del Banco con los motivos. Si está muy claro dice «PEPA ha encontrado un posible cargo»; si hay dudas, «Puede que sea este cargo — revísalo».',
      ],
    },
    {
      heading: 'Qué pasa al confirmar o desconciliar',
      paragraphs: [
        '«Confirmar» une el cargo con el pago (queda «✓ Cobrado») y, si el pago previsto tiene categoría, el movimiento del banco pasa a tener esa categoría, sustituyendo la que tuviera. Si por algún motivo no se puede aplicar, se abre «Gestionar movimiento» para que decidas tú.',
        '«Desconciliar» solo quita la unión: el movimiento se queda con la categoría que tiene en ese momento, no se le devuelve la anterior.',
        '«No es este» guarda el descarte y esa pareja no se vuelve a proponer. Si no queda ningún otro cargo que coincida de verdad, PEPA te lo dice y el pago sigue pendiente: no te va enseñando otros cargos al azar. No hay en la pantalla un botón para deshacer un descarte.',
        'Si PEPA no encuentra el cargo (por ejemplo, el banco lo escribe con un nombre muy distinto), tú puedes vincularlo a mano: en el ⋯ del pago, «🔗 Vincular con un movimiento del banco». Si no encaja en nombre, importe, cuenta o fecha, te avisa antes, pero decides tú.',
      ],
      example:
        'Ejemplo inventado: tienes «Seguro del coche» previsto el 5 de mayo por 300,00 € en la cuenta principal. El 6 de mayo el banco cobra 300,00 € a «EJEMPLO SEGUROS S.A.» en esa cuenta. PEPA los propone (misma cuenta, mismo importe, un día de diferencia). Tú pulsas «Confirmar» y el cargo queda como cobrado con la categoría Seguros.',
    },
  ],
  limits: [
    'En A solo une si el importe es casi idéntico: una propina o un redondeo impide la unión. Con dos compras del mismo importe en 7 días puede unir la que no era.',
    'Si el apunte ya estaba unido a otro movimiento, el cargo crea un gasto nuevo y puede quedar un duplicado que hay que revisar.',
    'En B no se proponen ingresos ni cargos fuera de los ±3 días, y solo hay una propuesta por pago. Es preferible no proponer nada a proponer un cargo que no es: si el banco escribe el comercio con un nombre muy distinto del que pusiste al pago, no lo propondrá y tendrás que vincularlo a mano.',
    'PEPA nunca confirma por su cuenta una conciliación con un pago previsto.',
  ],
  ifWrong: [
    'Propuesta que no es: «No es este». Ya confirmada por error: «Desconciliar» en ese pago (y revisa la categoría del movimiento, que no se restaura sola).',
    'Un ticket o apunte unido al gasto equivocado, o un duplicado: en Compras → Compras registradas hay un panel de posibles duplicados que aún estoy revisando. Si no basta, cuéntalo en Sugerencias (Ayuda) con la tienda, la fecha y el importe.',
    'Que no proponga un cargo que tú ves claro es una limitación normal de las reglas. Que una propuesta con los datos claramente iguales no aparezca nunca, ni tras sincronizar, sí podría ser un fallo: avísalo en Sugerencias.',
  ],
  verified: V,
  basedOn: [
    'src/domain/forecastReconciliation.ts',
    'src/data/forecast.ts',
    'src/domain/ticketExpenseMatch.ts',
    'src/data/receipts.ts',
    'supabase/functions/enable-banking-sync-transactions/index.ts',
    'supabase/migrations/0173_forecast_reconciliation_category_inherit.sql',
    'src/ui/FinanceScreen.tsx',
  ],
  tour: 'tut-economia-revisar-conciliacion',
  go: { path: '/dinero', dest: 'economia.prevision', label: 'Llévame a Previsión de pagos' },
  labels: ['Confirmar', 'No es este', 'Desconciliar', 'Conciliación bancaria', 'PEPA ha encontrado un posible cargo', 'Puede que sea este cargo — revísalo'],
  cardIds: ['eco-prevision', 'eco-banco'],
  synonyms: ['conciliar', 'conciliacion bancaria', 'unir cargo con pago', 'confirmar cargo', 'duplicado banco ticket', 'por que se duplica', 'pagos por revisar', 'no es este', 'desconciliar'],
}

export const expEconomiaConexionBancaria: HelpExplainer = {
  id: 'exp-economia-conexion-bancaria',
  module: 'economia',
  title: 'Cómo se conecta el banco y qué trae PEPA',
  summary: 'Conectas el banco autorizándolo en la web de tu banco. PEPA trae sus movimientos varias veces al día, pero el permiso caduca a los 90 días y hay que renovarlo.',
  sections: [
    {
      heading: 'Cómo se conecta',
      paragraphs: [
        'En Mis cuentas, «Añadir cuenta» te lleva a Banco; si ya estabas en Banco, se abre la ventana de cuentas, y si venías de otra sección, hay que volver a pulsarlo allí (también está en Configuración → Gestionar cuentas). Ahí, «+ Conectar banco»: eliges país y banco, si quieres el IBAN, y pulsas «Conectar». PEPA te lleva a tu banco para que autorices. Tus claves las pones en el banco: en PEPA no hay ningún campo para ellas.',
      ],
    },
    {
      heading: 'Qué guarda PEPA',
      paragraphs: [
        'La conexión (banco y hasta cuándo vale), las cuentas (nombre, IBAN, divisa y saldo), los movimientos que el banco entrega (fecha, importe, concepto) y, de cada movimiento, un gasto en Movimientos.',
      ],
    },
    {
      heading: 'Cuándo y cuánto sincroniza',
      paragraphs: [
        'Con «🔄 Sincronizar movimientos» cuando tú quieres, y sola 4 veces al día. La primera vez trae los últimos 90 días (o el periodo que elijas en «Traer al menos»); después solo lo nuevo, con unos días de margen. El banco no entrega más de unos 3 meses de histórico, aunque se pida más.',
      ],
    },
    {
      heading: 'Los 90 días',
      paragraphs: [
        'Por normativa (PSD2), cada permiso dura 90 días. Al conectar, PEPA crea dos avisos en el Calendario («🏦 Renovar conexión con» y el nombre del banco), uno una semana antes y otro el día antes. Renovar es volver a conectar ese banco; la conexión antigua no se fusiona con la nueva.',
        'Pasado el plazo, la sincronización falla cuenta a cuenta y el aviso sale al sincronizar. La ventana de cuentas muestra «válido hasta», pero no avisa por sí sola de que ya caducó.',
      ],
      example: 'Conectas un banco el 1 de enero (ejemplo inventado). El permiso vale hasta el 1 de abril: el 25 de marzo y el 31 de marzo ves los avisos en el Calendario. Si no vuelves a conectar, desde el 2 de abril la sincronización de esa cuenta falla hasta que renueves el permiso.',
    },
    {
      heading: 'Si desconectas',
      paragraphs: [
        '«Desconectar» cierra el permiso en el banco, marca la conexión como revocada y borra los avisos de renovación. Los movimientos que ya se importaron se quedan.',
      ],
    },
  ],
  limits: [
    'Si el permiso caduca, la sincronización deja de traer movimientos hasta que se vuelva a conectar. Es normal y le pasa a cualquier app de banca abierta.',
    'Algunos bancos (por ejemplo cajas rurales) autorizan sin decir qué cuenta: si sale «0 cuentas», vuelve a conectar escribiendo el IBAN.',
    'Si en el móvil se queda en «Redirigir a su proveedor de servicios de cuenta», conéctalo desde un ordenador: queda enlazado para todos los dispositivos.',
    'Los errores de una cuenta se enseñan tal como los devuelve el banco o el servicio, y pueden ser técnicos (por ejemplo, un límite de accesos).',
    'El saldo se pide aparte; si un banco no lo entrega, la tarjeta puede quedarse en «Sincronizando…». No existen cuentas manuales: solo hay cuentas de bancos conectados.',
  ],
  ifWrong: [
    'Lee el aviso que sale al sincronizar: si habla de caducidad o de límite de accesos, reconecta o espera un rato.',
    'Si tras reconectar sigue sin traer nada, o los movimientos salen duplicados, no es lo esperable: cuéntalo en Sugerencias (Ayuda) con el nombre del banco.',
  ],
  verified: V,
  basedOn: [
    'src/ui/BankAccountsModal.tsx',
    'src/ui/FinanceScreen.tsx',
    'src/data/bank.ts',
    'supabase/functions/enable-banking-auth-start/index.ts',
    'supabase/functions/enable-banking-auth-callback/index.ts',
    'supabase/functions/enable-banking-sync-transactions/index.ts',
    'supabase/functions/enable-banking-disconnect/index.ts',
    'supabase/migrations/0077_schedule_bank_sync.sql',
  ],
  tour: 'tut-economia-conectar-banco',
  go: { path: '/dinero', dest: 'economia.banco', label: 'Llévame a Banco' },
  labels: ['+ Conectar banco', '🔄 Sincronizar movimientos', 'Desconectar', 'Traer al menos: últimos 3 meses', 'Añadir cuenta'],
  cardIds: ['eco-banco'],
  synonyms: ['conectar banco', 'sincronizar banco', 'banco caducado', '90 dias', 'renovar conexion', 'psd2', 'open banking', 'no se sincroniza', 'movimientos del banco', 'desconectar banco', 'iban'],
}

export const expEconomiaCorreccionAprende: HelpExplainer = {
  id: 'exp-economia-correccion-aprende',
  module: 'economia',
  title: 'Qué recuerda PEPA cuando corriges una categoría (y qué no)',
  summary: 'Cuando eliges tú la categoría de un movimiento, PEPA la recuerda para ese comercio y la aplica a los próximos que traiga el banco. Los anteriores solo cambian si tú lo aceptas.',
  sections: [
    {
      heading: 'Qué pasa cuando corriges',
      paragraphs: [
        'Al elegir la categoría se cambia ese movimiento y, si tiene ticket, también la del ticket, a la vez. Queda como decisión tuya: PEPA no la vuelve a tocar nunca por su cuenta.',
      ],
    },
    {
      heading: 'Qué recuerda para los próximos',
      paragraphs: [
        'Cuando llega un movimiento nuevo del banco, PEPA mira primero lo que tu familia decidió a mano para ese mismo comercio. Si siempre lo habéis puesto en la misma categoría, el nuevo entra ya ahí, sin marcarlo como dudoso. Si lo habéis puesto en categorías distintas (el mismo comercio vende cosas distintas), PEPA no se fía: lo deja como «sugerida» o pendiente.',
        'También cuenta cómo se repitió en los movimientos anteriores que nadie corrigió: si un comercio siempre fue a la misma categoría, el siguiente va ahí. Lo que PEPA clasificó sola no cuenta como aprendizaje, para que no se refuerce a sí misma.',
      ],
      example:
        'Ejemplo inventado: llega «EJEMPLO FOTOS S.L.», que PEPA no conoce, y va a «Otros». Tú lo cambias a «Casa y jardín». El mes siguiente llega otro «EJEMPLO FOTOS S.L.»: entra ya en «Casa y jardín». Y, al corregir el primero, PEPA te preguntó si querías pasar también los anteriores.',
    },
    {
      heading: 'Los movimientos anteriores: solo si tú quieres',
      paragraphs: [
        'Tras corregir un movimiento, si hay otros anteriores del mismo comercio que importó el banco y están en otra categoría, PEPA te pregunta si quieres cambiarlos también. Si dices que no, no se toca ninguno. Nunca cambia uno que ya hubieras decidido tú ni los que tienen un ticket con su desglose.',
        'Además, si hay movimientos antiguos en «Otros» que ahora PEPA sabe situar, te lo ofrece con «Revisar», con casillas para quitar los que no quieras cambiar.',
      ],
    },
    {
      heading: 'Qué sí se recuerda aparte (no lo confundas)',
      paragraphs: [
        'En Compras, la clase de un producto que eliges tú sí se recuerda para ese producto (es otra cosa, con su propia explicación).',
        'En Previsión de pagos, al confirmar un cargo con un pago previsto, el movimiento toma la categoría del pago. Así los recibos fijos (seguro, cuota, alquiler) quedan bien sin corregirlos cada mes.',
      ],
    },
  ],
  limits: [
    'No hay una lista de reglas que puedas ver o editar: el recuerdo sale de las categorías que ya elegiste.',
    'Cada familia aprende de sí misma: lo que decide una familia no cambia nada en otra.',
    'Un movimiento que ya tenía ticket o que apuntaste a mano no se cambia en bloque.',
  ],
  ifWrong: [
    'Si PEPA recordó una categoría que ya no quieres para un comercio, cámbiala en el siguiente movimiento: a partir de ahí manda la nueva (si hay varias distintas, PEPA solo sugiere).',
    'Si algo no se aplicó como esperabas, cuéntalo en Sugerencias (Ayuda).',
  ],
  verified: V2,
  basedOn: [
    'supabase/functions/_shared/bank/classifyMovement.ts',
    'supabase/functions/enable-banking-sync-transactions/index.ts',
    'src/domain/similarMovements.ts',
    'src/ui/QuickCategoryChange.tsx',
    'supabase/migrations/0340_expense_category_provenance.sql',
    'supabase/migrations/0173_forecast_reconciliation_category_inherit.sql',
  ],
  tour: 'tut-economia-cambiar-categoria',
  go: { path: '/dinero', dest: 'economia.movimientos', label: 'Llévame a Movimientos' },
  labels: ['¿Cambiar también los anteriores?', 'No, solo este', 'Revisar'],
  cardIds: ['eco-categorias', 'eco-pendientes', 'eco-clasificacion-banco'],
  synonyms: ['recordar categoria', 'siempre me lo pone mal', 'corregir categoria otra vez', 'por que vuelve a salir mal', 'aprende de mis correcciones', 'regla de categoria', 'categoria del siguiente', 'cambiar los anteriores', 'aprende pepa'],
}

export const expEconomiaIngresoGastoAhorro: HelpExplainer = {
  id: 'exp-economia-ingreso-gasto-ahorro',
  module: 'economia',
  title: 'Qué cuenta como ingreso, gasto y ahorro (y por qué Resumen y Presupuesto pueden sumar distinto)',
  summary: 'Resumen, Movimientos y Estadísticas cuentan los ingresos igual; Presupuestos, con un banco conectado, cuenta solo lo que entra en el banco. Los traspasos no cuentan y las devoluciones restan del gasto.',
  sections: [
    {
      heading: 'Las cuentas del Resumen',
      paragraphs: [
        'Ingresos: todo ingreso real del periodo, apuntado a mano o llegado del banco. Gastos: todo gasto real del periodo. Ni los traspasos entre tus propias cuentas ni los «Cobro anulado» cuentan como ingreso ni como gasto, y las devoluciones no son ingreso.',
        'Si hubo devoluciones, la tarjeta las enseña aparte y calcula el «Gasto neto» (gastos menos devoluciones). Ahorro = ingresos − gasto neto; si sale negativo la tarjeta lo llama «Balance». La «Tasa de ahorro» es el ahorro entre los ingresos, y no sale si no hay ingresos.',
        'Un gasto «Pendiente de clasificar» cuenta en los gastos y en el ahorro, aunque todavía no tenga categoría. Lo previsto en Previsión de pagos no cuenta hasta que se cobra y se concilia.',
      ],
    },
    {
      heading: 'Por qué Presupuestos puede dar otra cifra de ingresos',
      paragraphs: [
        'En Presupuestos, si tu familia tiene cuentas bancarias conectadas, «Ingresos» suma solo lo que entra en esas cuentas; los ingresos que apuntaste a mano ya no se cuentan ahí y la pantalla lo avisa. Sin banco conectado, suma lo que apuntes a mano. Resumen, Movimientos y Estadísticas, en cambio, cuentan los dos tipos.',
        'Por eso un ingreso apuntado a mano puede salir en el Resumen y no en Presupuestos. Y el «Gastado» de Presupuestos es el gasto bruto del periodo: no resta las devoluciones.',
      ],
      example:
        'Ejemplo inventado: con un banco conectado, apuntas a mano una paga extra de 200 € que no entró por el banco. El Resumen de octubre suma esos 200 € en Ingresos; el Resumen de Presupuestos no, y avisa de que los ingresos apuntados a mano no se cuentan.',
    },
    {
      heading: 'Información que no suma',
      paragraphs: [
        '«Dinero destinado a cuentas de ahorro» es solo informativo: enseña a dónde ha ido dinero traspasado, y puede incluir ahorro de otros periodos. No se convierte ni en ingreso ni en gasto.',
      ],
    },
  ],
  limits: [
    'Esto es un cálculo orientativo con lo que está registrado: no es asesoramiento financiero.',
    'Si un traspaso entre tus cuentas llega como gasto o ingreso, hay que ponerle a mano la categoría de traspasos; mientras no, cuenta como movimiento normal.',
    'Que Resumen y Presupuestos puedan sumar distinto los ingresos es una regla actual de PEPA, no algo que estés haciendo mal.',
  ],
  ifWrong: [
    'Si una cifra no te cuadra, entra con «Ver registros →» y comprueba qué movimientos la forman.',
    'Si un movimiento cuenta donde no debe (por ejemplo un traspaso como gasto), cámbiale la categoría tocándolo en Movimientos.',
  ],
  verified: V,
  basedOn: ['src/domain/financeCompute.ts', 'src/domain/finance.ts', 'src/domain/refunds.ts', 'src/domain/pending.ts', 'src/domain/cancelledCharge.ts', 'src/ui/FinanceScreen.tsx'],
  tour: 'tut-economia-cuentas-resumen',
  go: { path: '/dinero', dest: 'economia.resumen', label: 'Llévame al Resumen' },
  labels: ['Tasa de ahorro', 'Gasto neto', 'Dinero destinado a cuentas de ahorro', 'Pendiente de clasificar'],
  cardIds: ['eco-moverse', 'eco-presupuesto'],
  synonyms: ['ingresos', 'gastos', 'ahorro', 'por que no cuadra', 'resumen y presupuesto distinto', 'tasa de ahorro', 'gasto neto', 'devoluciones no son ingreso', 'traspasos no cuentan'],
}

export const expEconomiaTraspasosAnulaciones: HelpExplainer = {
  id: 'exp-economia-traspasos-anulaciones',
  module: 'economia',
  title: 'Traspasos entre tus cuentas, cobros anulados y devoluciones del banco',
  summary: 'PEPA reconoce por el concepto los traspasos entre tus cuentas y los reintegros de cajero, y por reglas las anulaciones y las devoluciones del banco. Ninguno cuenta como ingreso o gasto normal.',
  sections: [
    {
      heading: 'Traspasos entre cuentas propias y cajero',
      paragraphs: [
        'Mover dinero entre tus cuentas no es ingresar ni gastar. Si el concepto del banco lo dice («traspaso», «entre cuentas», «cuentas propias»), PEPA lo pone en «Transferencias entre cuentas propias» (dentro de «Movimientos internos»). Un reintegro de cajero va a «Retirada de efectivo». Con esas categorías, no suman en Ingresos ni en Gastos de ningún sitio.',
        'Si el concepto no lo dice (solo trae un nombre), llega como un gasto en una cuenta y un ingreso en la otra. Si el nombre es de alguien de tu familia, PEPA lo sugiere como traspaso, sin aplicarlo; si no, ponles tú la categoría «Transferencias entre cuentas propias».',
      ],
    },
    {
      heading: 'Cobros anulados',
      paragraphs: [
        'Si el banco apunta un cargo y luego su anulación (mismo importe, en un plazo de 60 días, o una comisión y su reversión en pocos días), PEPA marca las dos partes como «Cobro anulado». Así se cancelan entre sí y no cuentan como gasto ni ingreso. Es una regla fija: no lo decide una IA.',
      ],
    },
    {
      heading: 'Devoluciones',
      paragraphs: [
        'Un abono del banco cuya descripción empieza por «DEVOLUCION» entra en la categoría «Devoluciones». Una devolución no es ingreso: es dinero recuperado de un gasto anterior, y por eso el Resumen la resta del gasto (Gasto neto).',
      ],
      example:
        'Ejemplo inventado: el banco apunta «COMPRA TARJ. EJEMPLO TIENDA» de 50 € y, dos días después, «DEVOLUCION EJEMPLO TIENDA» de 50 €. El gasto sigue siendo de 50 € y la devolución de 50 €: el Gasto neto de ese par es 0 €, y la devolución no sube tus Ingresos.',
    },
  ],
  limits: [
    'Un traspaso cuyo concepto es solo un nombre no se puede asegurar: PEPA lo sugiere si el nombre es de tu familia y, si no, hay que categorizarlo a mano.',
    'Las reglas de anulación son estrechas a propósito, para no marcar por error un importe que casualmente coincide.',
    'Registrar devoluciones de compras hechas desde Compras es una función que aún estoy revisando y no se explica aquí.',
  ],
  ifWrong: [
    'Un traspaso que cuenta como gasto o ingreso: toca la categoría del movimiento y cámbiala a «Transferencias entre cuentas propias».',
    'Un «Cobro anulado» que no debería serlo: cámbiale la categoría a mano desde el propio movimiento.',
  ],
  verified: V2,
  basedOn: [
    'supabase/functions/enable-banking-sync-transactions/index.ts',
    'supabase/functions/_shared/bank/classifyMovement.ts',
    'src/domain/cancelledCharge.ts',
    'src/domain/refunds.ts',
    'src/domain/finance.ts',
    'src/ui/FinanceScreen.tsx',
  ],
  tour: 'tut-economia-cambiar-categoria',
  go: { path: '/dinero', dest: 'economia.movimientos', label: 'Llévame a Movimientos' },
  labels: ['Cobro anulado', 'Devoluciones', 'Transferencias entre cuentas propias'],
  cardIds: ['eco-banco', 'eco-categorias'],
  synonyms: ['traspaso', 'traspasos entre cuentas', 'cobro anulado', 'devolucion del banco', 'movimientos internos', 'transferencia propia', 'por que cuenta como gasto', 'anulacion', 'reintegro de cajero'],
}

export const expEconomiaPrevision: HelpExplainer = {
  id: 'exp-economia-prevision',
  module: 'economia',
  title: 'Cómo funciona la Previsión de pagos',
  summary: 'La Previsión anota lo que sabes que va a venir. No es gasto hasta que el banco lo cobra y se concilia. Un importe pendiente nunca se enseña como 0 €.',
  sections: [
    {
      heading: 'Conocido, Estimado o Pendiente',
      paragraphs: [
        'Cada pago tiene un estado del importe: Conocido (sabes cuánto es), Estimado (más o menos; entonces es obligatorio decir «¿En qué se basa?», por ejemplo «recibo del año pasado») o Pendiente (aún no lo sabes). Los pendientes se cuentan aparte («3 pagos pendientes de importe») y nunca se suman como 0 €.',
        'El vencimiento es obligatorio. Puede repetirse (cada mes, cada año…), repartirse «En varios pagos» o llevar una fecha distinta de cobro. La divisa puede ser EUR, GBP o USD, pero los totales se enseñan por divisa, sin convertir.',
      ],
    },
    {
      heading: 'Qué es y qué no es gasto',
      paragraphs: [
        'Lo previsto no entra en tus gastos ni en el Resumen. Solo cuando el banco cobra y se concilia con el pago (PEPA lo propone y tú confirmas), el cargo pasa a ser un gasto con la categoría del pago.',
        'La Visión de 12 meses y los Próximos pagos solo suman lo previsto: son para anticiparte.',
      ],
    },
    {
      heading: 'Pagos recurrentes que PEPA detecta',
      paragraphs: [
        'Si el banco cobra algo con una periodicidad clara (al menos 3 cargos seguidos al mismo ritmo; hoy, sobre todo mensual), PEPA propone «💡 posibles pagos recurrentes» con un importe habitual y el próximo cargo estimado. Es una cuenta de fechas e importes, sin IA, y nunca crea nada sola: «Revisar» abre el formulario ya rellenado y «No me interesa» lo descarta.',
      ],
      example:
        'Ejemplo inventado: el banco cobra 29,90 € a «EJEMPLO FIBRA» el día 3 de cada mes durante tres meses. PEPA propone un posible pago recurrente de unos 29,90 € con el próximo cargo estimado el día 3. Tú pulsas «Revisar», lo ajustas y lo creas, o «No me interesa».',
    },
    {
      heading: 'Importar desde un documento',
      paragraphs: [
        '«📄 Importar desde foto o documento» usa una IA para leer una factura o un contrato y rellenar el pago. Siempre te lo enseña para revisar antes de guardar, con un aviso si los importes no cuadran.',
      ],
    },
  ],
  limits: [
    'Los préstamos e hipotecas no se pueden crear ni editar: «🏦 Préstamos e hipotecas» solo muestra datos antiguos. Un préstamo se anota hoy como un pago «En varios pagos».',
    'No hay conciliación automática de pagos previstos: PEPA solo propone y tú confirmas.',
    'El aviso «Avísame antes» se guarda con el pago, pero no he podido comprobar que los avisos lleguen.',
    'Importar un documento depende de la IA y de que el servicio esté disponible; si falla, el mensaje es genérico.',
  ],
  ifWrong: [
    'Un pago mal anotado: abre su menú ⋯ → Editar. Uno que ya no vale: Desactivar (se puede reactivar) o Eliminar.',
    'Una propuesta de pago recurrente que no te interesa: «No me interesa».',
  ],
  verified: V,
  basedOn: ['src/data/forecast.ts', 'src/domain/forecast.ts', 'src/domain/forecastRecurrenceDetection.ts', 'src/domain/forecastReconciliation.ts', 'src/domain/forecastDocumentImport.ts', 'src/ui/FinanceScreen.tsx'],
  tour: 'tut-economia-anadir-pago-previsto',
  go: { path: '/dinero', dest: 'economia.prevision', label: 'Llévame a Previsión de pagos' },
  labels: ['Visión 12 meses', 'Próximos pagos', 'posibles pagos recurrentes', 'No me interesa', 'Importar desde foto o documento', 'Préstamos e hipotecas', '¿En qué se basa?'],
  cardIds: ['eco-prevision'],
  synonyms: ['previsión', 'pagos previstos', 'estimado', 'pendiente de importe', 'recurrentes', 'pagos que se repiten', 'visión 12 meses', 'préstamos', 'importar factura'],
}

export const expEconomiaPeriodos: HelpExplainer = {
  id: 'exp-economia-periodos',
  module: 'economia',
  title: 'Periodos, mes contable y mes real',
  summary: 'Todas las cifras de Economía dependen del periodo de 📅 Fecha. El mes contable empieza el día que elijas; el mes real, siempre el 1.',
  sections: [
    {
      heading: 'Qué periodos hay',
      paragraphs: [
        'Por defecto ves Hoy, Esta semana, Mes contable, Mes real, Este año y Rango de fecha (con Desde y Hasta). En Configuración → Filtros temporales puedes activar otros cinco: Mes contable anterior, Mes real anterior, Año anterior, Últimos 30 días y Últimos 3 meses, y elegir un favorito. Es solo tuyo.',
        'La tarjeta del Resumen puede decir «Este mes» aunque el botón diga «Mes contable»: es el mismo periodo.',
      ],
    },
    {
      heading: 'Mes contable y mes real',
      paragraphs: [
        'El mes real va del día 1 al último día del mes. El mes contable empieza el día que pongas en Configuración → Economía (por ejemplo el 25, si cobras entonces) y acaba el día antes de ese día del mes siguiente. Con 31, el mes empieza el último día de cada mes. Cada persona tiene su día.',
        'Los presupuestos mensuales siguen el mes contable en curso. Si el mes contable empieza el último día del mes anterior, se etiqueta con el mes siguiente.',
      ],
      example:
        'Ejemplo inventado: tu mes contable empieza el 25. El 10 de noviembre, «Mes contable» abarca del 25 de octubre al 24 de noviembre y «Mes real», del 1 al 30 de noviembre.',
    },
    {
      heading: 'Comparar periodos',
      paragraphs: [
        '«Comparado con el periodo anterior» compara con el periodo equivalente justo anterior (mes contable con mes contable, mes real con mes real) y, si el actual no ha terminado, usa el mismo tramo de días. La «Evolución temporal» muestra los últimos 6 meses con su propio selector Mes real / Mes contable.',
      ],
    },
  ],
  limits: [
    'Cambiar el día del mes contable cambia las cifras de todas las pantallas para ti, no para los demás.',
    'Los periodos de Configuración → Filtros temporales solo ocultan o muestran opciones; no borran nada.',
  ],
  ifWrong: [
    'Si una cifra no cuadra con lo que esperabas, mira qué periodo tienes elegido en «📅 Fecha» y si tu mes contable empieza otro día.',
    'Para cambiar el día, ve a Configuración → Economía → Inicio del mes contable.',
  ],
  verified: V,
  basedOn: ['src/domain/dateRanges.ts', 'src/domain/financePeriod.ts', 'src/ui/FinanceScreen.tsx', 'src/ui/MenuSettingsScreen.tsx', 'supabase/migrations/0170_date_filter_user_preferences.sql'],
  tour: 'tut-economia-mes-contable',
  go: { path: '/dinero', dest: 'economia.resumen', label: 'Llévame al Resumen' },
  labels: ['Mes contable', 'Mes real', 'Rango de fecha', 'Evolución temporal', 'Comparado con el periodo anterior'],
  cardIds: ['eco-mes-contable', 'eco-moverse'],
  synonyms: ['mes contable', 'mes real', 'dia 25', 'cobro el dia 25', 'periodo', 'filtro de fecha', 'filtros temporales', 'favorito', 'ultimos 30 dias'],
}

export const expEconomiaPresupuestos: HelpExplainer = {
  id: 'exp-economia-presupuestos',
  module: 'economia',
  title: 'Qué cuenta un presupuesto y qué no',
  summary: 'Un presupuesto compara lo gastado en su periodo con su límite. Cuenta el gasto bruto, incluye subcategorías y el General incluye los pendientes. El importe solo se cambia por voz.',
  sections: [
    {
      heading: 'Qué se descuenta',
      paragraphs: [
        'Cada presupuesto (mensual o semanal) cuenta los gastos reales de su periodo. No cuenta los traspasos entre tus cuentas. Es gasto bruto: no resta las devoluciones.',
        'Uno de una categoría padre (por ejemplo Alimentación) descuenta esa categoría y todas sus subcategorías; uno de una subcategoría, solo esa. El presupuesto «General» cuenta todo el gasto, incluidos los pendientes de clasificar, que los de categoría no cuentan.',
      ],
    },
    {
      heading: 'Qué ves',
      paragraphs: [
        'La barra de cada presupuesto muestra lo gastado frente a su límite y se pone roja si lo superas. El «Resumen» de abajo junta Ingresos, Presupuesto, Gastado y, con el filtro Mes contable y un presupuesto General, el Balance (presupuesto menos gastado).',
        'Si ya tienes un presupuesto para la misma categoría y el mismo mes, PEPA te avisa antes de duplicarlo.',
      ],
      example:
        'Ejemplo inventado: un presupuesto de 400 € para Alimentación en octubre. Un gasto de 60 € en la subcategoría Supermercado y otro de 25 € en Alimentación a secas suman 85 €: la barra marca el 21 %.',
    },
    {
      heading: 'Cambiarlos y borrarlos',
      paragraphs: [
        'Una vez creado, el importe no se edita en pantalla; se le pide a PEPA por voz. «Eliminar» (con confirmación) borra el presupuesto. «Historial» guarda los de meses anteriores.',
      ],
    },
  ],
  limits: [
    'Los ingresos del Resumen de Presupuestos pueden diferir de los del Resumen principal (ver la explicación de ingresos, gastos y ahorro).',
    'Solo hay presupuestos mensuales y semanales, y de categoría o General. No hay presupuestos anuales.',
  ],
  ifWrong: [
    'Si el límite está mal, díselo a PEPA por voz, o elimina el presupuesto y crea otro.',
    'Si no baja nada, comprueba que los gastos tengan categoría y que estén dentro del periodo del presupuesto.',
  ],
  verified: V,
  basedOn: ['src/domain/finance.ts', 'src/data/finance.ts', 'src/ui/FinanceScreen.tsx', 'src/pepa/actions/financeActions.ts'],
  tour: 'tut-economia-crear-presupuesto',
  go: { path: '/dinero', dest: 'economia.presupuesto', label: 'Llévame a Presupuestos' },
  labels: ['+ Nuevo presupuesto', 'Historial', 'Eliminar'],
  cardIds: ['eco-presupuesto'],
  synonyms: ['presupuesto', 'limite de gasto', 'cuanto llevo gastado', 'barra de progreso', 'presupuesto general', 'editar presupuesto', 'balance del presupuesto'],
}

export const expEconomiaLimites: HelpExplainer = {
  id: 'exp-economia-limites',
  module: 'economia',
  title: 'Lo que Economía hace, lo que no hace todavía y lo que está en revisión',
  summary: 'Una lista honesta: lo que ya funciona, lo que PEPA no tiene (cuentas manuales, exportar, divisas…) y lo que está hecho pero aún lo estoy revisando.',
  sections: [
    {
      heading: 'Lo que Economía no tiene',
      paragraphs: [
        'Cuentas manuales: solo hay cuentas de bancos conectados. Exportar a Excel o CSV: el informe de Presupuestos se imprime o se guarda como PDF. Conversión de divisas: movimientos y presupuestos están en euros; solo la Previsión admite otras divisas, sin convertir.',
        'Crear o editar préstamos o hipotecas: se anotan como un pago «En varios pagos». Editar el importe de un presupuesto en pantalla: solo por voz. Renombrar o reordenar categorías: solo se crean, se borran y se clasifican.',
        'Reconocer solos los traspasos entre tus cuentas, deshacer un «No es este», conciliar sola un pago previsto o avisar dentro de la app de que un permiso del banco ha caducado.',
      ],
    },
    {
      heading: 'Lo que está hecho pero lo estoy revisando',
      paragraphs: [
        'Efectivo y carteras de efectivo, pagar una compra con varios medios, devoluciones de compras y la detección de duplicados están implementados, pero aún no los he comprobado en iPhone y Android. Por eso todavía no los explico paso a paso.',
      ],
      example:
        'Ejemplo inventado: si necesitas anotar un gasto pagado en efectivo, puedes apuntarlo como un movimiento normal desde «+ Nuevo movimiento». Lo que aún no te enseño es a llevar un saldo de efectivo con carteras.',
    },
    {
      heading: 'Lo que ya funciona',
      paragraphs: [
        'Apuntar movimientos, corregir categorías, conectar bancos y sincronizar, el Resumen y las estadísticas, presupuestos con informe, y la Previsión de pagos con propuestas de conciliación. Cada una tiene su recorrido en «Enséñame».',
      ],
    },
  ],
  limits: [
    'Esta lista puede quedarse corta cuando salgan funciones nuevas: si echas algo en falta, cuéntalo en Sugerencias (Ayuda).',
  ],
  ifWrong: [
    'Si algo que aquí aparece como «no existe» lo ves en tu pantalla, o al revés, dímelo en Sugerencias (Ayuda): la lista se revisa con cada cambio.',
  ],
  verified: V,
  basedOn: ['src/ui/FinanceScreen.tsx', 'src/data/bank.ts', 'src/ui/CashAndPaymentsUi.tsx', 'src/pepa/actions/financeActions.ts', 'src/domain/forecast.ts'],
  go: { path: '/dinero', dest: 'economia.resumen', label: 'Llévame a Economía' },
  labels: ['+ Nuevo movimiento', 'Generar informe', 'Préstamos e hipotecas'],
  cardIds: ['eco-nuevo-movimiento', 'eco-banco', 'eco-prevision', 'eco-presupuesto'],
  synonyms: ['que no puede hacer economia', 'exportar excel', 'cuentas manuales', 'divisas', 'efectivo', 'cartera de efectivo', 'prestamos', 'que falta en economia', 'limitaciones'],
}

export const EXPLAINERS_ECONOMIA: HelpExplainer[] = [
  expEconomiaCategorizarMovimientos,
  expEconomiaPendienteClasificar,
  expEconomiaConciliacion,
  expEconomiaConexionBancaria,
  expEconomiaCorreccionAprende,
  expEconomiaIngresoGastoAhorro,
  expEconomiaTraspasosAnulaciones,
  expEconomiaPrevision,
  expEconomiaPeriodos,
  expEconomiaPresupuestos,
  expEconomiaLimites,
]
