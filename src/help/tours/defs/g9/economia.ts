import type { TourDef } from '@/help/tours/types'

// Economía (grupo g9): clasificar gastos pendientes y conectar el banco. Marcas `data-help-id` en src/ui/FinanceScreen.tsx y src/ui/BankAccountsModal.tsx.
// El tutorial del banco SOLO señala hasta «+ Conectar banco» y explica: no conecta, no sincroniza y no desconecta nada, y no hay forma de recorrer la web del banco desde la app.
// El de pendientes termina esperando el aviso de «movimiento guardado» que lanza la propia pantalla.

export const tutEconomiaClasificarPendientes: TourDef = {
  id: 'tut-economia-clasificar-pendientes',
  module: 'economia',
  group: 'Movimientos',
  summary: 'Encuentra los gastos sin categoría y clasifica uno.',
  version: 1,
  title: 'Clasificar los gastos pendientes',
  cardId: 'eco-pendientes',
  durationSec: 100,
  startPath: '/dinero',
  startDest: 'economia.resumen',
  steps: [
    {
      id: 'senal',
      text: 'Si hay gastos sin categoría, aquí sale una señal con cuántos son y su total. Tócala y te llevo a Movimientos con el filtro «Pendientes».',
      target: 'finance.pending-signal',
      completeOn: [
        { type: 'click', target: 'finance.pending-signal' },
        { type: 'appear', target: 'finance.movements-filter' },
      ],
      skipIf: [{ type: 'appear', target: 'finance.movements-filter' }],
      optional: true,
    },
    {
      id: 'menu',
      text: 'Ahora mismo no veo la señal: no tienes gastos pendientes. Para ver igualmente dónde se miran, abre el ☰ Menú y entra en «Movimientos».',
      target: 'finance.menu',
      completeOn: [{ type: 'appear', target: 'finance.movements-filter' }],
      skipIf: [{ type: 'appear', target: 'finance.movements-filter' }],
    },
    {
      id: 'filtro',
      text: 'Aquí está «Filtrar por». Si llegaste desde la señal, ya ves solo los pendientes; si no, ábrelo y elige «Pendientes». Elige y pulsa «Siguiente».',
      target: 'finance.movements-filter',
      completeOn: [{ type: 'click', target: 'finance.movements-filter' }],
      manualNext: true,
    },
    {
      id: 'fila',
      text: 'Toca un gasto de la lista para editarlo (no la ✕ de la derecha: esa borra). Si no queda ninguno, es que ya está todo clasificado: pulsa «Salir».',
      target: 'finance.movement-row',
      completeOn: [{ type: 'appear', target: 'finance.movement-category' }],
    },
    {
      id: 'categoria',
      text: 'Toca «Categoría» y elige la que corresponda; las que llevan › se abren en subcategorías. Al elegir, la ventana se cierra sola.',
      target: 'finance.movement-category',
      completeOn: [{ type: 'appear', target: 'finance.category-picker' }],
      manualNext: true,
    },
    {
      id: 'elegir',
      text: 'Toca la categoría correcta. Cuando la hayas elegido, pulsa «Siguiente».',
      target: 'finance.category-picker',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Pulsa «Guardar». Lo pulsas tú. Un gasto pendiente ya contaba en los totales; al clasificarlo solo cambia a qué categoría pertenece.',
      target: 'finance.edit-save',
      completeOn: [{ type: 'event', name: 'finance.movement-updated' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! Ese gasto ya tiene categoría y sale de los pendientes. Repite lo mismo con los demás cuando quieras.',
  next: ['eco-categorias', 'eco-presupuesto', 'eco-banco'],
}

export const tutEconomiaConectarBanco: TourDef = {
  id: 'tut-economia-conectar-banco',
  module: 'economia',
  group: 'Banco',
  summary: 'Dónde se conecta un banco, de quién es cada cuenta y cómo se sincronizan los movimientos (sin conectar nada por ti).',
  version: 1,
  title: 'Conectar mi banco',
  cardId: 'eco-banco',
  durationSec: 110,
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
      text: 'Para empezar a conectar un banco se pulsa «Añadir cuenta». Se abre la ventana «Cuentas bancarias». Púlsalo tú cuando quieras.',
      target: 'finance.add-account',
      completeOn: [
        { type: 'click', target: 'finance.add-account' },
        { type: 'appear', target: 'finance.bank-modal' },
      ],
      skipIf: [{ type: 'appear', target: 'finance.bank-modal' }],
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
      text: 'Con una cuenta conectada, aquí eliges de quién es: «Común» o una persona de la familia. Solo su dueño actual puede cambiarlo.',
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
    {
      id: 'sincronizar',
      text: 'Con un banco conectado, «🔄 Sincronizar movimientos» trae lo nuevo al momento; además se sincroniza sola varias veces al día. Lo que llega lleva una categoría sugerida que puedes corregir.',
      target: 'finance.bank-sync',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. No he conectado nada: si quieres enlazar tu banco, hazlo tú desde «Añadir cuenta». Y si todavía no ves la tarjeta de sincronizar, es que aún no hay ningún banco conectado.',
  next: ['eco-pendientes', 'eco-categorias', 'eco-prevision'],
}

export const TOURS_G9_ECONOMIA: TourDef[] = [tutEconomiaClasificarPendientes, tutEconomiaConectarBanco]
