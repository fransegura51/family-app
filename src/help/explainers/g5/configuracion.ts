import type { HelpExplainer } from '@/help/explainers/types'

// Configuración: qué ajustes son personales y cuáles de toda la familia, y cómo funcionan los avisos (campana, móvil y resúmenes diarios). Comprobado contra
// MenuSettingsScreen.tsx, las tarjetas de «Avisos», src/state/prefs, docs/CONFIG_01_SINCRONIZACION_PREFERENCIAS.md y las migraciones 0186, 0263, 0283.

export const expConfiguracionAjustesPersonalesFamiliares: HelpExplainer = {
  id: 'exp-configuracion-ajustes-personales-familiares',
  module: 'configuracion',
  title: 'Qué ajustes son tuyos y cuáles son de toda la familia',
  summary: 'En Configuración, unos ajustes son solo tuyos y te siguen a todos tus dispositivos; otros son de la familia y solo los cambia la administración.',
  sections: [
    {
      heading: 'Los tuyos',
      paragraphs: [
        'Son tuyos el orden del menú, el de las tarjetas de Inicio, los colores, los menús de cada sección, cómo te contesta Pepa, tus horarios de avisos, tus filtros temporales («📅 Filtros temporales»), tu mes contable («📅 Inicio del mes contable») y cómo ves el calendario.',
        'Cada persona de la familia puede tener los suyos distintos sin afectar a los demás. Se guardan en tu cuenta, así que los ves igual en tu móvil y en tu ordenador.',
      ],
      example: 'Ejemplo inventado: Ana pone «Economía» entre las cuatro secciones fijas abajo y Luis no. Cada uno ve su barra como la dejó.',
    },
    {
      heading: 'Los de la familia',
      paragraphs: [
        'Son de toda la familia el nombre de la familia, el «🔐 Modo de cuentas», «👶 De bebé a niño» y «🔔 ¿A quién avisamos de tareas y eventos?». Solo la administración de la familia puede cambiarlos; el resto los puede ver, pero no cambiarlos.',
        'Ojo: algunas pantallas dejan tocar los botones aunque no seas administración, y el servidor solo acepta el cambio de quien administra.',
      ],
    },
    {
      heading: 'Si cambias algo en dos dispositivos',
      paragraphs: [
        'Los ajustes tuyos de pantalla viajan entre tus dispositivos casi al momento. Si cambias lo mismo en dos a la vez, gana el cambio ya confirmado y PEPA te avisa con «Se aplicó un cambio más reciente hecho en otro dispositivo…»; el tuyo no se pierde: puedes recuperarlo con «Recuperar el mío».',
        'Si cambias el estilo de color en otro dispositivo, aquí no se recarga sola la app: te lo avisa y eliges «Aplicar ahora».',
      ],
    },
    {
      heading: 'Lo que es de cada dispositivo',
      paragraphs: [
        'No viajan los permisos del sistema, quién comparte la ubicación en ese móvil ni los avisos de «🔔 Avisos en este móvil»: cada móvil tiene los suyos.',
      ],
    },
  ],
  limits: [
    'La sincronización entre dispositivos está en producción, pero su comprobación con móviles y ordenadores reales sigue pendiente de hacerse.',
    'Si un cambio no se puede subir (sin conexión, por ejemplo), PEPA lo guarda en el dispositivo y lo reintenta; si falla de forma persistente lo muestra con «Reintentar ahora».',
    'El progreso de los tutoriales y la preferencia de voz de la Ayuda se guardan solo en el dispositivo por ahora.',
  ],
  ifWrong: [
    'Si no te deja cambiar un ajuste de la familia, pídeselo a la administración de tu familia.',
    'Si dos dispositivos muestran cosas distintas, cierra y vuelve a abrir PEPA en el que esté desfasado; si sigue igual, cuéntalo en Sugerencias indicando qué ajuste y en qué dispositivos.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/MenuSettingsScreen.tsx',
    'src/ui/TaskNotifyModeCard.tsx',
    'src/ui/PrefsNotices.tsx',
    'src/state/prefs/prefsRegistry.ts',
    'docs/CONFIG_01_SINCRONIZACION_PREFERENCIAS.md',
  ],
  tour: 'tut-configuracion-orden-menu',
  go: { path: '/menu-organizar' },
  labels: [
    '📅 Filtros temporales',
    '📅 Inicio del mes contable',
    '🔐 Modo de cuentas',
    '👶 De bebé a niño',
    '🔔 ¿A quién avisamos de tareas y eventos?',
    'Recuperar el mío',
    'Aplicar ahora',
    'Reintentar ahora',
  ],
  cardIds: ['cfg-que-hay', 'cfg-sincronizacion', 'cfg-nombre-familia'],
  synonyms: ['ajustes personales', 'ajustes de la familia', 'por qué no me deja cambiar', 'mi menú en otro móvil', 'sincronizar', 'solo yo veo este orden', 'quién puede cambiar la configuración'],
}

export const expConfiguracionAvisos: HelpExplainer = {
  id: 'exp-configuracion-avisos',
  module: 'notificaciones',
  title: 'Cómo funcionan los avisos: campana, móvil y resúmenes diarios',
  summary: 'Los avisos llegan a la campana 🔔 de PEPA y, si activas los avisos de ese móvil, también al teléfono. Los resúmenes de tareas tienen su propia hora.',
  sections: [
    {
      heading: 'Dos sitios donde llegan',
      paragraphs: [
        'La campana 🔔 de Inicio guarda tus avisos dentro de PEPA. Los avisos del móvil son los que suenan o aparecen en la pantalla; se activan móvil a móvil en «🔔 Avisos en este móvil» y, en el móvil, hay que aceptar el permiso.',
        'Si los avisos de ese móvil están desactivados, los resúmenes los verás igualmente en la campana, pero no te llegarán al teléfono.',
      ],
    },
    {
      heading: 'Resumen diario de tus tareas',
      paragraphs: [
        'Hay dos avisos independientes, cada uno con su interruptor y su hora (formato 24 h, en tu zona horaria): «Avisarme de las tareas de hoy» (activado por defecto, a las 08:00) y «Avisarme de las tareas atrasadas» (desactivado por defecto; al activarlo se propone las 09:00).',
        'El aviso llega desde la hora elegida y como mucho una hora después, una vez al día, y solo si hay tareas: nunca se manda uno vacío. Solo lo reciben las cuentas con acceso a Calendario. Se guarda en el servidor, por persona, y vale en todos tus dispositivos.',
        'Los recordatorios de cada tarea o evento no cambian con estos ajustes.',
      ],
      example: 'Ejemplo inventado: Luis activa «Avisarme de las tareas atrasadas» a las 09:00. Si un día tiene 2 tareas vencidas, recibe un resumen con ellas; si no tiene ninguna, no recibe nada.',
    },
    {
      heading: 'A quién se avisa de las tareas y eventos de la familia',
      paragraphs: [
        '«🔔 ¿A quién avisamos de tareas y eventos?» es un ajuste de toda la familia, solo para la administración. Mientras no se elija nada, los avisos van a la persona asignada y a los administradores. Se puede elegir «Todos los miembros activos» o «Solo los miembros asignados».',
      ],
    },
    {
      heading: 'Avisos de llegada y salida de lugares',
      paragraphs: [
        'Los avisos de ubicación y las reglas de «Reglas» también aparecen en la campana y llegan al móvil. Están explicados en «Cómo funcionan los avisos de llegada y salida».',
      ],
    },
  ],
  limits: [
    'Los avisos del móvil dependen también de los ajustes del propio teléfono (batería, no molestar). En iPhone, desde la web, hay que añadir PEPA a la pantalla de inicio para recibirlos.',
    'La hora de los avisos de las reglas «Todos los días a una hora» es la de España peninsular, aunque tu zona horaria sea otra.',
    'No hay un botón para marcar todos los avisos como leídos de golpe.',
  ],
  ifWrong: [
    'Si no te llegan al móvil: en Configuración → «Avisos», mira «🔔 Avisos en este móvil». Si dice que están bloqueados, hay que permitirlos en los ajustes del teléfono; PEPA no puede hacerlo sola. Cuando estén activados, pulsa «Mandarme un aviso de prueba».',
    'Si el resumen no llega a la hora, comprueba que el interruptor está marcado, la zona horaria y que tu cuenta tiene acceso a Calendario. Si todo está bien y sigue sin llegar, cuéntalo en Sugerencias con la hora y el día.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/NotificationsCard.tsx',
    'src/ui/NotificationPrefsCard.tsx',
    'src/ui/TaskSummaryPrefs.tsx',
    'src/ui/TaskNotifyModeCard.tsx',
    'src/domain/notificationPrefs.ts',
    'supabase/migrations/0283_task_summary_preferences.sql',
    'supabase/migrations/0263_notification_history_for_existing_alerts.sql',
    'supabase/migrations/0186_server_side_automations.sql',
  ],
  tour: 'tut-notificaciones-horario-avisos',
  go: { path: '/menu-organizar', dest: 'config.avisos' },
  labels: [
    '🔔 Avisos en este móvil',
    '🕗 Horarios de tus avisos',
    'Avisarme de las tareas de hoy',
    'Avisarme de las tareas atrasadas',
    '🔔 ¿A quién avisamos de tareas y eventos?',
    'Todos los miembros activos',
    'Solo los miembros asignados',
    'Mandarme un aviso de prueba',
  ],
  cardIds: ['not-activar', 'not-campana', 'not-resumen-tareas'],
  synonyms: ['por qué no me llegan los avisos', 'notificaciones', 'resumen de tareas', 'a qué hora llega el aviso', 'campana', 'avisos del móvil', 'quién recibe los avisos'],
}

export const EXPLAINERS_CONFIGURACION: HelpExplainer[] = [expConfiguracionAjustesPersonalesFamiliares, expConfiguracionAvisos]
