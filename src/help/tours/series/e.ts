import type { TutorialSeries } from '@/help/tours/series/types'

// Tutoriales principales («series») con sus capítulos: Comunidad, Ubicación, Inicio, Hablar con PEPA y Ayuda.
export const SERIES_E: TutorialSeries[] = [
  // ───────────── Comunidad (solo personas de 18 años cumplidos con Comunidad abierta)
  {
    id: 'ser-comunidad-participar',
    module: 'comunidad',
    title: 'Participar en Comunidad',
    summary: 'Elige tu alias, lee y guarda publicaciones, empieza una y déjala en borrador, copia una receta a tu Cocina y aprende a denunciar o bloquear.',
    chapters: ['tut-comunidad-elegir-alias', 'tut-comunidad-guardar-publicacion', 'tut-comunidad-crear-borrador', 'tut-comunidad-importar-receta', 'tut-comunidad-denunciar'],
    cardIds: ['com2-alias', 'com2-publicar', 'com2-recetas', 'com2-denunciar'],
    synonyms: ['alias', 'normas', 'publicar', 'borrador', 'guardar publicación', 'seguir conversación', 'guardar receta', 'denunciar', 'bloquear', 'comunidad'],
    access: { community: true },
  },
  {
    id: 'ser-comunidad-acceso',
    module: 'comunidad',
    title: 'Si Comunidad no me deja entrar',
    summary: 'Añade tu fecha de nacimiento en tu ficha de Familia: Comunidad es solo para personas de 18 años cumplidos.',
    chapters: ['tut-comunidad-sin-acceso'],
    cardIds: ['com2-sin-acceso'],
    synonyms: ['comunidad no disponible', 'no veo comunidad', 'fecha de nacimiento', 'mayor de 18'],
  },

  // ───────────── Ubicación
  {
    id: 'ser-ubicacion-avisos',
    module: 'ubicacion',
    title: 'Ubicación y avisos',
    summary: 'Comparte tu ubicación, guarda y edita lugares, crea avisos de llegada o salida y, en Android, consigue que lleguen con la app cerrada.',
    chapters: ['tut-ubicacion-compartir-movil', 'tut-ubicacion-guardar-lugar', 'tut-ubicacion-editar-lugar', 'tut-ubicacion-crear-regla', 'tut-ubicacion-permiso-android'],
    cardIds: ['ubi-compartir-movil', 'ubi-lugares', 'ubi-permiso-android'],
    synonyms: ['compartir ubicación', 'guardar un lugar', 'mover un lugar', 'aviso de llegada', 'aviso de salida', 'reglas', 'app cerrada', 'permitir todo el tiempo'],
  },

  // ───────────── Inicio
  {
    id: 'ser-inicio-moverme',
    module: 'inicio',
    title: 'Moverme y ordenar PEPA',
    summary: 'Usa la barra y el menú ☰, elige las cuatro secciones fijas, ordena las tarjetas de Inicio y ajusta el carrusel.',
    chapters: ['tut-ini-menu-y-barra', 'tut-ini-secciones-fijas', 'tut-inicio-organizar', 'tut-ini-carrusel'],
    cardIds: ['ini-menu-y-barra', 'ini-organizar', 'ini-que-veo'],
    synonyms: ['menú', 'barra de abajo', 'secciones fijas', 'orden del menú', 'ordenar tarjetas', 'carrusel', 'dónde está'],
  },
  {
    id: 'ser-inicio-primeros-pasos',
    module: 'inicio',
    title: 'Primeros pasos en PEPA',
    summary: 'Un repaso de uno o dos minutos por Inicio, el menú, Calendario, Compras y la Ayuda.',
    chapters: ['bienvenida'],
    cardIds: ['ayu-usar', 'ini-pepa-te-avisa'],
    synonyms: ['bienvenida', 'empezar', 'primeros pasos', 'recorrido', 'no sé usar pepa'],
  },

  // ───────────── Hablar con PEPA
  {
    id: 'ser-pepa-hablar',
    module: 'pepa',
    title: 'Hablar con PEPA',
    summary: 'Pregúntale, pídele que apunte algo y revisa la tarjeta, pídele ayuda y elige cómo quieres que te conteste.',
    chapters: ['tut-pepa-hablar', 'tut-pepa-apuntar', 'tut-pepa-pedir-ayuda', 'tut-pepa-modo-respuesta', 'tut-pepa-sin-tarjeta'],
    cardIds: ['pepa-hablar', 'pepa-apuntar', 'pepa-pedir-ayuda', 'pepa-preguntas', 'pepa-modo-respuesta', 'pepa-botones', 'pepa-sin-tarjeta'],
    synonyms: ['preguntar a pepa', 'apuntar por voz', 'tarjeta', 'sin tarjeta', 'botones clásicos', 'voz', 'micrófono', 'hablando', 'por escrito'],
  },

  // ───────────── Ayuda, Buzón y Reseñas
  {
    id: 'ser-ayuda-opinar',
    module: 'ayuda',
    title: 'Dar tu opinión',
    summary: 'Escribe una sugerencia en el Buzón y valora PEPA con estrellas.',
    chapters: ['tut-buzon-escribir-sugerencia', 'tut-ayuda-resenas'],
    cardIds: ['ini-sugerencias', 'ini-resenas'],
    synonyms: ['sugerencia', 'buzón', 'idea', 'valorar pepa', 'estrellas', 'reseña', 'opinión'],
  },
]
