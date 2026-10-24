import type { TourDef } from '@/help/tours/types'

// Economía (grupo g2). Una visita informativa y seis tutoriales «Enséñame» sobre FinanceScreen.tsx. Ningún tutorial pulsa nada por la persona. Lo que NO se automatiza a propósito:
//  - Conectar un banco, sincronizar o desconectarlo (la visita solo señala «+ Añadir cuenta» y dice que no se conecta nada por ella).
//  - «Confirmar» / «No es este» de una conciliación: el tutorial las explica y las señala, pero nunca espera que se pulsen.
//  - Borrar movimientos, presupuestos o pagos previstos.
// La parte de educación financiera de Pequeños Grandes (KidsFinanceTab) no está aquí.

export const visitaEconomia: TourDef = {
  id: 'visita-economia',
  kind: 'visit',
  module: 'economia',
  title: 'Conoce Economía',
  summary: 'Un paseo rápido por Economía: cuentas, periodo, resumen y conclusiones de Pepa.',
  version: 1,
  cardId: 'eco-nuevo-movimiento',
  durationSec: 100,
  startPath: '/dinero',
  startDest: 'economia.resumen',
  steps: [
    {
      id: 'menu',
      text: 'Esto es Economía. Con el botón ☰ Menú cambias de parte: Inicio, Estadísticas, Movimientos, Presupuesto(s), Banco y Previsión de pagos. Ahora solo miramos: no se guarda nada.',
      target: 'finance.menu',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'cuentas',
      text: 'Mis cuentas: una tarjeta por cada cuenta de banco conectada, con su saldo. Tocar una tarjeta te lleva a sus movimientos en Banco. Si aún no hay banco, solo verás «Añadir cuenta».',
      target: 'finance.accounts',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'anadir',
      text: '«Añadir cuenta» te lleva a Banco y abre la ventana para conectar un banco. Yo no conecto nada por ti: lo haces tú, en la web de tu banco, solo si quieres.',
      target: 'finance.add-account',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'config',
      text: '«⚙️ Configuración cuentas» te lleva a Configuración, donde se conectan o desconectan los bancos y se indica de quién es cada cuenta.',
      target: 'finance.accounts-settings',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'fecha',
      text: '📅 Fecha: eliges el periodo que quieres ver (hoy, esta semana, mes contable, mes real, año o un rango). Las cifras de debajo se recalculan con él.',
      target: 'finance.date-filter',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'pendientes',
      text: 'Si hay gastos sin categoría verás aquí una señal ⏳ de pendientes de clasificar. Tócala y te lleva a Movimientos para ponérsela. Cuentan en los totales aunque no tengan categoría.',
      target: 'finance.pending-signal',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'resumen',
      text: 'Resumen: ingresos, gastos y ahorro (o balance) del periodo. «Ver registros →» abre los movimientos que suman esa cifra. Los traspasos entre tus propias cuentas no cuentan como ingreso ni gasto.',
      target: 'finance.summary-card',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'conclusiones',
      text: 'Conclusiones de Pepa: una frase cada vez sobre el periodo (ritmo de gasto, categoría principal…). Cambia al deslizar o al volver a abrir. «+info →» te enseña los movimientos de esa frase.',
      target: 'finance.conclusions',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es Economía. En «Enséñame» tienes cómo apuntar un gasto, crear un presupuesto o añadir un pago previsto.',
  next: ['eco-nuevo-movimiento', 'eco-presupuesto', 'eco-prevision'],
}

// Movimientos → «+ Nuevo movimiento» → Gasto/Ingreso → «Apuntar gasto» / «Apuntar ingreso».
export const tutEconomiaApuntarMovimiento: TourDef = {
  id: 'tut-economia-apuntar-movimiento',
  module: 'economia',
  group: 'Movimientos',
  title: 'Apuntar un gasto o un ingreso',
  summary: 'Registrar a mano un gasto o un ingreso en Movimientos.',
  version: 1,
  cardId: 'eco-nuevo-movimiento',
  durationSec: 90,
  startPath: '/dinero',
  startDest: 'economia.movimientos',
  steps: [
    {
      id: 'abrir',
      text: 'Pulsa «+ Nuevo movimiento» para apuntar a mano un gasto o un ingreso. No se guarda nada hasta el último paso.',
      target: 'finance.new-movement',
      completeOn: [
        { type: 'click', target: 'finance.new-movement' },
        { type: 'appear', target: 'finance.new-movement-form' },
      ],
      skipIf: [{ type: 'appear', target: 'finance.new-movement-form' }],
    },
    {
      id: 'tipo',
      text: 'Elige si es un Gasto o un Ingreso. Los campos cambian un poco: un ingreso no lleva establecimiento.',
      target: 'finance.movement-type',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'categoria',
      text: 'Toca Categoría y elige la que mejor encaje. Ya viene una puesta de partida (la primera de tu lista): cámbiala si no es esa y pulsa «Siguiente».',
      target: 'finance.movement-category',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'fecha',
      text: 'Elige el día. Viene puesto hoy; si fue otro, cámbialo. Si ya es el correcto, pulsa «Siguiente».',
      target: 'finance.movement-date',
      completeOn: [{ type: 'confirmed', target: 'finance.movement-date' }],
      manualNext: true,
    },
    {
      id: 'importe',
      text: 'Escribe el importe en euros, por ejemplo 12,50. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'finance.movement-amount',
      completeOn: [{ type: 'entered', target: 'finance.movement-amount', min: 1 }],
      manualNext: true,
    },
    {
      id: 'opcionales',
      text: 'Opcional: Establecimiento (solo en gastos), Etiqueta y Concepto. Sirven para encontrar el movimiento después. Puedes dejarlos vacíos.',
      target: 'finance.movement-store',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Pulsa «Apuntar gasto» (o «Apuntar ingreso»). Lo pulsas tú; yo solo te lo señalo. Hasta entonces no se guarda nada.',
      target: 'finance.new-save',
      completeOn: [{ type: 'event', name: 'finance.movement-added' }],
      sensitive: true,
    },
  ],
  finishText: '¡Apuntado! Lo verás en la lista de Movimientos. Si te equivocas de categoría, toca el movimiento para editarlo.',
  next: ['eco-categorias', 'eco-pendientes', 'eco-presupuesto'],
}

// Movimientos → tocar un movimiento → Categoría → «Guardar». Solo cambia ESE movimiento (no hay memoria para el siguiente).
export const tutEconomiaCambiarCategoria: TourDef = {
  id: 'tut-economia-cambiar-categoria',
  module: 'economia',
  group: 'Movimientos',
  title: 'Cambiar la categoría de un movimiento',
  summary: 'Corregir la categoría de un gasto, por ejemplo uno que llegó del banco.',
  version: 1,
  cardId: 'eco-categorias',
  durationSec: 80,
  startPath: '/dinero',
  startDest: 'economia.movimientos',
  steps: [
    {
      id: 'fila',
      text: 'Toca un movimiento de la lista para editarlo (no el ✕ de la derecha: ese es para borrar). Si aún no tienes ninguno, pulsa «Salir» y apunta uno antes.',
      target: 'finance.movement-row',
      completeOn: [{ type: 'appear', target: 'finance.movement-category' }],
    },
    {
      id: 'categoria',
      text: 'Toca Categoría. En los movimientos del banco es una sugerencia que PEPA pone según el comercio: aquí es donde la corriges. Si es un ingreso, es una lista normal: elige y pulsa «Siguiente».',
      target: 'finance.movement-category',
      completeOn: [{ type: 'appear', target: 'finance.category-picker' }],
      manualNext: true,
    },
    {
      id: 'elegir',
      text: 'Toca la categoría correcta; las que llevan › se abren en subcategorías. Al elegir, la ventana se cierra sola y paso al siguiente.',
      target: 'finance.category-picker',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Pulsa «Guardar». Lo pulsas tú. Ojo: solo cambia ESTE movimiento. PEPA no recuerda tu corrección para el siguiente del mismo comercio.',
      target: 'finance.edit-save',
      completeOn: [{ type: 'event', name: 'finance.movement-updated' }],
      sensitive: true,
    },
  ],
  finishText: 'Hecho: ese movimiento ya tiene su nueva categoría. Los próximos del mismo comercio se clasificarán otra vez por su cuenta y puede que haya que corregirlos también.',
  next: ['eco-pendientes', 'eco-categorias', 'eco-nuevo-movimiento'],
}

// Presupuesto(s) → «+ Nuevo presupuesto» → «Crear presupuesto».
export const tutEconomiaCrearPresupuesto: TourDef = {
  id: 'tut-economia-crear-presupuesto',
  module: 'economia',
  group: 'Presupuestos',
  title: 'Crear un presupuesto',
  summary: 'Poner un límite de gasto mensual o semanal, general o por categoría.',
  version: 1,
  cardId: 'eco-presupuesto',
  durationSec: 80,
  startPath: '/dinero',
  startDest: 'economia.presupuesto',
  steps: [
    {
      id: 'abrir',
      text: 'Pulsa «+ Nuevo presupuesto». No se crea nada hasta el último paso.',
      target: 'finance.new-budget',
      completeOn: [
        { type: 'click', target: 'finance.new-budget' },
        { type: 'appear', target: 'finance.budget-form' },
      ],
      skipIf: [{ type: 'appear', target: 'finance.budget-form' }],
    },
    {
      id: 'periodo',
      text: 'Elige si el presupuesto es Mensual o Semanal. Debajo, «Empieza el» marca desde qué día cuenta (viene el mes contable en curso).',
      target: 'finance.budget-period',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'categoria',
      text: 'Elige la categoría que quieres controlar, o «General» para que cuenten todos los gastos.',
      target: 'finance.budget-category',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'importe',
      text: 'Escribe cuánto quieres gastar como máximo, en euros. Una vez creado, el importe no se edita en pantalla: si te equivocas, pídeselo a PEPA por voz. Pulsa ✓ en el teclado o «Siguiente».',
      target: 'finance.budget-amount',
      completeOn: [{ type: 'entered', target: 'finance.budget-amount', min: 1 }],
      manualNext: true,
    },
    {
      id: 'crear',
      text: 'Pulsa «Crear presupuesto». Lo pulsas tú; yo solo te lo señalo.',
      target: 'finance.budget-save',
      completeOn: [{ type: 'event', name: 'finance.budget-created' }],
      sensitive: true,
    },
  ],
  finishText: '¡Presupuesto creado! Lo verás con su barra de progreso en Presupuestos, comparado con lo que ya has gastado.',
  next: ['eco-nuevo-movimiento', 'eco-categorias'],
}

// Previsión de pagos → «+ Añadir pago» → «Crear pago previsto».
export const tutEconomiaAnadirPagoPrevisto: TourDef = {
  id: 'tut-economia-anadir-pago-previsto',
  module: 'economia',
  group: 'Previsión de pagos',
  title: 'Añadir un pago previsto',
  summary: 'Anotar un pago que sabes que llegará (seguro, IBI, cuota…).',
  version: 1,
  cardId: 'eco-prevision',
  durationSec: 110,
  startPath: '/dinero',
  startDest: 'economia.prevision',
  steps: [
    {
      id: 'abrir',
      text: 'Pulsa «+ Añadir pago» para anotar algo que sabes que llegará. No se guarda nada hasta el último paso.',
      target: 'finance.add-forecast',
      completeOn: [
        { type: 'click', target: 'finance.add-forecast' },
        { type: 'appear', target: 'finance.forecast-form' },
      ],
      skipIf: [{ type: 'appear', target: 'finance.forecast-form' }],
    },
    {
      id: 'concepto',
      text: 'Escribe qué pago es, por ejemplo «Seguro del coche» o «IBI». Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'finance.forecast-title',
      completeOn: [{ type: 'entered', target: 'finance.forecast-title', min: 2 }],
      manualNext: true,
    },
    {
      id: 'estado',
      text: 'Estado del importe: Conocido (sabes cuánto es), Estimado (más o menos) o Pendiente (aún no lo sabes). Un importe pendiente nunca se enseña como 0 €.',
      target: 'finance.forecast-amount-status',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'importe',
      text: 'Escribe el importe. Si elegiste «Pendiente», este campo no aparece y puedes seguir con «Siguiente».',
      target: 'finance.forecast-amount',
      completeOn: [{ type: 'entered', target: 'finance.forecast-amount', min: 1 }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'categoria',
      text: 'Categoría (opcional): ayuda a que, cuando el banco cobre el pago, PEPA lo clasifique igual. Puedes dejarla sin elegir.',
      target: 'finance.forecast-category',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'vencimiento',
      text: 'Elige el día de vencimiento: es obligatorio. Cuando lo hayas elegido sigo yo; si ya es el correcto, pulsa «Siguiente».',
      target: 'finance.forecast-due',
      completeOn: [{ type: 'confirmed', target: 'finance.forecast-due' }],
      manualNext: true,
    },
    {
      id: 'repeticion',
      text: '«¿Este pago volverá a repetirse cuando termine?»: márcalo si es de cada mes o cada año y elegirás la frecuencia. «¿Cómo se paga?» permite repartirlo en varios pagos.',
      target: 'finance.forecast-repeat',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Pulsa «Crear pago previsto». Lo pulsas tú. No cuenta como gasto: es un aviso de lo que vendrá, hasta que el banco lo cobre.',
      target: 'finance.forecast-save',
      completeOn: [{ type: 'event', name: 'finance.forecast-saved' }],
      sensitive: true,
    },
  ],
  finishText: '¡Pago previsto guardado! Lo verás en «Próximos pagos» y en la Visión de 12 meses.',
  next: ['eco-prevision', 'eco-banco'],
}

// Previsión de pagos → conciliación bancaria. INFORMATIVO: señala «Confirmar» y «No es este» pero jamás espera ni empuja a pulsarlos.
export const tutEconomiaRevisarConciliacion: TourDef = {
  id: 'tut-economia-revisar-conciliacion',
  module: 'economia',
  group: 'Previsión de pagos',
  title: 'Revisar una propuesta de conciliación',
  summary: 'Entender cuándo PEPA propone unir un cargo del banco con un pago previsto.',
  version: 1,
  cardId: 'eco-prevision',
  durationSec: 90,
  startPath: '/dinero',
  startDest: 'economia.prevision',
  steps: [
    {
      id: 'abrir',
      text: 'Si PEPA ve un cargo del banco que parece uno de tus pagos previstos, aparece «🔎 N pagos por revisar». Tócalo para abrirlo. Si no lo ves, ahora no hay nada que revisar.',
      target: 'finance.reconcile-toggle',
      completeOn: [
        { type: 'click', target: 'finance.reconcile-toggle' },
        { type: 'appear', target: 'finance.reconcile-card' },
      ],
      skipIf: [{ type: 'appear', target: 'finance.reconcile-card' }],
    },
    {
      id: 'tarjeta',
      text: 'A un lado, lo Previsto; al otro, el movimiento del Banco; debajo, por qué los une (misma cuenta, mismo importe, mismo día…). Es solo una propuesta: PEPA nunca concilia sola.',
      target: 'finance.reconcile-card',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'confirmar',
      text: 'Si es el mismo pago, «Confirmar» los une: el cargo queda como cobrado y toma la categoría del pago previsto. Yo no lo pulso por ti: lo decides tú.',
      target: 'finance.reconcile-confirm',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'descartar',
      text: 'Si no es el mismo, «No es este»: PEPA no volverá a proponer esa pareja. Tampoco lo pulso yo.',
      target: 'finance.reconcile-dismiss',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Ya sabes revisarlas. Si te equivocas al confirmar, en el pago conciliado verás «Desconciliar» para deshacer la unión.',
  next: ['eco-prevision', 'eco-banco'],
}

// Estadísticas → fecha, vistas y gráfica. Solo mira: no cambia nada.
export const tutEconomiaVerEstadisticas: TourDef = {
  id: 'tut-economia-ver-estadisticas',
  module: 'economia',
  group: 'Estadísticas',
  title: 'Ver las estadísticas',
  summary: 'Mirar en qué se va el dinero, por categorías, etiquetas o tipo de gasto.',
  version: 1,
  cardId: 'eco-categorias',
  durationSec: 70,
  startPath: '/dinero',
  startDest: 'economia.estadisticas',
  steps: [
    {
      id: 'fecha',
      text: 'Elige el periodo con 📅 Fecha. Todas las gráficas de esta pantalla se recalculan con él.',
      target: 'finance.date-filter',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'vistas',
      text: 'Cambia la forma de verlo: Categorías, Etiquetas, Debo/Necesito/Quiero o Fijo/variable. Prueba tocando una; el total es siempre el mismo.',
      target: 'finance.stats-views',
      completeOn: [{ type: 'click', target: 'finance.stats-views' }],
      manualNext: true,
    },
    {
      id: 'grafica',
      text: 'Aquí se reparte el gasto del periodo. Toca una porción para ver su importe y, con «Ver movimientos →», los movimientos que la forman. «✕ Ver todo» vuelve a la vista general.',
      target: 'finance.stats-card',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Listo. Debajo de la gráfica tienes también la comparación con el periodo anterior y la evolución en el tiempo.',
  next: ['eco-nuevo-movimiento', 'eco-presupuesto'],
}

export const TOURS_ECONOMIA: TourDef[] = [
  visitaEconomia,
  tutEconomiaApuntarMovimiento,
  tutEconomiaCambiarCategoria,
  tutEconomiaCrearPresupuesto,
  tutEconomiaAnadirPagoPrevisto,
  tutEconomiaRevisarConciliacion,
  tutEconomiaVerEstadisticas,
]
