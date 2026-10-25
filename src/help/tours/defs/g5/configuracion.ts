import type { TourDef } from '@/help/tours/types'

// Configuración (src/ui/MenuSettingsScreen.tsx). Visita guiada y los capítulos de «Personalizar PEPA» (serie `ser-configuracion-personalizar`): colores, sacar accesos de los menús ☰,
// nombre de la familia y «De bebé a niño». El orden del menú («Organizar menú») es el capítulo `tut-ini-secciones-fijas` de Inicio (serie «Moverme y ordenar PEPA»); aquí solo queda su identificador antiguo como alias.
// No hay tutorial del «Modo de cuentas»: un solo toque lo guarda y cambia lo que ve toda la familia en Economía, así que no es seguro enseñarlo paso a paso.
// Nada de lo de «Mi cuenta» (cerrar sesión, borrar cuenta) se recorre en un tutorial: está en la visita «Conoce tu cuenta» y en las explicaciones de Cuentas.
// Los avisos (src/ui/NotificationsCard.tsx…) y la seguridad (SecuritySettings.tsx) tienen sus propios archivos en defs/f.

const info = { completeOn: [] as never[], manualNext: true }

export const visitaConfiguracion: TourDef = {
  id: 'visita-configuracion',
  kind: 'visit',
  module: 'configuracion',
  version: 2,
  title: 'Conoce Configuración',
  summary: 'Dónde está cada ajuste de PEPA: los 12 temas, el nombre de la familia y qué es tuyo.',
  cardId: 'cfg-que-hay',
  durationSec: 110,
  startPath: '/menu-organizar',
  steps: [
    {
      id: 'temas',
      text: 'Configuración es una lista de 12 temas. Toca uno y se despliega; solo se abre uno a la vez. Esta visita solo te enseña dónde está cada cosa: no cambia nada. El primero, «Organizar menú», es el orden de tus secciones fijas abajo.',
      target: 'config.group-menu',
      ...info,
    },
    {
      id: 'nombre',
      text: 'Arriba está el nombre de la familia; solo la administración de la familia puede cambiarlo. Debajo, solo en las cuentas que administran la aplicación, sale «Centro de Administración PEPA»: no es lo mismo que administrar tu familia.',
      target: 'config.family-name',
      ...info,
      optional: true,
    },
    {
      id: 'inicio-colores',
      text: '«Inicio» elige qué sale en el carrusel de arriba de Inicio (compra, calendario, Comunidad y fotos). Justo debajo, «Colores»: el estilo de las pantallas (Pastel, Vivo o Neutro) y, aparte, el de los gráficos. Al cambiarlo, la app se recarga.',
      target: 'config.group-inicio',
      ...info,
    },
    {
      id: 'familia-pepa',
      text: '«Familia» tiene «De bebé a niño»: a qué edad la ficha de un bebé pasa a niño/a (solo la administración lo cambia). «Pepa» elige qué botones de Pepa ves arriba y si hace lo que le pides directamente o te enseña antes una tarjeta.',
      target: 'config.group-familia',
      ...info,
    },
    {
      id: 'avisos',
      text: '«Avisos»: activar los avisos de este móvil, tu zona horaria y la hora de tus resúmenes de tareas y, para la administración, a quién llegan los avisos de tareas y eventos. En la app de Android también salen aquí el permiso de ubicación y la batería.',
      target: 'config.group-avisos',
      ...info,
    },
    {
      id: 'economia',
      text: 'Después van «Economía» (mes contable, modo de cuentas, bancos, categorías, etiquetas y colores) y «Compras y cocina» (las clases de productos). Los ajustes de dinero de la familia los cambia la administración.',
      target: 'config.group-economia',
      ...info,
    },
    {
      id: 'seguridad',
      text: '«Seguridad»: tu correo, tu contraseña y el PIN o la huella para abrir PEPA. Debajo está «Filtros temporales»: qué filtros de fecha ves en Economía y Compras, y cuál es tu favorito.',
      target: 'config.group-seguridad',
      ...info,
    },
    {
      id: 'calendario-cuenta',
      text: '«Calendario»: colores, categorías y calendarios externos (Google, enlazados). Y el último, «Mi cuenta»: cerrar sesión y borrar mi cuenta, que no se puede deshacer y pide escribir BORRAR. Aquí no toco nada.',
      target: 'config.group-calendario',
      ...info,
    },
  ],
  finishText: 'Ya sabes dónde está cada ajuste. Si quieres practicar, abre «Personalizar PEPA»: los colores, los accesos de los menús ☰ y los ajustes de la familia.',
  next: ['cfg-que-hay', 'cfg-colores', 'cfg-sacar-accesos'],
}

export const tutConfiguracionColores: TourDef = {
  id: 'tut-configuracion-colores',
  module: 'configuracion',
  group: 'Configuración',
  summary: 'Ver los estilos de color de las pantallas y de los gráficos, y saber qué pasa al elegir uno.',
  version: 2,
  title: 'Elegir los colores de la app',
  cardId: 'cfg-colores',
  durationSec: 60,
  startPath: '/menu-organizar',
  startDest: 'config.colores',
  readyOn: ['config.colors-ui'],
  steps: [
    {
      id: 'pantallas',
      text: 'Aquí eliges el estilo de Inicio, los menús ☰, las tarjetas, el calendario, las compras y la cocina: Pastel, Vivo o Neutro. Cada opción trae una muestra de colores y la que usas ahora lleva ✓.',
      target: 'config.colors-ui',
      ...info,
    },
    {
      id: 'graficos',
      text: 'Aquí, aparte, el estilo de los gráficos de Economía y de la estadística de compras: Pastel o Vivo.',
      target: 'config.colors-charts',
      ...info,
    },
    {
      id: 'decidir',
      text: 'Ojo: al tocar otro estilo, PEPA lo guarda de verdad en tu cuenta y la app se recarga para repintarse; este recorrido terminará ahí. Yo no lo toco por ti: si quieres cambiarlo, hazlo tú. Si no, pulsa «Siguiente».',
      target: 'config.colors-ui',
      ...info,
    },
  ],
  finishText: 'Cuando quieras, pulsa el estilo que prefieras. Se guarda en tu cuenta y vale en todos tus dispositivos; la app se recarga al elegirlo.',
  next: ['cfg-sincronizacion', 'cfg-que-hay'],
}

export const tutConfiguracionSacarAccesos: TourDef = {
  id: 'tut-configuracion-sacar-accesos',
  module: 'configuracion',
  group: 'Configuración',
  summary: 'Pon un acceso de un menú ☰ como botón en la pantalla, y quítalo cuando quieras.',
  version: 2,
  title: 'Sacar un acceso del menú ☰ a la pantalla',
  cardId: 'cfg-sacar-accesos',
  durationSec: 45,
  startPath: '/calendario',
  needs: [
    {
      target: 'calendar.menu',
      message: 'Te lo enseño en el menú ☰ del Calendario, y tu cuenta no tiene Calendario. Puedes leerlo igualmente: en Compras, La cocina, Economía, Ubicación y Comunidad el menú ☰ funciona igual.',
    },
  ],
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
      text: 'Cada acceso tiene a la derecha «📌 Sacar»: lo pone como botón en la pantalla, para tenerlo siempre a mano. Cuando ya está fuera, el botón pasa a «📍 Quitar» y lo devuelve al menú. Se guarda en tu cuenta. Aquí solo te lo enseño: yo no lo pulso por ti.',
      target: 'calendar.menu-pin',
      ...info,
      optional: true,
    },
    {
      id: 'otros',
      text: 'Los demás menús ☰ funcionan igual: Compras, La cocina, Economía, Ubicación y Comunidad (si la tienes abierta). Cada menú guarda sus propios accesos fuera.',
      target: 'calendar.menu-panel',
      ...info,
      optional: true,
    },
  ],
  finishText: 'No se ha cambiado nada. Cuando quieras, pulsa «📌 Sacar» en el acceso que uses más.',
  next: ['cfg-que-hay', 'cal-vistas'],
}

export const tutConfiguracionNombreFamilia: TourDef = {
  id: 'tut-configuracion-nombre-familia',
  module: 'configuracion',
  group: 'Configuración',
  summary: 'Cambiar el nombre de la familia (solo administración).',
  access: { familyAdmin: true },
  version: 2,
  title: 'Cambiar el nombre de la familia',
  cardId: 'cfg-nombre-familia',
  durationSec: 60,
  startPath: '/menu-organizar',
  readyOn: ['config.family-name'],
  steps: [
    {
      id: 'nombre',
      text: 'Arriba de Configuración está el nombre de tu familia. Solo la administración de la familia puede cambiarlo. Si lo cambias, se guarda de verdad para toda la familia cuando pulses «Guardar»; si solo estás practicando, sal sin guardar.',
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
  next: ['cfg-bebe-a-nino', 'cfg-que-hay'],
}

export const tutConfiguracionBebeANino: TourDef = {
  id: 'tut-configuracion-bebe-a-nino',
  module: 'configuracion',
  group: 'Configuración',
  summary: 'Elegir a qué edad la ficha de un bebé pasa sola a niño/a (solo administración).',
  access: { familyAdmin: true },
  version: 1,
  title: 'Elegir cuándo un bebé pasa a niño',
  cardId: 'cfg-bebe-a-nino',
  durationSec: 60,
  startPath: '/menu-organizar',
  startDest: 'config.familia',
  readyOn: ['config.baby-until'],
  steps: [
    {
      id: 'tarjeta',
      text: 'Los percentiles de crecimiento son solo para bebés. Esta tarjeta decide a qué edad la ficha de un bebé pasa sola a niño/a. Es un ajuste de toda la familia y solo lo cambia la administración. Se guarda de verdad en cuanto eliges una edad.',
      target: 'config.baby-until',
      ...info,
    },
    {
      id: 'opciones',
      text: 'Las edades posibles son 1 año, 18 meses, 2 años, 30 meses y 3 años. La que está marcada es la de ahora.',
      target: 'config.baby-until-options',
      ...info,
    },
    {
      id: 'elegir',
      text: 'Para cambiarla, toca una edad distinta de la marcada. Se guarda al momento para toda la familia. Yo no la toco por ti; si prefieres dejarla como está, pulsa «Salir».',
      target: 'config.baby-until-options',
      completeOn: [{ type: 'event', name: 'config.baby-until-saved' }],
      sensitive: true,
    },
    {
      id: 'resultado',
      text: 'Guardado. Desde ahora, cuando un bebé cumple esa edad, su ficha pasa sola a niño/a. Para volver a la anterior, toca esa edad otra vez.',
      target: 'config.baby-until-options',
      ...info,
    },
  ],
  finishText: 'Listo. La edad se aplica a todas las fichas de bebé de la familia.',
  next: ['cfg-nombre-familia', 'cfg-que-hay'],
}

export const TOURS_CONFIGURACION: TourDef[] = [
  visitaConfiguracion,
  tutConfiguracionColores,
  tutConfiguracionSacarAccesos,
  tutConfiguracionNombreFamilia,
  tutConfiguracionBebeANino,
]
