import type { HelpExplainer } from '@/help/explainers/types'

// «Cómo funciona PEPA» → Calendario. Cada explicación sale del código (se lista en `basedOn`); si cambia, se revisa el texto. Fecha de comprobación: 23/10/2026.
// Solo hay pruebas automáticas (jsdom): nada de esto se ha comprobado en un móvil real, y lo que depende del servidor (avisos, permisos) se ha leído en las migraciones, no probado en vivo.
const V = '2026-10-23'

export const expCalendarioRepeticiones: HelpExplainer = {
  id: 'exp-calendario-repeticiones',
  module: 'calendario',
  title: 'Cómo funcionan las repeticiones y los cambios en una serie',
  summary: 'Un evento o una tarea que se repite es una sola ficha con una regla. Aquí ves cómo se calculan los días y qué significa cada opción al editar una serie.',
  sections: [
    {
      heading: 'Una sola ficha, muchos días',
      paragraphs: [
        'Cuando eliges una «Repetición», PEPA no crea una copia por cada día. Guarda un solo evento o tarea con una regla (por ejemplo, «cada semana, hasta el 20 de diciembre») y calcula los días que hay que pintar cada vez que abres el calendario.',
        'Los preajustes son: «Todos los días», «Todos los días laborables» (de lunes a viernes), «Todas las semanas», «Cada 2 semanas», «Todos los meses» y «Todos los años». Con «Personalizado…» eliges la frecuencia y, si es semanal, los días de la semana.',
      ],
      example: 'Ejemplo inventado: «Fútbol de Eric» empieza el martes 3 de noviembre con «Todas las semanas». Saldrá también el 10, el 17 y el 24 de noviembre, siempre en martes.',
    },
    {
      heading: 'Hasta cuándo, y los festivos',
      paragraphs: [
        'Si no pones nada, la serie sigue sin fecha de fin. Con «Repetir hasta (opcional)» eliges el último día. Con «Excluir festivos» se saltan los días que sean festivo en el calendario de festivos que hayas enlazado en Configuración → Calendario; si no hay ninguno enlazado, no se salta nada.',
        'Los días de la semana marcados («Todos los días laborables» o un «Personalizado» con días) y «Cada 2 semanas» no se combinan: si marcas días concretos, se repite todas las semanas en esos días.',
      ],
    },
    {
      heading: 'Marcar como hecho',
      paragraphs: ['Cada día de la serie tiene su propio círculo. Marcar hoy como hecho no marca los demás días, y los puntos (si los hay) se dan una vez por cada día marcado.'],
    },
    {
      heading: 'Cambiar una serie: tres alcances',
      paragraphs: [
        'Al editar algo que se repite aparece «Guardar cambios en» con tres opciones. «Toda la serie» cambia la ficha única: el cambio vale también para los días pasados y futuros.',
        '«Solo esta repetición» saca ese día de la serie: la serie sigue igual sin ese día y los cambios se guardan en un evento suelto, nuevo, solo para esa fecha (si ese día ya estaba marcado como hecho, se conserva).',
        '«Esta y las siguientes» corta la serie original el día anterior y crea otra que empieza ese día con los cambios y sigue repitiéndose. Lo que ya estaba hecho desde ese día en adelante pasa a la nueva.',
      ],
      example: 'Ejemplo: «Gimnasia» es cada lunes. El lunes 9 de noviembre eliges «Esta y las siguientes» y cambias la hora a las 18:00. Los lunes anteriores se quedan como estaban y desde el 9 en adelante salen a las 18:00.',
    },
    {
      heading: 'Borrar un día o toda la serie',
      paragraphs: ['Si una fila se repite y la deslizas para «Eliminar», PEPA pregunta «Solo este día» o «Toda la serie», y puedes «Cancelar». Un apunte que no se repite se borra directamente.'],
    },
  ],
  limits: [
    'Si un evento mensual empieza el día 29, 30 o 31, en pantalla puede salir descolocado en los meses más cortos, y los avisos solo se mandan en los meses que tienen ese día. Para evitar líos, empieza la serie un día entre el 1 y el 28.',
    '«Solo esta repetición» y «Esta y las siguientes» crean fichas nuevas: después son eventos distintos y para cambiarlos todos hay que editarlos por separado.',
    'No he visto en la app un botón para deshacer un cambio de serie: se corrige volviendo a editar.',
    'El cálculo está pensado para unos años; más allá de unos diez años no se garantiza que se vean todas las repeticiones.',
    'Las citas de calendarios enlazados (por ejemplo, Google) se ven pero no se editan desde PEPA.',
  ],
  ifWrong: [
    'Si has elegido mal el alcance, vuelve a tocar el evento y corrígelo. Con «Esta y las siguientes» hay dos fichas: edita la que corresponda.',
    'Si una serie sale en días que no esperabas, mira «Repetición», «Repetir hasta (opcional)» y, en semanales, los días marcados. Una serie semanal sin días marcados se cuenta de 7 en 7 días desde la fecha de inicio.',
    'Si una repetición aparece o desaparece sin que encuentres explicación, puede ser un fallo técnico: cuéntalo en el buzón de Sugerencias (Ayuda) con el nombre del evento y las fechas.',
  ],
  verified: V,
  basedOn: ['src/domain/recurrence.ts', 'src/domain/calendar.ts', 'src/data/calendar.ts', 'src/ui/CalendarScreen.tsx', 'supabase/migrations/0154_fix_recurring_reminder_occurrences.sql'],
  tour: 'tut-calendario-editar-evento',
  go: { path: '/calendario' },
  labels: [
    'Repetición',
    'Todos los días',
    'Todos los días laborables',
    'Todas las semanas',
    'Cada 2 semanas',
    'Todos los meses',
    'Todos los años',
    'Personalizado…',
    'Repetir hasta (opcional)',
    'Excluir festivos',
    'Guardar cambios en',
    'Toda la serie',
    'Solo esta repetición',
    'Esta y las siguientes',
    'Solo este día',
    'Eliminar',
    'Cancelar',
  ],
  cardIds: ['cal-repeticion', 'cal-crear-evento', 'cal-crear-tarea'],
  synonyms: ['por qué se repite', 'cada semana', 'serie', 'solo esta repetición', 'esta y las siguientes', 'editar una serie', 'evento recurrente', 'cómo funciona la repetición', 'borrar solo un día', 'tarea que se repite'],
}

export const expCalendarioPuntos: HelpExplainer = {
  id: 'exp-calendario-puntos',
  module: 'calendario',
  title: 'Cómo se dan los puntos de eventos y tareas',
  summary: 'Un evento o una tarea puede dar puntos a UNA persona cuando se marca como hecho. Quién los recibe, cuándo y qué límites tiene.',
  sections: [
    {
      heading: 'Dónde se ponen',
      paragraphs: [
        'En «Nuevo evento» o «Nueva tarea» (y al editarlos) sale el campo «Puntos al marcarlo "Hecho" (opcional)»; al crear una tarea, «Puntos al marcarla "Hecha" (opcional)». Solo aparece si en «¿Para quién?» hay UNA sola persona.',
        'Con «Toda la familia» o con dos o más personas no hay campo, y los puntos se guardan como 0: PEPA no reparte puntos entre varias personas.',
      ],
    },
    {
      heading: 'Cuándo se ganan y quién los recibe',
      paragraphs: [
        'Se ganan al marcar el apunte como hecho (el círculo). En ese momento PEPA apunta los puntos que tenía a la persona asignada, aunque quien toque el círculo sea otra persona de la familia.',
        'En algo que se repite, cada día marcado da sus puntos, y un mismo día solo se puede marcar una vez.',
      ],
      example: 'Ejemplo inventado: la tarea «Recoger la habitación» es para Eric y vale 5 puntos. Cuando alguien la marca como hecha hoy, Eric suma 5 puntos. Mañana, si se repite y se marca, suma otros 5.',
    },
    {
      heading: 'Dónde se ven',
      paragraphs: ['Los puntos se suman al saldo de esa persona en Pequeños Grandes → Puntos y recompensas, junto con los que dé un adulto a mano. Con ese saldo se canjean las recompensas.'],
    },
    {
      heading: 'Si cambias algo después',
      paragraphs: [
        'Los puntos que ya se dieron se quedan con la cantidad que tenían al marcar. Si cambias los puntos o la persona del apunte, el cambio afecta a las próximas veces, no a las ya marcadas.',
        'Si vuelves a tocar el círculo («Marcar como pendiente»), ese día deja de contar y sus puntos se quitan. Por eso los puntos de un «Hecho» del Calendario no se corrigen desde el historial de puntos, sino desmarcando el apunte.',
      ],
    },
  ],
  limits: [
    'Solo con una persona. Con varias personas o con «Toda la familia» no hay puntos.',
    'Los eventos de calendarios enlazados (Google, Outlook…) y los cumpleaños no dan puntos: los primeros se pueden marcar como hechos, pero sin puntos.',
    'PEPA no pide que un adulto confirme que algo está hecho: cualquiera con acceso al Calendario puede tocar el círculo de un apunte compartido, y la persona asignada recibe los puntos. Según lo que he leído en el código, tampoco se manda ningún aviso al marcar algo como hecho.',
    'No he podido comprobar cómo queda el saldo si se desmarca un apunte cuyos puntos ya se habían gastado en un premio. Ante la duda, habla antes con un adulto.',
  ],
  ifWrong: [
    'Si marcaste algo por error, toca otra vez el círculo: queda pendiente y los puntos de ese día se quitan.',
    'Si no ves el campo de puntos, mira «¿Para quién?»: tiene que haber una sola persona marcada. Es una limitación normal, no un fallo.',
    'Si marcaste un apunte con puntos de una sola persona y el saldo de Pequeños Grandes no ha cambiado, puede ser un fallo técnico: cuéntalo en el buzón de Sugerencias (Ayuda) con el nombre del apunte y el día.',
  ],
  verified: V,
  basedOn: ['src/ui/CalendarScreen.tsx', 'src/data/calendar.ts', 'supabase/migrations/0040_tasks_to_events.sql', 'supabase/migrations/0229_pequenos_grandes_rewards_approval.sql', 'src/help/catalog/cardsOtros.ts'],
  tour: 'tut-calendario-puntos',
  go: { path: '/calendario', dest: 'calendario.nueva-tarea' },
  labels: ['¿Para quién?', 'Toda la familia', 'Puntos al marcarlo "Hecho" (opcional)', 'Puntos al marcarla "Hecha" (opcional)', 'Marcar como pendiente', 'Marcar como hecho'],
  cardIds: ['cal-puntos', 'cal-para-quien', 'cal-hecho', 'pg-puntos'],
  synonyms: ['puntos', 'cómo se dan los puntos', 'por qué no me salen los puntos', 'quién gana los puntos', 'puntos por tarea', 'recompensa por tarea', 'por qué no sale el campo de puntos'],
}

export const expCalendarioRecordatorios: HelpExplainer = {
  id: 'exp-calendario-recordatorios',
  module: 'calendario',
  title: 'Cómo funcionan los recordatorios',
  summary: 'Qué es un recordatorio, cuándo llega, qué pasa con la app abierta o cerrada y qué avisos hay para las tareas.',
  sections: [
    {
      heading: 'Qué se puede elegir',
      paragraphs: [
        'Los recordatorios son de los eventos; las tareas no llevan hora ni recordatorio. En «Recordatorio» eliges cuánto antes de que empiece: 10 minutos, 30 minutos, 1 hora, 1 día, 1 semana, 1 mes o 1 año, o «Personalizado…» con cantidad y unidad. Puedes tener varios en el mismo evento.',
        'Si el evento tiene hora de fin, también puedes elegir «Antes de terminar» en vez de «Antes de empezar».',
      ],
    },
    {
      heading: 'Cuándo y cómo llega',
      paragraphs: [
        'El aviso lo manda el servidor de PEPA a los móviles que tienen los avisos activados, también con la app cerrada. Las horas se cuentan en la hora de Madrid. El servidor revisa los avisos pendientes cada minuto, así que puede llegar unos segundos después de la hora exacta.',
        'El texto dice, por ejemplo, «Empieza a las 17:00» o «Empieza mañana a las 17:00». En un evento de todo el día dice «Hoy, todo el día» o «Mañana, todo el día», sin hora.',
        '«1 día antes» son 24 horas justas. En las dos noches del año en que cambia la hora, puede salir una hora distinta de la del evento.',
      ],
      example: 'Ejemplo inventado: «Dentista de Eric» es el jueves a las 17:00 con dos recordatorios, «1 día antes» y «1 hora antes». Llegan dos avisos: el miércoles a las 17:00 y el jueves a las 16:00.',
    },
    {
      heading: 'Con la app abierta o sin avisos activados',
      paragraphs: [
        'Si tu móvil tiene los avisos activados, el servidor es quien avisa y la app abierta no repite el mismo aviso. Si el aviso del servidor no llega en un par de minutos, la app abierta lo muestra ella.',
        'Si tu móvil no tiene los avisos activados, la app abierta los muestra por su cuenta (lo comprueba cada medio minuto). Y quien no tiene ningún móvil dado de alta lo ve igualmente anotado en la campana de Inicio.',
      ],
    },
    {
      heading: 'El aviso «Todavía pendiente»',
      paragraphs: ['Mientras la app está abierta, si un evento de hoy con hora ya ha pasado y no está marcado como hecho, PEPA te lo recuerda con «Todavía pendiente» cada media hora. Solo se marca «hecho» con el círculo.'],
    },
    {
      heading: 'Y para las tareas',
      paragraphs: [
        'Las tareas no tienen recordatorio, pero en Configuración → Avisos → «Avisos de tareas» puedes pedir un resumen diario de tus tareas de hoy («Avisarme de las tareas de hoy», activado por defecto a las 08:00) y otro de las atrasadas («Avisarme de las tareas atrasadas», desactivado por defecto, a las 09:00). Solo se envían si hay tareas.',
        'Además, si alguien te asigna una tarea compartida, te llega «Te han asignado una tarea» al momento.',
      ],
    },
  ],
  limits: [
    'En iPhone (web) hay que instalar PEPA en la pantalla de inicio para que lleguen avisos. Que el aviso llegue con la app cerrada también depende de los ajustes de batería del móvil.',
    'Guardar un evento sin cambiar su hora no repite los avisos ya enviados; si cambias de verdad la hora del evento, el aviso se vuelve a preparar.',
    'Un evento privado solo avisa a quien lo creó.',
    'El aviso de «Todavía pendiente» solo sale con la app abierta y solo para eventos con hora, no para tareas ni eventos de todo el día.',
    'Quién recibe cada aviso depende del ajuste de avisos de la familia (otra explicación de esta sección).',
  ],
  ifWrong: [
    'Si no te llegan avisos al móvil, mira Configuración → Avisos → «Avisos en este móvil» y manda uno de prueba. Es lo primero que conviene comprobar; en Android, revisa también la batería.',
    'Si el aviso llega unos segundos tarde, o no sale porque el evento es de otra persona y tu familia ha elegido «Solo los miembros asignados», es una limitación normal.',
    'Si con los avisos activados y probados te llegan avisos duplicados o a una hora equivocada, puede ser un fallo técnico: cuéntalo en el buzón de Sugerencias (Ayuda) con el título del evento y la hora.',
  ],
  verified: V,
  basedOn: [
    'src/domain/reminders.ts',
    'src/domain/reminderIdentity.ts',
    'src/ui/ReminderWatcher.tsx',
    'src/ui/TaskSummaryPrefs.tsx',
    'src/domain/notificationPrefs.ts',
    'supabase/migrations/0197_reminders_future_occurrences_and_stable_identity.sql',
    'supabase/migrations/0261_family_notification_recipients.sql',
  ],
  tour: 'tut-calendario-evento-recordatorio',
  go: { path: '/calendario', dest: 'calendario.nuevo-evento' },
  labels: [
    'Recordatorio',
    'Sin recordatorio',
    'Personalizado…',
    'Antes de empezar',
    'Antes de terminar',
    'Todavía pendiente',
    'Hoy, todo el día',
    'Avisos de tareas',
    'Avisarme de las tareas de hoy',
    'Avisarme de las tareas atrasadas',
    'Avisos en este móvil',
  ],
  cardIds: ['cal-recordatorio', 'not-activar', 'not-resumen-tareas'],
  synonyms: ['por qué no me avisa', 'recordatorio', 'cómo funciona el recordatorio', 'no me llega el aviso', 'aviso antes del evento', 'avisos duplicados', 'a qué hora avisa', 'alarma'],
}

export const expCalendarioQuienRecibeAvisos: HelpExplainer = {
  id: 'exp-calendario-quien-recibe-avisos',
  module: 'calendario',
  title: 'A quién avisa PEPA de un evento o una tarea',
  summary: 'Quién recibe los recordatorios y avisos de cada apunte: lo decide un ajuste de la familia, la privacidad y la casilla «Aviso a toda la familia».',
  sections: [
    {
      heading: 'La regla',
      paragraphs: [
        'Un apunte privado avisa solo a quien lo creó. Para uno compartido manda el ajuste de la familia «¿A quién avisamos de tareas y eventos?», que cambia un administrador en Configuración → Avisos.',
        'Mientras nadie elija nada, los avisos van a las personas asignadas que tienen cuenta y a los administradores. Con «Todos los miembros activos», llegan a todas las cuentas con acceso al Calendario. Con «Solo los miembros asignados», solo a quien tenga el apunte asignado.',
        'Excepción que se aplica siempre: si lo asignado es un menor sin cuenta propia, avisa a todos los adultos con cuenta.',
      ],
      example: 'Ejemplo inventado: con «Solo los miembros asignados», la tarea «Sacar la basura» es para Eric, que es pequeño y no tiene cuenta. El aviso llega a Ana y a Luis, que son adultos con cuenta, y no a Marta, que es una invitada.',
    },
    {
      heading: 'La casilla «Aviso a toda la familia»',
      paragraphs: [
        'Solo aparece al crear o editar un apunte cuando la familia usa «Solo los miembros asignados» y el apunte no es privado. Viene desmarcada. Si la marcas, ese apunte avisa a todas las cuentas de la familia con acceso a Calendario; no cambia a quién está asignado, ni los permisos, ni la privacidad.',
      ],
    },
    {
      heading: 'Aviso de asignación',
      paragraphs: ['Cuando asignas una tarea compartida a otra persona, esa persona recibe «Te han asignado una tarea» al momento. Quien asigna no recibe aviso de lo que asigna, y editar la tarea no lo repite. Esto es solo para tareas, no para eventos.'],
    },
    {
      heading: 'Quién puede cambiar el ajuste',
      paragraphs: ['Solo un administrador de la familia. El resto ve el ajuste en modo lectura.'],
    },
  ],
  limits: [
    'Los avisos van a cuentas, no a fichas: una persona de la familia sin cuenta no recibe nada, salvo la excepción de los menores, que avisa a los adultos.',
    'Solo reciben avisos las cuentas con acceso a la sección Calendario.',
    'Que el aviso llegue al móvil depende de que esa persona tenga los avisos activados; si no, lo verá en la campana de Inicio.',
    'El resumen diario de tareas es distinto: con el ajuste sin elegir solo cuenta lo asignado a cada persona.',
  ],
  ifWrong: [
    'Si alguien no recibe un aviso que esperabas, mira primero el ajuste de la familia y si esa persona está asignada al apunte. Después comprueba que su ficha en Familia está enlazada a su cuenta y que tiene los avisos activados en su móvil.',
    'Si quieres que un apunte concreto avise a todos, marca «Aviso a toda la familia» (solo sale con «Solo los miembros asignados»).',
    'Si el reparto no se parece a lo explicado aquí, puede ser un fallo técnico: cuéntalo en el buzón de Sugerencias (Ayuda) con un ejemplo.',
  ],
  verified: V,
  basedOn: ['src/domain/eventRecipients.ts', 'src/ui/NotifyFamilyCheckbox.tsx', 'src/ui/TaskNotifyModeCard.tsx', 'src/domain/notificationPrefs.ts', 'supabase/migrations/0261_family_notification_recipients.sql'],
  go: { path: '/menu-organizar', dest: 'config.avisos' },
  labels: ['¿A quién avisamos de tareas y eventos?', 'Todos los miembros activos', 'Solo los miembros asignados', 'Aviso a toda la familia'],
  cardIds: ['cal-para-quien', 'cal-recordatorio', 'not-resumen-tareas'],
  synonyms: ['quién recibe los avisos', 'a quién avisa', 'por qué no le llega el aviso', 'avisar a todos', 'avisos de tareas', 'solo los asignados', 'aviso a toda la familia'],
}

export const expCalendarioPrivadoFamiliar: HelpExplainer = {
  id: 'exp-calendario-privado-familiar',
  module: 'calendario',
  title: 'Eventos privados y eventos de la familia',
  summary: 'Qué ve cada persona de un evento o una tarea según sea «Privado» o compartido, y qué no cambia «¿Para quién?».',
  sections: [
    {
      heading: 'Compartido (lo normal)',
      paragraphs: [
        'Un evento o una tarea normal lo ven todas las cuentas de la familia con acceso a Calendario, y cualquiera de ellas puede editarlo o marcarlo como hecho. «¿Para quién?» no controla quién lo ve: solo dice a quién se asigna, de qué color sale y a quién se avisa.',
      ],
      example: 'Ejemplo inventado: «Dentista de Eric» es para Eric. Sigue viéndolo toda la familia con acceso a Calendario, aunque salga con el color de Eric.',
    },
    {
      heading: '«🔒 Privado — Solo yo puedo verlo»',
      paragraphs: [
        'Con la casilla marcada, solo la persona que lo creó puede ver y editar ese evento o tarea. Lo impone la base de datos, no solo la pantalla: ni los demás miembros ni la administración lo ven. En tus vistas sale con un 🔒 delante del título.',
        'Un privado avisa solo a quien lo creó, la casilla «Aviso a toda la familia» no se ofrece, y no se manda al Google Calendar de otras personas.',
      ],
    },
    {
      heading: 'La vista Personal',
      paragraphs: [
        'Lo que creas desde la vista Personal empieza ya como privado (puedes desmarcarlo). Personal enseña tus eventos y tareas asignados a ti y tus privados, y debajo tus notas privadas, que son otra cosa: se guardan aparte y solo las ves tú.',
      ],
    },
    {
      heading: 'Cambiar de uno a otro',
      paragraphs: ['Al editar puedes marcar o desmarcar «Privado». Si lo desmarcas, lo verá toda la familia con acceso a Calendario.'],
    },
  ],
  limits: [
    'Un privado puede tener a otra persona en «¿Para quién?», pero esa persona no lo verá ni recibirá avisos de él.',
    'Una cuenta sin acceso a la sección Calendario no ve nada del calendario, ni compartido ni privado.',
    'El icono 📤 manda el título, la fecha y la nota como texto fuera de PEPA; lo que hagan con él después ya no depende de PEPA. También sale en un evento privado.',
    'Si no ves un evento que otra persona dice haber creado, lo normal es que sea privado o que tu cuenta no tenga acceso a Calendario.',
  ],
  ifWrong: [
    'Si un evento tuyo se ve más de lo que querías, edítalo y marca «Privado». Si es privado y quieres que lo vea la familia, desmárcalo.',
    'Si ves un evento privado de otra persona, sería un fallo grave de privacidad: avísalo cuanto antes en el buzón de Sugerencias (Ayuda), diciendo qué evento es.',
  ],
  verified: V,
  basedOn: [
    'src/ui/CalendarScreen.tsx',
    'src/domain/calendar.ts',
    'src/domain/eventRecipients.ts',
    'supabase/migrations/0089_calendar_event_private_visibility.sql',
    'supabase/migrations/0261_family_notification_recipients.sql',
    'supabase/functions/sync-calendar-to-google-cron/index.ts',
  ],
  go: { path: '/calendario' },
  labels: ['🔒 Privado — Solo yo puedo verlo', '¿Para quién?', 'Aviso a toda la familia', 'Notas privadas'],
  cardIds: ['cal-privado', 'cal-para-quien', 'cal-compartir'],
  synonyms: ['privado', 'solo yo', 'quién ve mi evento', 'evento secreto', 'por qué no veo un evento', 'compartido', 'personal', 'nota privada'],
}

export const EXPLAINERS_CALENDARIO: HelpExplainer[] = [
  expCalendarioRepeticiones,
  expCalendarioPuntos,
  expCalendarioRecordatorios,
  expCalendarioQuienRecibeAvisos,
  expCalendarioPrivadoFamiliar,
]
