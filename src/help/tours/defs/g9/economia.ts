import type { TourDef } from '@/help/tours/types'

// Economía (grupo g9): conectar el banco, sincronizar, categorías y etiquetas, y filtros temporales. Marcas `data-help-id` en src/ui/FinanceScreen.tsx, src/ui/BankAccountsModal.tsx y
// src/ui/MenuSettingsScreen.tsx. «Clasificar los gastos pendientes» se fusionó en `tut-economia-cambiar-categoria` (alias en help/tours/aliases/b.ts).
// Los dos capítulos del banco SOLO señalan y explican: no conectan, no sincronizan y no desconectan nada, y no hay forma de recorrer la web del banco desde la app.
// Los de Configuración (categorías, etiquetas, filtros) solo explican: crear o borrar categorías, etiquetas o filtros es de la persona.

export const tutEconomiaConectarBanco: TourDef = {
  id: 'tut-economia-conectar-banco',
  module: 'economia',
  group: 'Cuentas',
  summary: 'Dónde se conecta un banco y de quién es cada cuenta (sin conectar nada por ti).',
  version: 2,
  title: 'Conectar mi banco',
  cardId: 'eco-banco',
  durationSec: 90,
  startPath: '/dinero',
  startDest: 'economia.banco',
  steps: [
    {
      id: 'cuentas',
      text: 'Arriba está «Mis cuentas»: una tarjeta por cada cuenta de banco conectada, con su saldo y de quién es. Yo solo te enseño dónde se hace: no conecto ningún banco.',
      target: 'finance.accounts',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'anadir',
      text: 'Para empezar a conectar un banco se pulsa «Añadir cuenta». Estando en Banco, se abre la ventana «Cuentas bancarias». Púlsalo tú cuando quieras; si no, pulsa «Siguiente».',
      target: 'finance.add-account',
      completeOn: [
        { type: 'click', target: 'finance.add-account' },
        { type: 'appear', target: 'finance.bank-modal' },
      ],
      skipIf: [{ type: 'appear', target: 'finance.bank-modal' }],
      manualNext: true,
    },
    {
      id: 'ventana',
      text: 'Aquí salen los bancos conectados y hasta cuándo vale cada permiso. Por normativa, cada banco pide renovarlo cada 90 días: hay que volver aquí y conectarlo de nuevo.',
      target: 'finance.bank-modal',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'dueno',
      text: 'Con una cuenta conectada, aquí eliges de quién es: «Común» o una persona de la familia. Solo su dueño actual puede cambiarlo; una cuenta sin dueño puede asignarla cualquiera.',
      target: 'finance.bank-owner',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'conectar',
      text: '«+ Conectar banco» abre un formulario: eliges país y banco y pulsas «Conectar». El banco te pedirá permiso en su propia web. Eso lo haces tú; yo no lo toco. Pulsa «Siguiente» cuando quieras seguir.',
      target: 'finance.bank-connect',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'cerrar',
      text: 'Cuando termines, cierra la ventana con la ✕.',
      target: 'finance.bank-modal-close',
      completeOn: [{ type: 'click', target: 'finance.bank-modal-close' }],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. No he conectado nada: si quieres enlazar tu banco, hazlo tú desde «Añadir cuenta». Cómo funciona la conexión, en «Cómo funciona PEPA».',
  next: ['eco-banco', 'eco-modo-cuentas'],
}

export const tutEconomiaSincronizar: TourDef = {
  id: 'tut-economia-sincronizar',
  module: 'economia',
  group: 'Cuentas',
  summary: 'Cómo llegan los movimientos del banco, cada cuánto y qué pasa a los 90 días (solo explicado).',
  version: 1,
  title: 'Sincronizar el banco y los 90 días',
  cardId: 'eco-banco',
  durationSec: 80,
  startPath: '/dinero',
  startDest: 'economia.banco',
  needs: [{ target: 'finance.bank-sync', message: 'El botón de sincronizar solo sale cuando hay un banco conectado. Puedo contártelo solo leyendo.' }],
  steps: [
    {
      id: 'sincronizar',
      text: '«🔄 Sincronizar movimientos» trae lo nuevo del banco al momento. Es opcional: pulsa tú el botón cuando quieras, yo no lo hago por ti.',
      target: 'finance.bank-sync',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'traer',
      text: '«Traer al menos» fija cuánto histórico pide la primera vez: último mes o últimos 3 meses. El banco no entrega más de unos 3 meses aunque se pida más.',
      target: 'finance.bank-sync-days',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'sola',
      text: 'Además, PEPA sincroniza sola 4 veces al día y trae solo lo nuevo. Cada movimiento llega como un gasto en Movimientos, con una categoría sugerida que puedes corregir.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'noventa',
      text: 'Cada permiso del banco dura 90 días. Al conectar, PEPA crea dos avisos en el Calendario para renovarlo. Pasado el plazo, la sincronización falla hasta que vuelvas a conectar ese banco desde «Añadir cuenta».',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Por qué caduca el permiso y qué guarda PEPA, en «Cómo funciona PEPA».',
  next: ['eco-banco', 'eco-pendientes'],
}

// Configuración → Economía → Categorías y Etiquetas. Solo explica: ni crea ni borra nada. No se renombran ni se reordenan las categorías (van por orden alfabético).
export const tutEconomiaCategoriasEtiquetas: TourDef = {
  id: 'tut-economia-categorias-etiquetas',
  module: 'economia',
  group: 'Registrar',
  summary: 'Dónde se crean y se borran las categorías y las etiquetas, y qué NO se puede cambiar.',
  version: 1,
  title: 'Tus categorías y etiquetas',
  cardId: 'eco-categorias',
  durationSec: 90,
  startPath: '/menu-organizar',
  startDest: 'config.economia',
  steps: [
    {
      id: 'tarjeta',
      text: 'En Configuración → Economía, «🗂️ Categorías» tiene el botón «Gestionar». Pulsa «Gestionar»: se abre la ventana. Solo mirar no cambia nada; cerrarla con la ✕ tampoco.',
      target: 'economia.categorias',
      completeOn: [{ type: 'appear', target: 'finance.categories-modal' }],
      skipIf: [{ type: 'appear', target: 'finance.categories-modal' }],
      manualNext: true,
    },
    {
      id: 'ventana',
      text: '«+ Crear nueva categoría» añade una (en Generales o en Ingresos, con categoría principal opcional). Tocar una la despliega: sus subcategorías, Debo/Necesito/Quiero y Fijo/Variable (solo gastos) y «✕ Eliminar esta categoría». No se renombran ni se reordenan: van por orden alfabético.',
      target: 'finance.categories-modal',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'etiquetas',
      text: 'Cierra esa ventana con la ✕. «🏷️ Etiquetas» → «Gestionar»: creas etiquetas con nombre y color, tocas una para cambiar su nombre o color y la ✕ la elimina. Sirven para filtrar y para las estadísticas.',
      target: 'economia.etiquetas',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'atajo',
      text: 'No hace falta venir hasta aquí: dentro del selector de categoría hay «⚙️ Gestionar categorías», y al elegir la etiqueta de un movimiento, «⚙️ Gestionar etiquetas».',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Crear y borrar categorías y etiquetas es cosa tuya; yo no he tocado nada. Cómo se asigna la categoría a cada movimiento, en «Cómo funciona PEPA».',
  next: ['eco-categorias', 'eco-pendientes'],
}

// Configuración → Filtros temporales. Solo explica.
export const tutEconomiaFiltrosTemporales: TourDef = {
  id: 'tut-economia-filtros-temporales',
  module: 'economia',
  group: 'Números',
  summary: 'Elegir qué periodos ves en los desplegables 📅 Fecha y cuál es tu favorito (solo explicado).',
  version: 1,
  title: 'Filtros temporales y favorito',
  cardId: 'eco-mes-contable',
  durationSec: 60,
  startPath: '/menu-organizar',
  startDest: 'config.filtros_temporales',
  steps: [
    {
      id: 'tarjeta',
      text: 'Aquí eliges qué periodos aparecen en los desplegables «📅 Fecha» de Economía y de Compras. Es solo tuyo: cada persona puede tener los suyos.',
      target: 'economia.filtros-temporales',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'activo',
      text: '«Activo» / «Desactivado» muestra u oculta un periodo (nunca lo borra). Por defecto están ocultos: Mes contable anterior, Mes real anterior, Año anterior, Últimos 30 días y Últimos 3 meses. «Rango de fecha» no se puede ocultar.',
      target: 'economia.filtros-temporales',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'favorito',
      text: '«☆ Favorito» marca con qué periodo arranca una pantalla nueva. Elegir otro dentro de una pantalla solo vale para esa vez. Cambiarlo es cosa tuya: yo no toco nada.',
      target: 'economia.filtros-temporales',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Para cambiar el día en que empieza el mes contable, mira «Cambiar el día en que empieza el mes contable».',
  next: ['eco-mes-contable', 'eco-moverse'],
}

export const tutEconomiaCarterasEfectivo: TourDef = {
  id: 'tut-economia-carteras-efectivo',
  module: 'economia',
  group: 'Efectivo',
  summary: 'Dónde están las carteras de efectivo, sus tarjetas y las cinco operaciones (sin crear ni mover dinero por ti).',
  version: 1,
  title: 'Carteras de efectivo',
  cardId: 'eco-efectivo',
  durationSec: 100,
  startPath: '/dinero',
  startDest: 'economia.movimientos',
  steps: [
    {
      id: 'tarjetas',
      text: 'Aquí están las carteras de efectivo, junto a tus cuentas del banco en «Mis cuentas»: una tarjeta por cartera, con su titular (o «Familiar») y su saldo. Son opcionales: puedes apuntar gastos en efectivo sin tener ninguna.',
      target: 'finance.accounts',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'anadir',
      text: '«+ Añadir cuenta o cartera» te deja elegir entre una cuenta bancaria y una cartera de efectivo (personal o familiar, con su saldo inicial). Yo solo te enseño dónde está: no creo ninguna.',
      target: 'finance.add-account',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'operaciones',
      text: 'Al tocar una cartera, Movimientos enseña solo sus movimientos y salen las «Operaciones de efectivo»: entrada, salida, ajustar saldo, traspaso y «↔ Banco y efectivo» (reintegros e ingresos de cajero, en las dos direcciones). Si no tienes ninguna cartera, este paso se salta.',
      target: 'finance.cash-tools',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'etiqueta',
      text: 'Ojo: pagar desde una cartera no decide a quién corresponde el gasto. Eso lo dice la etiqueta del movimiento (por ejemplo «Común» aunque pague una persona).',
      target: 'finance.accounts',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. No he creado ni movido nada de efectivo: cuando quieras, hazlo tú desde «+ Añadir cuenta o cartera» y las operaciones de cada cartera.',
  next: ['eco-nuevo-movimiento', 'eco-banco'],
}

export const TOURS_G9_ECONOMIA: TourDef[] = [tutEconomiaConectarBanco, tutEconomiaSincronizar, tutEconomiaCategoriasEtiquetas, tutEconomiaFiltrosTemporales, tutEconomiaCarterasEfectivo]
