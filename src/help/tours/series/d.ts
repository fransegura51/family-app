import type { TutorialSeries } from '@/help/tours/series/types'

// Tutoriales principales («series») con sus capítulos: Eventos, Documentos, Galería, Contactos y Cumpleaños. Todos los tutoriales que ya existían siguen siendo capítulos con su mismo
// identificador (por eso no hay alias en aliases/d.ts); los capítulos nuevos van marcados abajo. Los módulos de Eventos sin recorrido están en planned/d.ts.
export const SERIES_D: TutorialSeries[] = [
  // ───────────── Eventos
  {
    id: 'ser-eventos-crear',
    module: 'eventos',
    title: 'Crear y preparar un evento',
    summary: 'Crear una celebración, conocer el panel y activar sus partes, apuntar las tareas de preparativos y añadir partidas al presupuesto.',
    chapters: [
      'tut-eventos-crear-evento',
      'tut-eventos-panel', // nuevo
      'tut-eventos-anadir-tarea',
      'tut-eventos-anadir-partida',
    ],
    cardIds: ['eve-crear', 'eve-presupuesto'],
    synonyms: ['nuevo evento', 'crear una fiesta', 'cumpleaños', 'comunión', 'bautizo', 'boda', 'preparativos', 'tareas del evento', 'presupuesto', 'organizar una celebración', 'gestionar evento'],
  },
  {
    id: 'ser-eventos-invitados',
    module: 'eventos',
    title: 'Invitados e invitación',
    summary: 'Apuntar a los invitados (sin enviar nada), diseñar la invitación y saber dónde se envía y cómo seguir las confirmaciones.',
    chapters: [
      'tut-eventos-anadir-invitado',
      'tut-eventos-crear-invitacion',
      'tut-eventos-enviar-invitacion', // nuevo
    ],
    cardIds: ['eve-invitados', 'eve-invitacion'],
    synonyms: ['lista de invitados', 'invitar', 'invitación', 'confirmar asistencia', 'rsvp', 'enlace de confirmación', 'recordar a pendientes', 'enlace abierto', 'diseñar invitación'],
  },
  {
    id: 'ser-eventos-menu-plan',
    module: 'eventos',
    title: 'Menú y plan del día',
    summary: 'Añadir platos al menú del evento, preparar la compra del menú y montar el plan del día con sus momentos.',
    chapters: [
      'tut-eventos-anadir-plato',
      'tut-eventos-compra-menu', // nuevo
      'tut-eventos-anadir-momento',
    ],
    cardIds: ['eve-menu', 'eve-plan-dia'],
    synonyms: ['menú del evento', 'platos', 'catering', 'comida de la fiesta', 'compra del menú', 'plan del día', 'horario', 'cronograma', 'momentos'],
  },

  // ───────────── Documentos
  {
    id: 'ser-documentos-guardar',
    module: 'documentos',
    title: 'Guardar y cuidar tus documentos',
    summary: 'Crear carpetas, subir un documento, ponerle fecha de vencimiento para recibir avisos y decidir quién puede verlo.',
    chapters: [
      'tut-documentos-carpeta',
      'tut-documentos-subir', // nuevo
      'tut-documentos-subir-vencimiento',
      'tut-documentos-quien-ve', // nuevo
    ],
    cardIds: ['doc-subir', 'doc-vencimiento'],
    synonyms: ['subir documento', 'dni', 'pasaporte', 'seguro', 'itv', 'carpeta', 'caducidad', 'vencimiento', 'quién puede ver', 'candado', 'privado', 'solo yo'],
  },

  // ───────────── Galería
  {
    id: 'ser-galeria-fotos',
    module: 'galeria',
    title: 'Las fotos de la familia',
    summary: 'Subir una foto, verla en grande con su descripción editable y compartir una o varias.',
    chapters: ['tut-galeria-subir-foto', 'tut-galeria-ampliar', 'tut-galeria-compartir'],
    cardIds: ['gal-subir', 'gal-ampliar', 'gal-compartir'],
    synonyms: ['subir foto', 'galería', 'ver foto grande', 'descripción de la foto', 'compartir fotos', 'carrusel'],
  },

  // ───────────── Contactos
  {
    id: 'ser-contactos-agenda',
    module: 'contactos',
    title: 'Tu agenda familiar',
    summary: 'Añadir un contacto, buscarlo y filtrarlo por categoría, y editarlo, llamarle o ponerle cumpleaños.',
    chapters: [
      'tut-contactos-anadir',
      'tut-contactos-buscar',
      'tut-contactos-ficha',
      'tut-contactos-acciones', // nuevo
    ],
    cardIds: ['con-agenda', 'con-ficha'],
    synonyms: ['agenda', 'teléfono del colegio', 'número del médico', 'añadir contacto', 'buscar contacto', 'editar contacto', 'llamar', 'cumpleaños de un contacto'],
  },
  {
    id: 'ser-contactos-importar-compartir',
    module: 'contactos',
    title: 'Importar y compartir contactos',
    summary: 'Traer contactos desde un archivo, el móvil o los cumpleaños de Google, y compartir uno o varios contactos.',
    chapters: ['tut-contactos-importar', 'tut-contactos-compartir'],
    cardIds: ['con-importar', 'con-compartir'],
    synonyms: ['importar contactos', 'vcf', 'agenda del móvil', 'cumpleaños de google', 'compartir contacto', 'mandar teléfono', 'compartir varios'],
  },

  // ───────────── Cumpleaños
  // Solo administración de la familia: en las fichas de Familia la base de datos solo deja guardar a administración (ver defs/g6/cumpleanos.ts).
  {
    id: 'ser-cumpleanos-favoritos',
    module: 'cumpleanos',
    title: 'Favoritos y fechas de cumpleaños',
    summary: 'Marcar un cumpleaños como favorito con la estrella y cambiar la fecha de un cumpleaños.',
    chapters: ['tut-cumpleanos-favorito', 'tut-cumpleanos-cambiar-fecha'],
    cardIds: ['cum-ver'],
    access: { familyAdmin: true },
    synonyms: ['cumpleaños favorito', 'estrella', 'cambiar fecha de cumpleaños', 'fecha de nacimiento', 'próximos cumpleaños'],
  },
]
