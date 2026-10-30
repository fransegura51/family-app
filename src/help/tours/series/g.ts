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
    id: 'ser-grupos-contactos',
    module: 'grupos',
    title: 'Tus participantes y sus contactos',
    summary: 'Nombres y apellidos bien separados, los contactos familiares de cada alumno, contactos desde capturas de WhatsApp y compartir la lista de contactos.',
    chapters: ['tut-grupos-nombres', 'tut-grupos-contactos', 'tut-grupos-whatsapp-contactos', 'tut-grupos-compartir-contactos'],
    cardIds: ['grupos-nombres', 'grupos-contactos-familiares', 'grupos-whatsapp-contactos', 'grupos-compartir-contactos'],
    synonyms: ['apellidos', 'formato de nombres', 'contactos familiares', 'madre del alumno', 'capturas de whatsapp', 'compartir contactos', 'lista de telefonos', 'emails de las familias', 'pendientes de identificar'],
  },
  {
    id: 'ser-grupos-datos',
    module: 'grupos',
    title: 'Pedir datos y compartir la gestión',
    summary: 'Crear un formulario que las familias responden sin instalar PEPA (con datos delicados protegidos) e invitar a otra persona a ser responsable del grupo con un código.',
    chapters: ['tut-grupos-solicitar-datos', 'tut-grupos-responsable-codigo'],
    cardIds: ['grupos-solicitar-datos', 'grupos-responsable-codigo'],
    synonyms: ['formulario', 'solicitar datos', 'pedir correos', 'documentacion de un viaje', 'datos delicados', 'quien falta por responder', 'invitar responsable', 'codigo de responsable', 'segundo responsable'],
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
