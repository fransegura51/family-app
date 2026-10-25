import type { HelpExplainer } from '@/help/explainers/types'

// «Cómo funciona PEPA» · Comunidad (g4). Comprobado contra el código el 23/10/2026: lo que no he podido confirmar en el código se dice como tal.

export const expComunidadSoloAdultas: HelpExplainer = {
  id: 'exp-comunidad-solo-adultas',
  module: 'comunidad',
  title: 'Por qué Comunidad es solo para personas de 18 años o más',
  summary: 'Quién puede entrar en Comunidad, con qué dato se decide y qué hacer si te dice que no está disponible para tu cuenta.',
  synonyms: ['por qué no puedo entrar en comunidad', 'comunidad no disponible para tu cuenta', 'mayores de 18', 'fecha de nacimiento comunidad', 'menores en comunidad', 'no me sale comunidad', 'cómo funciona'],
  sections: [
    {
      heading: 'La regla',
      paragraphs: [
        'Comunidad PEPA es solo para personas con 18 años cumplidos. Quien no los tenga no puede leer, publicar, comentar ni seguir nada de Comunidad. El resto de PEPA y tu cuenta siguen exactamente igual.',
      ],
    },
    {
      heading: 'Con qué dato se decide',
      paragraphs: [
        'Con la fecha de nacimiento de tu ficha de Familia (la ficha enlazada a tu cuenta). No hay otra fuente: PEPA no pide documentos ni verifica la edad de otra forma.',
        'Si esa ficha no tiene fecha, tampoco hay acceso: una fecha desconocida nunca cuenta como mayoría de edad.',
      ],
    },
    {
      heading: 'Quién lo decide',
      paragraphs: [
        'Lo decide el servidor, en cada llamada a Comunidad, con la fecha de la ficha en ese momento. La pantalla solo lo refleja: si el servidor dice que no, te enseña el aviso. Por eso, si cambias la fecha, entras en cuanto se guarde, sin esperar a nada más.',
      ],
      example: 'Si tu ficha dice que naciste en 2010, Comunidad te dirá que es solo para personas de 18 años o más. Si la ficha no tiene fecha, te pedirá completarla en Familia.',
    },
    {
      heading: 'Qué ves si no tienes acceso',
      paragraphs: [
        'Una pantalla con «Comunidad no está disponible para tu cuenta» y el motivo. Si falta la fecha, hay un enlace «Completar mi fecha de nacimiento» que lleva a Familia. Si no puedes editar tu ficha, tiene que hacerlo quien administra tu familia.',
        'Es otro aviso distinto si Comunidad aún no está abierta: «Comunidad PEPA todavía no está abierta».',
      ],
    },
  ],
  limits: [
    'La seguridad depende de que la fecha de nacimiento de la ficha sea correcta: PEPA se fía de ella.',
    'No hay excepciones por permiso de la familia: la regla es la misma para todas las cuentas.',
    'Si Comunidad no sale en tu menú, puede ser por esta regla o porque aún no esté abierta para tu cuenta; la pantalla de Comunidad te dice cuál es.',
  ],
  ifWrong: [
    'Si la fecha de tu ficha está mal o falta, corrígela en Familia (o pídeselo a quien administra tu familia) y vuelve a entrar en Comunidad.',
    'Si la fecha es correcta y eres mayor de 18, pero sigue diciendo que no, puede ser un fallo técnico: cuéntalo en Sugerencias (o en Soporte técnico cuando exista) indicando qué mensaje ves.',
    'Si eres menor de 18, es una limitación normal: no se puede cambiar.',
  ],
  verified: '2026-10-23',
  basedOn: ['src/domain/communityAccess.ts', 'src/ui/community/CommunityAccessUi.tsx', 'src/ui/community/CommunityLayout.tsx', 'supabase/migrations/0284_community_adults_follow_topics_tags.sql'],
  go: { path: '/familia' },
  labels: ['Comunidad no está disponible para tu cuenta', 'Completar mi fecha de nacimiento', 'Comunidad PEPA todavía no está abierta'],
  cardIds: ['com2-sin-acceso', 'com2-que-es'],
}

export const expComunidadPublicoPrivado: HelpExplainer = {
  id: 'exp-comunidad-publico-privado',
  module: 'comunidad',
  title: 'Qué es público y qué no en Comunidad',
  summary: 'Qué ven las demás personas de ti, qué pasa con tus borradores y tus fotos, y qué sigue siendo solo tuyo.',
  access: { community: true },
  synonyms: ['qué ven los demás de mí', 'alias público', 'borradores privados', 'fotos en comunidad', 'datos privados comunidad', 'quién ve mi publicación', 'cómo funciona'],
  sections: [
    {
      heading: 'Tu alias y tu icono',
      paragraphs: [
        'En Comunidad no apareces con tu nombre ni con el de tu familia, sino con un alias (de 3 a 24 caracteres) y, si quieres, un icono. Es lo único que ven de ti. Para leer no necesitas alias; lo pide la primera vez que publicas, comentas, valoras o sigues.',
        'Puedes cambiarlo cuando quieras en Mi perfil → Mis ajustes → «Cambiar alias o icono». Tus publicaciones, comentarios y medallas se conservan.',
      ],
    },
    {
      heading: 'Lo que publicas',
      paragraphs: [
        'Al pulsar «Publicar», la publicación se ve enseguida en Comunidad: no hay aprobación previa. Las normas que aceptas dicen que lo publicado es público y que lo puede leer cualquier persona con el enlace y buscadores como Google.',
        'Esa lectura sin cuenta depende de un interruptor interno de PEPA que, según las notas del proyecto, ahora está apagado; no lo he podido comprobar en el servidor real. Por prudencia, trátalo todo como público y no pongas datos privados ni fotos de menores.',
      ],
      example: 'Publicas una receta de lentejas con el alias «CocinaDeLola» (ejemplo inventado). Los demás ven el alias, el icono y la receta; no ven tu nombre ni el de tu familia. Pero no escribas en ella tu dirección ni el colegio de tus hijos: lo publicado se considera público.',
    },
    {
      heading: 'Borradores y fotos',
      paragraphs: [
        '«Guardar borrador» lo guarda solo para ti, no lo ve nadie, y se conserva 30 días desde el último guardado manual (como mucho 20 borradores). Mientras escribes, el editor también guarda una copia temporal solo en tu dispositivo; no es un borrador y puede perderse.',
        'Las fotos son opcionales (hasta 5). Se preparan en tu móvil, sin datos de ubicación, y se suben en cuanto las eliges; si descartas la publicación, se borran. Hasta que publicas, solo las ves tú.',
      ],
    },
    {
      heading: 'Lo que no se comparte',
      paragraphs: [
        'Guardar una receta de Comunidad en tu Cocina crea una copia tuya y no comparte nada de tu familia con quien la publicó. Publicar una receta de tu Cocina puede pedirte marcar antes una casilla de consentimiento.',
        'Seguir a alguien no le avisa, y el perfil público enseña solo cuántas personas te siguen, no quiénes. Bloquear a alguien tampoco se le avisa.',
      ],
    },
  ],
  limits: [
    'Una vez publicado, otras personas pueden haberlo leído o copiado antes de que lo borres: borrar no deshace eso.',
    'No he podido comprobar el estado real del interruptor de lectura pública; si te preocupa, trata como público todo lo que publiques.',
  ],
  ifWrong: [
    'Si publicaste algo que no querías, puedes editarlo o eliminarlo desde la propia publicación (menú «Más opciones»). Si incluía datos privados, elimínalo cuanto antes.',
    'Si ves algo que no debería estar, usa «Denunciar» en su menú.',
    'Si un borrador o una foto no aparece donde esperabas y no es porque hayan pasado los 30 días, puede ser un fallo técnico: cuéntalo en Sugerencias (o en Soporte técnico cuando exista).',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/community/AliasDialog.tsx',
    'src/ui/community/MySettingsPage.tsx',
    'src/ui/community/PostEditorPage.tsx',
    'src/ui/community/PhotoPicker.tsx',
    'src/ui/community/recipes/RecipeImportButton.tsx',
    'src/domain/community.ts',
    'supabase/migrations/0266_community_social.sql',
    'supabase/migrations/0272_community_public_read.sql',
    'supabase/migrations/0281_community_open_access.sql',
    'supabase/migrations/0284_community_adults_follow_topics_tags.sql',
  ],
  tour: 'tut-comunidad-elegir-alias',
  go: { path: '/comunidad' },
  labels: ['Cambiar alias o icono', 'Guardar borrador', 'Publicar', 'Guardar y continuar', 'Denunciar'],
  cardIds: ['com2-alias', 'com2-publicar', 'com2-recetas'],
}

export const expComunidadAvisos: HelpExplainer = {
  id: 'exp-comunidad-avisos',
  module: 'comunidad',
  title: 'Cómo funcionan los avisos de Comunidad',
  summary: 'Cuándo te avisa Comunidad, por qué a veces llegan agrupados y dónde se cambian los horarios.',
  access: { community: true },
  synonyms: ['avisos de comunidad', 'notificaciones de comunidad', 'para ti en comunidad', 'seguir la conversación', 'por qué me avisa', 'dejar de recibir avisos', 'cómo funciona'],
  sections: [
    {
      heading: 'Dos tipos de aviso',
      paragraphs: [
        'Los avisos personales: comentarios nuevos en las conversaciones que sigues y en tus publicaciones, y respuestas directas a tus comentarios. Se activan cuando pulsas «Seguir la conversación» o cuando publicas tú.',
        'Las sugerencias: de vez en cuando PEPA te enseña una publicación con el título «Para ti en Comunidad». Elige primero algo nuevo de quien sigues en modo «Avisos inteligentes» y, si no hay, algo reciente y popular que aún no hayas abierto (y que no sea de alguien que hayas bloqueado).',
      ],
    },
    {
      heading: 'Cuándo llegan',
      paragraphs: [
        'Los personales se agrupan: no hay un aviso por comentario. Cuenta solo los comentarios que aún no has visto. Tras un aviso, el siguiente puede llegar 1 hora después si abriste el anterior y, si no, al menos 2 horas después. Con varias conversaciones llega un único aviso con un desglose.',
        'Puedes elegir recibirlos «A cualquier hora» o en una franja tuya («Establecer franja horaria»). Fuera de la franja esperan y se juntan en un solo aviso.',
        'Las sugerencias solo llegan entre las 08:00 y las 21:00 de tu zona horaria, por defecto una cada 48 horas (puedes elegir entre 6 y 720). Si pasa la hora, no se acumulan: se salta.',
      ],
      example: 'Sigues dos conversaciones y tienes una franja de 09:00 a 21:00. A las 23:00 llegan 5 comentarios. No suena nada; a las 09:00 recibes un solo aviso: «5 comentarios nuevos en 2 conversaciones».',
    },
    {
      heading: 'Seguir a personas',
      paragraphs: [
        'Al seguir a alguien puedes elegir «Avisos inteligentes» (por defecto, dentro del ritmo de las sugerencias), «Avisar de todo» (cada publicación nueva) o «Sin avisos». Seguir no avisa a la persona seguida.',
      ],
    },
    {
      heading: 'Dónde se cambia',
      paragraphs: [
        'En Comunidad → Mi perfil → Mis ajustes → «Avisos de Comunidad», y también en Configuración → «Avisos» → «Horarios de tus avisos». La zona horaria se cambia en Configuración → «Avisos» (ya no está en Familia).',
      ],
    },
  ],
  limits: [
    'Los avisos salen por las notificaciones de PEPA: necesitan que estén permitidas en tu dispositivo. No he podido comprobar cómo las entrega cada móvil.',
    'Las sugerencias solo se envían a quien ya tiene alias y ha aceptado las normas.',
    'Los horarios de las sugerencias (08:00 a 21:00) no se pueden ampliar; la franja propia solo afecta a los avisos personales.',
  ],
  ifWrong: [
    'Si recibes demasiados avisos, deja de seguir esa conversación (el botón pasa a «Siguiendo la conversación»), cambia a «Sin avisos» en la persona que sigues o desactiva las sugerencias.',
    'Si pusiste una franja y siguen llegando fuera de ella, comprueba que pulsaste «Guardar franja»: hasta entonces los avisos llegan a cualquier hora.',
    'Si no te llega ningún aviso aunque lo tengas todo activo, primero revisa los permisos de notificaciones del móvil; si están bien, puede ser un fallo técnico: cuéntalo en Sugerencias (o en Soporte técnico cuando exista).',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/community/CommunityNoticePrefs.tsx',
    'src/ui/community/MySettingsPage.tsx',
    'src/ui/community/PostActions.tsx',
    'src/ui/NotificationPrefsCard.tsx',
    'supabase/migrations/0271_community_notifications.sql',
    'supabase/migrations/0284_community_adults_follow_topics_tags.sql',
  ],
  go: { path: '/comunidad' },
  labels: [
    'Avisos de Comunidad',
    'Avisos personales de Comunidad',
    'Sugerencias de Comunidad',
    'A cualquier hora',
    'Establecer franja horaria',
    'Guardar franja',
    'Avisos inteligentes',
    'Avisar de todo',
    'Sin avisos',
    'Horarios de tus avisos',
  ],
  tour: 'tut-comunidad-guardar-publicacion',
  cardIds: ['com2-publicar', 'com2-alias'],
}

export const EXPLAINERS_COMUNIDAD: HelpExplainer[] = [expComunidadSoloAdultas, expComunidadPublicoPrivado, expComunidadAvisos]
