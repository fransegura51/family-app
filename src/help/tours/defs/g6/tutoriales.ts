import type { TourDef } from '@/help/tours/types'

// Tutoriales «Enséñame» del grupo g6: Inicio, campana de avisos, Documentos, Galería, Contactos y Cumpleaños. Cada secuencia está comprobada contra el código de la pantalla real
// (nombres de botones y orden). Los pasos que guardan datos son `sensitive` y solo avanzan con el aviso `emitHelpEvent(...)` que la pantalla lanza DESPUÉS de que el servidor
// confirma. Ninguno borra, comparte, quita ni pulsa nada por la persona; todos se pueden abandonar con «Salir» sin guardar.

const pending = { completeOn: [] as never[], manualNext: true }

// ───────────────────────────── Inicio
export const tutInicioOrganizar: TourDef = {
  id: 'tut-inicio-organizar',
  module: 'inicio',
  group: 'Inicio',
  summary: 'Cambia el orden de las tarjetas de Inicio.',
  version: 1,
  title: 'Ordenar las tarjetas de Inicio',
  cardId: 'ini-organizar',
  durationSec: 60,
  startPath: '/',
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a ordenar las tarjetas de Inicio. Pulsa «↕️ Organizar».',
      target: 'inicio.organizar',
      completeOn: [
        { type: 'click', target: 'inicio.organizar' },
        { type: 'appear', target: 'inicio.mover' },
      ],
      skipIf: [{ type: 'appear', target: 'inicio.mover' }],
    },
    {
      id: 'mover',
      text: 'Cada tarjeta tiene dos flechas: ◀ la pasa antes y ▶ la pasa después. Mueve una para probar; el orden se guarda al momento. Si no quieres cambiar nada, pulsa «Siguiente».',
      target: 'inicio.mover',
      completeOn: [{ type: 'click', target: 'inicio.mover' }],
      manualNext: true,
    },
    {
      id: 'listo',
      text: 'Cuando termines, pulsa «✓ Listo». Mientras organizas, tocar una tarjeta no abre su sección; al terminar, vuelve a funcionar con normalidad.',
      target: 'inicio.organizar',
      completeOn: [{ type: 'click', target: 'inicio.organizar' }],
    },
  ],
  finishText: '¡Listo! Tus tarjetas quedan en el orden que has elegido. Es solo tuyo: cada persona tiene el suyo. Puedes volver a cambiarlo cuando quieras.',
  next: ['ini-que-veo', 'not-campana'],
}

// ───────────────────────────── Campana de avisos (módulo Notificaciones)
// No borra nada y no abre ningún aviso: «Seleccionar» solo se señala, nunca se pulsa. El panel es un diálogo modal, así que, si se cierra (Escape, ✕ o tocando fuera), los pasos
// siguientes se omiten solos por ser opcionales.
export const tutNotificacionesCampana: TourDef = {
  id: 'tut-notificaciones-campana',
  module: 'notificaciones',
  group: 'Avisos',
  summary: 'Abre la campana de Inicio y entiende tus avisos.',
  version: 1,
  title: 'Abrir y entender la campana de avisos',
  cardId: 'not-campana',
  durationSec: 90,
  startPath: '/',
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a ver tus avisos. Pulsa la campana 🔔 de arriba a la derecha.',
      target: 'notificaciones.campana',
      completeOn: [
        { type: 'click', target: 'notificaciones.campana' },
        { type: 'appear', target: 'notificaciones.panel' },
      ],
      skipIf: [{ type: 'appear', target: 'notificaciones.panel' }],
    },
    {
      id: 'panel',
      text: 'Este es tu panel de avisos. Se abre encima de Inicio y abrirlo no marca nada como leído. Se cierra con ✕, con Escape o tocando fuera.',
      target: 'notificaciones.panel',
      ...pending,
      optional: true,
    },
    {
      id: 'vacio',
      text: 'Ahora mismo no tienes avisos. Aquí aparecerán los de los últimos 30 días; los más antiguos se borran solos.',
      target: 'notificaciones.vacio',
      ...pending,
      optional: true,
    },
    {
      id: 'contador',
      text: 'Arriba se cuentan por separado: por ejemplo «3 nuevas · 12 leídas». Un aviso pasa a leído cuando lo abres o cuando lleva unos 3 segundos a la vista dentro del panel.',
      target: 'notificaciones.contador',
      ...pending,
      optional: true,
    },
    {
      id: 'bloques',
      text: 'Los avisos van en dos bloques: «Personales» y «Otras notificaciones» (los recordatorios del calendario, por ejemplo). Los nuevos van en negrita con un punto azul. Tocando el título, cada bloque se pliega.',
      target: 'notificaciones.bloque',
      ...pending,
      optional: true,
    },
    {
      id: 'marcar-leidas',
      text: 'Además de que se marquen solos a los 3 segundos, con «Marcar todas como leídas» los dejas todos leídos de golpe. Aquí solo te lo enseño: yo no lo pulso por ti.',
      target: 'notificaciones.marcar-leidas',
      ...pending,
      optional: true,
    },
    {
      id: 'marcar-no-leidas',
      text: 'Y con «Marcar todas como no leídas» los vuelves a dejar todos pendientes para recordarlos; esos no se marcan solos otra vez mientras tengas el panel abierto.',
      target: 'notificaciones.marcar-no-leidas',
      ...pending,
      optional: true,
    },
    {
      id: 'seleccionar',
      text: '«Seleccionar» sirve para elegir avisos y eliminarlos, y siempre pide confirmación. Eliminar un aviso no borra la tarea o el evento al que apuntaba. Aquí solo te lo enseño: yo no lo pulso por ti.',
      target: 'notificaciones.acciones',
      ...pending,
      optional: true,
    },
    {
      id: 'cerrar',
      text: 'Para volver a Inicio, pulsa ✕. Si tocas un aviso, se marca como leído y te lleva a la pantalla a la que se refiere.',
      target: 'notificaciones.cerrar',
      completeOn: [{ type: 'click', target: 'notificaciones.cerrar' }],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: '¡Listo! Ya sabes leer tus avisos. Si quieres que te lleguen también al móvil, se activan en Configuración → «🔔 Avisos».',
  next: ['not-activar', 'not-resumen-tareas', 'ini-que-veo'],
}

// ───────────────────────────── Documentos
export const tutDocumentosCarpeta: TourDef = {
  id: 'tut-documentos-carpeta',
  module: 'documentos',
  group: 'Documentos',
  summary: 'Crea una carpeta (categoría) nueva para tus documentos.',
  version: 1,
  title: 'Crear una carpeta de documentos',
  cardId: 'doc-subir',
  durationSec: 60,
  startPath: '/documentos',
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a crear una carpeta. Pulsa «Nueva carpeta».',
      target: 'documentos.nueva-carpeta',
      completeOn: [
        { type: 'click', target: 'documentos.nueva-carpeta' },
        { type: 'appear', target: 'documentos.carpeta-nombre' },
      ],
      skipIf: [{ type: 'appear', target: 'documentos.carpeta-nombre' }],
    },
    {
      id: 'nombre',
      text: 'Escribe cómo se llama, por ejemplo «Coche» o «Salud». No se crea nada hasta que pulses el botón. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'documentos.carpeta-nombre',
      completeOn: [{ type: 'entered', target: 'documentos.carpeta-nombre', min: 2 }],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Cuando quieras, pulsa «+ Añadir categoría». Yo no lo pulso por ti.',
      target: 'documentos.carpeta-guardar',
      completeOn: [{ type: 'event', name: 'documents.folder-created' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! La carpeta ya está en la cuadrícula, vacía. Al abrirla verás una subcarpeta por cada miembro de la familia y «Sin especificar»; los documentos se suben con «+ Subir foto».',
  next: ['doc-subir', 'doc-vencimiento'],
}

export const tutDocumentosSubirVencimiento: TourDef = {
  id: 'tut-documentos-subir-vencimiento',
  module: 'documentos',
  group: 'Documentos',
  summary: 'Sube un documento con su fecha de vencimiento para que PEPA te avise.',
  version: 1,
  title: 'Subir un documento con fecha de vencimiento',
  cardId: 'doc-vencimiento',
  durationSec: 120,
  startPath: '/documentos',
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a guardar un documento. Pulsa el botón «+ Subir foto»: sirve para fotos y también para PDF.',
      target: 'documentos.subir',
      completeOn: [
        { type: 'click', target: 'documentos.subir' },
        { type: 'appear', target: 'documentos.archivo' },
      ],
      skipIf: [{ type: 'appear', target: 'documentos.archivo' }],
    },
    {
      id: 'archivo',
      text: 'Bajo «Archivo», elige «📷 Foto» o «📄 PDF» y busca el documento. No se sube nada hasta que pulses «Guardar»; cuando lo elijas, seguiré yo.',
      target: 'documentos.archivo',
      completeOn: [{ type: 'appear', target: 'documentos.detectar' }],
    },
    {
      id: 'detectar',
      text: '«🔍 Detectar caducidad» es opcional: envía el archivo a la IA de PEPA para que lea la fecha. Solo se usa si tú lo pulsas y debes revisar lo que rellene. Si prefieres, escribe la fecha tú.',
      target: 'documentos.detectar',
      ...pending,
      optional: true,
    },
    {
      id: 'titulo',
      text: 'Ponle un título, por ejemplo «DNI de Ana». Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'documentos.titulo',
      completeOn: [{ type: 'entered', target: 'documentos.titulo', min: 2 }],
      manualNext: true,
    },
    {
      id: 'carpeta',
      text: 'Elige en qué carpeta (categoría) va. Si no eliges ninguna, queda en «Sin categoría». Si ya está bien, pulsa «Siguiente».',
      target: 'documentos.categoria',
      completeOn: [{ type: 'change', target: 'documentos.categoria' }],
      manualNext: true,
    },
    {
      id: 'persona',
      text: '«A quién» es de quién es el documento. Si eliges a alguien, el aviso del Calendario queda asignado a esa persona; con «Sin especificar» no se asigna a nadie.',
      target: 'documentos.persona',
      completeOn: [{ type: 'change', target: 'documentos.persona' }],
      manualNext: true,
    },
    {
      id: 'vencimiento',
      text: 'Pon la fecha de vencimiento del documento. Cuando la hayas elegido seguiré yo. Si este documento no caduca, déjala vacía y pulsa «Siguiente»: entonces no se crea ningún aviso.',
      target: 'documentos.vencimiento',
      completeOn: [{ type: 'confirmed', target: 'documentos.vencimiento' }],
      manualNext: true,
    },
    {
      id: 'aviso',
      text: 'Con fecha, PEPA crea en el Calendario un evento de todo el día llamado «Vence: (título)» y programa avisos 30, 7 y 1 día antes de que venza.',
      target: 'documentos.aviso-vencimiento',
      ...pending,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Cuando lo tengas, pulsa «Guardar». Yo no lo pulso por ti.',
      target: 'documentos.guardar',
      completeOn: [{ type: 'event', name: 'documents.document-added' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! El documento ya está guardado. Si pusiste fecha, la verás en el Calendario como «Vence: …» y recibirás los avisos si tienes las notificaciones activadas. Para cambiar la fecha más tarde, usa ✏️ en el documento.',
  next: ['doc-vencimiento', 'not-activar', 'doc-subir'],
}

// ───────────────────────────── Galería
export const tutGaleriaSubirFoto: TourDef = {
  id: 'tut-galeria-subir-foto',
  module: 'galeria',
  group: 'Fotos',
  summary: 'Sube una foto a la Galería de la familia.',
  version: 1,
  title: 'Subir una foto a la Galería',
  cardId: 'gal-subir',
  durationSec: 60,
  startPath: '/galeria',
  steps: [
    {
      id: 'foto',
      text: 'Abajo está el formulario «Subir foto». Toca el campo «Foto» y elige una imagen de tu móvil. No se sube nada hasta que pulses «Subir»; cuando la elijas, seguiré yo.',
      target: 'gallery.photo-file',
      completeOn: [
        { type: 'filled', target: 'gallery.photo-file' },
        { type: 'change', target: 'gallery.photo-file' },
      ],
    },
    {
      id: 'descripcion',
      text: 'Si quieres, escribe una descripción: saldrá bajo la foto. Es opcional. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'gallery.photo-caption',
      completeOn: [{ type: 'entered', target: 'gallery.photo-caption', min: 1 }],
      manualNext: true,
    },
    {
      id: 'subir',
      text: 'Cuando quieras, pulsa «Subir». Yo no lo pulso por ti.',
      target: 'gallery.upload-save',
      completeOn: [{ type: 'event', name: 'gallery.photo-uploaded' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! Tu foto ya está en la Galería. También puede salir en el carrusel de Inicio (entran hasta 5 fotos). Después no se puede cambiar su descripción: si quieres otra, súbela de nuevo.',
  next: ['gal-compartir', 'ini-que-veo'],
}

// ───────────────────────────── Contactos
export const tutContactosAnadir: TourDef = {
  id: 'tut-contactos-anadir',
  module: 'contactos',
  group: 'Contactos',
  summary: 'Añade un contacto a la agenda de la familia.',
  version: 1,
  title: 'Añadir un contacto',
  cardId: 'con-agenda',
  durationSec: 100,
  startPath: '/contactos',
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a añadir un contacto. Pulsa «+ Nuevo contacto».',
      target: 'contactos.nuevo',
      completeOn: [
        { type: 'click', target: 'contactos.nuevo' },
        { type: 'appear', target: 'contactos.nombre' },
      ],
      skipIf: [{ type: 'appear', target: 'contactos.nombre' }],
    },
    {
      id: 'nombre',
      text: 'Escribe el nombre, por ejemplo «Colegio Los Álamos». Si ya existe un contacto con ese mismo nombre, PEPA rellena el resto con sus datos y aún puedes cambiarlos. Cuando termines, pulsa ✓ o «Siguiente».',
      target: 'contactos.nombre',
      completeOn: [{ type: 'entered', target: 'contactos.nombre', min: 2 }],
      manualNext: true,
    },
    {
      id: 'categoria',
      text: 'La categoría agrupa los contactos: Colegio, Médico, Emergencia, Familia, Otros… Puedes elegir una de las sugeridas o escribir una nueva.',
      target: 'contactos.categoria',
      ...pending,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'telefono',
      text: 'Con un teléfono, la ficha tendrá el botón 📞 para llamar directamente. Es opcional.',
      target: 'contactos.telefono',
      ...pending,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'email',
      text: 'El email también es opcional; se verá en la ficha.',
      target: 'contactos.email',
      ...pending,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'cumpleanos',
      text: 'Si pones su cumpleaños, esta persona saldrá también en la sección Cumpleaños y en el Calendario. Es opcional.',
      target: 'contactos.cumpleanos',
      ...pending,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'notas',
      text: 'En notas puedes apuntar lo que quieras recordar, como un horario o una extensión. Es opcional.',
      target: 'contactos.notas',
      ...pending,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'guardar',
      text: 'Cuando lo tengas, pulsa «Añadir». Yo no lo pulso por ti.',
      target: 'contactos.anadir',
      completeOn: [{ type: 'event', name: 'contacts.contact-added' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! El contacto ya está en la agenda. Para cambiarlo más tarde, usa ✏️ en su ficha.',
  next: ['con-importar', 'con-compartir'],
}

export const tutContactosBuscar: TourDef = {
  id: 'tut-contactos-buscar',
  module: 'contactos',
  group: 'Contactos',
  summary: 'Busca un contacto por nombre y filtra por categoría.',
  version: 1,
  title: 'Buscar y filtrar contactos',
  cardId: 'con-agenda',
  durationSec: 60,
  startPath: '/contactos',
  steps: [
    {
      id: 'buscar',
      text: 'Escribe parte de un nombre en el buscador. Busca solo por nombre (no por teléfono) y no distingue mayúsculas ni tildes. Cuando termines, pulsa ✓ o «Siguiente».',
      target: 'contactos.buscar',
      completeOn: [{ type: 'entered', target: 'contactos.buscar', min: 1 }],
      manualNext: true,
    },
    {
      id: 'categorias',
      text: 'Estos botones filtran por categoría: «Todas» o solo una. Se combinan con el buscador. Toca uno para probar, o pulsa «Siguiente».',
      target: 'contactos.categorias',
      completeOn: [{ type: 'click', target: 'contactos.categorias' }],
      manualNext: true,
    },
    {
      id: 'lista',
      text: 'Aquí salen los contactos que cumplen las dos cosas. Si no hay ninguno, dice «No hay contactos que coincidan.». Para verlos todos, borra el buscador y pulsa «Todas».',
      target: 'contactos.lista',
      ...pending,
    },
  ],
  finishText: '¡Listo! No se ha guardado nada: buscar y filtrar solo cambian lo que ves.',
  next: ['con-agenda', 'con-importar'],
}

// ───────────────────────────── Cumpleaños
// Solo administración: en las fichas de FAMILIA la base de datos solo deja modificar a quien administra la familia (política «family_members: admin update», 0001); a las demás
// personas adultas el cambio no se les guardaría (la consulta no da error pero no actualiza nada). Con los contactos sí puede cualquiera, pero la lista mezcla ambas cosas.
export const tutCumpleanosFavorito: TourDef = {
  id: 'tut-cumpleanos-favorito',
  module: 'cumpleanos',
  group: 'Cumpleaños',
  access: { familyAdmin: true },
  summary: 'Marca un cumpleaños como favorito con la estrella.',
  version: 1,
  title: 'Marcar un cumpleaños como favorito',
  cardId: 'cum-ver',
  durationSec: 60,
  startPath: '/cumpleanos',
  steps: [
    {
      id: 'lista',
      text: 'Aquí están los próximos cumpleaños. Si no ves a nadie, falta poner la fecha de nacimiento en Familia o en Contactos.',
      target: 'cumpleanos.lista',
      ...pending,
    },
    {
      id: 'favorito',
      text: 'Toca la estrella de la persona que quieras tener a mano: ☆ la marca como favorita y ⭐ (si ya lo era) le quita la marca. Se guarda al momento.',
      target: 'cumpleanos.favorito',
      completeOn: [{ type: 'event', name: 'birthdays.favorite-saved' }],
      sensitive: true,
    },
    {
      id: 'filtro',
      text: 'Pulsa «Favoritos» para ver solo las personas marcadas con ⭐. Con «Próximos» vuelves a verlas todas.',
      target: 'cumpleanos.filtros',
      completeOn: [{ type: 'click', target: 'cumpleanos.filtros' }],
      manualNext: true,
    },
  ],
  finishText: '¡Listo! Los favoritos quedan guardados. Para quitar uno, vuelve a tocar su ⭐.',
  next: ['cum-ver'],
}

export const tutCumpleanosCambiarFecha: TourDef = {
  id: 'tut-cumpleanos-cambiar-fecha',
  module: 'cumpleanos',
  group: 'Cumpleaños',
  access: { familyAdmin: true },
  summary: 'Cambia la fecha de un cumpleaños.',
  version: 1,
  title: 'Cambiar la fecha de un cumpleaños',
  cardId: 'cum-ver',
  durationSec: 70,
  startPath: '/cumpleanos',
  steps: [
    {
      id: 'editar',
      text: 'Pulsa ✏️ en la persona cuya fecha quieras cambiar.',
      target: 'cumpleanos.editar',
      completeOn: [
        { type: 'click', target: 'cumpleanos.editar' },
        { type: 'appear', target: 'cumpleanos.fecha' },
      ],
      skipIf: [{ type: 'appear', target: 'cumpleanos.fecha' }],
    },
    {
      id: 'fecha',
      text: 'Elige la fecha correcta. Cuando la hayas elegido seguiré yo. La edad que cumple se recalcula sola. Todavía no se guarda nada.',
      target: 'cumpleanos.fecha',
      completeOn: [{ type: 'confirmed', target: 'cumpleanos.fecha' }],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Cuando quieras, pulsa «Guardar». Yo no lo pulso por ti. Si no quieres cambiar nada, pulsa «Cancelar» y sal del tutorial.',
      target: 'cumpleanos.fecha-guardar',
      completeOn: [{ type: 'event', name: 'birthdays.date-saved' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! La fecha queda guardada y la lista se reordena según lo que falte para el cumpleaños.',
  next: ['cum-ver'],
}
