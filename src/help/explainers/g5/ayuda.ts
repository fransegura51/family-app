import type { HelpExplainer } from '@/help/explainers/types'

// Ayuda: qué pasa con las sugerencias y las reseñas que envías. Comprobado contra SuggestionsScreen.tsx, ReviewsScreen.tsx, data/suggestions.ts, domain/appReviews.ts y las
// migraciones 0078, 0254, 0290 y 0291. No se ha encontrado ningún aviso automático al enviar una sugerencia ni al cambiar su estado: se dice así.

export const expAyudaSugerencias: HelpExplainer = {
  id: 'exp-ayuda-sugerencias',
  module: 'ayuda',
  title: 'Qué pasa con las sugerencias que envías',
  summary: 'Una sugerencia queda guardada en el Buzón. La leen las cuentas que administran PEPA, que pueden marcarla como aplicada o descartada y dejarte una respuesta.',
  sections: [
    {
      heading: 'A dónde llega',
      paragraphs: [
        'Al pulsar «📮 Enviar sugerencia», tu texto se guarda en el Buzón con tu cuenta y tu familia. Lo ven las cuentas que administran la aplicación PEPA, que reciben las de todas las familias, con el nombre de la familia que las dejó.',
        'No he encontrado ningún aviso automático a nadie en el momento de enviarla: se ve cuando esas cuentas abren el Buzón.',
      ],
    },
    {
      heading: 'Los estados',
      paragraphs: [
        'Toda sugerencia nace «🕓 Pendiente». Solo las cuentas que administran PEPA pueden cambiarla a «✅ Aplicada» o «✕ Descartada», con una nota opcional que tú verás como «Respuesta: …» en el propio Buzón.',
        'No hay aviso en la campana ni correo cuando cambia el estado: para enterarte, abre el Buzón de vez en cuando.',
      ],
      example: 'Ejemplo inventado: Ana escribe «Me gustaría poder ordenar las recetas por tiempo». Queda «Pendiente». Semanas después ve «Aplicada» y «Respuesta: ya está en Recetas».',
    },
    {
      heading: 'Quién ve las tuyas',
      paragraphs: [
        'Las sugerencias de una familia las ve toda esa familia: cualquier persona que entre en el Buzón ve todas las de tu familia, no solo las suyas. Por eso conviene no escribir contraseñas ni datos privados.',
        'No se pueden editar después de enviarlas. Mientras estén «Pendiente», se pueden quitar con «Retirar».',
      ],
    },
  ],
  limits: [
    'Enviar una sugerencia no garantiza que se aplique ni que se conteste.',
    'El Buzón no es una vía de urgencia: nadie lo recibe al instante, así que no sirve para algo que necesite respuesta inmediata.',
    'El Buzón no guarda borradores: si sales antes de enviarla, el texto se pierde.',
  ],
  ifWrong: [
    'Si enviaste una sugerencia por error, retírala con «Retirar» mientras esté pendiente.',
    'Si no aparece en la lista tras enviarla, sal y vuelve a entrar en el Buzón; si sigue sin aparecer, vuelve a escribirla y cuéntalo (con la hora) en una nueva sugerencia.',
    'Un fallo técnico (algo que no funciona) también se cuenta aquí: explica qué hacías, qué esperabas y qué pasó.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/SuggestionsScreen.tsx',
    'src/data/suggestions.ts',
    'supabase/migrations/0078_suggestions.sql',
    'supabase/migrations/0254_suggestions_owner_by_profile.sql',
  ],
  tour: 'tut-buzon-escribir-sugerencia',
  go: { path: '/sugerencias' },
  labels: ['📮 Enviar sugerencia', 'Nueva sugerencia', 'Retirar', '🕓 Pendiente', '✅ Aplicada', '✕ Descartada', 'Respuesta:'],
  cardIds: ['ini-sugerencias'],
  synonyms: ['quién lee mis sugerencias', 'a dónde va mi sugerencia', 'estado de mi sugerencia', 'buzón', 'pedir una mejora', 'qué hace pepa con mi idea', 'retirar una sugerencia'],
}

export const expAyudaResenas: HelpExplainer = {
  id: 'exp-ayuda-resenas',
  module: 'ayuda',
  title: 'Qué pasa con tus reseñas y opiniones',
  summary: 'Cada toque en las estrellas guarda tu valoración al momento. Solo la ves tú y las cuentas que administran PEPA, y una nota baja les avisa.',
  sections: [
    {
      heading: 'Qué se guarda',
      paragraphs: [
        'Puedes valorar de 1 a 5 estrellas la app en general y, si quieres, cada sección. Hay una valoración por persona y sección, y puedes cambiarla o quitarla cuando quieras.',
        'Cada toque en las estrellas guarda en ese momento. El comentario («Lo que me gusta» y «Lo que no me gusta») se guarda al pulsar «Guardar comentario», y hace falta haber puesto antes las estrellas.',
      ],
    },
    {
      heading: 'Quién la ve',
      paragraphs: [
        'Tú ves solo las tuyas: ni siquiera el resto de tu familia ve las suyas. Las cuentas que administran PEPA ven las de todas las familias, con el nombre de la familia, y una media por sección.',
        'Si pones 1 o 2 estrellas (o cambias el comentario de una valoración baja), esas cuentas reciben además un aviso en la campana y en el móvil con tus estrellas, el nombre de tu familia y un trozo de tu comentario.',
      ],
      example: 'Ejemplo inventado: Luis valora Compras con 2 estrellas y escribe «Me cuesta encontrar la tienda». La administración de PEPA recibe «2 estrellas en Compras» con ese texto.',
    },
    {
      heading: 'Qué no es',
      paragraphs: [
        'No es el sitio para pedir una mejora ni para contar un fallo: para eso está el Buzón de sugerencias. Las reseñas no se contestan dentro de la app.',
      ],
    },
  ],
  limits: [
    'Cada toque guarda de verdad: si te equivocas, cambia las estrellas o pulsa «Quitar mi valoración».',
    'Las reseñas no se publican para otras familias ni en ningún sitio público.',
    'No he encontrado que PEPA te conteste ni te avise cuando alguien lee tu reseña.',
  ],
  ifWrong: [
    'Si pusiste mal las estrellas, vuelve a tocarlas con las correctas.',
    'Si quieres borrar lo que escribiste, usa «Quitar mi valoración».',
    'Si algo no se guarda, aparece el mensaje «No se pudo guardar»; vuelve a intentarlo y, si sigue, cuéntalo en Sugerencias.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/ReviewsScreen.tsx',
    'src/data/appReviews.ts',
    'src/domain/appReviews.ts',
    'supabase/migrations/0290_app_reviews.sql',
    'supabase/migrations/0291_app_reviews_low_star_alert.sql',
  ],
  go: { path: '/resenas' },
  labels: ['Contar qué me gusta y qué no', 'Guardar comentario', 'Quitar mi valoración', 'Lo que me gusta', 'Lo que no me gusta', '📋 Valorar cada sección (opcional)'],
  cardIds: ['ini-resenas', 'ini-sugerencias'],
  synonyms: ['estrellas', 'valorar pepa', 'quién ve mi opinión', 'puntuar la app', 'reseña pública', 'opiniones'],
}

export const EXPLAINERS_AYUDA: HelpExplainer[] = [expAyudaSugerencias, expAyudaResenas]
