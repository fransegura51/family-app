import type { TutorialSeries } from '@/help/tours/series/types'

// Tutoriales principales («series») con sus capítulos: Familia, La cocina de Pepa y Pequeños Grandes.
export const SERIES_C: TutorialSeries[] = [
  // ───────────── Familia
  {
    id: 'ser-familia-fichas',
    module: 'familia',
    title: 'Gestionar las fichas de la familia',
    summary: 'Añade a alguien, edita su ficha y su foto, elige a qué secciones entra un niño o un invitado y dale acceso a PEPA.',
    chapters: ['fam-anadir-miembro', 'tut-familia-editar-ficha', 'tut-familia-secciones', 'tut-familia-codigo-acceso'],
    cardIds: ['fam-anadir-miembro', 'fam-editar-ficha', 'fam-invitado-limitado', 'fam-codigo-acceso'],
    synonyms: ['añadir miembro', 'nuevo miembro', 'ficha', 'foto de perfil', 'dar acceso', 'invitar', 'secciones de un niño', 'invitado', 'canguro'],
    access: { adultsOnly: true },
  },
  {
    id: 'ser-familia-peso',
    module: 'familia',
    title: 'Peso y medidas',
    summary: 'Apunta el peso y la altura de cada persona, lee su evolución y fija un peso objetivo.',
    chapters: ['tut-familia-peso-medidas', 'tut-familia-peso-evolucion', 'tut-familia-peso-objetivo'],
    cardIds: ['fam-peso-medidas'],
    synonyms: ['peso', 'altura', 'medidas', 'percentiles', 'imc', 'peso objetivo', 'crecimiento'],
  },

  // ───────────── La cocina de Pepa
  {
    id: 'ser-cocina-menu',
    module: 'cocina',
    title: 'Planificar la semana',
    summary: 'Apunta platos en el menú, cambia de semana y pasa los ingredientes a la lista de la compra.',
    chapters: ['tut-cocina-menu-plato', 'tut-cocina-menu-a-compras'],
    cardIds: ['coc-menu-semanal', 'coc-menu-a-compras'],
    synonyms: ['menú semanal', 'qué cenamos', 'planificar comidas', 'ingredientes a la compra'],
  },
  {
    id: 'ser-cocina-recetas',
    module: 'cocina',
    title: 'Mis recetas',
    summary: 'Escribe una receta, tráela de internet o de un enlace, y úsala: raciones, favoritas, filtros y compra.',
    chapters: ['tut-cocina-receta-escribir', 'tut-cocina-receta-internet', 'tut-cocina-receta-usar'],
    cardIds: ['coc-receta'],
    synonyms: ['nueva receta', 'importar receta', 'receta de internet', 'recetario', 'favoritas', 'raciones'],
  },
  {
    id: 'ser-cocina-que-cocino',
    module: 'cocina',
    title: '¿Qué cocino hoy?',
    summary: 'Di qué ingredientes tienes y mira qué puedes cocinar con tus recetas y con recetas de internet.',
    chapters: ['tut-cocina-que-cocino'],
    cardIds: ['coc-que-cocino-hoy'],
    synonyms: ['qué cocino', 'idea de comida', 'receta con lo que tengo'],
  },

  // ───────────── Pequeños Grandes
  {
    id: 'ser-pequenos-puntos',
    module: 'pequenos',
    title: 'Puntos y recompensas',
    summary: 'Da puntos, crea recompensas, pídelas y apruébalas, y elige cómo se mide el progreso de la familia.',
    chapters: ['tut-pequenos-dar-puntos', 'tut-pequenos-recompensa-crear', 'tut-pequenos-solicitar', 'tut-pequenos-aprobar', 'tut-pequenos-camino-carrera'],
    cardIds: ['pg-puntos', 'pg-recompensas', 'pg-mi-camino'],
    synonyms: ['puntos', 'premios', 'recompensas', 'canjear', 'mi camino', 'carrera mensual'],
  },
  {
    id: 'ser-pequenos-deseos',
    module: 'pequenos',
    title: 'Lista de deseos',
    summary: 'Crea una lista, añade regalos, resérvalos sin que lo vea quien los recibe y compártela con invitados.',
    chapters: ['tut-pequenos-lista-deseos', 'tut-pequenos-regalo-anadir', 'tut-pequenos-regalo-reservar', 'tut-pequenos-lista-compartir-editar'],
    cardIds: ['pg-lista-deseos'],
    synonyms: ['lista de regalos', 'wishlist', 'reservar regalo', 'compartir lista', 'cumpleaños regalos'],
  },
]
