import type { TutorialSeries } from '@/help/tours/series/types'

// Mis listas: un tutorial principal con tres capítulos (crear y escribir · importar · privacidad, Calendario y compra).
export const SERIES_G: readonly TutorialSeries[] = [
  {
    id: 'ser-grupos-empezar',
    module: 'grupos',
    title: 'Tus grupos: crear, llenar y vincular',
    summary: 'Crear un grupo y ordenarlo en carpetas, añadir o importar a sus participantes, vincular un evento o una lista y copiar el grupo a otra persona.',
    chapters: ['tut-grupos-crear', 'tut-grupos-participantes', 'tut-grupos-vincular', 'tut-grupos-copiar'],
    cardIds: ['grupos-crear', 'grupos-participantes', 'grupos-vincular', 'grupos-copiar'],
    synonyms: ['gestion de grupos', 'nuevo grupo', 'clase', 'carpeta de grupos', 'importar alumnos', 'lista de alumnos', 'participantes', 'copiar grupo', 'recibir grupo', 'vincular evento', 'vincular lista'],
  },
  {
    id: 'ser-grupos-botes',
    module: 'grupos',
    title: 'Tus botes: cobrar, compartir y cerrar',
    summary: 'Crear un bote compartido, anotar los pagos y gastos, compartir los pendientes por WhatsApp y cerrar el bote.',
    chapters: ['tut-grupos-bote', 'tut-grupos-whatsapp', 'tut-grupos-cerrar'],
    cardIds: ['grupos-bote', 'grupos-compartir', 'grupos-cerrar'],
    synonyms: ['bote', 'bote compartido', 'colecta', 'excursion', 'quien falta por pagar', 'pendientes por whatsapp', 'bizum', 'cerrar bote', 'reabrir bote', 'recaudacion'],
  },
  {
    id: 'ser-listas-usar',
    module: 'listas',
    title: 'Tus listas: crear, importar y conectar',
    summary: 'Crear una lista y escribir en ella con formato, importar elementos desde una foto, un PDF o la voz, y decidir quién la ve y con qué se conecta.',
    chapters: ['tut-listas-crear', 'tut-listas-importar', 'tut-listas-conectar'],
    cardIds: ['listas-crear', 'listas-importar', 'listas-conectar'],
    synonyms: ['mis listas', 'nueva lista', 'carpeta de listas', 'importar lista', 'foto de una lista', 'lista privada', 'enviar a la compra', 'listas vinculadas', 'lista de tareas'],
  },
]
