import type { TourDef } from '@/help/tours/types'

// Tutoriales «Enséñame» del grupo g10 (ajustes de Configuración): botones de Pepa, tarjeta de confirmación, Economía (mes contable y modo de cuentas), nombre de la familia, accesos nuevos
// y ajustes que viajan con la cuenta. Comprobado contra src/ui/MenuSettingsScreen.tsx, ClassicButtonsCard.tsx, PepaPreferencesCard.tsx y CalendarScreen.tsx (menú ☰).
// Ninguno pulsa nada por la persona: señalan el control real y esperan. Los pasos que guardan algo son `sensitive` y solo avanzan con el aviso que la pantalla lanza DESPUÉS de guardar.
// El «Modo de cuentas» es solo informativo: un toque lo guarda y cambia lo que ve toda la familia, así que se explica pero no se espera a que se pulse.

const info = { completeOn: [] as never[], manualNext: true }

export const tutPepaBotones: TourDef = {
  id: 'tut-pepa-botones',
  module: 'pepa',
  group: 'Pepa',
  summary: 'Mostrar u ocultar los botones clásicos de PEPA de la barra de arriba.',
  version: 1,
  title: 'Mostrar u ocultar los botones de PEPA',
  cardId: 'pepa-botones',
  durationSec: 60,
  startPath: '/menu-organizar',
  startDest: 'config.pepa',
  steps: [
    {
      id: 'tarjeta',
      text: 'Esta tarjeta decide qué botones de PEPA ves arriba. Con la casilla marcada salen los de siempre; sin marcar, solo queda el botón 💬 «Hablar con PEPA».',
      target: 'pepa.classic-buttons',
      ...info,
    },
    {
      id: 'casilla',
      text: 'Marca o desmarca «Mostrar botones clásicos». Se guarda al momento, y los botones no se borran: solo se esconden. Yo no lo toco por ti; si no quieres cambiarlo, pulsa «Salir».',
      target: 'pepa.classic-buttons',
      completeOn: [{ type: 'event', name: 'pepa.classic-buttons-changed' }],
      sensitive: true,
    },
    {
      id: 'resultado',
      text: 'Hecho. Mira la barra de arriba: ya muestra lo que has elegido. Es solo tuyo, y puedes volver a cambiarlo cuando quieras.',
      target: 'pepa.classic-buttons',
      ...info,
    },
  ],
  finishText: 'Listo. Tu elección se guarda en tu cuenta y la ves igual en tus dispositivos. Cuando quieras cambiarla, vuelve a Configuración → «Pepa».',
  next: ['pepa-hablar', 'pepa-sin-tarjeta', 'cfg-sincronizacion'],
}

export const tutPepaSinTarjeta: TourDef = {
  id: 'tut-pepa-sin-tarjeta',
  module: 'pepa',
  group: 'Pepa',
  summary: 'Elegir si PEPA hace lo que le pides directamente o te enseña antes una tarjeta.',
  version: 1,
  title: 'Que PEPA lo haga sin enseñarte la tarjeta',
  cardId: 'pepa-sin-tarjeta',
  durationSec: 60,
  startPath: '/menu-organizar',
  startDest: 'config.pepa',
  steps: [
    {
      id: 'tarjeta',
      text: 'Cuando me pides algo (apuntar leche, un evento…), normalmente te enseño primero una tarjeta para que lo revises y pulses el botón. Esta tarjeta de Configuración lo cambia.',
      target: 'pepa.auto-confirm',
      ...info,
    },
    {
      id: 'casilla',
      text: 'Si marcas «Hacerlo directamente, sin tarjeta», lo que me pidas se hace al momento. Se guarda al marcarla. Yo no la toco por ti; si prefieres dejarlo como está, pulsa «Salir».',
      target: 'pepa.auto-confirm',
      completeOn: [{ type: 'event', name: 'pepa.auto-confirm-changed' }],
      sensitive: true,
    },
    {
      id: 'limites',
      text: 'Ojo: lo que toca dinero (presupuestos) siempre pide confirmación, y si algo no cuadra, como un duplicado, te enseño la tarjeta igualmente. Puedes volver a cambiarlo cuando quieras.',
      target: 'pepa.auto-confirm',
      ...info,
    },
  ],
  finishText: 'Listo. Es una preferencia personal: se guarda en tu cuenta y no cambia lo de los demás.',
  next: ['pepa-hablar', 'pepa-botones'],
}

export const tutEconomiaMesContable: TourDef = {
  id: 'tut-economia-mes-contable',
  module: 'economia',
  group: 'Economía',
  summary: 'Cambiar el día en que empieza «Este mes» en Economía.',
  version: 1,
  title: 'Cambiar el día en que empieza el mes contable',
  cardId: 'eco-mes-contable',
  durationSec: 60,
  startPath: '/menu-organizar',
  startDest: 'config.economia',
  steps: [
    {
      id: 'tarjeta',
      text: 'Aquí eliges desde qué día cuenta «Este mes» en toda Economía. Es útil si cobras, por ejemplo, el día 25. Es solo tuyo: cada persona puede tener el suyo.',
      target: 'economia.mes-contable',
      ...info,
    },
    {
      id: 'dia',
      text: 'Cambia el número de «Día» (del 1 al 31). Se guarda solo al escribirlo; con 31 el mes empieza el último día de cada mes. Yo no lo cambio por ti; si no quieres, pulsa «Salir».',
      target: 'economia.mes-contable-dia',
      completeOn: [{ type: 'event', name: 'economia.accounting-month-saved' }],
      sensitive: true,
    },
    {
      id: 'resultado',
      text: 'Guardado. Comprueba que el número que ves es el que querías; puedes corregirlo cuando quieras. Desde ahora «Este mes» en Economía cuenta desde ese día.',
      target: 'economia.mes-contable-dia',
      ...info,
    },
  ],
  finishText: 'Listo. Tus filtros de «Este mes» en Economía usan ya tu día de inicio. No cambia a los demás.',
  next: ['eco-modo-cuentas', 'cfg-que-hay'],
}

export const tutEconomiaModoCuentas: TourDef = {
  id: 'tut-economia-modo-cuentas',
  module: 'economia',
  group: 'Economía',
  summary: 'Entender «Compartidas» o «Separadas» y dónde se cambia (solo administración).',
  access: { familyAdmin: true },
  version: 1,
  title: 'Cuentas compartidas o separadas',
  cardId: 'eco-modo-cuentas',
  durationSec: 75,
  startPath: '/menu-organizar',
  startDest: 'config.economia',
  steps: [
    {
      id: 'tarjeta',
      text: 'Esta tarjeta, «Modo de cuentas», decide qué ve cada persona en Economía. Solo la administración de la familia puede cambiarla.',
      target: 'economia.modo-cuentas',
      ...info,
    },
    {
      id: 'compartidas',
      text: '«Compartidas»: todo el mundo ve los movimientos y saldos de todos. «Separadas»: cada uno ve solo los suyos, y hay un interruptor Individual / Común para lo que se comparta a propósito.',
      target: 'economia.modo-cuentas-opciones',
      ...info,
    },
    {
      id: 'decidir',
      text: 'Un solo toque lo guarda y cambia lo que ve toda la familia, así que aquí solo te lo explico: no te señalo ningún botón para pulsar. Piénsalo con calma y decídelo tú.',
      target: 'economia.modo-cuentas-opciones',
      ...info,
    },
  ],
  finishText: 'No he cambiado nada. Cuando lo tengas decidido, pulsa tú «Compartidas» o «Separadas» en Configuración → «Economía».',
  next: ['eco-mes-contable', 'cfg-que-hay'],
}

export const tutConfiguracionNombreFamilia: TourDef = {
  id: 'tut-configuracion-nombre-familia',
  module: 'configuracion',
  group: 'Configuración',
  summary: 'Cambiar el nombre de la familia (solo administración).',
  access: { familyAdmin: true },
  version: 1,
  title: 'Cambiar el nombre de la familia',
  cardId: 'cfg-nombre-familia',
  durationSec: 60,
  startPath: '/menu-organizar',
  steps: [
    {
      id: 'nombre',
      text: 'Arriba de Configuración está el nombre de tu familia. Solo la administración de la familia puede cambiarlo.',
      target: 'config.family-name',
      ...info,
    },
    {
      id: 'editar',
      text: 'Pulsa «✏️ Cambiar nombre».',
      target: 'config.family-name-edit',
      completeOn: [
        { type: 'click', target: 'config.family-name-edit' },
        { type: 'appear', target: 'config.family-name-input' },
      ],
      skipIf: [{ type: 'appear', target: 'config.family-name-input' }],
    },
    {
      id: 'escribir',
      text: 'Escribe el nombre nuevo. No cambia nada hasta que pulses «Guardar». Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'config.family-name-input',
      completeOn: [{ type: 'entered', target: 'config.family-name-input', min: 1 }],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Cuando estés conforme, pulsa «Guardar». Yo no lo hago por ti; si te lo piensas mejor, pulsa «Cancelar» o «Salir».',
      target: 'config.family-name-save',
      completeOn: [{ type: 'event', name: 'config.family-name-saved' }],
      sensitive: true,
    },
  ],
  finishText: 'Listo. El nuevo nombre de la familia ya se ve arriba, para todas las personas de la familia.',
  next: ['cfg-que-hay', 'cfg-colores'],
}

export const tutConfiguracionSacarAccesos: TourDef = {
  id: 'tut-configuracion-sacar-accesos',
  module: 'configuracion',
  group: 'Configuración',
  summary: 'Pon un acceso de un menú ☰ como botón en la pantalla, y quítalo cuando quieras.',
  version: 1,
  title: 'Sacar un acceso del menú ☰ a la pantalla',
  cardId: 'cfg-sacar-accesos',
  durationSec: 45,
  startPath: '/calendario',
  steps: [
    {
      id: 'menu',
      text: 'Te lo enseño en el menú del Calendario. Pulsa «☰ Menú», arriba a la izquierda.',
      target: 'calendar.menu',
      completeOn: [
        { type: 'click', target: 'calendar.menu' },
        { type: 'appear', target: 'calendar.menu-panel' },
      ],
      skipIf: [{ type: 'appear', target: 'calendar.menu-panel' }],
    },
    {
      id: 'sacar',
      text: 'Cada acceso tiene a la derecha «📌 Sacar»: lo pone como botón en la pantalla, para tenerlo siempre a mano. Cuando ya está fuera, el botón pasa a «📍 Quitar» y lo devuelve al menú. Aquí solo te lo enseño: yo no lo pulso por ti.',
      target: 'calendar.menu-pin',
      ...info,
      optional: true,
    },
    {
      id: 'otros',
      text: 'Los demás menús ☰ (Compras, Cocina, Economía y Ubicación) funcionan igual.',
      target: 'calendar.menu-panel',
      ...info,
      optional: true,
    },
  ],
  finishText: 'No se ha cambiado nada. Cuando quieras, pulsa «📌 Sacar» en el acceso que uses más.',
  next: ['cfg-que-hay', 'cal-vistas'],
}

export const tutConfiguracionSincronizacion: TourDef = {
  id: 'tut-configuracion-sincronizacion',
  module: 'configuracion',
  group: 'Configuración',
  summary: 'Qué ajustes personales viajan con tu cuenta a todos tus dispositivos.',
  version: 1,
  title: 'Tus ajustes en varios dispositivos',
  cardId: 'cfg-sincronizacion',
  durationSec: 75,
  startPath: '/menu-organizar',
  steps: [
    {
      id: 'idea',
      text: 'Tus preferencias personales no se quedan en un solo móvil: viajan con tu cuenta y las ves igual en tus dispositivos. Esto no tiene un botón propio; te enseño dónde están esos ajustes.',
      ...info,
    },
    {
      id: 'menu',
      text: '«Organizar menú»: el orden de tus secciones fijas es tuyo y te acompaña a cada dispositivo.',
      target: 'config.group-menu',
      ...info,
    },
    {
      id: 'colores',
      text: '«Colores»: el estilo que elijas se guarda en tu cuenta. Si lo cambias en otro dispositivo, aquí te avisaré de que hay que recargar PEPA para verlo.',
      target: 'config.group-colores',
      ...info,
    },
    {
      id: 'pepa',
      text: '«Pepa»: los botones de arriba y cómo contesto también son preferencias de tu cuenta.',
      target: 'config.group-pepa',
      ...info,
    },
    {
      id: 'conflicto',
      text: 'Si en dos dispositivos cambias lo mismo a la vez, se aplica el cambio más reciente y te aviso en pantalla, con un botón «Recuperar el mío» por si prefieres tu elección.',
      ...info,
    },
  ],
  finishText: 'Eso es todo: cambia un ajuste en un dispositivo y lo verás en los demás. No he cambiado nada.',
  next: ['cfg-que-hay', 'cfg-colores'],
}
