import type { TourDef } from '@/help/tours/types'

// Economía (grupo g2). Una visita informativa y los capítulos de cinco series «Enséñame» sobre FinanceScreen.tsx:
//  · ser-economia-moverte  → tut-economia-menu-pestanas, tut-economia-cuentas-resumen, tut-economia-periodo-fecha, tut-economia-ver-pendientes
//  · ser-economia-apuntar  → tut-economia-apuntar-movimiento, tut-economia-cambiar-categoria (encontrar y corregir), tut-economia-categorias-etiquetas (defs/g9/economia.ts)
//  · ser-economia-cuentas  → tut-economia-conectar-banco, tut-economia-sincronizar (defs/g9/economia.ts), tut-economia-modo-cuentas (defs/g10/ajustes.ts)
//  · ser-economia-pagos    → tut-economia-anadir-pago-previsto, tut-economia-ver-prevision, tut-economia-revisar-conciliacion
//  · ser-economia-numeros  → tut-economia-mes-contable (defs/g10/ajustes.ts), tut-economia-filtros-temporales (defs/g9/economia.ts), tut-economia-ver-estadisticas, tut-economia-crear-presupuesto, tut-economia-informe
// Ningún capítulo pulsa nada por la persona. Lo que NO se automatiza a propósito:
//  - Conectar un banco, sincronizar o desconectarlo (solo se señalan y se explican).
//  - «Confirmar» / «No es este» de una conciliación: se explican y se señalan, pero nunca se espera que se pulsen.
//  - Borrar movimientos, presupuestos o pagos previstos.
// Lo que existe pero está pendiente de validación en iPhone y Android (Efectivo/carteras, pagos con varios medios, devoluciones y duplicados) NO tiene capítulo: ver planned/b.ts.
// La parte de educación financiera de Pequeños Grandes (KidsFinanceTab) no está aquí.

export const visitaEconomia: TourDef = {
  id: 'visita-economia',
  kind: 'visit',
  module: 'economia',
  title: 'Conoce Economía',
  summary: 'Un paseo rápido por Economía: cuentas, periodo, resumen y conclusiones de Pepa.',
  version: 2,
  cardId: 'eco-nuevo-movimiento',
  durationSec: 100,
  startPath: '/dinero',
  startDest: 'economia.resumen',
  steps: [
    {
      id: 'menu',
      text: 'Esto es Economía. Con el botón ☰ Menú cambias de parte: Inicio (el Resumen), Estadísticas, Movimientos, Presupuesto(s), Banco y Previsión de pagos. Con «📌 Sacar» pones un acceso como botón en pantalla. Ahora solo miramos.',
      target: 'finance.menu',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'cuentas',
      text: 'Mis cuentas: una tarjeta por cada cuenta de banco conectada, con su saldo (un candado 🔒 si es de otra persona y las cuentas son separadas). Tocar una te lleva a sus movimientos en Banco. Si aún no hay banco, solo verás «Añadir cuenta».',
      target: 'finance.accounts',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'anadir',
      text: '«Añadir cuenta» te lleva a Banco, donde se conecta un banco; si ya estás en Banco, se abre la ventana. Yo no conecto nada por ti: lo haces tú, en la web de tu banco, solo si quieres.',
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
      text: '📅 Fecha: eliges el periodo que quieres ver. Por defecto: Hoy, Esta semana, Mes contable, Mes real, Este año o un Rango de fecha. En Configuración → Filtros temporales puedes activar más. Las cifras de debajo se recalculan.',
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
      text: 'Resumen: ingresos, gastos y ahorro (o balance) del periodo. «Ver registros →» abre los movimientos que suman esa cifra. Los traspasos entre tus cuentas no cuentan; con devoluciones, verás también el gasto neto.',
      target: 'finance.summary-card',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'conclusiones',
      text: 'Conclusiones de Pepa: una frase cada vez sobre el periodo (ritmo de gasto, categoría principal…). Cambia al deslizar con el dedo o al volver a abrir. «+info →» te enseña los movimientos de esa frase.',
      target: 'finance.conclusions',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es Economía. En «Enséñame» tienes cómo moverte, apuntar movimientos, conectar cuentas, pagos previstos y entender tus números.',
  next: ['eco-moverse', 'eco-nuevo-movimiento', 'eco-presupuesto'],
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Serie «Moverte por Economía»
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export const tutEconomiaMenuPestanas: TourDef = {
  id: 'tut-economia-menu-pestanas',
  module: 'economia',
  group: 'Moverte',
  title: 'Cambiar de sección con el menú ☰',
  summary: 'Abrir el menú de Economía, ver sus seis secciones y sacar un acceso a la pantalla.',
  version: 1,
  cardId: 'eco-moverse',
  durationSec: 70,
  startPath: '/dinero',
  startDest: 'economia.resumen',
  steps: [
    {
      id: 'abrir',
      text: 'Pulsa el botón ☰ Menú, arriba. Es la forma de cambiar de sección dentro de Economía. Solo miramos: no se guarda nada.',
      target: 'finance.menu',
      completeOn: [
        { type: 'click', target: 'finance.menu' },
        { type: 'appear', target: 'finance.menu-panel' },
      ],
      skipIf: [{ type: 'appear', target: 'finance.menu-panel' }],
    },
    {
      id: 'secciones',
      text: 'Estas son las secciones: Inicio (el Resumen), Estadísticas, Movimientos, Presupuesto(s), Banco y Previsión de pagos. Tocar una te lleva a ella y cierra el menú.',
      target: 'finance.menu-panel',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'sacar',
      text: '«📌 Sacar» pone ese acceso como botón en la pantalla de Economía, para llegar sin abrir el menú; «📍 Quitar» lo retira. Se guarda solo en este dispositivo.',
      target: 'finance.menu-pin',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'cerrar',
      text: 'Para cerrar el menú, toca otra vez ☰ o elige una sección. Siempre ves debajo «Mis cuentas», sea cual sea la sección.',
      target: 'finance.menu',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Las seis secciones tienen su propio recorrido en «Enséñame».',
  next: ['eco-moverse', 'eco-nuevo-movimiento'],
}

export const tutEconomiaCuentasResumen: TourDef = {
  id: 'tut-economia-cuentas-resumen',
  module: 'economia',
  group: 'Moverte',
  title: 'Leer Mis cuentas, el Resumen y las conclusiones',
  summary: 'Qué dice cada cifra de Inicio y cómo llegar a los movimientos que la forman.',
  version: 1,
  cardId: 'eco-moverse',
  durationSec: 80,
  startPath: '/dinero',
  startDest: 'economia.resumen',
  readyOn: ['finance.summary-card'],
  steps: [
    {
      id: 'cuentas',
      text: 'En «Mis cuentas», cada tarjeta es una cuenta con su saldo. «Sincronizando…» es que aún no ha llegado el saldo, y 🔒 es una cuenta de otra persona (cuentas separadas). El › de arriba abre Banco.',
      target: 'finance.accounts',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'resumen',
      text: 'El Resumen del periodo: Ingresos, Gastos y Ahorro (o Balance) con su Tasa de ahorro. Si hubo devoluciones, salen aparte y el Gasto neto las resta. Los traspasos entre tus cuentas no cuentan.',
      target: 'finance.summary-card',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'registros',
      text: 'Cada «Ver registros →» abre Movimientos solo con lo que suma esa cifra. Allí, «‹ Volver» te devuelve y «✕ Quitar filtro» lo quita. Así compruebas de dónde sale cada número.',
      target: 'finance.summary-card',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'conclusiones',
      text: 'Las conclusiones de Pepa son frases sobre el periodo. Se cambian deslizando con el dedo o al volver a abrir la pantalla. «+info →» enseña los movimientos de esa frase, y a veces hay un 💡 que la explica.',
      target: 'finance.conclusions',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Si algo del Resumen no cuadra con lo que esperabas, mira «Cómo funciona PEPA»: qué cuenta como ingreso, gasto y ahorro.',
  next: ['eco-moverse', 'eco-nuevo-movimiento'],
}

export const tutEconomiaPeriodoFecha: TourDef = {
  id: 'tut-economia-periodo-fecha',
  module: 'economia',
  group: 'Moverte',
  title: 'Elegir el periodo con 📅 Fecha',
  summary: 'Cambiar el periodo que miras en Economía y saber qué opciones hay.',
  version: 1,
  cardId: 'eco-moverse',
  durationSec: 60,
  startPath: '/dinero',
  startDest: 'economia.resumen',
  readyOn: ['finance.summary-card'],
  steps: [
    {
      id: 'fecha',
      text: 'Pulsa «📅 Fecha» para abrir las opciones de periodo. Cambiar el periodo solo cambia lo que miras: no modifica ningún dato.',
      target: 'finance.date-filter',
      completeOn: [{ type: 'appear', target: 'finance.date-panel' }],
      skipIf: [{ type: 'appear', target: 'finance.date-panel' }],
    },
    {
      id: 'opciones',
      text: 'Por defecto verás: Hoy, Esta semana, Mes contable, Mes real, Este año y Rango de fecha (con Desde y Hasta). Elige uno y las cifras de debajo se recalculan. Luego pulsa «Siguiente».',
      target: 'finance.date-panel',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'titulo',
      text: 'El título de la tarjeta, «Resumen — …», dice qué periodo estás viendo. Cada pantalla de Economía (y Compras) tiene su propio «📅 Fecha».',
      target: 'finance.summary-card',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'mas',
      text: 'En Configuración → Filtros temporales puedes activar otros periodos (Mes contable anterior, Mes real anterior, Año anterior, Últimos 30 días, Últimos 3 meses) y elegir un favorito.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Qué es el mes contable y cómo cambiar su día, en «Entender tus números».',
  next: ['eco-moverse', 'eco-mes-contable'],
}

export const tutEconomiaVerPendientes: TourDef = {
  id: 'tut-economia-ver-pendientes',
  module: 'economia',
  group: 'Moverte',
  title: 'Ver los gastos pendientes de clasificar',
  summary: 'Dónde se avisa de los gastos sin categoría y cómo llegar a ellos.',
  version: 1,
  cardId: 'eco-pendientes',
  durationSec: 60,
  startPath: '/dinero',
  startDest: 'economia.resumen',
  readyOn: ['finance.summary-card'],
  needs: [{ target: 'finance.pending-signal', message: 'Ahora mismo no tienes gastos pendientes de clasificar, así que no sale la señal ⏳. Puedo enseñártelo solo leyendo.' }],
  steps: [
    {
      id: 'senal',
      text: 'Si hay gastos sin categoría, sale esta señal con cuántos son y su total. Cuentan en los totales aunque no tengan categoría. Tócala: te llevo a Movimientos con el filtro «Pendientes» (no cambia nada).',
      target: 'finance.pending-signal',
      completeOn: [{ type: 'appear', target: 'finance.movements-filter-card' }],
      manualNext: true,
    },
    {
      id: 'filtro',
      text: 'Aquí ves solo los pendientes. «‹ Volver» te lleva de vuelta y «✕ Quitar filtro» los muestra todos. En la lista, cada uno lleva ⏳ Pendiente de clasificar.',
      target: 'finance.movements-filter-card',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'siguiente',
      text: 'Para ponerles categoría, mira «Encontrar y corregir un movimiento». Por qué algunos quedan pendientes, en «Cómo funciona PEPA».',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Un gasto pendiente ya cuenta en los totales: clasificarlo solo cambia a qué categoría pertenece.',
  next: ['eco-pendientes', 'eco-categorias'],
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Serie «Registrar ingresos y gastos»
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// Movimientos → «+ Nuevo movimiento» → Gasto/Ingreso → «Apuntar gasto» / «Apuntar ingreso».
export const tutEconomiaApuntarMovimiento: TourDef = {
  id: 'tut-economia-apuntar-movimiento',
  module: 'economia',
  group: 'Registrar',
  title: 'Apuntar un gasto o un ingreso',
  summary: 'Registrar a mano un gasto o un ingreso en Movimientos.',
  version: 2,
  cardId: 'eco-nuevo-movimiento',
  durationSec: 110,
  startPath: '/dinero',
  startDest: 'economia.movimientos',
  readyOn: ['finance.movements-total'],
  needs: [{ target: 'finance.new-movement', message: 'El botón «+ Nuevo movimiento» solo sale sin filtro activo. Pulsa «✕ Quitar filtro» y vuelve a empezar, o míralo ahora solo leyendo.' }],
  steps: [
    {
      id: 'abrir',
      text: 'Pulsa «+ Nuevo movimiento» para apuntar a mano un gasto o un ingreso. Se guarda de verdad en el último paso; si solo practicas, cierra con la ✕ o pulsa «Salir».',
      target: 'finance.new-movement',
      completeOn: [
        { type: 'click', target: 'finance.new-movement' },
        { type: 'appear', target: 'finance.new-movement-form' },
      ],
      skipIf: [{ type: 'appear', target: 'finance.new-movement-form' }],
    },
    {
      id: 'tipo',
      text: 'Elige si es un Gasto o un Ingreso. Los campos cambian un poco: un ingreso no lleva establecimiento ni Fijo/Variable.',
      target: 'finance.movement-type',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'categoria',
      text: 'Toca Categoría y elige la que mejor encaje. Ya viene una puesta de partida: revísala y cámbiala si no es esa. Cuando esté, pulsa «Siguiente».',
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
      native: true,
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
      text: 'Opcional: Etiqueta y Concepto (una anotación tuya) sirven para encontrarlo después. En un gasto también hay Establecimiento. Puedes dejarlos vacíos.',
      target: 'finance.movement-tag',
      keepVisible: ['finance.movement-notes'],
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'fijo',
      text: 'En un gasto, «Según categoría / Fijo / Variable» dice si se repite cada periodo (fijo) o depende del consumo (variable). Lo normal es dejar «Según categoría».',
      target: 'finance.movement-fixed',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'pago',
      text: 'Aquí no se elige la forma de pago (efectivo, tarjeta…). Eso se hace al registrar una compra, en Compras → Tickets.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Pulsa «Apuntar gasto» (o «Apuntar ingreso»). Lo pulsas tú; yo solo te lo señalo. Hasta entonces no se guarda nada. Si solo practicabas, pulsa «Salir».',
      target: 'finance.new-save',
      completeOn: [{ type: 'event', name: 'finance.movement-added' }],
      sensitive: true,
    },
  ],
  finishText: '¡Apuntado! Lo verás en la lista de Movimientos. Si te equivocas, toca el movimiento para editarlo.',
  next: ['eco-categorias', 'eco-pendientes', 'eco-presupuesto'],
}

// Movimientos → encontrar un movimiento (filtros) → tocarlo → Categoría → «Guardar». Fusiona «cambiar categoría» y «clasificar pendientes». Solo cambia ESE movimiento.
export const tutEconomiaCambiarCategoria: TourDef = {
  id: 'tut-economia-cambiar-categoria',
  module: 'economia',
  group: 'Registrar',
  title: 'Encontrar y corregir un movimiento',
  summary: 'Filtrar los movimientos, abrir uno y cambiarle la categoría (también los pendientes de clasificar).',
  version: 2,
  cardId: 'eco-categorias',
  durationSec: 100,
  startPath: '/dinero',
  startDest: 'economia.movimientos',
  readyOn: ['finance.movements-total'],
  needs: [{ target: 'finance.movement-row', message: 'Para practicar necesitas al menos un movimiento en la lista (con el filtro y el periodo que tengas ahora). Apunta uno o cambia el periodo, o míralo ahora solo leyendo.' }],
  steps: [
    {
      id: 'filtro',
      text: '«Filtrar por» te ayuda a encontrarlo: Todos, Gastos fijos, Gastos variables, Ingresos, Devoluciones, Categoría, Búsqueda libre o Pendientes (sin categoría). Úsalo si quieres y pulsa «Siguiente».',
      target: 'finance.movements-filter',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'fila',
      text: 'Toca un movimiento para editarlo. A su derecha hay iconos: ✕ lo borra (dos toques) y, con cuentas separadas, 🤝 lo copia a Común. No los pulses ahora: toca el resto de la fila.',
      target: 'finance.movement-row',
      completeOn: [{ type: 'appear', target: 'finance.movement-category' }],
    },
    {
      id: 'categoria',
      text: 'Toca Categoría. En los movimientos del banco es una sugerencia que PEPA pone según el comercio: aquí la corriges. Si es un ingreso, es una lista normal: elige y pulsa «Siguiente».',
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
      text: 'Pulsa «Guardar»: se guarda de verdad y lo pulsas tú. Cambia solo ESTE movimiento (y su ticket, si tiene). Si solo mirabas, pulsa «Cancelar» o «Salir».',
      target: 'finance.edit-save',
      completeOn: [{ type: 'event', name: 'finance.movement-updated' }],
      sensitive: true,
    },
  ],
  finishText: 'Hecho: ese movimiento ya tiene su nueva categoría. Por qué los siguientes no la heredan, en «Cómo funciona PEPA».',
  next: ['eco-pendientes', 'eco-categorias', 'eco-nuevo-movimiento'],
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Serie «Pagos previstos y conciliación»
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// Previsión de pagos → «+ Añadir pago» → «Crear pago previsto».
export const tutEconomiaAnadirPagoPrevisto: TourDef = {
  id: 'tut-economia-anadir-pago-previsto',
  module: 'economia',
  group: 'Pagos previstos',
  title: 'Añadir un pago previsto',
  summary: 'Anotar un pago que sabes que llegará (seguro, IBI, cuota…), con su importe y su repetición.',
  version: 2,
  cardId: 'eco-prevision',
  durationSec: 115,
  startPath: '/dinero',
  startDest: 'economia.prevision',
  steps: [
    {
      id: 'abrir',
      text: 'Pulsa «+ Añadir pago» para anotar algo que sabes que llegará. Se guarda de verdad en el último paso; si solo practicas, cierra con la ✕ o pulsa «Salir».',
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
      text: 'Estado del importe: Conocido (sabes cuánto es), Estimado (más o menos; exige explicar en qué te basas) o Pendiente (aún no lo sabes). Un importe pendiente nunca se enseña como 0 €.',
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
      id: 'base',
      text: 'Con «Estimado», este campo es obligatorio: ¿En qué se basa? (por ejemplo, «recibo del año pasado»). Sin él no podrás crear el pago.',
      target: 'finance.forecast-amount-basis',
      completeOn: [],
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
      native: true,
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
      text: 'Pulsa «Crear pago previsto». Lo pulsas tú. No cuenta como gasto: es un aviso de lo que vendrá, hasta que el banco lo cobre. Si solo practicabas, pulsa «Salir».',
      target: 'finance.forecast-save',
      completeOn: [{ type: 'event', name: 'finance.forecast-saved' }],
      sensitive: true,
    },
  ],
  finishText: '¡Pago previsto guardado! Lo verás en «Próximos pagos» y en la Visión de 12 meses.',
  next: ['eco-prevision', 'eco-banco'],
}

// Previsión de pagos → mirar lo que viene. Solo mira (editar, desactivar o eliminar son de la persona).
export const tutEconomiaVerPrevision: TourDef = {
  id: 'tut-economia-ver-prevision',
  module: 'economia',
  group: 'Pagos previstos',
  title: 'Mirar lo que viene',
  summary: 'Leer la Visión de 12 meses, los próximos pagos, el menú ⋯ de cada pago y los pagos recurrentes que detecta PEPA.',
  version: 1,
  cardId: 'eco-prevision',
  durationSec: 100,
  startPath: '/dinero',
  startDest: 'economia.prevision',
  needs: [{ target: 'finance.forecast-year', message: 'Aún no tienes pagos previstos, así que no hay nada que mirar. Añade uno (primer capítulo de esta serie) o míralo ahora solo leyendo.' }],
  steps: [
    {
      id: 'vision',
      text: 'Visión 12 meses: una tarjeta por mes con lo que vence. Lo conocido, lo estimado (≈) y los pagos de importe pendiente salen por separado. Sirve para ver qué meses vienen más cargados.',
      target: 'finance.forecast-year',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'horizonte',
      text: 'Los botones de abajo cambian el horizonte: 7 días, 30 días, 3 meses o 12 meses. La tarjeta que sigue suma lo previsto en ese plazo, sin convertir divisas.',
      target: 'finance.forecast-horizon',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'proximos',
      text: '«Próximos pagos» lista cada pago con su fecha, importe y categoría. Lo previsto no es gasto hasta que el banco lo cobra y se concilia.',
      target: 'finance.forecast-upcoming',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'menu',
      text: 'El ⋯ de cada pago abre Editar, Desactivar (o Reactivar), Eliminar y, si se importó de un documento, «📄 Ver documento original». Desactivar y eliminar son cosa tuya: yo no los toco.',
      target: 'finance.forecast-menu',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'recurrentes',
      text: 'Si PEPA ve cargos que se repiten en tu banco, sale «💡 posibles pagos recurrentes». «Revisar» abre el formulario ya rellenado (nunca crea nada solo) y «No me interesa» lo descarta.',
      target: 'finance.forecast-recurring',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'mas',
      text: 'Otras dos formas de crear un pago: «🔮 Añadir a Previsión» dentro de un movimiento del banco, y «📄 Importar desde foto o documento», que usa IA y siempre te lo enseña para revisar antes de guardar.',
      target: 'finance.forecast-import',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Cómo se unen estos pagos con los cargos del banco, en «Revisar una propuesta de conciliación».',
  next: ['eco-prevision', 'eco-banco'],
}

// Previsión de pagos → conciliación bancaria. INFORMATIVO: señala «Confirmar» y «No es este» pero jamás espera ni empuja a pulsarlos.
export const tutEconomiaRevisarConciliacion: TourDef = {
  id: 'tut-economia-revisar-conciliacion',
  module: 'economia',
  group: 'Pagos previstos',
  title: 'Revisar una propuesta de conciliación',
  summary: 'Entender cuándo PEPA propone unir un cargo del banco con un pago previsto y qué hace cada botón.',
  version: 2,
  cardId: 'eco-prevision',
  durationSec: 90,
  startPath: '/dinero',
  startDest: 'economia.prevision',
  needs: [{ target: 'finance.reconcile-toggle', message: 'Ahora no hay ninguna propuesta que revisar (hace falta un banco conectado, un pago previsto y un cargo parecido). Puedo contártelo solo leyendo.' }],
  steps: [
    {
      id: 'abrir',
      text: 'Si PEPA ve un cargo del banco que parece uno de tus pagos previstos, aparece «🔎 N pagos por revisar». Tócalo para abrirlo. Es solo una propuesta: PEPA nunca concilia sola.',
      target: 'finance.reconcile-toggle',
      completeOn: [
        { type: 'click', target: 'finance.reconcile-toggle' },
        { type: 'appear', target: 'finance.reconcile-card' },
      ],
      skipIf: [{ type: 'appear', target: 'finance.reconcile-card' }],
    },
    {
      id: 'tarjeta',
      text: 'A un lado, lo Previsto; al otro, el movimiento del Banco; debajo, por qué los une (misma cuenta, mismo importe, mismo día…). Si hay dudas, dice «Puede que sea este cargo — revísalo».',
      target: 'finance.reconcile-card',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'confirmar',
      text: 'Si es el mismo pago, «Confirmar» los une: el cargo queda como cobrado y su categoría cambia a la del pago previsto, si la tiene. Yo no lo pulso por ti: lo decides tú.',
      target: 'finance.reconcile-confirm',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'descartar',
      text: 'Si no es el mismo, «No es este»: PEPA no volverá a proponer esa pareja y no hay forma de deshacerlo desde la pantalla. Tampoco lo pulso yo.',
      target: 'finance.reconcile-dismiss',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'deshacer',
      text: 'En un pago ya conciliado verás «Gestionar» (para revisar su movimiento) y «Desconciliar», que solo quita la unión y no devuelve la categoría anterior. Cómo decide PEPA, en «Cómo funciona PEPA».',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Ya sabes revisarlas. Confirmar y descartar son decisiones tuyas: tómate tu tiempo.',
  next: ['eco-prevision', 'eco-banco'],
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Serie «Entender tus números»
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// Estadísticas → vistas, dónut, comparación y evolución. Solo mira: no cambia nada.
export const tutEconomiaVerEstadisticas: TourDef = {
  id: 'tut-economia-ver-estadisticas',
  module: 'economia',
  group: 'Números',
  title: 'Leer tus estadísticas',
  summary: 'Mirar en qué se va el dinero por categorías, etiquetas o tipo de gasto, y cómo evoluciona.',
  version: 2,
  cardId: 'eco-estadisticas',
  durationSec: 100,
  startPath: '/dinero',
  startDest: 'economia.estadisticas',
  readyOn: ['finance.stats-views'],
  steps: [
    {
      id: 'vistas',
      text: 'Cambia la forma de verlo: Categorías, Etiquetas, Debo/Necesito/Quiero o Fijo/variable. El total de gasto es el mismo, salvo en Etiquetas, que solo suma lo que tiene etiqueta. Prueba tocando una.',
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
    {
      id: 'comparado',
      text: '«Comparado con el periodo anterior» enseña en qué categorías has gastado más y en cuáles menos que en el periodo equivalente anterior. Si el actual no ha terminado, compara el mismo tramo de días.',
      target: 'finance.stats-compare',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'evolucion',
      text: '«Evolución temporal» muestra los últimos 6 meses. Con «Mes real» o «Mes contable» eliges cómo se cuentan, sin tocar el 📅 Fecha de arriba.',
      target: 'finance.stats-evolution',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'tendencia',
      text: 'Con un banco conectado, «Tendencia del saldo» (arriba) dibuja el saldo día a día, por cuenta o todas juntas. Solo se ve en esta pantalla.',
      target: 'finance.balance-trend',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Listo. El periodo se elige con 📅 Fecha, arriba. Para fijar un límite de gasto, mira «Controlar con presupuestos».',
  next: ['eco-estadisticas', 'eco-presupuesto'],
}

// Presupuesto(s) → lista, historial, resumen → «+ Nuevo presupuesto» → «Crear presupuesto».
export const tutEconomiaCrearPresupuesto: TourDef = {
  id: 'tut-economia-crear-presupuesto',
  module: 'economia',
  group: 'Números',
  title: 'Controlar con presupuestos',
  summary: 'Ver tus presupuestos del mes, crear uno nuevo y entender el resumen.',
  version: 2,
  cardId: 'eco-presupuesto',
  durationSec: 110,
  startPath: '/dinero',
  startDest: 'economia.presupuesto',
  readyOn: ['finance.budget-list'],
  steps: [
    {
      id: 'lista',
      text: 'Aquí están los presupuestos del mes contable en curso, cada uno con su barra de progreso: lo gastado frente a su límite. «Eliminar» (con confirmación) lo borra; eso lo decides tú.',
      target: 'finance.budget-list',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'historial',
      text: '«Historial» agrupa los presupuestos de meses anteriores, en carpetas por mes.',
      target: 'finance.budget-history',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'abrir',
      text: 'Pulsa «+ Nuevo presupuesto». Se crea de verdad en el último paso; si solo practicas, cierra con la ✕ o pulsa «Salir».',
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
      text: 'Elige la categoría que quieres controlar, o «General» para que cuenten todos los gastos. Si repites categoría y mes, PEPA te avisa.',
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
      text: 'Pulsa «Crear presupuesto»: se crea de verdad. Lo pulsas tú; yo solo te lo señalo. Si solo practicabas, pulsa «Salir».',
      target: 'finance.budget-save',
      completeOn: [{ type: 'event', name: 'finance.budget-created' }],
      sensitive: true,
    },
  ],
  finishText: '¡Presupuesto creado! Lo verás con su barra de progreso, comparado con lo que ya has gastado. El «Resumen» de esta pantalla lo detalla por categoría.',
  next: ['eco-presupuesto', 'eco-estadisticas'],
}

// Presupuesto(s) → «📄 Generar informe». Solo se explica: abre una página nueva y el diálogo de imprimir del navegador.
export const tutEconomiaInforme: TourDef = {
  id: 'tut-economia-informe',
  module: 'economia',
  group: 'Números',
  title: 'Generar un informe',
  summary: 'Qué contiene el informe imprimible de Economía y cómo guardarlo como PDF.',
  version: 1,
  cardId: 'eco-presupuesto',
  durationSec: 60,
  startPath: '/dinero',
  startDest: 'economia.presupuesto',
  readyOn: ['finance.budget-overview'],
  steps: [
    {
      id: 'resumen',
      text: 'El «Resumen» de Presupuestos suma Ingresos, Presupuesto, Gastado y Balance del periodo, y reparte el gasto por categoría. Con banco conectado, «Ingresos» cuenta lo que entra en el banco.',
      target: 'finance.budget-overview',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'informe',
      text: '«📄 Generar informe» abre una página con el periodo, los totales y una tabla por categoría, y lanza el diálogo de imprimir. Ahí puedes «Guardar como PDF». Pulsa tú el botón; yo no lo hago.',
      target: 'finance.budget-report',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'limites',
      text: 'Es un informe sencillo: sin gráficos y sin exportar a Excel o CSV. Si no se abre la página, comprueba que el navegador permita ventanas emergentes.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. El informe cuenta lo que ves en pantalla para el periodo elegido con 📅 Fecha.',
  next: ['eco-presupuesto', 'eco-estadisticas'],
}

export const TOURS_ECONOMIA: TourDef[] = [
  visitaEconomia,
  tutEconomiaMenuPestanas,
  tutEconomiaCuentasResumen,
  tutEconomiaPeriodoFecha,
  tutEconomiaVerPendientes,
  tutEconomiaApuntarMovimiento,
  tutEconomiaCambiarCategoria,
  tutEconomiaAnadirPagoPrevisto,
  tutEconomiaVerPrevision,
  tutEconomiaRevisarConciliacion,
  tutEconomiaVerEstadisticas,
  tutEconomiaCrearPresupuesto,
  tutEconomiaInforme,
]
