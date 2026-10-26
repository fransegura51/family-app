import type { TutorialSeries } from '@/help/tours/series/types'

// Mis listas: un tutorial principal con tres capítulos (crear y escribir · importar · privacidad, Calendario y compra).
export const SERIES_G: readonly TutorialSeries[] = [
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
