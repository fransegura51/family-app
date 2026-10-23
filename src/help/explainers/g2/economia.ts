import type { HelpExplainer } from '@/help/explainers/types'

// «Cómo funciona PEPA» de Economía (grupo g2). Cada afirmación se ha contrastado con el código el 2026-10-23; si cambian los archivos de `basedOn`, hay que revisar el texto.
const V = '2026-10-23'

export const expEconomiaCategorizarMovimientos: HelpExplainer = {
  id: 'exp-economia-categorizar-movimientos',
  module: 'economia',
  title: 'Cómo categoriza Economía los movimientos',
  summary: 'Cada movimiento recibe su categoría de una forma distinta según de dónde venga: la eliges tú, la sugieren unas reglas fijas por comercio, o la lleva el ticket.',
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
        'La eliges tú. Al abrir «+ Nuevo movimiento», el formulario ya trae puesta la primera categoría de tu lista (no queda «pendiente»), así que conviene mirarla antes de guardar. Los ingresos eligen entre las categorías de ingresos.',
      ],
    },
    {
      heading: 'Del banco: reglas fijas, sin IA',
      paragraphs: [
        'Al sincronizar, PEPA limpia el nombre del comercio (quita partes como «COMPRA TARJ.», «ADEUDO» o «RECIBO») y lo compara con una lista corta de 17 reglas de comercios habituales (supermercados, farmacias, combustible, restaurantes, seguros…). Gana la primera regla cuya palabra clave aparezca en el nombre, y solo vale si tu familia tiene una categoría con ese nombre exacto. Si no, el gasto va a «Otros».',
        'No mira el importe, la fecha ni la cuenta. Los ingresos entran como «Ingreso», salvo las anulaciones y reversiones de comisión («Cobro anulado») y los abonos que empiezan por «DEVOLUCION» («Devoluciones»).',
      ],
      example:
        'Ejemplo inventado: «COMPRA TARJ. 1234 MERCADONA CENTRO» queda como «MERCADONA CENTRO», contiene «mercadona» y va a Supermercado, carnicería y tiendas de alimentación. «COMPRA TARJ. 1234 EJEMPLO FOTOS S.L.» no encaja con ninguna regla y va a «Otros».',
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
    'Las reglas del banco son una suposición, no una certeza: por eso la pantalla dice que la categoría de los movimientos importados «se asigna por sugerencia».',
    'Solo reconocen los comercios de la lista. El resto cae en «Otros».',
    'Cuando varias reglas podrían valer, gana la primera de la lista: «UBER EATS» contiene «uber», que está en la regla de transporte antes que la de restaurantes, y se queda en transporte.',
    'En el código del banco no hay ninguna regla que reconozca los traspasos entre tus propias cuentas: si aparece uno como gasto o ingreso, hay que ponerle a mano la categoría de traspasos.',
    'Corregir una categoría no enseña a PEPA para el siguiente movimiento (hay otra explicación sobre eso).',
  ],
  ifWrong: [
    'Toca el movimiento, cambia la Categoría y pulsa «Guardar». Si el gasto viene de un ticket, se cambian a la vez el gasto y el ticket.',
    'Que una categoría sugerida no encaje es una limitación normal de las reglas. Si el cambio da un error al guardar y se repite, ya es un fallo técnico: cuéntalo en Sugerencias (Ayuda).',
  ],
  verified: V,
  basedOn: [
    'supabase/functions/enable-banking-sync-transactions/index.ts',
    'supabase/functions/amazon-order-webhook/index.ts',
    'src/domain/movementForm.ts',
    'src/data/receipts.ts',
    'src/ui/FinanceScreen.tsx',
  ],
  tour: 'tut-economia-cambiar-categoria',
  go: { path: '/dinero', dest: 'economia.movimientos', label: 'Llévame a Movimientos' },
  labels: ['+ Nuevo movimiento', 'Apuntado a mano', 'Importado de un ticket', 'Importado del banco', 'La categoría de los movimientos importados del banco se asigna por sugerencia'],
  cardIds: ['eco-nuevo-movimiento', 'eco-categorias', 'eco-banco'],
  synonyms: ['categoria automatica', 'por que categoriza asi', 'categoria del banco', 'sugerencia de categoria', 'otros', 'como categoriza', 'movimientos del banco categoria', 'categorizar gastos'],
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
        'PEPA prefiere dejar un gasto sin categoría antes que fingir una certeza que no tiene. Hasta donde he podido ver en el código, hoy el caso real son los pedidos de Amazon que llegan por correo: pueden mezclar comida, ropa, electrónica… así que entran sin categoría.',
        'Los movimientos del banco no se quedan pendientes: sin pista caen en «Otros». Y los apuntados a mano llevan la categoría que eliges.',
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
        'Toca el movimiento, elige la categoría y pulsa «Guardar». Si tiene ticket, se cambian a la vez el gasto y el ticket en una sola operación. Si el gasto y su ticket tuvieran categorías distintas, PEPA te avisa y no cambia nada.',
      ],
    },
  ],
  limits: [
    'Mientras esté pendiente, ese gasto no aparece en el reparto por categorías ni consume presupuestos de categoría, aunque sí suma en el total.',
    'PEPA no te lo recuerda con avisos ni te bloquea nada: solo está la señal discreta.',
    'No es lo mismo que un «producto sin clasificar» de Compras: aquello es la clase de un producto; esto es la categoría de un gasto.',
  ],
  ifWrong: [
    'Ponle la categoría desde el movimiento. Si no ves la señal pero crees que hay pendientes, usa el filtro «Pendientes» de Movimientos.',
    'Si al guardar sale «No se ha podido clasificar ahora mismo» es un fallo temporal y no se ha cambiado nada: inténtalo de nuevo. Si se repite siempre, cuéntalo en Sugerencias (Ayuda).',
  ],
  verified: V,
  basedOn: [
    'src/domain/pending.ts',
    'src/domain/classifyPurchase.ts',
    'src/data/classifyPurchase.ts',
    'supabase/migrations/0149_category_nullable_pending.sql',
    'supabase/functions/amazon-order-webhook/index.ts',
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
        'Al sincronizar, para cada cargo nuevo PEPA busca un gasto tuyo (apuntado a mano o de un ticket) con el mismo importe (menos de 1 céntimo de diferencia), a ±7 días y que no esté ya unido a otro movimiento. Si hay varios, elige el de fecha más cercana. Si lo encuentra, no crea otro gasto: une el cargo a ese.',
        'Al subir un ticket pasa al revés: busca el gasto que el banco ya trajo, con el mismo criterio. Los ingresos no se concilian así.',
      ],
    },
    {
      heading: 'B) Banco con pago previsto: PEPA propone, tú confirmas',
      paragraphs: [
        'En Previsión de pagos, «🔎 N pagos por revisar» abre las propuestas. Solo se comparan cargos (no ingresos) ya convertidos en gasto, en la misma divisa, dentro de ±3 días de la fecha prevista, y de la misma cuenta si el pago tiene una asignada.',
        'Cada candidato puntúa por misma cuenta, importe igual (o parecido, hasta un 15 % de diferencia), mismo día, una palabra en común y categoría coincidente. Si el importe y la categoría chocan a la vez, se descarta. Es una cuenta determinista: no hay IA.',
        'La tarjeta enseña lo Previsto y lo del Banco con los motivos. Si está muy claro dice «PEPA ha encontrado un posible cargo»; si hay dudas, «Puede que sea este cargo — revísalo».',
      ],
    },
    {
      heading: 'Qué pasa al confirmar o desconciliar',
      paragraphs: [
        '«Confirmar» une el cargo con el pago (queda «✓ Cobrado») y, si el pago previsto tiene categoría, el movimiento del banco pasa a tener esa categoría, sustituyendo la que tuviera. Si por algún motivo no se puede aplicar, se abre «Gestionar movimiento» para que decidas tú.',
        '«Desconciliar» solo quita la unión: el movimiento se queda con la categoría que tiene en ese momento, no se le devuelve la anterior.',
        '«No es este» guarda el descarte y esa pareja no se vuelve a proponer. No he visto en la pantalla un botón para deshacer un descarte.',
      ],
      example:
        'Ejemplo inventado: tienes «Seguro del coche» previsto el 5 de mayo por 300,00 € en la cuenta principal. El 6 de mayo el banco cobra 300,00 € a «EJEMPLO SEGUROS S.A.» en esa cuenta. PEPA los propone (misma cuenta, mismo importe, un día de diferencia). Tú pulsas «Confirmar» y el cargo queda como cobrado con la categoría Seguros.',
    },
  ],
  limits: [
    'En A solo une si el importe es casi idéntico: una propina o un redondeo impide la unión. Con dos compras del mismo importe en 7 días puede unir la que no era.',
    'Si el apunte ya estaba unido a otro movimiento, el cargo crea un gasto nuevo y puede quedar un duplicado que hay que revisar.',
    'En B no se proponen ingresos ni cargos fuera de los ±3 días, y solo hay una propuesta por pago. No he visto una forma de unir a mano un cargo que PEPA no propone.',
    'PEPA nunca confirma por su cuenta una conciliación con un pago previsto.',
  ],
  ifWrong: [
    'Propuesta que no es: «No es este». Ya confirmada por error: «Desconciliar» en ese pago (y revisa la categoría del movimiento, que no se restaura sola).',
    'Un ticket o apunte unido al gasto equivocado, o un duplicado: no hay un botón para separarlos. Cuéntalo en Sugerencias (Ayuda) con la tienda, la fecha y el importe.',
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
        'En Mis cuentas, «Añadir cuenta» te lleva a Banco (también está en Configuración → Gestionar cuentas). Ahí, «+ Conectar banco»: eliges país y banco, si quieres el IBAN, y pulsas «Conectar». PEPA te lleva a tu banco para que autorices. Tus claves las pones en el banco: en PEPA no hay ningún campo para ellas.',
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
    'El saldo se pide aparte; si un banco no lo entrega, la tarjeta puede quedarse en «Sincronizando…».',
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
  go: { path: '/dinero', dest: 'economia.banco', label: 'Llévame a Banco' },
  labels: ['+ Conectar banco', '🔄 Sincronizar movimientos', 'Desconectar', 'Traer al menos: últimos 3 meses', 'Añadir cuenta'],
  cardIds: ['eco-banco'],
  synonyms: ['conectar banco', 'sincronizar banco', 'banco caducado', '90 dias', 'renovar conexion', 'psd2', 'open banking', 'no se sincroniza', 'movimientos del banco', 'desconectar banco', 'iban'],
}

export const expEconomiaCorreccionNoAprende: HelpExplainer = {
  id: 'exp-economia-correccion-no-aprende',
  module: 'economia',
  title: 'Por qué corregir una categoría no enseña a PEPA para el siguiente movimiento',
  summary: 'Cuando corriges una categoría en Economía, cambia solo ese movimiento. PEPA no guarda ninguna regla nueva, así que el siguiente del mismo comercio vuelve a clasificarse como siempre.',
  sections: [
    {
      heading: 'Qué pasa cuando corriges',
      paragraphs: [
        'Al pulsar «Guardar», se cambia la categoría de ese movimiento y, si tiene ticket, también la del ticket, a la vez. Nada más: no se crea ninguna regla ni se apunta que «este comercio va en esta categoría».',
      ],
    },
    {
      heading: 'Por qué no aprende',
      paragraphs: [
        'Las categorías del banco las pone un conjunto de reglas fijas por palabras, que viven en el servidor de PEPA y solo cambia el equipo de PEPA al actualizar la app. No hay ninguna lista de reglas aprendidas de tus correcciones. Por eso el siguiente cargo del mismo comercio pasa otra vez por las mismas reglas.',
      ],
      example:
        'Ejemplo inventado: llega «EJEMPLO FOTOS S.L.» y las reglas no lo conocen, así que va a «Otros». Tú lo cambias a «Casa y jardín». Al mes siguiente llega otro «EJEMPLO FOTOS S.L.»: vuelve a entrar en «Otros» y habrá que corregirlo otra vez.',
    },
    {
      heading: 'Qué sí se recuerda (no lo confundas)',
      paragraphs: [
        'En Compras, la clase de un producto que eliges tú sí se recuerda para ese producto (es otra cosa, con su propia explicación).',
        'En Previsión de pagos, al confirmar un cargo con un pago previsto, el movimiento toma la categoría del pago. Así los recibos fijos (seguro, cuota, alquiler) quedan bien sin corregirlos cada mes.',
      ],
    },
  ],
  limits: [
    'No existe una opción «recordar para los próximos»: es una limitación actual, no un fallo. Lo dice la propia pantalla de Movimientos al hablar de «sugerencia».',
    'Cada corrección vale solo para el movimiento que editas.',
  ],
  ifWrong: [
    'Corrige tocando el movimiento y cambiando la Categoría. Para pagos que se repiten, anótalos en Previsión de pagos con su categoría y concílialos.',
    'Si echas de menos que PEPA aprenda de tus correcciones, cuéntalo en Sugerencias (Ayuda): así el equipo sabe que hace falta.',
  ],
  verified: V,
  basedOn: [
    'src/ui/FinanceScreen.tsx',
    'src/data/classifyPurchase.ts',
    'supabase/functions/enable-banking-sync-transactions/index.ts',
    'supabase/migrations/0173_forecast_reconciliation_category_inherit.sql',
  ],
  tour: 'tut-economia-cambiar-categoria',
  go: { path: '/dinero', dest: 'economia.movimientos', label: 'Llévame a Movimientos' },
  labels: ['Guardar', 'La categoría de los movimientos importados del banco se asigna por sugerencia'],
  cardIds: ['eco-categorias', 'eco-pendientes'],
  synonyms: ['no aprende', 'recordar categoria', 'siempre me lo pone mal', 'corregir categoria otra vez', 'por que vuelve a salir mal', 'aprende de mis correcciones', 'regla de categoria', 'categoria del siguiente'],
}

export const EXPLAINERS_ECONOMIA: HelpExplainer[] = [
  expEconomiaCategorizarMovimientos,
  expEconomiaPendienteClasificar,
  expEconomiaConciliacion,
  expEconomiaConexionBancaria,
  expEconomiaCorreccionNoAprende,
]
