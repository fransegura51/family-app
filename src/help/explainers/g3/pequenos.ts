import type { HelpExplainer } from '@/help/explainers/types'

// «Cómo funciona PEPA» de Pequeños Grandes (Puntos y recompensas, Lista de deseos). «Educación financiera» queda fuera: la lleva otra persona.

export const expPequenosPuntosRecompensas: HelpExplainer = {
  id: 'exp-pequenos-puntos-recompensas',
  module: 'pequenos',
  title: 'Cómo se ganan y se canjean los puntos y las recompensas',
  summary: 'De dónde salen los puntos, qué son «Puntos disponibles» y el progreso, y quién puede dar, solicitar, aprobar y crear recompensas.',
  sections: [
    {
      heading: 'De dónde salen los puntos',
      paragraphs: [
        'Hay dos formas. Una: marcar «Hecho» un evento o una tarea del Calendario que lleve puntos (se ponen al crear o editar, y solo cuando el evento o la tarea es de una sola persona). Dos: que una persona adulta se los dé a mano con «⭐ Dar puntos», con un motivo opcional.',
        'Cada persona que participa tiene su tarjeta en «Puntos por persona». Las personas adultas empiezan sin participar y las demás sí; quien tenga permiso de adulto lo cambia en «⚙️ Quién participa». Desactivar a alguien no borra su historial.',
      ],
    },
    {
      heading: 'Puntos disponibles y progreso: no son lo mismo',
      paragraphs: [
        '«⭐ Puntos disponibles» es lo que se puede gastar ahora: lo ganado, más lo que se ha dado a mano, menos lo que se ha pedido en recompensas que no han sido rechazadas.',
        'El progreso del Camino (o de la Carrera mensual) cuenta lo ganado y no baja al pedir un premio. La familia elige el modo en el ajuste de arriba (solo adultos): «🛤️ Camino» no se reinicia y «🏁 Carrera mensual» empieza de cero cada mes. Es un ajuste de toda la familia.',
        'En Mi Camino, cada mundo son 150 puntos y el recorrido completo tiene tres mundos (450 puntos).',
      ],
      example: 'Lucía (nombre inventado) ha ganado 80 puntos y pide una recompensa de 30: su progreso sigue en 80, pero sus puntos disponibles pasan a 50.',
    },
    {
      heading: 'Pedir una recompensa',
      paragraphs: [
        'Las recompensas están en el catálogo de cada tarjeta. «Solicitar» solo se activa si los puntos disponibles llegan al coste. Al pedirla, esos puntos quedan reservados y la solicitud queda «Pendiente de aprobar». Aunque dos personas pulsen a la vez, el servidor impide reservar más puntos de los que hay.',
        'Cualquier persona de la familia puede solicitar. Una persona adulta la ve en «🔔 Solicitudes pendientes de aprobar» y decide: aprobar (los puntos quedan gastados) o rechazar (los puntos se liberan). Una aprobada pasa a «🎁 Premios pendientes de disfrutar», donde un adulto la marca con «Marcar como disfrutado».',
      ],
    },
    {
      heading: 'Quién puede qué',
      paragraphs: [
        'Solo las personas adultas pueden dar puntos, crear, editar, desactivar o borrar recompensas, y aprobar, rechazar o marcar como disfrutado. Lo garantiza el servidor, no solo la pantalla.',
        'Un niño o una niña ve el catálogo y puede solicitar, pero no ve los botones de adulto.',
      ],
    },
  ],
  limits: [
    'En esta pantalla no hay un aviso aparte para las personas adultas: la solicitud aparece al abrir Puntos y recompensas.',
    'No hay un botón para cancelar una solicitud propia: la rechaza una persona adulta y los puntos se liberan.',
    'En el Historial solo las concesiones de «⭐ Dar puntos» se pueden corregir; los puntos que vienen de marcar «Hecho» en el Calendario no tienen esa opción.',
  ],
  ifWrong: [
    'Si diste puntos por error, una persona adulta abre el Historial de esa tarjeta, toca el «⋯» de esa concesión y elige «✏️ Corregir puntos» o «🚫 Anular concesión». El movimiento original no se borra: queda anotado quién lo cambió y por qué.',
    'Si una solicitud no era la que querías, pide a una persona adulta que la rechace: los puntos se liberan.',
    'Si una recompensa está mal escrita, una persona adulta la edita desde el «⋯» del catálogo.',
    'Si los puntos de un evento no aparecen, comprueba que el evento o la tarea llevaba puntos, que era de una sola persona y que está marcado como «Hecho». Si todo está bien y aun así no suma, es un fallo técnico: cuéntalo en Soporte técnico, o en Sugerencias si todavía no lo ves.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/RewardsScreen.tsx',
    'src/ui/PointGrantHistory.tsx',
    'src/domain/rewards.ts',
    'src/domain/miCamino.ts',
    'src/data/rewards.ts',
    'supabase/migrations/0229_pequenos_grandes_rewards_approval.sql',
    'supabase/migrations/0248_rewards_participation_and_mode.sql',
  ],
  tour: 'tut-pequenos-solicitar',
  go: { path: '/puntos', dest: 'pequenos.recompensas' },
  labels: ['⭐ Dar puntos', '⭐ Puntos disponibles', 'Solicitar', '+ Nueva recompensa', '⚙️ Quién participa', '🔔 Solicitudes pendientes de aprobar', '🎁 Premios pendientes de disfrutar', 'Marcar como disfrutado', '✏️ Corregir puntos', '🚫 Anular concesión', '🛤️ Camino'],
  cardIds: ['pg-puntos', 'pg-recompensas', 'pg-mi-camino'],
  synonyms: ['como gano puntos', 'canjear puntos', 'por que no puedo solicitar', 'quien aprueba', 'puntos disponibles', 'por que bajan mis puntos', 'camino o carrera', 'dar puntos', 'premios', 'recompensas'],
}

export const expPequenosDeseosReservas: HelpExplainer = {
  id: 'exp-pequenos-deseos-reservas',
  module: 'pequenos',
  title: 'Listas de deseos y reservas secretas: quién ve qué',
  summary: 'Cómo se reservan los regalos sin que lo vea quien los recibe, y qué ve cada persona de la familia y cada invitado.',
  sections: [
    {
      heading: 'Qué es una lista de deseos',
      paragraphs: [
        'Cada lista es para una persona, con una celebración, un año y, si quieres, una fecha. Dentro apuntas regalos con nombre, descripción, enlace, precio y foto. Si pegas un enlace de internet, PEPA intenta buscar sola la foto del producto.',
        'La app no limita por rol quién crea listas o añade regalos dentro de la familia. Una lista (celebración y fecha) y cada regalo (nombre, descripción, enlace y precio) se pueden editar con el lápiz ✏️; la foto y «regalo conjunto» no se cambian: para eso, borra el regalo y créalo otra vez.',
      ],
    },
    {
      heading: 'Reservar y deshacer',
      paragraphs: [
        'En la lista de otra persona, «🎁 Reservar este regalo» te apunta a regalarlo. En tu propia lista no hay botón de reservar.',
        'Un regalo normal solo admite una reserva a la vez: si dos personas lo intentan justo a la vez, la segunda recibe un aviso de que ya está reservado. Un regalo conjunto (marcado con «Es un regalo conjunto») admite a varias personas, una vez cada una, con «+ Unirme a este regalo».',
        '«Deshacer mi reserva» la deja sin efecto y el regalo queda libre otra vez.',
      ],
    },
    {
      heading: 'Quién ve las reservas',
      paragraphs: [
        'Quien recibe los regalos no ve ninguna reserva de su lista, y las cuentas de niños y niñas tampoco ven las reservas de las listas de los demás: la pantalla no les enseña el estado de los regalos. Las personas adultas que no son la destinataria ven si cada regalo está disponible, reservado o conjunto.',
        'Esto lo hace cumplir el servidor, no solo la pantalla: aunque se intentara pedir esos datos, no se entregan a quien no debe verlos.',
      ],
      example: 'En la lista de Marta (nombre inventado), su padre ve «✓ Reservado» en la bici. Marta no ve ningún estado en sus regalos, así que no sabe si la bici está reservada ni por quién.',
    },
    {
      heading: 'Invitados sin cuenta',
      paragraphs: [
        'Con «Compartir con invitados sin cuenta» se genera un enlace único de esa lista: quien lo tenga puede ver los regalos y reservar con su nombre, sin cuenta en PEPA. Tampoco ve quién ha reservado qué. «Renovar enlace» crea uno nuevo.',
        'Compartir el enlace es decisión tuya: el tutorial no lo hace.',
      ],
    },
  ],
  limits: [
    'De un regalo no se puede cambiar la foto ni si es conjunto, ni de una lista para quién es o el año: para eso, borra y vuelve a crear.',
    'Si borras una lista, desaparecen también sus regalos y reservas.',
    'Quien tenga el enlace de invitados puede ver la lista: trátalo como cualquier enlace que compartes.',
    'Con una cuenta de niño o niña la pantalla no enseña ninguna reserva, tampoco la propia: desde esa cuenta no aparece «Deshacer mi reserva».',
  ],
  ifWrong: [
    'Si reservaste por error con una cuenta de adulto, pulsa «Deshacer mi reserva» y queda libre.',
    'Si en tu propia lista no ves ningún estado en los regalos, es lo normal: nunca verás las reservas de tu lista, para que siga siendo una sorpresa.',
    'Si un regalo pide reservar y dice que ya está reservado, alguien se te adelantó. Si crees que no es verdad, cuéntalo en Soporte técnico, o en Sugerencias si todavía no lo ves.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/WishlistScreen.tsx',
    'src/domain/wishlist.ts',
    'src/data/wishlist.ts',
    'supabase/migrations/0239_wishlists.sql',
    'supabase/functions/wishlist-guest/index.ts',
  ],
  tour: 'tut-pequenos-regalo-reservar',
  go: { path: '/puntos', dest: 'pequenos.deseos' },
  labels: ['+ Nueva lista', '+ Añadir regalo', '🎁 Reservar este regalo', '+ Unirme a este regalo', 'Deshacer mi reserva', 'Compartir con invitados sin cuenta', 'Renovar enlace', 'Es un regalo conjunto'],
  cardIds: ['pg-lista-deseos'],
  synonyms: ['reservar regalo', 'quien ha reservado', 'por que no veo las reservas', 'lista de regalos', 'wishlist', 'regalo conjunto', 'sorpresa', 'compartir lista', 'deshacer reserva'],
}

export const EXPLAINERS_PEQUENOS: HelpExplainer[] = [expPequenosPuntosRecompensas, expPequenosDeseosReservas]
