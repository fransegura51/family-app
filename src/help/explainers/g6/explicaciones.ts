import type { HelpExplainer } from '@/help/explainers/types'

// Explicaciones «Cómo funciona PEPA» del grupo g6: Inicio, campana de avisos, Documentos, Galería, Contactos y Cumpleaños. Todo lo que afirman se ha comprobado leyendo el código
// de las pantallas, los datos y las migraciones indicadas en `basedOn` el 23/10/2026. Lo que no se ha podido probar en un móvil real se dice así.
const V = '2026-10-23'

export const expInicioCarrusel: HelpExplainer = {
  id: 'exp-inicio-carrusel',
  module: 'inicio',
  title: 'Qué enseña el carrusel de Inicio y de dónde salen sus datos',
  summary: 'El carrusel de arriba en Inicio pasa cuatro tipos de diapositiva. Aquí ves qué muestra cada una y de dónde saca la información.',
  sections: [
    {
      heading: 'Qué diapositivas hay y en qué orden',
      paragraphs: [
        'El orden es siempre el mismo: «Compra pendiente», «Hoy en el calendario», Comunidad PEPA (solo si Comunidad está abierta para ti) y, al final, las fotos de la Galería.',
        'Pasa sola cada pocos segundos. Si pones el dedo encima se para mientras lo mantienes; si deslizas hacia un lado, cambia de diapositiva.',
      ],
    },
    {
      heading: 'Compra pendiente',
      paragraphs: [
        'Enseña los artículos de tu lista de la compra que siguen pendientes, con su cantidad si la tienen. Salen hasta 4 y el resto se resume como «+N más».',
        'Si no hay nada pendiente dice «Nada pendiente todavía 🎉». El enlace «Ir a la Lista →» te lleva a Compras.',
      ],
      example: 'Ejemplo inventado: si la lista tiene «2 l leche», «pan» y «huevos», la diapositiva los escribe sobre la libreta, uno por línea.',
    },
    {
      heading: 'Hoy en el calendario',
      paragraphs: [
        'Enseña los eventos y las tareas del Calendario que caen en el día de hoy (también los que se repiten), ordenados por hora; los de todo el día salen primero. Salen hasta 4 y el resto, como «+N más».',
        'Un evento privado tuyo sale con 🔒. Los privados de otras personas no llegan a esta pantalla. Si no hay nada, dice «Nada apuntado para hoy».',
      ],
    },
    {
      heading: 'Comunidad PEPA y fotos',
      paragraphs: [
        'La diapositiva de Comunidad enseña hasta 3 publicaciones reales, por este orden de importancia: las que no has leído, las que tienen respuestas que no has visto, aquellas en las que has participado o te han gustado y, por último, las más recientes. Si no se pueden cargar, la diapositiva no sale; nunca se inventa nada.',
        'Las fotos son de tu Galería PEPA: hasta 5, al azar o las fijas que elijas. Si aún no hay ninguna foto, sale una tarjeta que lo explica y desaparece con la primera que subas.',
      ],
    },
    {
      heading: 'Cuándo se actualiza y cómo la configuras',
      paragraphs: [
        'Los datos se piden al abrir Inicio. Mientras lo tienes abierto, el carrusel no vuelve a consultar nada por su cuenta; si apuntas algo nuevo, lo verás al volver a Inicio. Lo de Comunidad se recuerda unos 3 minutos.',
        'El engranaje ⚙️ («Configurar el carrusel de Inicio») te deja elegir qué diapositivas ves y cómo salen las fotos. Es una preferencia personal: se guarda en tu cuenta y se ve igual en tus dispositivos.',
      ],
    },
  ],
  limits: [
    'El carrusel no avisa de nada ni cambia solo en directo: es una foto de lo que había al abrir Inicio.',
    'Solo enseña 4 artículos de la compra y 4 elementos del día; para ver todo hay que entrar en Compras o en Calendario.',
    'Las fotos al azar cambian cada vez que abres Inicio; si quieres unas concretas, elige «Elegir hasta 5 fijas» en la configuración.',
    'No he podido probar el gesto de deslizar y de mantener el dedo en un móvil real; lo que cuento sale de leer el código.',
  ],
  ifWrong: [
    'Si falta una diapositiva, abre el engranaje ⚙️ y mira si está desactivada. La de Comunidad solo sale si Comunidad está abierta para ti.',
    'Si lo que ves está desfasado, sal de Inicio y vuelve a entrar para que se pida de nuevo.',
    'Si un dato no coincide con lo que hay en Compras o en Calendario, es un posible fallo técnico: cuéntanoslo en Sugerencias, con una captura si puedes.',
  ],
  verified: V,
  basedOn: ['src/ui/HomeScreen.tsx', 'src/domain/homeCarousel.ts', 'src/state/homeCarouselPrefs.ts', 'src/data/communityHomeSlide.ts', 'src/ui/HomeCarouselSettings.tsx', 'src/data/gallery.ts'],
  go: { path: '/' },
  labels: ['Compra pendiente', 'Hoy en el calendario', 'Nada pendiente todavía 🎉', 'Nada apuntado para hoy', 'Ir a la Lista →', 'Configurar el carrusel de Inicio', 'Elegir hasta 5 fijas'],
  cardIds: ['ini-que-veo'],
  synonyms: ['carrusel', 'diapositivas de inicio', 'por qué sale esto en inicio', 'fotos de inicio', 'cómo funciona el carrusel', 'por qué no salen mis fotos', 'compra pendiente en inicio', 'de dónde sale'],
}

export const expInicioPepaTeAvisa: HelpExplainer = {
  id: 'exp-inicio-pepa-te-avisa',
  module: 'inicio',
  title: 'Cuándo sale la tarjeta «PEPA te avisa»',
  summary: 'La tarjeta naranja de Inicio aparece solo si algún evento tuyo necesita atención. Aquí ves qué mira PEPA y cuándo desaparece.',
  sections: [
    {
      heading: 'Qué mira PEPA',
      paragraphs: [
        'Revisa tus eventos de la sección Eventos que están activos (los archivados no cuentan) y, de cada uno, mira sus tareas, invitados, pagos y presupuesto.',
        'Hoy solo avisa de Eventos. Otras secciones, como Documentos, no generan esta tarjeta.',
      ],
    },
    {
      heading: 'Cuándo avisa',
      paragraphs: [
        'Hay un aviso cuando: faltan invitados por responder y el plazo es en 7 días o menos (o ya pasó); una tarea tiene la fecha pasada y no está hecha; un pago vence en 7 días o menos (o ya venció) y queda dinero pendiente; el gasto supera lo presupuestado; o han confirmado todos los invitados y hay necesidades alimentarias sin revisar.',
        'Cada tarjeta lleva al evento. Salen como máximo 3 y, si hay más, se resume cuántos eventos más necesitan atención.',
      ],
      example: 'Ejemplo inventado: en «Cumpleaños de Lucía» hay 3 invitados sin responder y el plazo de confirmación es en 2 días. La tarjeta lo dice y te lleva a ese evento.',
    },
    {
      heading: 'Cuándo desaparece',
      paragraphs: ['Se calcula cada vez que abres Inicio con el estado real de los eventos, así que desaparece sola cuando lo resuelves (marcas la tarea, registras el pago, el invitado responde…).'],
    },
  ],
  limits: [
    'La tarjeta en sí no manda notificaciones al móvil: es solo un aviso dentro de Inicio.',
    'Solo mira los eventos activos de la sección Eventos y solo con las reglas de arriba; no avisa de nada más.',
  ],
  ifWrong: [
    'Si la tarjeta sigue saliendo, revisa dentro del evento que lo que dice está de verdad resuelto (por ejemplo la fecha de la tarea o el pago registrado).',
    'Si ya lo has resuelto y sigue saliendo tras volver a entrar en Inicio, es un posible fallo técnico: cuéntanoslo en Sugerencias.',
  ],
  verified: V,
  basedOn: ['src/ui/HomeScreen.tsx', 'src/ui/AttentionCard.tsx', 'src/data/events.ts', 'src/domain/events.ts', 'src/domain/attention.ts'],
  go: { path: '/' },
  labels: ['PEPA te avisa'],
  cardIds: ['ini-pepa-te-avisa'],
  synonyms: ['pepa te avisa', 'tarjeta naranja', 'por qué me avisa', 'aviso de evento en inicio', 'tareas atrasadas', 'invitados sin responder'],
}

export const expNotificacionesCampana: HelpExplainer = {
  id: 'exp-notificaciones-campana',
  module: 'notificaciones',
  title: 'Cómo funciona la campana de avisos',
  summary: 'La campana guarda tus avisos 30 días y lleva la cuenta de los que no has leído. Aquí ves qué se marca como leído, qué borra «Eliminar» y qué no.',
  sections: [
    {
      heading: 'Qué guarda la campana',
      paragraphs: [
        'Cada aviso es tuyo: nadie más lo ve. Los crea el servidor de PEPA (por ejemplo un recordatorio del calendario, el resumen de tareas o un aviso de Comunidad), no la aplicación. Los recordatorios del calendario quedan anotados en la campana aunque no tengas los avisos del móvil activados.',
        'Se guardan 30 días. Pasado ese tiempo se borran solos, aunque no los hayas leído. La lista es la del servidor, así que lo leído y lo borrado es igual en todos tus dispositivos.',
      ],
    },
    {
      heading: 'Leídos y no leídos',
      paragraphs: [
        'El número de la campana cuenta los avisos sin leer. Se pide al abrir Inicio y al volver a la aplicación; no se actualiza solo cada poco.',
        'Abrir el panel no marca nada. Un aviso pasa a leído cuando lo abres, o cuando lleva unos 3 segundos a la vista dentro del panel. Los leídos tienen «Marcar como no leída» para que lo recuerdes más tarde. No existe un botón de «marcar todas como leídas».',
      ],
    },
    {
      heading: 'Qué borra «Eliminar» y qué no',
      paragraphs: [
        'Con «Seleccionar» eliges avisos y pulsas «Eliminar (n)»; te pide confirmar con «Sí, eliminar». Solo desaparece el aviso, en todos tus dispositivos.',
        'No se borra la tarea, el pago, el evento ni la publicación a la que apuntaba. Además, PEPA guarda aparte una memoria de qué avisos ya creó (durante 45 días), así que, en general, no vuelve a crear el mismo aviso aunque edites la tarea después.',
      ],
      example: 'Ejemplo inventado: borras el aviso «Cita con el dentista». El evento sigue en el Calendario y los avisos futuros que le correspondan seguirán llegando.',
    },
    {
      heading: 'Qué pasa al tocar un aviso',
      paragraphs: ['Lo marca como leído y te lleva a la pantalla a la que se refiere. El resumen de tareas es distinto: se abre dentro del panel con todas las tareas y cada una te lleva al Calendario.'],
    },
  ],
  limits: [
    'La campana solo está en Inicio.',
    'Un aviso borrado no se puede recuperar. Los de más de 30 días ya no existen, estén leídos o no.',
    'Que el aviso llegue también como notificación del móvil depende de haberla activado en ese móvil y de sus ajustes de batería; eso es independiente de la campana.',
  ],
  ifWrong: [
    'Si falta un aviso, comprueba que la tarea o el evento tiene recordatorio y que te toca recibirlo (depende de a quién estén asignados y del ajuste de la familia). Revisa también que no lo hayas borrado.',
    'Si el contador no cuadra, cierra el panel y vuelve a abrir Inicio. Si sigue mal, cuéntanoslo en Sugerencias (es un posible fallo técnico).',
    'Para recibir los avisos en el móvil, mira Configuración → «🔔 Avisos».',
  ],
  verified: V,
  basedOn: ['src/ui/NotificationBell.tsx', 'src/ui/NotificationPanel.tsx', 'src/data/notifications.ts', 'src/domain/notificationsCenter.ts', 'supabase/migrations/0260_notifications_center.sql'],
  tour: 'tut-notificaciones-campana',
  go: { path: '/' },
  labels: ['Seleccionar', 'Sí, eliminar', 'Marcar como no leída', 'Otras notificaciones', 'Personales', 'No tienes avisos. Aquí aparecerán los de los últimos 30 días.', '🔔 Avisos en este móvil'],
  cardIds: ['not-campana', 'not-activar'],
  synonyms: ['campana', 'avisos', 'borrar avisos', 'avisos leídos', 'por qué desaparecen mis avisos', 'contador de avisos', 'cómo funciona la campana', '30 días'],
}

export const expDocumentosAvisosVencimiento: HelpExplainer = {
  id: 'exp-documentos-avisos-vencimiento',
  module: 'documentos',
  title: 'Cómo te avisa PEPA de que un documento va a caducar',
  summary: 'Si le pones fecha de vencimiento a un documento, PEPA crea un evento en el Calendario y programa tres avisos. Aquí ves cuándo salen y a quién llegan.',
  sections: [
    {
      heading: 'Qué se crea al guardar',
      paragraphs: [
        'Solo si rellenas «Fecha de vencimiento (opcional)». Al pulsar «Guardar», PEPA apunta en el Calendario un evento de todo el día llamado «Vence: » seguido del título del documento, con tres recordatorios: 30 días, 7 días y 1 día antes.',
        'Si eliges en «A quién» a una persona, el evento queda asignado a ella. Con «Sin especificar» no se asigna a nadie.',
      ],
      example: 'Ejemplo inventado: guardas «Pasaporte de Ana» con vencimiento el 15 de marzo. El Calendario tendrá «Vence: Pasaporte de Ana» el 15 de marzo y recibirás avisos 30, 7 y 1 día antes.',
    },
    {
      heading: 'Cuándo salen los avisos',
      paragraphs: [
        'Salen a la hora de inicio del evento, restando 30 días, 7 días o 1 día. Como el evento es de todo el día, esa hora es la medianoche: el aviso llega de madrugada, no a media mañana (la hora se calcula en horario de Madrid). No he podido comprobarlo en un móvil real.',
        'El texto del aviso dice, por ejemplo, «Mañana, todo el día». Aparece en la campana de Inicio y, si has activado los avisos en ese móvil, también como notificación.',
      ],
    },
    {
      heading: 'A quién le llegan',
      paragraphs: [
        'Es la regla general de los eventos compartidos del Calendario. Por defecto, llegan a la persona asignada (si tiene cuenta) y a los administradores de la familia. Un administrador puede cambiarlo en Configuración, en «¿A quién avisamos de tareas y eventos?», para avisar a todos o solo a los asignados.',
        'Si el documento no tiene persona, por defecto el aviso llega a los administradores.',
      ],
    },
    {
      heading: 'Si cambias o quitas la fecha',
      paragraphs: [
        'Con ✏️ puedes cambiar el título o la fecha: el mismo evento se actualiza. Si dejas la fecha vacía, el evento se borra del Calendario. Si eliminas el documento, también se borra su evento.',
        'El botón «🔍 Detectar caducidad» es aparte y opcional: manda el archivo a la IA de PEPA para que lea la fecha. Siempre hay que revisarla antes de guardar.',
      ],
    },
  ],
  limits: [
    'Sin fecha de vencimiento no hay ningún aviso. Si la fecha ya pasó al guardar, tampoco se avisa.',
    'Si guardas un documento que vence en pocos días, el aviso de «30 días» ya habría pasado. Según la regla del servidor, ese aviso atrasado se envía enseguida en lugar de perderse; no he podido comprobarlo en un móvil real.',
    '«Detectar caducidad» puede fallar o no encontrar fecha: depende de la IA, de que esté activada y de su límite de uso, y solo la pueden usar cuentas de personas adultas. Entonces se escribe la fecha a mano.',
    'No hay avisos de caducidad para documentos cuya fecha no se haya puesto aquí.',
  ],
  ifWrong: [
    'Si no te llega el aviso del móvil, mira Configuración → «🔔 Avisos» en ese móvil, y si el aviso está en la campana de Inicio.',
    'Si la fecha es incorrecta, pulsa ✏️ en el documento y corrígela; el evento del Calendario se actualiza solo.',
    'Si el evento «Vence: …» no aparece en el Calendario tras guardar con fecha, es un posible fallo técnico: cuéntanoslo en Sugerencias.',
  ],
  verified: V,
  basedOn: ['src/ui/DocumentsScreen.tsx', 'src/data/documents.ts', 'src/services/documentExpiry.ts', 'supabase/functions/analyze-document-expiry/index.ts', 'supabase/migrations/0073_document_expiry_reminders.sql', 'supabase/migrations/0261_family_notification_recipients.sql', 'supabase/functions/send-due-reminders/index.ts'],
  tour: 'tut-documentos-subir-vencimiento',
  go: { path: '/documentos' },
  labels: ['Fecha de vencimiento (opcional)', 'Se apuntará en el Calendario y avisará 30, 7 y 1 día antes de que venza.', 'Detectar caducidad', 'Sin especificar', '¿A quién avisamos de tareas y eventos?'],
  cardIds: ['doc-vencimiento', 'doc-subir'],
  synonyms: ['caducidad', 'vencimiento', 'avisos de documentos', 'cuándo me avisa', 'renovar dni', 'cuándo caduca', 'por qué no me avisa', 'detectar caducidad', 'itv', 'pasaporte'],
}

export const expDocumentosCompartir: HelpExplainer = {
  id: 'exp-documentos-compartir',
  module: 'documentos',
  title: 'Qué pasa cuando compartes un documento',
  summary: 'El botón 📤 de un documento lo manda al menú de compartir de tu móvil. Aquí ves qué sale de PEPA y qué no.',
  sections: [
    {
      heading: 'Qué hace el botón',
      paragraphs: [
        'Al pulsar 📤, tu móvil descarga el archivo del documento desde el almacén privado de PEPA, con un enlace temporal de una hora, y abre el menú de compartir del propio sistema.',
        'Eres tú quien elige la aplicación y la persona. PEPA no envía nada por su cuenta.',
      ],
    },
    {
      heading: 'Qué se manda y qué no',
      paragraphs: [
        'Se manda el archivo (foto o PDF), con el título del documento como nombre. No se manda la fecha de vencimiento ni el resto de datos de la ficha.',
        'El documento sigue guardado en PEPA. Una vez que lo mandas a otra aplicación, lo que haga con él ya depende de esa aplicación y de quien lo reciba.',
      ],
      example: 'Compartes por mensaje el PDF del seguro del coche (ejemplo inventado). Quien lo recibe ve el PDF, no la fecha de vencimiento que tenías apuntada en PEPA; y el seguro sigue guardado en tu carpeta de Documentos.',
    },
    {
      heading: 'Si el móvil no puede compartir archivos',
      paragraphs: ['Si el navegador no permite compartir archivos (es habitual en un ordenador), PEPA abre el documento en otra pestaña, con ese mismo enlace temporal, para que lo guardes a mano. No reenvíes ese enlace si no quieres que otra persona pueda verlo durante esa hora.'],
    },
  ],
  limits: [
    'No hay una opción de compartir solo con alguien de la familia: el menú de compartir es el del móvil.',
    'El botón 👁 («Ver documento») abre el archivo en otra pestaña con el mismo tipo de enlace temporal.',
    'Compartir descarga el archivo en tu móvil un momento, así que gasta datos si el documento es grande.',
  ],
  ifWrong: [
    'Si no se abre el menú de compartir, usa la pestaña que se abre y guarda el documento desde ahí.',
    'Si sale «No se pudo compartir» y el documento es pequeño, inténtalo de nuevo; si se repite, cuéntanoslo en Sugerencias, porque puede ser un fallo técnico.',
  ],
  verified: V,
  basedOn: ['src/ui/DocumentsScreen.tsx', 'src/services/share.ts', 'src/data/documents.ts'],
  go: { path: '/documentos' },
  labels: ['Compartir documento', 'Ver documento'],
  cardIds: ['doc-subir'],
  synonyms: ['compartir documento', 'mandar dni', 'enviar pdf', 'enviar foto del dni', 'qué se comparte', 'es seguro compartir'],
}

export const expGaleriaCompartir: HelpExplainer = {
  id: 'exp-galeria-compartir',
  module: 'galeria',
  title: 'Qué pasa cuando compartes fotos de la Galería',
  summary: 'El 📤 de cada foto, y «📤 Compartir varias», abren el menú de compartir de tu móvil. Aquí ves qué sale de PEPA y qué no.',
  sections: [
    {
      heading: 'Una foto o varias',
      paragraphs: [
        'El 📤 de una foto la manda al menú de compartir del móvil. Con «📤 Compartir varias» marcas las que quieras y las mandas juntas en un solo paso.',
        'Para compartir, PEPA baja cada foto de su almacén privado a tu móvil y se la entrega al menú del sistema. Eres tú quien elige con quién.',
      ],
    },
    {
      heading: 'Qué se manda',
      paragraphs: [
        'Se mandan las imágenes, con nombres como «foto-1.jpg». La descripción se usa como título del mensaje solo cuando compartes una foto; la fecha no se manda.',
        'Las fotos siguen en la Galería. Lo que haga con ellas la otra aplicación ya no depende de PEPA.',
      ],
      example: 'Marcas tres fotos de la excursión con «📤 Compartir varias» y eliges un grupo de mensajería (ejemplo inventado). Llegan como foto-1.jpg, foto-2.jpg y foto-3.jpg; siguen en tu Galería, pero lo que haga el grupo con ellas ya no depende de PEPA.',
    },
    {
      heading: 'Si el móvil no puede compartir',
      paragraphs: ['Con una sola foto, si no se puede compartir el archivo, se abre la foto en una pestaña nueva para que la guardes a mano. Con varias, PEPA avisa de que tu navegador no lo permite y que las compartas de una en una.'],
    },
  ],
  limits: [
    'Las fotos se guardan comprimidas al subirlas, así que lo que compartes es esa versión, no el original.',
    'Compartir gasta datos: baja cada foto al móvil.',
    'Compartir no crea ningún enlace público: lo que se manda es el archivo de la foto. La única excepción es la pestaña alternativa de una foto suelta, que usa un enlace temporal de una hora.',
  ],
  ifWrong: [
    'Si sale «Tu navegador no permite compartir varias fotos a la vez — compártelas de una en una.», es una limitación normal de ese navegador: usa el 📤 de cada foto.',
    'Si no ocurre nada ni sale mensaje, es un posible fallo técnico: cuéntanoslo en Sugerencias, indicando el móvil y el navegador.',
  ],
  verified: V,
  basedOn: ['src/ui/GalleryScreen.tsx', 'src/services/share.ts', 'src/data/gallery.ts'],
  go: { path: '/galeria' },
  labels: ['📤 Compartir varias', 'Compartir foto', 'Tu navegador no permite compartir varias fotos a la vez — compártelas de una en una.'],
  cardIds: ['gal-compartir', 'gal-subir'],
  synonyms: ['compartir fotos', 'mandar fotos por whatsapp', 'enviar foto', 'qué se comparte', 'compartir varias fotos'],
}

export const expContactosCompartir: HelpExplainer = {
  id: 'exp-contactos-compartir',
  module: 'contactos',
  title: 'Qué pasa cuando compartes un contacto',
  summary: 'El 📤 de un contacto, y «📤 Compartir varios», mandan un texto con su nombre, teléfono y email. Aquí ves qué sale y qué no.',
  sections: [
    {
      heading: 'Qué se manda',
      paragraphs: [
        'Se manda un texto sencillo, una línea por contacto: nombre, teléfono y email si los tiene, separados por «·». No es un archivo de contacto (.vcf).',
        'No se mandan la categoría, las notas ni el cumpleaños.',
      ],
      example: 'Ejemplo inventado: «Colegio Los Álamos · 600 000 000 · info@colegio.example».',
    },
    {
      heading: 'Por dónde sale',
      paragraphs: [
        'PEPA abre el menú de compartir del móvil y tú eliges la aplicación. Si el móvil no tiene ese menú, copia el texto al portapapeles y lo avisa con «Copiado al portapapeles.».',
        'Si tampoco se puede copiar, abre una ventana con el texto para copiarlo a mano o mandarlo por WhatsApp o por email.',
      ],
    },
    {
      heading: 'Qué no hace',
      paragraphs: ['Compartir no envía nada a ningún servidor de PEPA ni cambia el contacto: el texto sale de tu móvil hacia la aplicación que elijas. Lo que haga esa aplicación con el texto ya no depende de PEPA.'],
    },
  ],
  limits: [
    'Al ser texto, quien lo recibe no puede añadirlo a su agenda con un toque: tiene que copiar los datos.',
    'Si el contacto no tiene teléfono ni email, solo se manda el nombre.',
  ],
  ifWrong: [
    'Si no se abre el menú de compartir, usa la ventana de respaldo («📋 Copiar texto», WhatsApp o email), que se muestra sola cuando todo lo demás falla.',
    'Si no ocurre nada y tampoco sale la ventana, es un posible fallo técnico: cuéntanoslo en Sugerencias, indicando el móvil y el navegador.',
  ],
  verified: V,
  basedOn: ['src/ui/ContactsScreen.tsx', 'src/ui/ShareFallbackModal.tsx', 'src/services/share.ts'],
  go: { path: '/contactos' },
  labels: ['Compartir contacto', '📤 Compartir varios', 'Copiado al portapapeles.', '📋 Copiar texto', '💬 WhatsApp'],
  cardIds: ['con-compartir', 'con-agenda'],
  synonyms: ['compartir contacto', 'mandar teléfono', 'enviar contacto por whatsapp', 'qué se comparte', 'compartir varios contactos'],
}

export const expCumpleanosOrigen: HelpExplainer = {
  id: 'exp-cumpleanos-origen',
  module: 'cumpleanos',
  title: 'De dónde salen los cumpleaños y si avisan',
  summary: 'Cumpleaños junta las fechas de Familia y de Contactos. Aquí ves cómo las ordena y por qué no manda avisos.',
  sections: [
    {
      heading: 'De dónde salen',
      paragraphs: [
        'La lista junta a las personas de Familia que tienen fecha de nacimiento y a los contactos que tienen cumpleaños. Quien no tenga fecha no sale.',
        'Las fechas no se escriben en esta pantalla: se ponen en la ficha de Familia o al crear o editar un contacto (también con «🎂 Añadir cumpleaños» en su ficha) o importándolas en Contactos. Aquí solo se cambia la fecha con ✏️.',
      ],
    },
    {
      heading: 'Cómo se calcula',
      paragraphs: [
        'Para cada persona se busca la próxima vez que cae ese día (este año o el siguiente), cuántos días faltan y la edad que cumple. Sale «¡Hoy!», «Mañana» o «En N días», y se ordena de menos a más días.',
        '«Favoritos» filtra los que has marcado con ⭐. Esa marca se guarda en la ficha de la persona, así que es la misma para toda la familia, no solo para ti.',
      ],
      example: 'Ejemplo inventado: si hoy es 10 de octubre y Ana nació el 12 de octubre de 2018, sale «En 2 días · cumple 8».',
    },
    {
      heading: 'Cuándo avisan',
      paragraphs: [
        'No avisan: no he encontrado en el código ninguna notificación ni aviso de campana por cumpleaños. Se ven en esta pantalla y en el Calendario, como «Cumpleaños de …».',
      ],
    },
    {
      heading: 'Quitar o cambiar una fecha',
      paragraphs: [
        '✏️ abre un editor con la fecha y «Guardar». ✕ («Quitar») te pregunta antes de borrar la fecha; solo quita el cumpleaños, no a la persona ni al contacto.',
        'Al cambiar la fecha de una persona de Familia, es la misma fecha de su ficha.',
      ],
    },
  ],
  limits: [
    'Según las reglas de la base de datos, en las fichas de Familia solo la administración puede guardar cambios directos. Para el resto, el cambio de fecha o de favorito de una persona de Familia puede no guardarse sin mostrar error; con los contactos sí puede cualquiera. No lo he probado con una cuenta que no sea administradora.',
    'Una persona nacida un 29 de febrero se cuenta, en los años que no son bisiestos, el 1 de marzo en esta lista, y el Calendario solo la pinta los 29 de febrero. Es lo que muestra el código; no lo he probado en vivo.',
    'No hay botón para añadir un cumpleaños desde esta pantalla.',
  ],
  ifWrong: [
    'Si alguien no sale, mira que tenga fecha en su ficha de Familia o en Contactos.',
    'Si cambias una fecha y vuelve a salir la antigua, puede que tu cuenta no pueda editar esa ficha: pídeselo a quien administre la familia.',
    'Si la fecha está bien guardada pero la lista o el Calendario muestran otra cosa, es un posible fallo técnico: cuéntanoslo en Sugerencias.',
  ],
  verified: V,
  basedOn: ['src/ui/BirthdaysScreen.tsx', 'src/domain/birthdays.ts', 'src/data/family.ts', 'src/data/contacts.ts', 'src/ui/ContactsScreen.tsx', 'src/ui/CalendarScreen.tsx', 'supabase/migrations/0001_init.sql', 'supabase/migrations/0054_birthday_favorites.sql'],
  tour: 'tut-cumpleanos-cambiar-fecha',
  go: { path: '/cumpleanos' },
  labels: ['¡Hoy!', 'Marca alguno con ⭐ para que aparezca aquí.', 'Nadie tiene fecha de nacimiento guardada todavía', '🎂 Añadir cumpleaños', '¿Quitar el cumpleaños de'],
  cardIds: ['cum-ver'],
  synonyms: ['cumpleaños', 'de dónde salen los cumpleaños', 'avisos de cumpleaños', 'por qué no me avisa de un cumpleaños', 'cumpleaños favoritos', 'edad que cumple', 'por qué falta un cumpleaños'],
}
