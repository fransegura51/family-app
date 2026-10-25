import type { TourDef } from '@/help/tours/types'

// Tutoriales «Enséñame» del grupo g10 (ajustes de Configuración): Economía (mes contable y modo de cuentas). (La tarjeta de confirmación y los botones de Pepa pasaron a «Tarjeta y botones de Pepa», en defs/g7/pepa.ts. El nombre de la familia, los accesos
// de los menús ☰ y los ajustes que viajan con la cuenta pasaron a «Personalizar PEPA», en defs/g5/configuracion.ts.) Comprobado contra src/ui/MenuSettingsScreen.tsx, ClassicButtonsCard.tsx y PepaPreferencesCard.tsx.
// Ninguno pulsa nada por la persona: señalan el control real y esperan. Los pasos que guardan algo son `sensitive` y solo avanzan con el aviso que la pantalla lanza DESPUÉS de guardar.
// El «Modo de cuentas» es solo informativo: un toque lo guarda y cambia lo que ve toda la familia, así que se explica pero no se espera a que se pulse.

const info = { completeOn: [] as never[], manualNext: true }

export const tutEconomiaMesContable: TourDef = {
  id: 'tut-economia-mes-contable',
  module: 'economia',
  group: 'Números',
  summary: 'Qué es el mes contable frente al mes real y cómo cambiar el día en que empieza.',
  version: 2,
  title: 'Cambiar el día en que empieza el mes contable',
  cardId: 'eco-mes-contable',
  durationSec: 70,
  startPath: '/menu-organizar',
  startDest: 'config.economia',
  steps: [
    {
      id: 'tarjeta',
      text: 'El «Mes contable» empieza el día que tú elijas (útil si cobras el 25); el «Mes real» va siempre del 1 al último día. Esta tarjeta fija ese día para toda Economía. Es solo tuyo: cada persona puede tener el suyo.',
      target: 'economia.mes-contable',
      ...info,
    },
    {
      id: 'dia',
      text: 'Cambia el número de «Día» (del 1 al 31). Se guarda al momento, al escribirlo; con 31 el mes empieza el último día de cada mes. Yo no lo cambio por ti; si no quieres, pulsa «Salir».',
      target: 'economia.mes-contable-dia',
      completeOn: [{ type: 'event', name: 'economia.accounting-month-saved' }],
      sensitive: true,
    },
    {
      id: 'resultado',
      text: 'Guardado. Comprueba que el número que ves es el que querías; puedes corregirlo cuando quieras. Desde ahora «Mes contable» en Economía cuenta desde ese día; «Mes real» no cambia.',
      target: 'economia.mes-contable-dia',
      ...info,
    },
  ],
  finishText: 'Listo. Tus filtros de «Mes contable» usan ya tu día de inicio. No cambia a los demás.',
  next: ['eco-mes-contable', 'eco-modo-cuentas'],
}

export const tutEconomiaModoCuentas: TourDef = {
  id: 'tut-economia-modo-cuentas',
  module: 'economia',
  group: 'Cuentas',
  summary: 'De quién es cada cuenta y qué ve cada persona con las cuentas compartidas o separadas (solo explicado).',
  version: 2,
  title: 'De quién es cada cuenta y modo de cuentas',
  cardId: 'eco-modo-cuentas',
  durationSec: 90,
  startPath: '/menu-organizar',
  startDest: 'config.economia',
  steps: [
    {
      id: 'cuentas',
      text: 'En «🏦 Cuentas bancarias», «Gestionar cuentas» abre la ventana donde se conectan los bancos y se dice de quién es cada cuenta: «Común» (🏠) o una persona. Solo su dueño actual puede cambiarlo. Yo no conecto nada.',
      target: 'economia.cuentas-bancarias',
      ...info,
    },
    {
      id: 'tarjeta',
      text: 'Esta tarjeta, «Modo de cuentas», decide qué ve cada persona en Economía. Todo el mundo puede verla, pero solo la administración de la familia puede cambiarla.',
      target: 'economia.modo-cuentas',
      ...info,
    },
    {
      id: 'compartidas',
      text: '«Compartidas»: todo el mundo ve los movimientos y saldos de todos. «Separadas»: cada uno ve solo los suyos (y 🔒 en el saldo de las cuentas ajenas), con un interruptor Individual / Común para lo que se comparta a propósito.',
      target: 'economia.modo-cuentas-opciones',
      ...info,
    },
    {
      id: 'decidir',
      text: 'Un solo toque lo guarda y cambia lo que ve toda la familia, así que aquí solo te lo explico: no te señalo ningún botón para pulsar. Si eres administración, piénsalo con calma y decídelo tú.',
      target: 'economia.modo-cuentas-opciones',
      ...info,
    },
  ],
  finishText: 'No he cambiado nada. Quien administre la familia puede elegir «Compartidas» o «Separadas» en Configuración → «Economía». Cómo funciona cada modo, en «Cómo funciona PEPA».',
  next: ['eco-modo-cuentas', 'eco-banco'],
}
